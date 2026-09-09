-- Migration: allow_unauthenticated_claim_constraint
-- Updates chk_admittedstudent_claim_consistent to permit claimedByUserId to be NULL
-- when isClaimed is true, enabling zero-login student registrations.

ALTER TABLE "AdmittedStudent" DROP CONSTRAINT IF EXISTS chk_admittedstudent_claim_consistent;

ALTER TABLE "AdmittedStudent"
  ADD CONSTRAINT chk_admittedstudent_claim_consistent
  CHECK (
    ("isClaimed" = false AND "claimedByUserId" IS NULL AND "claimedAt" IS NULL)
    OR
    ("isClaimed" = true AND "claimedAt" IS NOT NULL)
  );
