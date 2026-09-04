/**
 * Roster upload: preview, commit, history.
 *
 * A roster import is the most destructive operation in the console — it can
 * rename 15,000 students — so it is deliberately two requests. The admin uploads,
 * reads which header resolved to which field and what the parser complained
 * about, and only then commits by id. `ingestRoster` does the writing; this module
 * is the boundary in front of it.
 *
 * ## Where the previewed rows live between the two requests
 *
 * `rosterCommitRequest` carries `{ importId, fileHash }` and no file, but
 * `ingestRoster` needs the parsed rows. The `DRY_RUN` import record holds counts
 * and issues, not the 830 students. So the preview stashes the whole
 * `RosterParseResult` in Redis under `roster:staged:<importId>` and the commit
 * reads it back.
 *
 * Redis and not a database table: this is scratch data with a natural expiry,
 * nobody queries it, and the alternative is a `StagedRosterRow` table that has to
 * be swept. Two hours is long enough for an admin to read 500 issues, take a phone
 * call, and come back; past that the file has to be uploaded again, which is a
 * mild inconvenience and not a data loss — the file is still on their disk.
 *
 * `fileHash` is checked against the stash before committing. It pins the commit to
 * the exact bytes that were previewed, so a second upload in another tab cannot
 * substitute a different file under an id the admin already approved.
 *
 * ## Why the upload is not read through `readJson`
 *
 * `readJson` requires `content-type: application/json` and caps the body at 8 MB.
 * A roster is `multipart/form-data` and may be 20 MB, so these handlers read
 * `request.formData()` directly and do their own size and type checks.
 */
import 'server-only'

import { createHash } from 'node:crypto'

import { RosterImportStatus, prisma } from '@orientation/db'
import { ingestRoster } from '@orientation/db/roster'
import { parseRoster } from '@orientation/core/roster'
import { readRosterCsv, readRosterWorkbook } from '@orientation/core/roster/workbook'
import type { RosterField, RosterParseResult } from '@orientation/core/roster'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import { adminChannel } from '@orientation/core/realtime'
import {
  ROSTER_EXTENSIONS,
  ROSTER_MAX_BYTES,
  type RosterCommitRequest,
  type RosterCommitResponse,
  type RosterImportView,
  type RosterIssueView,
  type RosterPreviewResponse,
  type RosterSampleRow,
} from '@orientation/contracts'

import type { Actor } from '../auth'
import { auditPiiAccess, writeAudit } from '../audit'
import { abort } from '../http'
import { cacheDel, cacheGet, cacheSet, publish } from '../redis'
import type { RequestMeta } from '../registration'

/** Long enough to read the report, short enough not to be storage. */
const STAGE_TTL_SECONDS = 2 * 60 * 60

/** How many parsed rows the preview shows so columns can be eyeballed. */
const SAMPLE_ROWS = 8

/** How many issues travel to the browser. The full set stays in the import record. */
const MAX_ISSUES_IN_RESPONSE = 200

function stageKey(importId: string): string {
  return `roster:staged:${importId}`
}

/**
 * What the commit needs and the preview already computed.
 *
 * JSON-safe by construction: `RosterStudent` and `RosterIssue` are strings,
 * numbers and nulls with no `Date` anywhere, so a round trip through Redis is
 * lossless. If a `Date` were ever added to either, this is the line that would
 * quietly start handing `ingestRoster` an ISO string.
 */
interface StagedRoster {
  filename: string
  fileHash: string
  parsed: RosterParseResult
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload validation
// ─────────────────────────────────────────────────────────────────────────────

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot).toLowerCase()
}

/**
 * Basename only, and sanitised.
 *
 * The filename is displayed in the import history and typed back by the admin to
 * confirm a rollback, so it reaches a UI. A browser sends the basename already,
 * but `multipart/form-data` is a wire format an attacker controls: strip anything
 * path-like and cap the length rather than trusting that.
 */
