/**
 * Roster parsing: spreadsheet rows in, validated students out.
 *
 * Deliberately format-agnostic and side-effect free. It takes a 2D array of cell
 * values, so the same code serves the CLI seed, the admin upload endpoint, and a
 * CSV paste, and so the tests need no fixture files. The Excel adapter lives in
 * `./workbook.ts` and is the only part that depends on exceljs.
 */
import { parsePhoneCell } from './phone'
import { type ProgramLevel, programLevel } from './programs'

/** A cell as it arrives from a spreadsheet reader. */
export type Cell = string | number | boolean | Date | null | undefined

export type RosterField =
  | 'serialNo'
  | 'name'
  | 'program'
  | 'formNumber'
  | 'contactNo'
  | 'altContactNo'
  | 'paymentStatus'
  /** Recognised so it can be reported as deliberately ignored. */
  | 'email'

/**
 * Header aliases, matched after stripping everything but letters and digits.
 *
 * `fromno` is first for `formNumber` and that is not a typo on our side — the
 * admissions sheet's header genuinely reads `From No.`. It is kept as an alias
 * rather than corrected, because the next file Admissions sends will have it too.
 */
const FIELD_ALIASES: Readonly<Record<RosterField, readonly string[]>> = {
  serialNo: ['sino', 'sno', 'srno', 'slno', 'sl', 'serialno', 'serial', 'no'],
  name: ['name', 'studentname', 'candidatename', 'fullname', 'nameofstudent'],
  program: ['program', 'programme', 'course', 'branch', 'programname'],
  formNumber: [
    'fromno',
    'formno',
    'formnumber',
    'formnum',
    'form',
    'applicationno',
    'applicationnumber',
    'applicationformno',
  ],
  contactNo: ['contactno', 'contact', 'contactnumber', 'mobile', 'mobileno', 'phone', 'phoneno'],
  altContactNo: [
    'altcontactno',
    'altcontact',
    'altcontactnumber',
    'altno',
    'altmobile',
    'alternatecontactno',
    'alternatecontact',
    'alternatemobile',
    'alternatenumber',
    'secondarycontact',
    'parentcontact',
  ],
  paymentStatus: ['paymentstatus', 'payment', 'feestatus', 'feesstatus', 'paymentstate'],
  email: ['emailid', 'email', 'emailaddress', 'mailid', 'mail', 'eemailid'],
}

/** Lowercase, letters and digits only. `Alt. contact no.` → `altcontactno`. */
export function normaliseHeader(raw: Cell): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Which column index holds which field. Absent fields are simply missing. */
export type ColumnMap = Partial<Record<RosterField, number>>

export interface HeaderResolution {
  map: ColumnMap
  /** Header text per resolved field, so the admin preview can show the mapping. */
  matched: Partial<Record<RosterField, string>>
  /** Headers that matched nothing. Not an error — just unused. */
  unmapped: string[]
}

/**
 * Resolve a header row.
 *
 * First match wins per field, so a sheet with both `Contact No.` and `Mobile`
 * takes the leftmost. Columns matching an already-claimed field are reported as
 * unmapped rather than silently overwriting it.
 */
export function resolveHeaders(headerRow: readonly Cell[]): HeaderResolution {
  const map: ColumnMap = {}
  const matched: Partial<Record<RosterField, string>> = {}
  const unmapped: string[] = []

  for (const [index, cell] of headerRow.entries()) {
    const key = normaliseHeader(cell)
    if (key === '') continue

    let hit: RosterField | null = null
    for (const field of Object.keys(FIELD_ALIASES) as RosterField[]) {
      if (map[field] !== undefined) continue
      if (FIELD_ALIASES[field].includes(key)) {
        hit = field
        break
      }
    }

    if (hit === null) unmapped.push(String(cell ?? '').trim())
    else {
      map[hit] = index
      matched[hit] = String(cell ?? '').trim()
    }
  }

  return { map, matched, unmapped }
}

// ─────────────────────────────────────────────────────────────────────────────

