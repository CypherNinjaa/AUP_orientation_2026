/**
 * Roster ingestion: parsed students → `AdmittedStudent` rows.
 *
 * One implementation, two callers. `packages/db/prisma/seed.ts` runs it from the
 * command line and the admin upload endpoint runs it from the browser, so a file
 * that previews cleanly in the admin UI seeds identically from a terminal.
 *
 * The parsing happens before this — see `@orientation/core/roster`. This module
 * only decides what to write, and it is deliberately conservative about it:
 *
 *   - It never touches `isClaimed`, `claimedByUserId` or `claimedAt`. A re-import
 *     of a corrected file must not release a pass a student already holds.
 *   - It only issues an UPDATE for rows whose values actually differ, so a
 *     re-import of an unchanged file writes nothing and reports it as such.
 *   - It records the previous values of every row it changed, so the import can
 *     be rolled back.
 *   - It refuses a file whose SHA-256 matches an already-committed import, which
 *     is the easy way to double a roster.
 */
import type { ColumnMap, RosterParseResult, RosterStudent } from '@orientation/core/roster'
import { Prisma, RosterImportStatus } from '@prisma/client'
import { prisma } from '../index'

/** Fields a re-import is allowed to correct. Claim state is not among them. */
const MUTABLE_SCALARS = [
  'serialNo',
  'name',
  'program',
  'programLevel',
  'contactNo',
  'altContactNo',
  'paymentStatus',
] as const

type MutableScalar = (typeof MUTABLE_SCALARS)[number]

/** A row as it exists in the database, limited to what an import may change. */
interface ExistingRow extends Record<MutableScalar, string | number | null> {
  id: string
  formNumber: string
  extraContacts: string[]
  isClaimed: boolean
}

export interface IngestOptions {
  /** Shown in the admin import history. Basename only, never a full path. */
  filename: string
  /** SHA-256 of the uploaded bytes, lowercase hex. */
  fileHash: string
  /** The admin performing the upload, or null for the CLI seed. */
  uploadedById?: string | null
  /**
   * Report what would change and write nothing but the `DRY_RUN` import record.
   * This is what the admin preview screen runs.
   */
  dryRun?: boolean
  /**
   * Commit a file whose hash matches an earlier committed import. Only set this
   * when a human has been shown the earlier import and said yes. Ignored for a
   * dry run, which writes nothing and is a reasonable thing to ask about a file
   * that is already in.
   */
  allowDuplicateFile?: boolean
}

export interface IngestResult {
  importId: string
  status: RosterImportStatus
  totalRows: number
  created: number
  updated: number
  /** Present in the file and in the database, with nothing to change. */
  unchanged: number
  /** Rejected by the parser; see `parsed.issues`. */
  errored: number
  /**
   * Rows in the database that this file does not mention. Never deleted — a
   * partial file is far more likely than a genuine withdrawal.
   */
  absentFromFile: number
  /** Set when the same bytes were already committed and `allowDuplicateFile` was not. */
  duplicateOf?: { importId: string; filename: string; committedAt: Date | null }
}

/** JSON columns hold report data; this also drops `undefined`, which JSON cannot. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function sameContacts(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

/**
 * Which mutable fields differ between the file and the database.
 *
 * Returns an empty object when the row is already correct, which is what lets a
 * re-import of an unchanged file be a no-op rather than 830 pointless writes and
 * 830 `updatedAt` bumps.
 */
function diff(
  incoming: RosterStudent,
  existing: ExistingRow,
): { changes: Prisma.AdmittedStudentUpdateInput; before: Record<string, unknown> } {
  const changes: Prisma.AdmittedStudentUpdateInput = {}
  const before: Record<string, unknown> = {}

  for (const field of MUTABLE_SCALARS) {
    if (incoming[field] !== existing[field]) {
      // The index signature on ExistingRow keeps this honest: both sides are the
      // same primitive union, so there is no cast here.
      Object.assign(changes, { [field]: incoming[field] })
      before[field] = existing[field]
    }
  }

  if (!sameContacts(incoming.extraContacts, existing.extraContacts)) {
    changes.extraContacts = { set: incoming.extraContacts }
    before.extraContacts = existing.extraContacts
  }

  return { changes, before }
}

/**
 * Cap on how many previous row values are kept for rollback.
 *
 * A full 15,000-row correction would otherwise write a multi-megabyte blob into
 * one jsonb column. Past the cap the import is still committed, but it records
 * that its snapshot is partial so nobody trusts a rollback that cannot restore
 * everything.
 */
const MAX_SNAPSHOT_ROWS = 5000