function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'roster'

  // Control characters are dropped by code point rather than by a regex character
  // class, because a class holding literal control characters is invisible in an
  // editor — the same reason `personName` spells out its zero-width range.
  let cleaned = ''
  for (const char of base) {
    const code = char.codePointAt(0) ?? 0
    // C0, DEL and C1. Everything printable, including a Devanagari filename, stays.
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) continue
    cleaned += char
  }

  cleaned = cleaned.trim()
  return (cleaned === '' ? 'roster' : cleaned).slice(0, 200)
}

interface UploadedFile {
  filename: string
  bytes: Buffer
  fileHash: string
}

/**
 * Pull the file out of a multipart body.
 *
 * The extension decides the parser, not the MIME type. Browsers report
 * `application/octet-stream` for an xlsx often enough — and `text/csv` almost
 * never for a `.csv` on Windows — that trusting `file.type` refuses real files.
 * The extension is checked, the bytes are then parsed, and a file that lied about
 * being a workbook fails in the parser with a message that says so.
 */
async function readUpload(request: Request): Promise<UploadedFile> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    abort('UNSUPPORTED_MEDIA_TYPE', 'Upload the roster as a file, not as JSON.')
  }

  // Content-Length is advisory — it can be absent on a chunked upload and it can
  // lie — but when it is present and enormous, refusing here avoids buffering
  // 200 MB before finding out. The real check is on the buffered length below.
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > ROSTER_MAX_BYTES * 1.1) {
    abort('PAYLOAD_TOO_LARGE', `A roster file must be under ${String(ROSTER_MAX_BYTES / 1024 / 1024)} MB.`)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    abort('VALIDATION_FAILED', 'That upload could not be read. Try selecting the file again.')
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    abort('VALIDATION_FAILED', 'Attach the roster file in a field named "file".')
  }

  if (file.size > ROSTER_MAX_BYTES) {
    abort('PAYLOAD_TOO_LARGE', `A roster file must be under ${String(ROSTER_MAX_BYTES / 1024 / 1024)} MB.`)
  }
  if (file.size === 0) {
    abort('VALIDATION_FAILED', 'That file is empty.')
  }

  const filename = safeFilename(file.name)
  const extension = extensionOf(filename)
  if (!(ROSTER_EXTENSIONS as readonly string[]).includes(extension)) {
    abort(
      'UNSUPPORTED_MEDIA_TYPE',
      `Upload an ${ROSTER_EXTENSIONS.join(', ')} file. This one is "${extension === '' ? 'unnamed' : extension}".`,
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.byteLength > ROSTER_MAX_BYTES) {
    abort('PAYLOAD_TOO_LARGE', `A roster file must be under ${String(ROSTER_MAX_BYTES / 1024 / 1024)} MB.`)
  }

  return {
    filename,
    bytes,
    fileHash: createHash('sha256').update(bytes).digest('hex'),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview
// ─────────────────────────────────────────────────────────────────────────────

function toIssueViews(parsed: RosterParseResult): RosterIssueView[] {
  return parsed.issues.slice(0, MAX_ISSUES_IN_RESPONSE).map((issue) => ({
    row: issue.row,
    field: issue.field,
    severity: issue.severity,
    message: issue.message,
    ...(issue.value === undefined ? {} : { value: issue.value }),
  }))
}

function toSample(parsed: RosterParseResult): RosterSampleRow[] {
  return parsed.students.slice(0, SAMPLE_ROWS).map((student) => ({
    formNumber: student.formNumber,
    name: student.name,
    program: student.program,
    programLevel: student.programLevel,
    contactNo: student.contactNo,
  }))
}

/**
 * Header text → field.
 *
 * `HeaderResolution.matched` is field → header text, which is the useful direction
 * for the parser and the wrong one for a human reading a mapping table. The admin
 * is checking "what did the column called `From No.` become?", so the response is
 * keyed by what they can see in Excel.
 */
function invertMatched(matched: Partial<Record<RosterField, string>>): Record<string, string> {
  const inverted: Record<string, string> = {}
  for (const [field, header] of Object.entries(matched)) {
    if (header !== undefined && header !== '') inverted[header] = field
  }
  return inverted
}

export async function previewUpload(
  request: Request,
  actor: Actor,
  meta: RequestMeta,
): Promise<RosterPreviewResponse> {
  const upload = await readUpload(request)

  let read: { rows: (string | number | boolean | Date | null | undefined)[][] }
  try {
    read =
      extensionOf(upload.filename) === '.csv'
        ? readRosterCsv(upload.bytes)
        : await readRosterWorkbook(upload.bytes)
  } catch (error) {
    // The parser's own message names the problem ("The workbook contains no
    // sheets"), and it is written for a person. Anything else is a corrupt file.
    abort(
      'VALIDATION_FAILED',
      error instanceof Error && error.message !== ''
        ? error.message
        : 'That file could not be opened as a spreadsheet.',
    )
  }

  const parsed = parseRoster(read.rows)

  const result = await ingestRoster(parsed, {
    filename: upload.filename,
    fileHash: upload.fileHash,
    uploadedById: actor.id,
    dryRun: true,
  })

  const staged: StagedRoster = {
    filename: upload.filename,
    fileHash: upload.fileHash,
    parsed,
  }
  await cacheSet(stageKey(result.importId), staged, STAGE_TTL_SECONDS)

  // A preview shows names and phone numbers of real students, so it is a PII read
  // and `ROSTER_PREVIEWED` is in `PII_ACCESS_ACTIONS`. The row count is recorded;
  // the rows are not.
  await auditPiiAccess({
    action: AUDIT_ACTIONS.ROSTER_PREVIEWED,
    entityType: 'RosterImport',
    entityId: result.importId,
    actor,
    after: {
      filename: upload.filename,
      fileHash: upload.fileHash,
      totalRows: result.totalRows,
      created: result.created,
      updated: result.updated,
      errored: result.errored,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  // A duplicate file is reported by `ingestRoster` only on a real commit — a dry
  // run is a reasonable question to ask about a file that is already in. So the
  // preview looks it up itself, and the admin sees the warning before committing
  // rather than after being refused.
  const previousCommit = await prisma.rosterImport.findFirst({
    where: { fileHash: upload.fileHash, status: RosterImportStatus.COMMITTED },
    orderBy: { createdAt: 'desc' },
    select: { id: true, filename: true, committedAt: true },
  })

  return {
    importId: result.importId,
    filename: upload.filename,
    fileHash: upload.fileHash,
    totalRows: result.totalRows,
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    errored: result.errored,
    absentFromFile: result.absentFromFile,
    columnMap: invertMatched(parsed.headers.matched),
    unmapped: parsed.headers.unmapped,
    issues: toIssueViews(parsed),
    issuesTruncated: parsed.issuesTruncated || parsed.issues.length > MAX_ISSUES_IN_RESPONSE,
    duplicateOf:
      previousCommit === null
        ? null
        : {
            importId: previousCommit.id,
            filename: previousCommit.filename,
            committedAt: previousCommit.committedAt?.toISOString() ?? null,
          },
    sample: toSample(parsed),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Commit
// ─────────────────────────────────────────────────────────────────────────────

export async function commitImport(
  input: RosterCommitRequest,
  actor: Actor,
  meta: RequestMeta,
): Promise<RosterCommitResponse> {
  const preview = await prisma.rosterImport.findUnique({
    where: { id: input.importId },
    select: { id: true, status: true, filename: true, fileHash: true },
  })

  if (preview === null) abort('NOT_FOUND', 'No such preview.')
  if (preview.status !== RosterImportStatus.DRY_RUN) {
    abort(
      'CONFLICT',
      preview.status === RosterImportStatus.COMMITTED
        ? 'That import was already committed.'
        : `That import is ${preview.status.toLowerCase().replace('_', ' ')} and cannot be committed.`,
    )
  }
  if (preview.fileHash !== input.fileHash) {
    abort('CONFLICT', 'That file has changed since it was previewed. Upload it again.')
  }

  const staged = await cacheGet<StagedRoster>(stageKey(input.importId))
  if (staged === undefined) {
    abort('CONFLICT', 'That preview has expired. Upload the file again.')
  }
  if (staged.fileHash !== input.fileHash) {
    abort('CONFLICT', 'That file has changed since it was previewed. Upload it again.')
  }

  const result = await ingestRoster(staged.parsed, {
    filename: staged.filename,
    fileHash: staged.fileHash,
    uploadedById: actor.id,
    dryRun: false,
    allowDuplicateFile: input.allowDuplicateFile,
  })

  if (result.status === RosterImportStatus.FAILED) {
    // `ingestRoster` wrote a FAILED record explaining itself. Say the same thing
    // in a sentence and name the earlier import so the admin can go and look.
    await writeAudit({
      action: AUDIT_ACTIONS.ROSTER_IMPORT_REJECTED,
      entityType: 'RosterImport',
      entityId: result.importId,
      actor,
      after: { reason: 'duplicate-file', duplicateOf: result.duplicateOf?.importId ?? null },
      ip: meta.ip,
      userAgent: meta.userAgent,
    })

    abort(
      'CONFLICT',
      result.duplicateOf === undefined
        ? 'That roster was refused.'
        : `These exact bytes were already committed as "${result.duplicateOf.filename}". Tick the duplicate override if you meant to apply them again.`,
    )
  }

  // The staged copy has done its job. Dropping it means a double-click on Commit
  // gets "that preview has expired" instead of a second pass over the same rows —
  // which `ingestRoster` would treat as 830 unchanged rows and a duplicate-file
  // refusal, but there is no reason to make it prove that.
  await cacheDel(stageKey(input.importId))

  const committedAt = new Date()

  await writeAudit({
    action: AUDIT_ACTIONS.ROSTER_IMPORTED,
    entityType: 'RosterImport',
    entityId: result.importId,
    actor,
    after: {
      filename: staged.filename,
      fileHash: staged.fileHash,
      previewId: input.importId,
      totalRows: result.totalRows,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      errored: result.errored,
      absentFromFile: result.absentFromFile,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  publish(adminChannel(), {
    type: 'roster.imported',
    importId: result.importId,
    inserted: result.created,
    updated: result.updated,
    at: committedAt.getTime(),
  })

  return {
    importId: result.importId,
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    totalRows: result.totalRows,
    committedAt: committedAt.toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The import history, newest first.
 *
 * `canRollback` is true for exactly one row: the most recent `COMMITTED` import.
 * Rolling back an older one would restore values that a later import has since
 * corrected, so the rule is enforced in `rollbackImport` and mirrored here purely
 * so the UI can disable the button rather than let it fail.
 */
export async function listImports(limit = 30): Promise<RosterImportView[]> {
  const rows = await prisma.rosterImport.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
    select: {
      id: true,
      filename: true,
      status: true,
      totalRows: true,
      created: true,
      updated: true,
      skipped: true,
      errored: true,
      createdAt: true,
      committedAt: true,
      rolledBackAt: true,
      uploadedBy: { select: { name: true, email: true } },
    },
  })

  const rollbackable = rows.find((row) => row.status === RosterImportStatus.COMMITTED)

  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    status: row.status,
    totalRows: row.totalRows,
    created: row.created,
    updated: row.updated,
    skipped: row.skipped,
    errored: row.errored,
    uploadedBy: row.uploadedBy?.name ?? row.uploadedBy?.email ?? null,
    createdAt: row.createdAt.toISOString(),
    committedAt: row.committedAt?.toISOString() ?? null,
    rolledBackAt: row.rolledBackAt?.toISOString() ?? null,
    canRollback: row.id === rollbackable?.id,
  }))
}