export interface RosterStudent {
  serialNo: number | null
  formNumber: string
  name: string
  /**
   * Verbatim from the sheet. This is what the student is shown and what the
   * pass prints — it is never replaced by a normalised or grouped form.
   */
  program: string
  programLevel: ProgramLevel
  contactNo: string | null
  altContactNo: string | null
  /** Third and subsequent numbers found in the two phone columns. */
  extraContacts: string[]
  paymentStatus: string | null
  /** 1-based row number in the source sheet, for the import report. */
  sourceRow: number
}

export type IssueSeverity = 'error' | 'warning'

export interface RosterIssue {
  /** 1-based row number in the source sheet. `0` for whole-file problems. */
  row: number
  field: RosterField | 'row' | 'header'
  severity: IssueSeverity
  message: string
  /** The offending value, truncated. Never a full row. */
  value?: string
}

export interface RosterParseResult {
  students: RosterStudent[]
  issues: RosterIssue[]
  /** True when `issues` was capped, so a report reader knows it is partial. */
  issuesTruncated: boolean
  headers: HeaderResolution
  /** Rows examined, excluding the header and blank rows. */
  totalRows: number
  /** Rows rejected outright. `students.length + rejectedRows === totalRows`. */
  rejectedRows: number
}

/**
 * One pathological file must not be able to write an unbounded blob into
 * `RosterImport.report`.
 */
const MAX_ISSUES = 500
const MAX_VALUE_LENGTH = 80

/** `'  ANJALI  KUMARI '` → `'ANJALI KUMARI'`. Excel numbers become strings. */
function text(cell: Cell): string {
  if (cell === null || cell === undefined) return ''
  if (cell instanceof Date) return cell.toISOString()
  return String(cell).replace(/\s+/g, ' ').trim()
}

/**
 * Parse a sheet.
 *
 * Row 1 is the header. Blank rows are skipped silently — trailing empty rows are
 * normal in a hand-edited spreadsheet and are not worth reporting.
 *
 * A row is rejected only for a missing or malformed form number, or a missing
 * name: those are the two things nothing downstream can work around. Everything
 * else — no phone, unknown programme, unparseable payment status — is a warning
 * and the row is kept, because a student whose phone number is mistyped still
 * needs to be able to claim their pass.
 */
