/**
 * Undoing the most recent roster import.
 *
 * `ingestRoster` deliberately has no rollback path: it is shared with the CLI seed
 * and rollback is an admin-console operation with rules that only make sense there.
 * Those rules are three, and each one exists because the obvious implementation
 * gets it wrong:
 *
 *   1. **Only the most recent committed import.** An older one's snapshot holds the
 *      values that were current *then*. Restoring it would overwrite corrections a
 *      later import has since made — a rollback that silently reverts somebody
 *      else's fix is worse than a refusal.
 *   2. **A claimed row is never deleted.** `isClaimed` means a student has already
 *      registered against that form number, and `Registration.admittedStudentId` is
 *      a foreign key: deleting the row would either fail on the constraint or, with
 *      a cascade, take a real registration and its pass with it. Those rows are
 *      counted and reported instead.
 *   3. **Updates are restored from the snapshot, not recomputed.** The snapshot is
 *      the only record of what a field held before, and `ingestRoster` caps it at
 *      5,000 rows and records `snapshotTruncated` when it had to. A truncated
 *      snapshot means the restore is partial, and the response says so rather than
 *      claiming a clean undo.
 *
 * The delete and the restore are one transaction. A half-rolled-back roster is
 * indistinguishable from a corrupt one.
 */
import 'server-only'

import { Prisma, RosterImportStatus, prisma } from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import type { RosterRollbackRequest, RosterRollbackResponse } from '@orientation/contracts'

import type { Actor } from '../auth'
import { writeAudit } from '../audit'
import { abort } from '../http'
import type { RequestMeta } from '../registration'

/**
 * One row's previous values, as `ingestRoster` wrote them.
 *
 * Deliberately `unknown` per field: this comes back out of a `Json` column, so it
 * is untrusted at the type level even though this codebase wrote it. Each value is
 * checked before it reaches an update.
 */
interface SnapshotEntry {
  formNumber: string
  before: Record<string, unknown>
}

/**
 * Fields a rollback is allowed to restore — the same list `ingestRoster` is allowed
 * to change, and no wider.
 *
 * Without this the snapshot would be a blob that can set any column on
 * `AdmittedStudent`, including `isClaimed`. It is written by this codebase, but it
 * has been through a `jsonb` column and back, and an allow-list costs one constant.
 */
const RESTORABLE = new Set([
  'serialNo',
  'name',
  'program',
  'programLevel',
  'contactNo',
  'altContactNo',
  'paymentStatus',
  'extraContacts',
])

function isSnapshotEntry(value: unknown): value is SnapshotEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.formNumber === 'string' &&
    typeof entry.before === 'object' &&
    entry.before !== null &&
    !Array.isArray(entry.before)
  )
}

/**
 * Turn one snapshot entry into an update payload.
 *
 * Returns `null` when nothing in it is restorable, so a malformed entry is skipped
 * rather than issuing an empty `UPDATE` that bumps `updatedAt` for no reason.
 */
function toUpdate(before: Record<string, unknown>): Prisma.AdmittedStudentUpdateInput | null {
  const data: Prisma.AdmittedStudentUpdateInput = {}
  let touched = false

  for (const [field, value] of Object.entries(before)) {
    if (!RESTORABLE.has(field)) continue

    if (field === 'extraContacts') {
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) continue
      data.extraContacts = { set: value }
      touched = true
      continue
    }

    if (field === 'serialNo') {
      if (value !== null && typeof value !== 'number') continue
      data.serialNo = value
      touched = true
      continue
    }

    // Every other restorable field is `String` or `String?` in the schema.
    if (value !== null && typeof value !== 'string') continue
    Object.assign(data, { [field]: value })
    touched = true
  }

  return touched ? data : null
}

