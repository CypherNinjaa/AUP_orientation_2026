-- Integrity guarantees that Prisma's schema language cannot express.
--
-- Everything here is a rule the application also enforces. It is duplicated in
-- the database because an application check has a window: two requests can both
-- read "not yet claimed" before either writes. Postgres has no such window, and
-- it also covers the paths that bypass the application entirely — a psql session,
-- an admin script, a future service.
--
-- Every constraint is named `chk_<table>_<rule>` so a violation message says which
-- rule was broken rather than just naming a column.

-- ── AuditLog: append-only (D20) ──────────────────────────────────────────────
-- The audit log is the record of who did what. If it can be edited it proves
-- nothing, so UPDATE and DELETE are refused at the row level.
--
-- This stops the application and any ordinary role. It does not stop a superuser
-- with `ALTER TABLE "AuditLog" DISABLE TRIGGER`, and it does not cover TRUNCATE
-- or DROP — those stay available on purpose, because a retention policy will
-- eventually need to prune this table and that must be a deliberate, logged
-- operator action rather than something the app can do by accident.
CREATE OR REPLACE FUNCTION orientation_audit_log_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'AuditLog is append-only: % is not permitted (row id %)',
    TG_OP, COALESCE(OLD."id", '?')
    USING ERRCODE = 'restrict_violation',
          HINT = 'Write a new AuditLog entry describing the correction instead.';
END;
$$;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION orientation_audit_log_append_only();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION orientation_audit_log_append_only();

-- ── SystemConfig: exactly one row ────────────────────────────────────────────
-- Registration open/closed, auto-approve, and the gate windows are read on every
-- request. A second row would mean two answers to "is registration open?", and
-- which one wins would depend on row order.
ALTER TABLE "SystemConfig"
  ADD CONSTRAINT chk_systemconfig_singleton CHECK ("id" = 'singleton');

ALTER TABLE "SystemConfig"
  ADD CONSTRAINT chk_systemconfig_retention_positive
  CHECK ("selfieRetentionDays" >= 1);

-- The DPDP retention promise is a published number of days. A value in the
-- hundreds is almost certainly a typo, and it would silently extend how long
-- student selfies are held.
ALTER TABLE "SystemConfig"
  ADD CONSTRAINT chk_systemconfig_retention_bounded
  CHECK ("selfieRetentionDays" <= 180);

ALTER TABLE "SystemConfig"
  ADD CONSTRAINT chk_systemconfig_max_companions
  CHECK ("maxCompanions" BETWEEN 0 AND 4);

-- ── Companion: position is 1..4 ──────────────────────────────────────────────
-- The policy ceiling is SystemConfig.maxCompanions (2 for 2026) and is
-- deliberately NOT hardcoded here — an admin can raise it without a migration.
-- This is only a sanity floor and ceiling, so `position = 0` or `position = 99`
-- cannot reach the pass, where positions are rendered in order.
ALTER TABLE "Companion"
  ADD CONSTRAINT chk_companion_position_range
  CHECK ("position" BETWEEN 1 AND 4);

-- ── AdmittedStudent: form number and claim state ─────────────────────────────
-- Same rule as packages/core/src/roster/parse.ts. Duplicated so a row inserted
-- by anything other than the parser still has a form number a student can type.
ALTER TABLE "AdmittedStudent"
  ADD CONSTRAINT chk_admittedstudent_form_number
  CHECK ("formNumber" ~ '^[0-9]{4,20}$');

-- A half-claimed row is the dangerous state: `isClaimed = true` with no
-- `claimedByUserId` looks taken to the lookup endpoint but belongs to nobody, so
-- the real student is locked out with no way to prove it. All three fields move
-- together or not at all.
ALTER TABLE "AdmittedStudent"
  ADD CONSTRAINT chk_admittedstudent_claim_consistent
  CHECK (
    ("isClaimed" = false AND "claimedByUserId" IS NULL AND "claimedAt" IS NULL)
    OR
    ("isClaimed" = true AND "claimedByUserId" IS NOT NULL AND "claimedAt" IS NOT NULL)
  );

-- ── Registration ─────────────────────────────────────────────────────────────
-- The student portal renders the admin's note as the instruction for what to fix.
-- A revision request with no note is a dead end for the student.
ALTER TABLE "Registration"
  ADD CONSTRAINT chk_registration_revision_has_note
  CHECK ("status" <> 'REVISION_REQUESTED' OR "reviewNote" IS NOT NULL);

ALTER TABLE "Registration"
  ADD CONSTRAINT chk_registration_revision_count
  CHECK ("revisionCount" >= 0);

-- Selfie metadata arrives from one Cloudinary response, so either all of it is
-- there or none of it is. A public id with no upload timestamp would be invisible
-- to the retention sweep, which selects on selfieUploadedAt — the asset would
-- outlive its retention window unnoticed.
ALTER TABLE "Registration"
  ADD CONSTRAINT chk_registration_selfie_consistent
  CHECK (
    ("selfiePublicId" IS NULL AND "selfieUploadedAt" IS NULL AND "selfieVersion" IS NULL)
    OR
    ("selfiePublicId" IS NOT NULL AND "selfieUploadedAt" IS NOT NULL AND "selfieVersion" IS NOT NULL)
  );

-- ── Pass ─────────────────────────────────────────────────────────────────────
-- The manual-entry keypad accepts ten digits. Anything else can be issued but
-- never typed in, so it would fail only at the gate.
ALTER TABLE "Pass"
  ADD CONSTRAINT chk_pass_code10_format CHECK ("code10" ~ '^[0-9]{10}$');

-- A revoked pass with no revokedAt cannot be explained to the student who is
-- standing at the gate being turned away.
ALTER TABLE "Pass"
  ADD CONSTRAINT chk_pass_revocation_consistent
  CHECK (
    ("status" = 'ACTIVE' AND "revokedAt" IS NULL)
    OR
    ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL)
  );

-- guestCount is denormalised onto the pass because the offline manifest carries
-- no companion names (D7). It is what the volunteer counts heads against.
ALTER TABLE "Pass"
  ADD CONSTRAINT chk_pass_guest_count CHECK ("guestCount" BETWEEN 0 AND 4);

-- ── CloudinaryConfig ─────────────────────────────────────────────────────────
-- Priority 0 is reserved for the credentials in the environment, which are never
-- stored in this table. A row claiming 0 would silently outrank them.
ALTER TABLE "CloudinaryConfig"
  ADD CONSTRAINT chk_cloudinaryconfig_priority CHECK ("priority" >= 1);

ALTER TABLE "CloudinaryConfig"
  ADD CONSTRAINT chk_cloudinaryconfig_usage_nonneg
  CHECK ("storageUsedBytes" >= 0 AND ("storageLimitBytes" IS NULL OR "storageLimitBytes" > 0));
