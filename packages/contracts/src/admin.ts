/**
 * The admin command centre's boundary.
 *
 * Everything here is behind `role === 'ADMIN'` and everything here writes to the
 * audit log. Two conventions worth knowing before reading:
 *
 *   - Destructive operations take a confirmation field that names the thing being
 *     destroyed, not a boolean. `{ confirm: true }` is a field a client library
 *     can set by accident; `{ confirmImportId: 'clh…' }` is one it cannot.
 *   - Numbers an admin can set are bounded in the schema, not just in the UI.
 *     `selfieRetentionDays: 36500` is a typo that silently disables a DPDP
 *     obligation, so the contract refuses it.
 */
import { z } from 'zod'
import {
  broadcastAudience,
  broadcastPriority,
  cuid,
  pageQuery,
  registrationStatus,
  role,
  scanOutcome,
} from './common'
import type { RegistrationStatus, Role, ScanOutcome } from './common'
import { MAX_COMPANIONS } from './registration'

// ─────────────────────────────────────────────────────────────────────────────
// Roster import
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 15,000 rows of eight short columns is comfortably under a megabyte; 20 MB
 * leaves room for a workbook carrying formatting, a logo, and three abandoned
 * sheets, which is what a real admissions file looks like.
 */
export const ROSTER_MAX_BYTES = 20 * 1024 * 1024

export const ROSTER_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
] as const

export const ROSTER_EXTENSIONS = ['.xlsx', '.xls', '.csv'] as const

/**
 * A preview is a parse with nothing written — `RosterImportStatus.DRY_RUN`.
 *
 * The admin uploads, reads the resolved column mapping and the per-row issues,
 * and only then commits by id. Two requests rather than one because a roster
 * import is the single most destructive thing in the admin console: it can
 * rename 15,000 students. Making the admin look at what a header resolved to
 * before it lands is the whole safety mechanism.
 */
export interface RosterPreviewResponse {
  importId: string
  filename: string
  fileHash: string
  totalRows: number
  created: number
  updated: number
  unchanged: number
  errored: number
  /** Rows in the database that this file does not mention. Never deleted. */
  absentFromFile: number
  /** Header text → field, exactly as resolved. The thing to actually read. */
  columnMap: Record<string, string>
  /** Headers that matched no field. A missed column shows up here. */
  unmapped: string[]
  issues: RosterIssueView[]
  issuesTruncated: boolean
  /** Set when an identical file was already committed. Commit refuses. */
  duplicateOf: { importId: string; filename: string; committedAt: string | null } | null
  /** First few parsed rows, so the admin can eyeball that columns line up. */
  sample: RosterSampleRow[]
}

export interface RosterIssueView {
  row: number
  field: string
  severity: 'error' | 'warning'
  message: string
  value?: string
}

export interface RosterSampleRow {
  formNumber: string
  name: string
  program: string
  programLevel: string
  contactNo: string | null
}

export const rosterCommitRequest = z.strictObject({
  importId: cuid,
  /**
   * Repeat the hash the preview reported. It pins the commit to the bytes that
   * were previewed: without it, "commit import X" would happily apply a file
   * that was re-uploaded under the same id in another tab.
   */
  fileHash: z.string().regex(/^[0-9a-f]{64}$/, { error: 'Not a SHA-256 hash.' }),
  /**
   * Set only after the admin has read the duplicate warning. Committing the same
   * roster twice is the easy way to double a count, so the refusal is on by
   * default and the override is explicit.
   */
  allowDuplicateFile: z.boolean().default(false),
})
export type RosterCommitRequest = z.infer<typeof rosterCommitRequest>

export interface RosterCommitResponse {
  importId: string
  created: number
  updated: number
  unchanged: number
  totalRows: number
  committedAt: string
}

/**
 * Undo the most recent committed import.
 *
 * Only the most recent, and never a row a student has already claimed — both
 * rules live in `packages/db/roster/ingest.ts` so they can produce a sentence an
 * admin can act on instead of a foreign-key error. `confirmFilename` is typed by
 * hand for the same reason a `DROP TABLE` prompt asks for the table name.
 */
