-- Scan outcome parity, scan-event idempotency, and device tracking.
--
-- Three related fixes, one migration, because they are all consequences of the
-- same thing: the offline scanner's verdicts and the server's verdicts have to be
-- stored side by side and compared.
--
--   1. `ScanOutcome` was missing two values that `packages/core/scan/decide.ts`
--      can return. `NOT_APPROVED` and `STALE_MANIFEST` had nowhere to go, so a
--      device reporting either would have failed the insert — at the gate, on the
--      one code path that must not fail.
--   2. `ScanEvent.clientEventId` makes `/api/scanner/sync` idempotent. The
--      outbox retries on every network flap; without a unique key, one lost HTTP
--      response becomes two check-ins for one student.
--   3. `ScannerDevice` gives "device 4f2a is forty minutes stale" something to be
--      read from. The alternative is aggregating millions of ScanEvent rows to
--      answer a question mission control asks every few seconds.

-- ─── 1. Enum parity with decideScan ────────────────────────────────────────────
-- Safe inside Prisma's transaction on PostgreSQL 12+ because neither new value is
-- referenced by any statement in this migration.
ALTER TYPE "ScanOutcome" ADD VALUE 'NOT_APPROVED';
ALTER TYPE "ScanOutcome" ADD VALUE 'STALE_MANIFEST';

-- ─── 2. ScanEvent: idempotency and offline provenance ──────────────────────────
ALTER TABLE "ScanEvent"
  ADD COLUMN "clientEventId" TEXT,
  ADD COLUMN "clientReason" TEXT,
  ADD COLUMN "clientManifestVersion" INTEGER,
  ADD COLUMN "clientManifestGeneratedAt" TIMESTAMP(3),
  ADD COLUMN "overridden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "clockSuspect" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "ScanEvent_clientEventId_key" ON "ScanEvent"("clientEventId");

-- An override is only meaningful against a verdict decideScan marks overridable,
-- and OUT_OF_WINDOW is the only one. A row claiming an override of INVALID would
-- mean a volunteer waved through a forged QR, and of REVOKED that they waved
-- through a cancelled pass — neither is a thing the app can do, so if either ever
-- appears it came from a hand-edited request and belongs in a constraint
-- violation rather than in the arrivals count.
--
-- ADMITTED is allowed alongside it because the sync handler may reasonably record
-- an overridden entry as what actually happened — the student went in. Pinning
-- this to OUT_OF_WINDOW alone would make that a gate outage rather than a
-- refactor.
ALTER TABLE "ScanEvent"
  ADD CONSTRAINT chk_scanevent_override_only_overridable
  CHECK ("overridden" = false OR "outcome" IN ('OUT_OF_WINDOW', 'ADMITTED'));

-- Deliberately no "a DUPLICATE must name the check-in it lost to" constraint.
-- It would be true at insert time and false afterwards: reversing a mis-scan
-- deletes the CheckIn, `duplicateOfId` is ON DELETE SET NULL, and the reversal
-- would fail on the check — locking a real student out over a tidiness rule.

-- ─── 3. ScannerDevice ──────────────────────────────────────────────────────────
CREATE TABLE "ScannerDevice" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "label" TEXT,
  "gateId" TEXT,
  "lastSeenById" TEXT,
  "manifestVersion" INTEGER,
  "manifestGeneratedAt" TIMESTAMP(3),
  "clockOffsetMs" INTEGER,
  "lastHelloAt" TIMESTAMP(3),
  "lastSyncAt" TIMESTAMP(3),
  "lastScanAt" TIMESTAMP(3),
  "scanCount" INTEGER NOT NULL DEFAULT 0,
  "conflictCount" INTEGER NOT NULL DEFAULT 0,
  "isBlocked" BOOLEAN NOT NULL DEFAULT false,
  "blockedReason" TEXT,
  "blockedAt" TIMESTAMP(3),
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScannerDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScannerDevice_deviceId_key" ON "ScannerDevice"("deviceId");
CREATE INDEX "ScannerDevice_gateId_lastSyncAt_idx" ON "ScannerDevice"("gateId", "lastSyncAt");
CREATE INDEX "ScannerDevice_isBlocked_idx" ON "ScannerDevice"("isBlocked");

ALTER TABLE "ScannerDevice"
  ADD CONSTRAINT "ScannerDevice_gateId_fkey"
  FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScannerDevice"
  ADD CONSTRAINT "ScannerDevice_lastSeenById_fkey"
  FOREIGN KEY ("lastSeenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A device id is generated client-side, so it is the one identifier here that an
-- attacker chooses. Pinning the shape means a hostile value cannot be a 4 KB
-- string that turns every admin device list into a rendering problem.
ALTER TABLE "ScannerDevice"
  ADD CONSTRAINT chk_scannerdevice_uuid
  CHECK ("deviceId" ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');

ALTER TABLE "ScannerDevice"
  ADD CONSTRAINT chk_scannerdevice_counts_nonneg
  CHECK ("scanCount" >= 0 AND "conflictCount" >= 0 AND "conflictCount" <= "scanCount");

-- Blocking is an admin action with a reason, or it is not blocked. A device that
-- silently stopped syncing with no recorded why is an incident nobody can review.
ALTER TABLE "ScannerDevice"
  ADD CONSTRAINT chk_scannerdevice_block_consistent
  CHECK (
    ("isBlocked" = false AND "blockedAt" IS NULL AND "blockedReason" IS NULL)
    OR ("isBlocked" = true AND "blockedAt" IS NOT NULL AND "blockedReason" IS NOT NULL)
  );
