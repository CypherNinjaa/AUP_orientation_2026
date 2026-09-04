/**
 * Data export.
 *
 * Five datasets, two formats, one audit entry per download. An admin pulling 15,000
 * names and phone numbers is the largest single egress of personal data the system
 * performs, and it is the one operation where the DPDP question — "who took a copy of
 * this, when, and how much?" — has to have an exact answer.
 *
 * ## `includeContact` is off by default
 *
 * Most export requests are counting exercises: how many came, from which programme, at
 * what time. None of those need a phone number. When the flag is false the contact
 * columns are masked to their last four digits, which is enough to reconcile against a
 * second list and useless as a phone book. Turning it on is recorded in the audit entry
 * as its own field, so "who exported contactable data" is a separate question from "who
 * exported data".
 *
 * ## Streaming was considered and rejected
 *
 * At 15,000 registrations an xlsx is a few megabytes and `exceljs` builds it in memory
 * regardless — its streaming writer wants a file path, which is not something a
 * container with a read-only filesystem has. A buffered response with a hard row cap is
 * honest about the limit instead of pretending to stream while buffering anyway.
 */
import 'server-only'

import { prisma } from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import {
  exportFilename,
  exportMime,
  toCsv,
  toXlsx,
  type ExportColumn,
  type ExportSpec,
} from '@orientation/core/export'
import type { ExportQuery } from '@orientation/contracts'

import type { Actor } from '../auth'
import { writeAudit } from '../audit'
import { abort } from '../http'
import type { RequestMeta } from '../registration'

/**
 * The ceiling on one export.
 *
 * Set above the 15,000 expected registrations with room for the scan-event log, which
 * is the largest table (one row per *attempt*, not per arrival). Past this the answer
 * is a date range, not a bigger buffer: a request that would build a 200 MB workbook
 * takes the process down and the admin never finds out why.
 */
const MAX_ROWS = 60_000

export interface ExportResult {
  bytes: Buffer
  filename: string
  contentType: string
  rowCount: number
}

/** What a dataset builder hands back: bytes and the count that goes in the audit row. */
interface Rendered {
  bytes: Buffer
  rowCount: number
  truncated: boolean
}

/**
 * Turn a spec into bytes.
 *
 * Each dataset builder calls this itself rather than returning its spec, because a
 * spec is generic in its row type and a function that returned
 * `ExportSpec<SomethingOrOther>` would need a cast at every call site — and a cast on
 * a column's `value` accessor is exactly the kind that compiles and then reads the
 * wrong field.
 */
async function render<Row>(
  spec: ExportSpec<Row>,
  format: 'xlsx' | 'csv',
): Promise<Rendered> {
  if (spec.rows.length === 0) {
    // A zero-row workbook is a file somebody emails onward believing it is the answer.
    // Refused rather than delivered, so the mistake is visible while it is still cheap.
    abort('NOT_FOUND', 'No rows matched those filters, so there is nothing to export.')
  }

  const bytes = format === 'csv' ? toCsv(spec) : await toXlsx(spec)

  return { bytes, rowCount: spec.rows.length, truncated: spec.rows.length >= MAX_ROWS }
}

