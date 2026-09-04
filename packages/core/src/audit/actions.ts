/**
 * The vocabulary of the audit log.
 *
 * Every action string that can be written to `AuditLog.action` is declared here
 * and nowhere else. The table is append-only — enforced by a Postgres trigger,
 * not by application code ([D20](../../../../docs/01-decisions.md)) — so a typo
 * cannot be corrected after the fact. `AuditAction` being a closed union means a
 * typo does not compile.
 *
 * ## What gets logged
 *
 * Two categories, and the second is the one that matters legally:
 *
 *   1. **Mutations of consequence.** Roster imports, moderation verdicts,
 *      revocations, config changes, exports. Who changed what, and when.
 *   2. **Reads of sensitive personal data.** Every time a selfie is viewed, and
 *      every time student data leaves the system as a file. Under the DPDP Act
 *      2023 a selfie is sensitive personal data, and "who looked at this photo"
 *      is a question the university has to be able to answer.
 *
 * Ordinary reads are not logged. A log that records every page view is a log
 * nobody reads, and it would bury the accesses that matter.
 *
 * ## Naming
 *
 * `subject.verb`, past tense, lower case. The subject is the thing acted upon so
 * that `LIKE 'selfie.%'` answers "everything that happened to selfies" without a
 * schema change.
 *
 * Pure and dependency-free: constants and types.
 */

export const AUDIT_ACTIONS = {
  // ── roster ────────────────────────────────────────────────────────────────
  /** A workbook was parsed and previewed. No writes. Logged because an upload
   *  puts 15,000 people's data in a request body, successfully or not. */
  ROSTER_PREVIEWED: 'roster.previewed',
  ROSTER_IMPORTED: 'roster.imported',
  ROSTER_IMPORT_REJECTED: 'roster.import_rejected',
  ROSTER_ROLLED_BACK: 'roster.rolled_back',

  // ── registration ──────────────────────────────────────────────────────────
  REGISTRATION_SUBMITTED: 'registration.submitted',
  REGISTRATION_APPROVED: 'registration.approved',
  REGISTRATION_REVISION_REQUESTED: 'registration.revision_requested',
  REGISTRATION_EDITED_BY_ADMIN: 'registration.edited_by_admin',
  /** The claim on an `AdmittedStudent` row was released, freeing the form number. */
  REGISTRATION_CLAIM_RELEASED: 'registration.claim_released',

  // ── passes ────────────────────────────────────────────────────────────────
  PASS_ISSUED: 'pass.issued',
  PASS_REISSUED: 'pass.reissued',
  PASS_REVOKED: 'pass.revoked',
  PASS_RESTORED: 'pass.restored',

  // ── the gate ──────────────────────────────────────────────────────────────
  CHECKIN_RECORDED: 'checkin.recorded',
  /** A volunteer admitted somebody against an `OUT_OF_WINDOW` verdict. The only
   *  override the system allows, so it is recorded with the verdict it overrode. */
  CHECKIN_OVERRIDDEN: 'checkin.overridden',
  CHECKIN_REVERSED: 'checkin.reversed',
  /** A device's outbox was flushed. Carries counts, not rows. */
  SCANNER_SYNCED: 'scanner.synced',
  MANIFEST_ISSUED: 'manifest.issued',

  // ── selfies: sensitive personal data, every touch recorded ────────────────
  SELFIE_UPLOADED: 'selfie.uploaded',
  /** A signed URL was minted for a volunteer or admin. The access, not the view —
   *  the URL is what we can observe, and it is what grants the ability to look. */
  SELFIE_VIEWED: 'selfie.viewed',
  SELFIE_REPLACED: 'selfie.replaced',
  SELFIE_DELETED: 'selfie.deleted',
  /** The retention sweep ran. One row for the batch, with a count. */
  SELFIE_RETENTION_SWEEP: 'selfie.retention_sweep',

  // ── configuration ─────────────────────────────────────────────────────────
  CONFIG_UPDATED: 'config.updated',
  REGISTRATION_WINDOW_CHANGED: 'config.registration_window_changed',
  GATE_WINDOW_CHANGED: 'config.gate_window_changed',
  CLOUDINARY_CONFIG_ADDED: 'cloudinary.config_added',
  CLOUDINARY_CONFIG_ACTIVATED: 'cloudinary.config_activated',
  CLOUDINARY_CONFIG_DISABLED: 'cloudinary.config_disabled',

  // ── communications ────────────────────────────────────────────────────────
  BROADCAST_SENT: 'broadcast.sent',

  // ── data leaving the system ───────────────────────────────────────────────
  /** An export is a copy of student PII on somebody's laptop. Always logged, with
   *  the row count and the filters that produced it. */
  DATA_EXPORTED: 'data.exported',

  // ── access control ────────────────────────────────────────────────────────
  ROLE_GRANTED: 'role.granted',
  ROLE_REVOKED: 'role.revoked',
  /** A request reached an admin or volunteer endpoint without the role for it.
   *  Rare and interesting; frequent and interesting for a different reason. */
  ACCESS_DENIED: 'access.denied',
} as const

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

/** Every action, for validation at a boundary and for the admin log filter. */
export const AUDIT_ACTION_VALUES: readonly AuditAction[] = Object.values(AUDIT_ACTIONS)

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTION_VALUES as readonly string[]).includes(value)
}

/**
 * The kind of record an action is about, for grouping in the admin log viewer.
 *
 * Derived from the action's own prefix rather than stored, so a new action cannot
 * be filed under the wrong heading.
 */
export type AuditSubject =
  | 'roster'
  | 'registration'
  | 'pass'
  | 'checkin'
  | 'scanner'
  | 'manifest'
  | 'selfie'
  | 'config'
  | 'cloudinary'
  | 'broadcast'
  | 'data'
  | 'role'
  | 'access'

export function auditSubject(action: AuditAction): AuditSubject {
  return (action.split('.')[0] ?? 'access') as AuditSubject
}

/**
 * Actions that record a read of sensitive personal data.
 *
 * Separated because they answer a different question — a DPDP access request, or
 * an investigation into who looked at a student's photograph — and because they
 * are the ones that must never be pruned by a retention policy that trims the
 * rest of the log.
 */
export const PII_ACCESS_ACTIONS: readonly AuditAction[] = [
  AUDIT_ACTIONS.SELFIE_VIEWED,
  AUDIT_ACTIONS.DATA_EXPORTED,
  AUDIT_ACTIONS.ROSTER_PREVIEWED,
]

export function isPiiAccess(action: AuditAction): boolean {
  return PII_ACCESS_ACTIONS.includes(action)
}
