-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'VOLUNTEER', 'ADMIN');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REVISION_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CompanionRelationship" AS ENUM ('FATHER', 'MOTHER', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "PassStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "BroadcastPriority" AS ENUM ('INFO', 'WARNING', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "BroadcastAudience" AS ENUM ('STUDENTS', 'VOLUNTEERS', 'ALL');

-- CreateEnum
CREATE TYPE "ScanOutcome" AS ENUM ('ADMITTED', 'DUPLICATE', 'INVALID', 'REVOKED', 'NOT_FOUND', 'OUT_OF_WINDOW');

-- CreateEnum
CREATE TYPE "ScanMethod" AS ENUM ('QR', 'BARCODE', 'MANUAL_CODE');

-- CreateEnum
CREATE TYPE "RosterImportStatus" AS ENUM ('DRY_RUN', 'COMMITTED', 'ROLLED_BACK', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmittedStudent" (
    "id" TEXT NOT NULL,
    "serialNo" INTEGER,
    "formNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "programGroup" TEXT NOT NULL,
    "programLevel" TEXT NOT NULL,
    "contactNo" TEXT,
    "altContactNo" TEXT,
    "extraContacts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "paymentStatus" TEXT,
    "isClaimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedByUserId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByImportId" TEXT,

    CONSTRAINT "AdmittedStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterImport" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" "RosterImportStatus" NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errored" INTEGER NOT NULL DEFAULT 0,
    "columnMap" JSONB NOT NULL,
    "report" JSONB,
    "snapshot" JSONB,
    "uploadedById" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "admittedStudentId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "name" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "contactNo" TEXT NOT NULL,
    "selfiePublicId" TEXT,
    "selfieVersion" TEXT,
    "selfieBytes" INTEGER,
    "selfieWidth" INTEGER,
    "selfieHeight" INTEGER,
    "selfieUploadedAt" TIMESTAMP(3),
    "faceDetected" BOOLEAN,
    "consentVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Companion" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "relationship" "CompanionRelationship" NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Companion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pass" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "code10" TEXT NOT NULL,
    "qrPayload" TEXT NOT NULL,
    "signedPayload" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "status" "PassStatus" NOT NULL DEFAULT 'ACTIVE',
    "guestCount" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokedReason" TEXT,

    CONSTRAINT "Pass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "scannedById" TEXT NOT NULL,
    "method" "ScanMethod" NOT NULL,
    "guestsAdmitted" INTEGER NOT NULL DEFAULT 0,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT,
    "wasOffline" BOOLEAN NOT NULL DEFAULT false,
    "scanEventId" TEXT,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" TEXT NOT NULL,
    "passId" TEXT,
    "rawCode" TEXT NOT NULL,
    "method" "ScanMethod" NOT NULL,
    "outcome" "ScanOutcome" NOT NULL,
    "reason" TEXT,
    "gateId" TEXT,
    "scannedById" TEXT,
    "deviceId" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wasOffline" BOOLEAN NOT NULL DEFAULT false,
    "clientDecision" "ScanOutcome",
    "duplicateOfId" TEXT,
    "syncBatchId" TEXT,

    CONSTRAINT "ScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloudinaryConfig" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "cloudName" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecretCipher" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
    "storageLimitBytes" BIGINT,
    "usageCheckedAt" TIMESTAMP(3),
    "uploadCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudinaryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "priority" "BroadcastPriority" NOT NULL DEFAULT 'INFO',
    "audience" "BroadcastAudience" NOT NULL DEFAULT 'ALL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "registrationOpen" BOOLEAN NOT NULL DEFAULT false,
    "registrationOpensAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "autoApprove" BOOLEAN NOT NULL DEFAULT true,
    "consentVersion" TEXT NOT NULL DEFAULT '2026-01-v1',
    "selfieRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "maxCompanions" INTEGER NOT NULL DEFAULT 2,
    "manifestVersion" INTEGER NOT NULL DEFAULT 1,
    "sseDegradeThreshold" INTEGER NOT NULL DEFAULT 2500,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdmittedStudent_formNumber_key" ON "AdmittedStudent"("formNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AdmittedStudent_claimedByUserId_key" ON "AdmittedStudent"("claimedByUserId");

-- CreateIndex
CREATE INDEX "AdmittedStudent_name_idx" ON "AdmittedStudent"("name");

-- CreateIndex
CREATE INDEX "AdmittedStudent_programGroup_idx" ON "AdmittedStudent"("programGroup");

-- CreateIndex
CREATE INDEX "AdmittedStudent_programLevel_idx" ON "AdmittedStudent"("programLevel");

-- CreateIndex
CREATE INDEX "AdmittedStudent_isClaimed_idx" ON "AdmittedStudent"("isClaimed");

-- CreateIndex
CREATE INDEX "AdmittedStudent_createdByImportId_idx" ON "AdmittedStudent"("createdByImportId");

-- CreateIndex
CREATE INDEX "RosterImport_status_createdAt_idx" ON "RosterImport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RosterImport_fileHash_idx" ON "RosterImport"("fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationDraft_userId_key" ON "RegistrationDraft"("userId");

-- CreateIndex
CREATE INDEX "RegistrationDraft_updatedAt_idx" ON "RegistrationDraft"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_reference_key" ON "Registration"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_userId_key" ON "Registration"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_admittedStudentId_key" ON "Registration"("admittedStudentId");

-- CreateIndex
CREATE INDEX "Registration_status_submittedAt_idx" ON "Registration"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "Registration_submittedAt_idx" ON "Registration"("submittedAt");

-- CreateIndex
CREATE INDEX "Registration_selfieUploadedAt_idx" ON "Registration"("selfieUploadedAt");

-- CreateIndex
CREATE INDEX "Companion_registrationId_idx" ON "Companion"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "Companion_registrationId_position_key" ON "Companion"("registrationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Gate_code_key" ON "Gate"("code");

-- CreateIndex
CREATE INDEX "Gate_isActive_idx" ON "Gate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Pass_registrationId_key" ON "Pass"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "Pass_code10_key" ON "Pass"("code10");

-- CreateIndex
CREATE INDEX "Pass_status_idx" ON "Pass"("status");

-- CreateIndex
CREATE INDEX "Pass_issuedAt_idx" ON "Pass"("issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_passId_key" ON "CheckIn"("passId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_scanEventId_key" ON "CheckIn"("scanEventId");

-- CreateIndex
CREATE INDEX "CheckIn_recordedAt_idx" ON "CheckIn"("recordedAt");

-- CreateIndex
CREATE INDEX "CheckIn_gateId_recordedAt_idx" ON "CheckIn"("gateId", "recordedAt");

-- CreateIndex
CREATE INDEX "CheckIn_scannedById_idx" ON "CheckIn"("scannedById");

-- CreateIndex
CREATE INDEX "ScanEvent_passId_idx" ON "ScanEvent"("passId");

-- CreateIndex
CREATE INDEX "ScanEvent_recordedAt_idx" ON "ScanEvent"("recordedAt");

-- CreateIndex
CREATE INDEX "ScanEvent_outcome_recordedAt_idx" ON "ScanEvent"("outcome", "recordedAt");

-- CreateIndex
CREATE INDEX "ScanEvent_gateId_recordedAt_idx" ON "ScanEvent"("gateId", "recordedAt");

-- CreateIndex
CREATE INDEX "ScanEvent_deviceId_recordedAt_idx" ON "ScanEvent"("deviceId", "recordedAt");

-- CreateIndex
CREATE INDEX "ScanEvent_syncBatchId_idx" ON "ScanEvent"("syncBatchId");

-- CreateIndex
CREATE INDEX "CloudinaryConfig_isActive_priority_idx" ON "CloudinaryConfig"("isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "CloudinaryConfig_cloudName_apiKey_key" ON "CloudinaryConfig"("cloudName", "apiKey");

-- CreateIndex
CREATE INDEX "Broadcast_audience_publishedAt_idx" ON "Broadcast"("audience", "publishedAt");

-- CreateIndex
CREATE INDEX "Broadcast_publishedAt_idx" ON "Broadcast"("publishedAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "AdmittedStudent" ADD CONSTRAINT "AdmittedStudent_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmittedStudent" ADD CONSTRAINT "AdmittedStudent_createdByImportId_fkey" FOREIGN KEY ("createdByImportId") REFERENCES "RosterImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterImport" ADD CONSTRAINT "RosterImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDraft" ADD CONSTRAINT "RegistrationDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_admittedStudentId_fkey" FOREIGN KEY ("admittedStudentId") REFERENCES "AdmittedStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Companion" ADD CONSTRAINT "Companion_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_passId_fkey" FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_scannedById_fkey" FOREIGN KEY ("scannedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_scanEventId_fkey" FOREIGN KEY ("scanEventId") REFERENCES "ScanEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_passId_fkey" FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_scannedById_fkey" FOREIGN KEY ("scannedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "CheckIn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloudinaryConfig" ADD CONSTRAINT "CloudinaryConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemConfig" ADD CONSTRAINT "SystemConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