export async function rollbackImport(
  input: RosterRollbackRequest,
  actor: Actor,
  meta: RequestMeta,
): Promise<RosterRollbackResponse> {
  const target = await prisma.rosterImport.findUnique({
    where: { id: input.importId },
    select: {
      id: true,
      filename: true,
      status: true,
      snapshot: true,
      report: true,
      committedAt: true,
    },
  })

  if (target === null) abort('NOT_FOUND', 'No such import.')

  if (target.status !== RosterImportStatus.COMMITTED) {
    abort(
      'CONFLICT',
      target.status === RosterImportStatus.ROLLED_BACK
        ? 'That import has already been rolled back.'
        : 'Only a committed import can be rolled back.',
    )
  }

  // Rule 1. Checked against the database rather than against what the UI sent,
  // because the button may have been enabled when the page loaded and a colleague
  // may have committed another file since.
  const latest = await prisma.rosterImport.findFirst({
    where: { status: RosterImportStatus.COMMITTED },
    orderBy: { createdAt: 'desc' },
    select: { id: true, filename: true },
  })

  if (latest !== null && latest.id !== target.id) {
    abort(
      'CONFLICT',
      `"${latest.filename}" was committed after this one. Roll that back first — restoring an older import would undo the newer corrections.`,
    )
  }

  // The typed confirmation, checked here and not only in the schema: the schema
  // proves a string arrived, this proves it is the right string.
  if (input.confirmFilename.trim() !== target.filename) {
    abort(
      'VALIDATION_FAILED',
      `Type the filename exactly to confirm: "${target.filename}".`,
    )
  }

  const snapshotRaw = target.snapshot
  // `SnapshotEntry` is not a subtype of Prisma's `JsonValue` — its `before` is an
  // index of `unknown`, not of JSON — so the array is widened to `unknown[]` for
  // the predicate to apply. `isSnapshotEntry` is what actually validates.
  const entries: SnapshotEntry[] = Array.isArray(snapshotRaw)
    ? (snapshotRaw as unknown[]).filter(isSnapshotEntry)
    : []

  const snapshotTruncated =
    typeof target.report === 'object' &&
    target.report !== null &&
    !Array.isArray(target.report) &&
    (target.report as Record<string, unknown>).snapshotTruncated === true

  const rolledBackAt = new Date()

  const outcome = await prisma.$transaction(
    async (tx) => {
      // Rule 2. Counted before the delete so the number is what was actually kept,
      // not what a second query says after the fact.
      const keptBecauseClaimed = await tx.admittedStudent.count({
        where: { createdByImportId: target.id, isClaimed: true },
      })

      const { count: deleted } = await tx.admittedStudent.deleteMany({
        where: { createdByImportId: target.id, isClaimed: false },
      })

      // Rule 3. One update per row, because each row restores different fields.
      // Bounded by `MAX_SNAPSHOT_ROWS` in `ingestRoster`, so at most 5,000.
      let restored = 0
      for (const entry of entries) {
        const data = toUpdate(entry.before)
        if (data === null) continue

        // `updateMany` and not `update`: the row may have been deleted in the
        // meantime, and a missing row should be a skip rather than a thrown
        // `P2025` that aborts a rollback halfway through.
        const { count } = await tx.admittedStudent.updateMany({
          where: { formNumber: entry.formNumber },
          data,
        })
        restored += count
      }

      await tx.rosterImport.update({
        where: { id: target.id },
        data: { status: RosterImportStatus.ROLLED_BACK, rolledBackAt },
      })

      return { deleted, restored, keptBecauseClaimed }
    },
    { timeout: 300_000, maxWait: 15_000 },
  )

  await writeAudit({
    action: AUDIT_ACTIONS.ROSTER_ROLLED_BACK,
    entityType: 'RosterImport',
    entityId: target.id,
    actor,
    before: {
      filename: target.filename,
      committedAt: target.committedAt?.toISOString() ?? null,
    },
    after: {
      deleted: outcome.deleted,
      restored: outcome.restored,
      keptBecauseClaimed: outcome.keptBecauseClaimed,
      snapshotEntries: entries.length,
      snapshotTruncated,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return {
    importId: target.id,
    deleted: outcome.deleted,
    restored: outcome.restored,
    keptBecauseClaimed: outcome.keptBecauseClaimed,
    rolledBackAt: rolledBackAt.toISOString(),
  }
}