export function parseRoster(rows: readonly (readonly Cell[])[]): RosterParseResult {
  const issues: RosterIssue[] = []
  let issuesTruncated = false

  function issue(next: RosterIssue): void {
    if (issues.length >= MAX_ISSUES) {
      issuesTruncated = true
      return
    }
    issues.push(
      next.value === undefined
        ? next
        : { ...next, value: next.value.slice(0, MAX_VALUE_LENGTH) },
    )
  }

  const headerRow = rows[0]
  if (headerRow === undefined) {
    return {
      students: [],
      issues: [{ row: 0, field: 'header', severity: 'error', message: 'The sheet is empty.' }],
      issuesTruncated: false,
      headers: { map: {}, matched: {}, unmapped: [] },
      totalRows: 0,
      rejectedRows: 0,
    }
  }

  const headers = resolveHeaders(headerRow)
  const { map } = headers

  for (const required of ['formNumber', 'name'] as const) {
    if (map[required] === undefined) {
      issue({
        row: 0,
        field: 'header',
        severity: 'error',
        message:
          required === 'formNumber'
            ? 'No form-number column found. Expected a header like "From No.", "Form No." or "Application No.".'
            : 'No name column found. Expected a header like "Name" or "Student Name".',
      })
    }
  }

  if (map.email !== undefined) {
    issue({
      row: 0,
      field: 'email',
      severity: 'warning',
      message:
        'The email column was found and is deliberately not imported. Students are identified by the account they sign in with, not by an address in the sheet.',
      value: headers.matched.email,
    })
  }

  if (map.formNumber === undefined || map.name === undefined) {
    return {
      students: [],
      issues,
      issuesTruncated,
      headers,
      totalRows: 0,
      rejectedRows: 0,
    }
  }

  const formNumberCol = map.formNumber
  const nameCol = map.name

  const students: RosterStudent[] = []
  const seenFormNumbers = new Map<string, number>()
  let totalRows = 0
  let rejectedRows = 0

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]
    if (row === undefined) continue

    const sourceRow = i + 1
    if (row.every((cell) => text(cell) === '')) continue
    totalRows += 1

    const rawForm = text(row[formNumberCol])
    const formNumber = rawForm.replace(/\D/g, '')
    const name = text(row[nameCol])

    if (formNumber === '') {
      rejectedRows += 1
      issue({
        row: sourceRow,
        field: 'formNumber',
        severity: 'error',
        message: 'No form number. The row cannot be imported — nothing else identifies a student.',
        value: rawForm,
      })
      continue
    }

    if (formNumber.length < 4 || formNumber.length > 20) {
      rejectedRows += 1
      issue({
        row: sourceRow,
        field: 'formNumber',
        severity: 'error',
        message: `Form number is ${formNumber.length} digits, which is outside the plausible range of 4 to 20.`,
        value: rawForm,
      })
      continue
    }

    if (name === '') {
      rejectedRows += 1
      issue({
        row: sourceRow,
        field: 'name',
        severity: 'error',
        message: 'No name. The gate has to be able to read a name off the pass.',
        value: formNumber,
      })
      continue
    }

    const firstSeen = seenFormNumbers.get(formNumber)
    if (firstSeen !== undefined) {
      rejectedRows += 1
      issue({
        row: sourceRow,
        field: 'formNumber',
        severity: 'error',
        message: `Duplicate form number, first seen on row ${firstSeen}. The later row is skipped rather than overwriting the earlier one — resolve it in the file.`,
        value: formNumber,
      })
      continue
    }
    seenFormNumbers.set(formNumber, sourceRow)

    const program = map.program === undefined ? '' : text(row[map.program])
    if (program === '') {
      issue({
        row: sourceRow,
        field: 'program',
        severity: 'warning',
        message: 'No programme. Imported, but the student will see a blank programme in the wizard.',
        value: formNumber,
      })
    }

    const primary = parsePhoneCell(map.contactNo === undefined ? null : text(row[map.contactNo]))
    const secondary = parsePhoneCell(
      map.altContactNo === undefined ? null : text(row[map.altContactNo]),
    )

    // One ordered, deduplicated list across both columns, then split into
    // primary / alternate / overflow. Doing it in one pass is what stops the
    // same number appearing as both contact and alt-contact, which 40-odd demo
    // rows would otherwise produce.
    const numbers: string[] = []
    for (const candidate of [...primary.valid, ...secondary.valid]) {
      if (!numbers.includes(candidate)) numbers.push(candidate)
    }

    for (const [field, result] of [
      ['contactNo', primary],
      ['altContactNo', secondary],
    ] as const) {
      for (const bad of result.rejected) {
        issue({
          row: sourceRow,
          field,
          severity: 'warning',
          message: 'Not a usable 10-digit Indian mobile number; dropped.',
          value: bad,
        })
      }
    }

    if (numbers.length === 0) {
      issue({
        row: sourceRow,
        field: 'contactNo',
        severity: 'warning',
        message: 'No usable phone number. The help desk will have no way to reach this student.',
        value: formNumber,
      })
    }

    const paymentStatus =
      map.paymentStatus === undefined ? '' : text(row[map.paymentStatus])
    const serialRaw = map.serialNo === undefined ? '' : text(row[map.serialNo])
    const serialNo = /^\d+$/.test(serialRaw) ? Number(serialRaw) : null

    students.push({
      serialNo,
      formNumber,
      name,
      program,
      programLevel: programLevel(program),
      contactNo: numbers[0] ?? null,
      altContactNo: numbers[1] ?? null,
      extraContacts: numbers.slice(2),
      paymentStatus: paymentStatus === '' ? null : paymentStatus,
      sourceRow,
    })
  }

  return {
    students,
    issues,
    issuesTruncated,
    headers,
    totalRows,
    rejectedRows,
  }
}