export const rosterRollbackRequest = z.strictObject({
  importId: cuid,
  confirmFilename: z.string().min(1).max(255),
})
export type RosterRollbackRequest = z.infer<typeof rosterRollbackRequest>

export interface RosterRollbackResponse {
  importId: string
  deleted: number
  restored: number
  /** Claimed rows this import created, which were kept rather than deleted. */
  keptBecauseClaimed: number
  rolledBackAt: string
}

export interface RosterImportView {
  id: string
  filename: string
  status: 'DRY_RUN' | 'COMMITTED' | 'ROLLED_BACK' | 'FAILED'
  totalRows: number
  created: number
  updated: number
  skipped: number
  errored: number
  uploadedBy: string | null
  createdAt: string
  committedAt: string | null
  rolledBackAt: string | null
  /** True for the one import that `/rollback` will accept. */
  canRollback: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Mission control
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The live numbers on the admin home screen.
 *
 * `admitted` is the roster, `registered` is submissions, `checkedIn` is people
 * through the gate — three different denominators that get conflated in every
 * event dashboard. They are named separately here so a chart cannot accidentally
 * divide by the wrong one.
 */
export interface StatsResponse {
  admitted: number
  registered: number
  approved: number
  pendingReview: number
  revisionRequested: number
  passesIssued: number
  passesRevoked: number
  checkedIn: number
  /** Companions actually admitted, summed. Not the same as passes. */
  guestsAdmitted: number
  /** Check-ins in the last 60 seconds, for the arrivals gauge. */
  arrivalsPerMinute: number
  /** Check-ins bucketed by minute for the last two hours. */
  arrivals: Array<{ at: string; count: number }>
  /** Grouped by the verbatim programme string, largest first. */
  byProgram: Array<{ program: string; admitted: number; registered: number; checkedIn: number }>
  byLevel: Array<{ level: string; admitted: number; registered: number; checkedIn: number }>
  scanOutcomes: Array<{ outcome: ScanOutcome; count: number }>
  /** Devices whose offline verdict disagreed with the server's. */
  clientDisagreements: Array<{ deviceId: string; count: number }>
  generatedAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Registrations
// ─────────────────────────────────────────────────────────────────────────────

export const registrationListQuery = pageQuery.extend({
  status: registrationStatus.optional(),
  /** Matches name, form number, reference or pass code. */
  q: z.string().trim().min(2).max(80).optional(),
  program: z.string().trim().min(1).max(200).optional(),
  /** Registrations whose selfie the detector saw no face in. */
  noFace: z.coerce.boolean().optional(),
  checkedIn: z.coerce.boolean().optional(),
  sort: z.enum(['submittedAt', 'name']).default('submittedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
})
export type RegistrationListQuery = z.infer<typeof registrationListQuery>

export interface RegistrationRow {
  id: string
  reference: string
  status: RegistrationStatus
  name: string
  program: string
  formNumber: string
  contactNo: string
  guestCount: number
  hasSelfie: boolean
  faceDetected: boolean | null
  submittedAt: string
  passCode10: string | null
  passStatus: 'ACTIVE' | 'REVOKED' | null
  checkedInAt: string | null
  reviewNote: string | null
  revisionCount: number
}

/**
 * The canned retake reasons.
 *
 * Free text exists as well, but a moderator working through a queue at speed
 * writes "bad photo", which tells the student nothing. These are written to be
 * shown verbatim to the student and to be actionable in one read.
 */
export const RETAKE_REASONS = {
  NO_FACE: 'We could not see a face in your photo. Retake it looking straight at the camera.',
  TOO_DARK: 'Your photo is too dark to match at the gate. Retake it facing a window or a light.',
  BLURRED: 'Your photo is blurred. Hold the phone still and retake it.',
  FACE_COVERED:
    'Your face is partly covered. Remove anything covering it — a mask, sunglasses, a cap — and retake the photo.',
  NOT_A_PERSON: 'Your photo is not a picture of you. Take a live selfie to continue.',
  MULTIPLE_PEOPLE:
    'There is more than one person in your photo. Retake it with only yourself in frame.',
  WRONG_ORIENTATION: 'Your photo is sideways. Hold the phone upright and retake it.',
  NAME_MISMATCH:
    'The name on your registration does not match our admissions records. Correct it and resubmit.',
} as const

export type RetakeReasonCode = keyof typeof RETAKE_REASONS

export const retakeReasonCode = z.enum(
  Object.keys(RETAKE_REASONS) as [RetakeReasonCode, ...RetakeReasonCode[]],
)

/**
 * Approve, ask for a fix, or reject.
 *
 * A discriminated union rather than `{ status, note? }` because the note is
 * mandatory for exactly one of the three decisions and optional for the others,
 * and encoding that in the type is what stops a REVISION_REQUESTED landing in a
 * student's portal with no explanation of what to change.
 */
export const reviewRequest = z.discriminatedUnion('decision', [
  z.strictObject({
    decision: z.literal('APPROVE'),
    note: z.string().trim().max(500).optional(),
  }),
  z.strictObject({
    decision: z.literal('REQUEST_REVISION'),
    /** One canned reason, or free text, or both. At least one is required. */
    reasonCode: retakeReasonCode.optional(),
    note: z.string().trim().min(1).max(500).optional(),
  }),
  z.strictObject({
    decision: z.literal('REJECT'),
    /** Terminal, and there is no resubmission path, so a reason is mandatory. */
    note: z.string().trim().min(1).max(500),
  }),
])
export type ReviewRequest = z.infer<typeof reviewRequest>

export interface ReviewResponse {
  registrationId: string
  status: RegistrationStatus
  /** Issued on approval when the student had no pass yet. */
  passCode10: string | null
}

export const revokePassRequest = z.strictObject({
  reason: z.string().trim().min(1).max(300),
  /** The code being revoked, typed back. Guards against a mis-clicked row. */
  confirmCode10: z.string().trim().min(10).max(14),
})
export type RevokePassRequest = z.infer<typeof revokePassRequest>

export const restorePassRequest = z.strictObject({
  reason: z.string().trim().min(1).max(300),
})
export type RestorePassRequest = z.infer<typeof restorePassRequest>

/**
 * A check-in an admin records by hand at the help desk.
 *
 * Same table and the same unique constraint as a scanner's, so a manual entry
 * for someone who already walked through fails the way a duplicate scan does,
 * rather than creating a second arrival.
 */
export const manualCheckInRequest = z.strictObject({
  gateCode: z.string().trim().min(1).max(20).default('MAIN'),
  guestsAdmitted: z.number().int().min(0).max(2),
  note: z.string().trim().max(300).optional(),
})
export type ManualCheckInRequest = z.infer<typeof manualCheckInRequest>

/**
 * Reverse a check-in. Appends, never deletes (D9).
 *
 * The `CheckIn` row is removed so the student can enter — that is the one place
 * the system deletes anything — and the reversal is recorded in the audit log
 * with the original values. Without this, one mis-scan locks a real student out
 * of their own orientation, and the help desk has no answer.
 */
export const reverseCheckInRequest = z.strictObject({
  reason: z.string().trim().min(1).max(300),
  confirmCheckInId: cuid,
})
export type ReverseCheckInRequest = z.infer<typeof reverseCheckInRequest>

// ─────────────────────────────────────────────────────────────────────────────
// Moderation queue
// ─────────────────────────────────────────────────────────────────────────────

export const moderationQueueQuery = pageQuery.extend({
  /** `flagged` puts no-face and roster-name-mismatch first. */
  filter: z.enum(['pending', 'flagged', 'all']).default('pending'),
})
export type ModerationQueueQuery = z.infer<typeof moderationQueueQuery>

export interface ModerationItem {
  registrationId: string
  reference: string
  status: RegistrationStatus
  name: string
  /** From the roster, so a moderator can see a divergence without a second read. */
  rosterName: string
  program: string
  formNumber: string
  faceDetected: boolean | null
  submittedAt: string
  /**
   * A fresh ~60-second signed URL. Not persisted, not cached, and fetching this
   * list writes a `selfie.viewed` audit entry per item — viewing a queue of
   * students' faces is exactly the access the DPDP audit trail is for.
   */
  selfieUrl: string | null
  guestCount: number
}

// ─────────────────────────────────────────────────────────────────────────────
// System settings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every field optional: this is a PATCH of one row, and an admin toggling
 * registration open should not have to re-send a retention policy they did not
 * touch. `.strictObject` still refuses unknown keys, so a renamed field fails
 * loudly instead of being silently dropped.
 */
export const settingsUpdateRequest = z
  .strictObject({
    registrationOpen: z.boolean().optional(),
    registrationOpensAt: z.iso.datetime().nullable().optional(),
    registrationClosesAt: z.iso.datetime().nullable().optional(),
    /** D22. False routes submissions to PENDING_REVIEW instead of issuing a pass. */
    autoApprove: z.boolean().optional(),
    /**
     * DPDP retention for selfies. Capped at 180 days: the lawful basis is running
     * this event, and a year-old selfie has no basis at all. Minimum 1, because 0
     * would delete an image before the gate could use it.
     */
    selfieRetentionDays: z.number().int().min(1).max(180).optional(),
    /** 0 is legitimate — a year the university admits no guests at all. */
    maxCompanions: z.number().int().min(0).max(MAX_COMPANIONS).optional(),
    sseDegradeThreshold: z.number().int().min(100).max(50_000).optional(),
    /**
     * Bumping this invalidates every volunteer device's cached manifest, which
     * makes ~10 devices re-download at once. Deliberately a separate switch from
     * anything that changes automatically.
     */
    bumpManifestVersion: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    error: 'Nothing to change.',
  })
export type SettingsUpdateRequest = z.infer<typeof settingsUpdateRequest>

export interface SettingsResponse {
  registrationOpen: boolean
  registrationOpensAt: string | null
  registrationClosesAt: string | null
  autoApprove: boolean
  consentVersion: string
  selfieRetentionDays: number
  maxCompanions: number
  manifestVersion: number
  sseDegradeThreshold: number
  updatedAt: string
  updatedBy: string | null
}

export const gateUpdateRequest = z.strictObject({
  code: z.string().trim().min(1).max(20).toUpperCase(),
  name: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
  opensAt: z.iso.datetime().nullable().optional(),
  closesAt: z.iso.datetime().nullable().optional(),
})
export type GateUpdateRequest = z.infer<typeof gateUpdateRequest>

export interface GateView {
  id: string
  code: string
  name: string
  isActive: boolean
  opensAt: string | null
  closesAt: string | null
  checkInCount: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloudinary credentials
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A spare Cloudinary account, for when the primary fills up mid-event.
 *
 * The API secret is written straight into AES-256-GCM under `SECRETS_KEY` and is
 * never selected back out — not by this API, not by the admin UI. The response
 * type below has no field for it, which is the enforcement: there is nowhere to
 * put it even by accident.
 */
export const cloudinaryAddRequest = z.strictObject({
  label: z.string().trim().min(1).max(60),
  cloudName: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,60}$/, { error: 'A Cloudinary cloud name is lowercase.' }),
  apiKey: z.string().trim().regex(/^[0-9]{12,20}$/, { error: 'A Cloudinary API key is digits.' }),
  apiSecret: z.string().trim().min(20).max(120),
  /** Lower is tried first. Environment credentials are effectively 0. */
  priority: z.number().int().min(1).max(999).default(100),
  storageLimitBytes: z.number().int().min(0).nullable().optional(),
})
export type CloudinaryAddRequest = z.infer<typeof cloudinaryAddRequest>

export const cloudinaryUpdateRequest = z
  .strictObject({
    label: z.string().trim().min(1).max(60).optional(),
    isActive: z.boolean().optional(),
    priority: z.number().int().min(1).max(999).optional(),
    storageLimitBytes: z.number().int().min(0).nullable().optional(),
    /** Clears `lastError` so a fixed account is retried. */
    clearError: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { error: 'Nothing to change.' })
export type CloudinaryUpdateRequest = z.infer<typeof cloudinaryUpdateRequest>

export interface CloudinaryConfigView {
  id: string
  label: string
  cloudName: string
  /** Last four digits only. The full key identifies the account to an attacker. */
  apiKeyMasked: string
  priority: number
  isActive: boolean
  storageUsedBytes: string
  storageLimitBytes: string | null
  uploadCount: number
  usageCheckedAt: string | null
  lastErrorAt: string | null
  lastError: string | null
  createdBy: string | null
  createdAt: string
}

/** The environment credentials, shown alongside the spares as priority 0. */
export interface CloudinaryPrimaryView {
  cloudName: string
  apiKeyMasked: string
  configured: boolean
  /** From Cloudinary's usage API, when it answered. */
  storageUsedBytes: string | null
  storageLimitBytes: string | null
  usageCheckedAt: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Broadcasts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Published to Redis for anyone connected and persisted for everyone else — SSE
 * only reaches a client that is already listening, and a student who opens the
 * app after an EMERGENCY still has to see it.
 */
export const broadcastRequest = z.strictObject({
  priority: broadcastPriority.default('INFO'),
  audience: broadcastAudience.default('ALL'),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(600),
  expiresAt: z.iso.datetime().nullable().optional(),
  /**
   * EMERGENCY interrupts every connected screen, so it takes a second deliberate
   * action. A mis-clicked severity in front of 15,000 people is a stampede risk,
   * and this is the cheapest possible guard against it.
   */
  confirmEmergency: z.boolean().default(false),
})
export type BroadcastRequest = z.infer<typeof broadcastRequest>

export interface BroadcastView {
  id: string
  priority: 'INFO' | 'WARNING' | 'EMERGENCY'
  audience: 'STUDENTS' | 'VOLUNTEERS' | 'ALL'
  title: string
  body: string
  publishedAt: string | null
  expiresAt: string | null
  createdBy: string | null
  createdAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every export writes a `data.exported` audit entry with the dataset and the row
 * count. An admin downloading 15,000 names and phone numbers is the single
 * largest PII egress the system has, and it should never be invisible.
 */
export const exportQuery = z.strictObject({
  dataset: z.enum(['registrations', 'checkins', 'roster', 'scan-events', 'audit']),
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  status: registrationStatus.optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  /**
   * Off by default. When false the contact column is masked, which covers the
   * ordinary "how many people came" question without shipping a phone book.
   */
  includeContact: z.coerce.boolean().default(false),
})
export type ExportQuery = z.infer<typeof exportQuery>

// ─────────────────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────────────────

export const auditQuery = pageQuery.extend({
  action: z.string().trim().max(60).optional(),
  actorId: z.string().trim().max(40).optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(40).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  /** Only the entries that recorded a read of personal data. */
  piiOnly: z.coerce.boolean().default(false),
})
export type AuditQuery = z.infer<typeof auditQuery>

export interface AuditEntryView {
  id: string
  actorId: string | null
  actorLabel: string | null
  actorRole: Role | null
  action: string
  entityType: string
  entityId: string | null
  before: unknown
  after: unknown
  ip: string | null
  userAgent: string | null
  createdAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Roles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grant a role.
 *
 * Postgres first, then Clerk's `publicMetadata` as a mirror — see `setRole` in
 * `apps/web/lib/server/auth.ts`. That order is deliberate and it is the opposite of
 * the obvious one: `publicMetadata` is readable by the client, so writing it first
 * would open a window in which a browser can see a role the database has not
 * granted. The middleware reads the metadata for a cheap edge check and every write
 * path re-reads the database, so a mirror that lags is a slow sign-in, while a
 * mirror that leads is a privilege escalation.
 */
export const roleGrantRequest = z.strictObject({
  clerkUserId: z.string().trim().min(5).max(60),
  role,
  reason: z.string().trim().min(1).max(200),
})
export type RoleGrantRequest = z.infer<typeof roleGrantRequest>

export interface StaffView {
  id: string
  clerkUserId: string
  email: string | null
  name: string | null
  role: Role
  isActive: boolean
  lastSeenAt: string | null
  checkInsScanned: number
}

export { scanOutcome }