/** Last four digits, or nothing. Enough to reconcile, useless as a directory. */
function maskContact(value: string | null): string | null {
  if (value === null || value === '') return null
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`
}

function dateWindow(query: ExportQuery): { gte?: Date; lte?: Date } | undefined {
  if (query.from === undefined && query.to === undefined) return undefined
  return {
    ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
    ...(query.to === undefined ? {} : { lte: new Date(query.to) }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Datasets
// ─────────────────────────────────────────────────────────────────────────────

async function registrationsSpec(query: ExportQuery): Promise<Rendered> {
  const window = dateWindow(query)

  const rows = await prisma.registration.findMany({
    where: {
      ...(query.status === undefined ? { status: { not: 'DRAFT' } } : { status: query.status }),
      ...(window === undefined ? {} : { submittedAt: window }),
    },
    orderBy: { submittedAt: 'asc' },
    take: MAX_ROWS,
    select: {
      reference: true,
      name: true,
      program: true,
      contactNo: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      reviewNote: true,
      revisionCount: true,
      faceDetected: true,
      selfieUploadedAt: true,
      consentVersion: true,
      consentedAt: true,
      admittedStudent: { select: { formNumber: true, programLevel: true } },
      companions: { select: { relationship: true, name: true } },
      pass: {
        select: {
          code10: true,
          status: true,
          guestCount: true,
          checkIn: { select: { recordedAt: true, gate: { select: { code: true } } } },
        },
      },
      reviewedBy: { select: { name: true, email: true } },
    },
  })

  type Row = (typeof rows)[number]

  const columns: ExportColumn<Row>[] = [
    { header: 'Reference', value: (r) => r.reference, width: 14 },
    { header: 'Form No.', value: (r) => r.admittedStudent?.formNumber ?? null, width: 14 },
    { header: 'Name', value: (r) => r.name, width: 28 },
    { header: 'Program', value: (r) => r.program, width: 34 },
    { header: 'Level', value: (r) => r.admittedStudent?.programLevel ?? null, width: 8 },
    {
      header: query.includeContact ? 'Contact No.' : 'Contact (masked)',
      value: (r) => (query.includeContact ? r.contactNo : maskContact(r.contactNo)),
      width: 16,
    },
    { header: 'Status', value: (r) => r.status, width: 20 },
    { header: 'Submitted', value: (r) => r.submittedAt, width: 22 },
    { header: 'Guests', value: (r) => r.companions.length, width: 8 },
    {
      header: 'Guest names',
      value: (r) => r.companions.map((c) => `${c.name} (${c.relationship})`).join('; '),
      width: 40,
    },
    { header: 'Pass code', value: (r) => r.pass?.code10 ?? null, width: 14 },
    { header: 'Pass status', value: (r) => r.pass?.status ?? null, width: 12 },
    { header: 'Checked in', value: (r) => r.pass?.checkIn?.recordedAt ?? null, width: 22 },
    { header: 'Gate', value: (r) => r.pass?.checkIn?.gate.code ?? null, width: 10 },
    { header: 'Photo taken', value: (r) => r.selfieUploadedAt, width: 22 },
    // Not "does the photo look right" — only whether the on-device detector found a
    // face. Exported because it is the one machine-readable signal a moderator had.
    { header: 'Face detected', value: (r) => r.faceDetected, width: 14 },
    { header: 'Reviewed', value: (r) => r.reviewedAt, width: 22 },
    { header: 'Reviewed by', value: (r) => r.reviewedBy?.name ?? r.reviewedBy?.email ?? null, width: 24 },
    { header: 'Review note', value: (r) => r.reviewNote, width: 40 },
    { header: 'Revisions', value: (r) => r.revisionCount, width: 10 },
    { header: 'Consent version', value: (r) => r.consentVersion, width: 16 },
    { header: 'Consented at', value: (r) => r.consentedAt, width: 22 },
  ]

  return render({ sheetName: 'Registrations', columns, rows }, query.format)
}

async function checkinsSpec(query: ExportQuery): Promise<Rendered> {
  const window = dateWindow(query)

  const rows = await prisma.checkIn.findMany({
    where: window === undefined ? {} : { recordedAt: window },
    orderBy: { recordedAt: 'asc' },
    take: MAX_ROWS,
    select: {
      recordedAt: true,
      scannedAt: true,
      method: true,
      guestsAdmitted: true,
      wasOffline: true,
      deviceId: true,
      gate: { select: { code: true, name: true } },
      scannedBy: { select: { name: true, email: true } },
      pass: {
        select: {
          code10: true,
          registration: {
            select: {
              reference: true,
              name: true,
              program: true,
              contactNo: true,
              admittedStudent: { select: { formNumber: true } },
            },
          },
        },
      },
    },
  })

  type Row = (typeof rows)[number]

  const columns: ExportColumn<Row>[] = [
    { header: 'Recorded at', value: (r) => r.recordedAt, width: 22 },
    // Both times, always. `scannedAt` is the device's clock and `recordedAt` is the
    // server's; on an offline scan they can differ by hours, and the gap is the whole
    // story when somebody disputes an arrival time.
    { header: 'Scanned at (device)', value: (r) => r.scannedAt, width: 22 },
    { header: 'Offline', value: (r) => r.wasOffline, width: 9 },
    { header: 'Gate', value: (r) => r.gate.code, width: 10 },
    { header: 'Gate name', value: (r) => r.gate.name, width: 20 },
    { header: 'Method', value: (r) => r.method, width: 14 },
    { header: 'Pass code', value: (r) => r.pass.code10, width: 14 },
    { header: 'Reference', value: (r) => r.pass.registration.reference, width: 14 },
    { header: 'Form No.', value: (r) => r.pass.registration.admittedStudent?.formNumber ?? null, width: 14 },
    { header: 'Name', value: (r) => r.pass.registration.name, width: 28 },
    { header: 'Program', value: (r) => r.pass.registration.program, width: 34 },
    {
      header: query.includeContact ? 'Contact No.' : 'Contact (masked)',
      value: (r) =>
        query.includeContact
          ? r.pass.registration.contactNo
          : maskContact(r.pass.registration.contactNo),
      width: 16,
    },
    { header: 'Guests admitted', value: (r) => r.guestsAdmitted, width: 14 },
    { header: 'Scanned by', value: (r) => r.scannedBy.name ?? r.scannedBy.email ?? null, width: 24 },
    { header: 'Device', value: (r) => r.deviceId, width: 20 },
  ]

  return render({ sheetName: 'Check-ins', columns, rows }, query.format)
}

async function rosterSpec(query: ExportQuery): Promise<Rendered> {
  const rows = await prisma.admittedStudent.findMany({
    orderBy: [{ serialNo: 'asc' }, { formNumber: 'asc' }],
    take: MAX_ROWS,
    select: {
      serialNo: true,
      formNumber: true,
      name: true,
      program: true,
      programLevel: true,
      contactNo: true,
      altContactNo: true,
      paymentStatus: true,
      claimedByUserId: true,
      claimedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  type Row = (typeof rows)[number]

  const columns: ExportColumn<Row>[] = [
    { header: 'Si.No', value: (r) => r.serialNo, width: 8 },
    // The sheet's own header spelling, kept exactly. An export that "corrects" it to
    // "Form No." produces a file the admissions office cannot re-import.
    { header: 'From No.', value: (r) => r.formNumber, width: 14 },
    { header: 'Name', value: (r) => r.name, width: 28 },
    { header: 'Program', value: (r) => r.program, width: 34 },
    { header: 'Level', value: (r) => r.programLevel, width: 8 },
    {
      header: query.includeContact ? 'Contact No.' : 'Contact (masked)',
      value: (r) => (query.includeContact ? r.contactNo : maskContact(r.contactNo)),
      width: 16,
    },
    {
      header: query.includeContact ? 'Alt. contact no.' : 'Alt. contact (masked)',
      value: (r) => (query.includeContact ? r.altContactNo : maskContact(r.altContactNo)),
      width: 18,
    },
    { header: 'payment status', value: (r) => r.paymentStatus, width: 16 },
    { header: 'Registered', value: (r) => r.claimedByUserId !== null, width: 11 },
    { header: 'Claimed at', value: (r) => r.claimedAt, width: 22 },
    { header: 'Added', value: (r) => r.createdAt, width: 22 },
    { header: 'Last updated', value: (r) => r.updatedAt, width: 22 },
  ]

  return render({ sheetName: 'Roster', columns, rows }, query.format)
}

async function scanEventsSpec(query: ExportQuery): Promise<Rendered> {
  const window = dateWindow(query)

  const rows = await prisma.scanEvent.findMany({
    where: window === undefined ? {} : { recordedAt: window },
    orderBy: { recordedAt: 'asc' },
    take: MAX_ROWS,
    select: {
      recordedAt: true,
      scannedAt: true,
      rawCode: true,
      method: true,
      outcome: true,
      reason: true,
      wasOffline: true,
      overridden: true,
      clockSuspect: true,
      clientDecision: true,
      clientReason: true,
      clientManifestVersion: true,
      deviceId: true,
      syncBatchId: true,
      duplicateOfId: true,
      gate: { select: { code: true } },
      scannedBy: { select: { name: true, email: true } },
      pass: { select: { code10: true, registration: { select: { reference: true, name: true } } } },
    },
  })

  type Row = (typeof rows)[number]

  const columns: ExportColumn<Row>[] = [
    { header: 'Recorded at', value: (r) => r.recordedAt, width: 22 },
    { header: 'Scanned at (device)', value: (r) => r.scannedAt, width: 22 },
    { header: 'Outcome', value: (r) => r.outcome, width: 16 },
    { header: 'Reason', value: (r) => r.reason, width: 22 },
    // The disagreement columns. A device that decided ADMITTED where the server
    // decided DUPLICATE is either a clock problem or a second person holding the same
    // screenshot, and this is the only place that distinction is recorded.
    { header: 'Device decided', value: (r) => r.clientDecision, width: 16 },
    { header: 'Device reason', value: (r) => r.clientReason, width: 22 },
    { header: 'Device manifest', value: (r) => r.clientManifestVersion, width: 15 },
    { header: 'Offline', value: (r) => r.wasOffline, width: 9 },
    { header: 'Overridden', value: (r) => r.overridden, width: 11 },
    { header: 'Clock suspect', value: (r) => r.clockSuspect, width: 13 },
    { header: 'Method', value: (r) => r.method, width: 14 },
    // The raw code as scanned, so an INVALID can be diagnosed. It is a signed token or
    // a ten-digit code, not personal data — but it is long, so it goes near the end.
    { header: 'Raw code', value: (r) => r.rawCode, width: 30 },
    { header: 'Pass code', value: (r) => r.pass?.code10 ?? null, width: 14 },
    { header: 'Reference', value: (r) => r.pass?.registration.reference ?? null, width: 14 },
    { header: 'Name', value: (r) => r.pass?.registration.name ?? null, width: 28 },
    { header: 'Gate', value: (r) => r.gate?.code ?? null, width: 10 },
    { header: 'Scanned by', value: (r) => r.scannedBy?.name ?? r.scannedBy?.email ?? null, width: 24 },
    { header: 'Device', value: (r) => r.deviceId, width: 20 },
    { header: 'Sync batch', value: (r) => r.syncBatchId, width: 26 },
    { header: 'Duplicate of check-in', value: (r) => r.duplicateOfId, width: 26 },
  ]

  return render({ sheetName: 'Scan events', columns, rows }, query.format)
}

async function auditSpec(query: ExportQuery): Promise<Rendered> {
  const window = dateWindow(query)

  const rows = await prisma.auditLog.findMany({
    where: window === undefined ? {} : { createdAt: window },
    orderBy: { createdAt: 'asc' },
    take: MAX_ROWS,
    select: {
      createdAt: true,
      action: true,
      entityType: true,
      entityId: true,
      actorLabel: true,
      actorRole: true,
      actorId: true,
      before: true,
      after: true,
      ip: true,
      userAgent: true,
    },
  })

  type Row = (typeof rows)[number]

  /** JSON as one cell. Truncated, because a spreadsheet cell caps at 32,767 chars. */
  const json = (value: unknown): string | null => {
    if (value === null || value === undefined) return null
    const text = JSON.stringify(value)
    return text.length > 4000 ? `${text.slice(0, 4000)}…` : text
  }

  const columns: ExportColumn<Row>[] = [
    { header: 'At', value: (r) => r.createdAt, width: 22 },
    { header: 'Action', value: (r) => r.action, width: 30 },
    { header: 'Entity', value: (r) => r.entityType, width: 18 },
    { header: 'Entity id', value: (r) => r.entityId, width: 26 },
    { header: 'Actor', value: (r) => r.actorLabel, width: 26 },
    { header: 'Role', value: (r) => r.actorRole, width: 10 },
    { header: 'Actor id', value: (r) => r.actorId, width: 26 },
    { header: 'Before', value: (r) => json(r.before), width: 40 },
    { header: 'After', value: (r) => json(r.after), width: 40 },
    { header: 'IP', value: (r) => r.ip, width: 18 },
    { header: 'User agent', value: (r) => r.userAgent, width: 40 },
  ]

  return render({ sheetName: 'Audit log', columns, rows }, query.format)
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function buildExport(
  query: ExportQuery,
  actor: Actor,
  meta: RequestMeta,
): Promise<ExportResult> {
  const { bytes, rowCount, truncated } = await (query.dataset === 'registrations'
    ? registrationsSpec(query)
    : query.dataset === 'checkins'
      ? checkinsSpec(query)
      : query.dataset === 'roster'
        ? rosterSpec(query)
        : query.dataset === 'scan-events'
          ? scanEventsSpec(query)
          : auditSpec(query))

  await writeAudit({
    action: AUDIT_ACTIONS.DATA_EXPORTED,
    entityType: 'Export',
    entityId: query.dataset,
    actor,
    after: {
      dataset: query.dataset,
      format: query.format,
      rowCount,
      bytes: bytes.byteLength,
      // Its own field, because "who exported contactable data" is a different question
      // from "who exported data" and has to be answerable without reading a filter blob.
      includeContact: query.includeContact,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
      ...(truncated ? { truncatedAt: MAX_ROWS } : {}),
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return {
    bytes,
    filename: exportFilename(query.dataset, query.format),
    contentType: exportMime(query.format).contentType,
    rowCount,
  }
}