export async function ingestRoster(
  parsed: RosterParseResult,
  options: IngestOptions,
): Promise<IngestResult> {
  const { filename, fileHash, uploadedById = null, dryRun = false } = options

  if (options.allowDuplicateFile !== true && !dryRun) {
    const previous = await prisma.rosterImport.findFirst({
      where: { fileHash, status: RosterImportStatus.COMMITTED },
      orderBy: { createdAt: 'desc' },
      select: { id: true, filename: true, committedAt: true },
    })

    if (previous !== null) {
      const record = await prisma.rosterImport.create({
        data: {
          filename,
          fileHash,
          status: RosterImportStatus.FAILED,
          totalRows: parsed.totalRows,
          errored: parsed.rejectedRows,
          columnMap: toJson(parsed.headers.map satisfies ColumnMap),
          report: toJson({
            refused: 'duplicate-file',
            duplicateOf: previous.id,
            message: `These exact bytes were already committed as import ${previous.id}.`,
          }),
          uploadedById,
        },
        select: { id: true },
      })

      return {
        importId: record.id,
        status: RosterImportStatus.FAILED,
        totalRows: parsed.totalRows,
        created: 0,
        updated: 0,
        unchanged: 0,
        errored: parsed.rejectedRows,
        absentFromFile: 0,
        duplicateOf: {
          importId: previous.id,
          filename: previous.filename,
          committedAt: previous.committedAt,
        },
      }
    }
  }

  // One read of the whole table rather than 15,000 upserts. At this scale the
  // table is a few megabytes, and having it in memory is what makes it possible
  // to distinguish "changed" from "already correct".
  const existingRows = await prisma.admittedStudent.findMany({
    select: {
      id: true,
      formNumber: true,
      serialNo: true,
      name: true,
      program: true,
      programLevel: true,
      contactNo: true,
      altContactNo: true,
      extraContacts: true,
      paymentStatus: true,
      isClaimed: true,
    },
  })

  const existingByForm = new Map<string, ExistingRow>(
    existingRows.map((row) => [row.formNumber, row]),
  )

  const toCreate: RosterStudent[] = []
  const toUpdate: Array<{ formNumber: string; changes: Prisma.AdmittedStudentUpdateInput }> = []
  const snapshot: Array<{ formNumber: string; before: Record<string, unknown> }> = []
  let unchanged = 0
  let snapshotTruncated = false

  for (const student of parsed.students) {
    const existing = existingByForm.get(student.formNumber)
    if (existing === undefined) {
      toCreate.push(student)
      continue
    }

    const { changes, before } = diff(student, existing)
    if (Object.keys(changes).length === 0) {
      unchanged += 1
      continue
    }

    toUpdate.push({ formNumber: student.formNumber, changes })
    if (snapshot.length < MAX_SNAPSHOT_ROWS) snapshot.push({ formNumber: student.formNumber, before })
    else snapshotTruncated = true
  }

  const seenInFile = new Set(parsed.students.map((s) => s.formNumber))
  const absentFromFile = existingRows.filter((row) => !seenInFile.has(row.formNumber)).length

  const status = dryRun ? RosterImportStatus.DRY_RUN : RosterImportStatus.COMMITTED

  const report = toJson({
    headers: {
      matched: parsed.headers.matched,
      unmapped: parsed.headers.unmapped,
    },
    issues: parsed.issues,
    issuesTruncated: parsed.issuesTruncated,
    snapshotTruncated,
    absentFromFile,
  })

  if (dryRun) {
    const record = await prisma.rosterImport.create({
      data: {
        filename,
        fileHash,
        status,
        totalRows: parsed.totalRows,
        created: toCreate.length,
        updated: toUpdate.length,
        skipped: unchanged,
        errored: parsed.rejectedRows,
        columnMap: toJson(parsed.headers.map satisfies ColumnMap),
        report,
        uploadedById,
      },
      select: { id: true },
    })

    return {
      importId: record.id,
      status,
      totalRows: parsed.totalRows,
      created: toCreate.length,
      updated: toUpdate.length,
      unchanged,
      errored: parsed.rejectedRows,
      absentFromFile,
    }
  }

  // Everything below is one transaction: either the whole file lands or none of
  // it does. A half-applied roster is the state where some students can claim a
  // pass and others are told they are not admitted.
  const result = await prisma.$transaction(
    async (tx) => {
      const record = await tx.rosterImport.create({
        data: {
          filename,
          fileHash,
          status,
          totalRows: parsed.totalRows,
          columnMap: toJson(parsed.headers.map satisfies ColumnMap),
          report,
          snapshot: snapshot.length > 0 ? toJson(snapshot) : undefined,
          uploadedById,
        },
        select: { id: true },
      })

      let created = 0
      for (let i = 0; i < toCreate.length; i += 1000) {
        const chunk = toCreate.slice(i, i + 1000)
        const written = await tx.admittedStudent.createMany({
          // A row that appeared between the read above and this write is skipped
          // rather than crashing the whole import.
          skipDuplicates: true,
          data: chunk.map((student) => ({
            serialNo: student.serialNo,
            formNumber: student.formNumber,
            name: student.name,
            program: student.program,
            programLevel: student.programLevel,
            contactNo: student.contactNo,
            altContactNo: student.altContactNo,
            extraContacts: student.extraContacts,
            paymentStatus: student.paymentStatus,
            createdByImportId: record.id,
          })),
        })
        created += written.count
      }

      for (const { formNumber, changes } of toUpdate) {
        await tx.admittedStudent.update({ where: { formNumber }, data: changes })
      }

      await tx.rosterImport.update({
        where: { id: record.id },
        data: {
          created,
          updated: toUpdate.length,
          skipped: unchanged,
          errored: parsed.rejectedRows,
          committedAt: new Date(),
        },
      })

      return { importId: record.id, created }
    },
    // 15,000 individual updates is the worst case and it is slow but bounded.
    { timeout: 300_000, maxWait: 15_000 },
  )

  return {
    importId: result.importId,
    status,
    totalRows: parsed.totalRows,
    created: result.created,
    updated: toUpdate.length,
    unchanged,
    errored: parsed.rejectedRows,
    absentFromFile,
  }
}
