-- Migration: release_stale_claims
-- Enforce single-form-number invariant:
-- 1. Release any AdmittedStudent that is marked isClaimed = true but has no Registration
UPDATE "AdmittedStudent"
SET "isClaimed" = false,
    "claimedByUserId" = NULL,
    "claimedAt" = NULL
WHERE "id" NOT IN (
  SELECT "admittedStudentId" FROM "Registration"
) AND ("isClaimed" = true OR "claimedByUserId" IS NOT NULL);

-- 2. Release any AdmittedStudent claim where the user registered with a different student
UPDATE "AdmittedStudent" a
SET "isClaimed" = false,
    "claimedByUserId" = NULL,
    "claimedAt" = NULL
FROM "Registration" r
WHERE a."claimedByUserId" = r."userId"
  AND a."id" <> r."admittedStudentId"
  AND (a."isClaimed" = true OR a."claimedByUserId" IS NOT NULL);

-- 3. Ensure legitimate registrations remain consistently claimed
UPDATE "AdmittedStudent" a
SET "isClaimed" = true,
    "claimedByUserId" = r."userId"
FROM "Registration" r
WHERE a."id" = r."admittedStudentId"
  AND (a."isClaimed" = false OR a."claimedByUserId" IS DISTINCT FROM r."userId");
