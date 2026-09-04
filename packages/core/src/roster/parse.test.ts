/**
 * Roster parsing, against the shape of the real admissions sheet.
 *
 * The header row here is copied character for character from
 * `Emrolled student Details 2026.xlsx`, misspelling included. If Admissions ever
 * sends a file that this parser rejects wholesale, this is the test that should
 * have caught it.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normaliseHeader, parseRoster, resolveHeaders } from './parse'
import type { Cell } from './parse'

/** The sheet's own header row. `From No.` is the sheet's spelling, not a typo. */
const HEADER: Cell[] = [
  'Si.No',
  'Name',
  'Program',
  'From No.',
  'Contact No.',
  'Alt. contact no.',
  'E-Mail ID',
  'payment status',
]

function row(
  serial: Cell,
  name: Cell,
  program: Cell,
  form: Cell,
  contact: Cell = '',
  alt: Cell = '',
  email: Cell = '',
  payment: Cell = '',
): Cell[] {
  return [serial, name, program, form, contact, alt, email, payment]
}

function errorsOf(result: ReturnType<typeof parseRoster>) {
  return result.issues.filter((i) => i.severity === 'error')
}

// ── headers ─────────────────────────────────────────────────────────────────

test('normaliseHeader strips punctuation and case', () => {
  assert.equal(normaliseHeader('Alt. contact no.'), 'altcontactno')
  assert.equal(normaliseHeader('  From No. '), 'fromno')
  assert.equal(normaliseHeader('E-Mail ID'), 'emailid')
  assert.equal(normaliseHeader(null), '')
})

test("resolves the sheet's real header row, including the From No. spelling", () => {
  const { map, matched, unmapped } = resolveHeaders(HEADER)
  assert.deepEqual(map, {
    serialNo: 0,
    name: 1,
    program: 2,
    formNumber: 3,
    contactNo: 4,
    altContactNo: 5,
    email: 6,
    paymentStatus: 7,
  })
  assert.equal(matched.formNumber, 'From No.')
  assert.deepEqual(unmapped, [])
})

test('does not mistake Alt. contact no. for the primary contact column', () => {
  // Both normalise to something containing `contactno`; only exact alias
  // matching keeps them apart, and swapping them would auto-fill the wizard with
  // a parent's number.
  const { map } = resolveHeaders(['Alt. contact no.', 'Contact No.', 'Name', 'From No.'])
  assert.equal(map.altContactNo, 0)
  assert.equal(map.contactNo, 1)
})

test('takes the leftmost column when a field has two candidates', () => {
  const { map, unmapped } = resolveHeaders(['Name', 'Form No.', 'Contact No.', 'Mobile'])
  assert.equal(map.contactNo, 2)
  assert.deepEqual(unmapped, ['Mobile'])
})

test('reports unrecognised headers without failing', () => {
  const { unmapped, map } = resolveHeaders(['Name', 'From No.', 'Hostel Block', 'Remarks'])
  assert.deepEqual(unmapped, ['Hostel Block', 'Remarks'])
  assert.equal(map.name, 0)
})

// ── whole-file failures ─────────────────────────────────────────────────────

test('an empty sheet is a single error, not a crash', () => {
  const result = parseRoster([])
  assert.deepEqual(result.students, [])
  assert.equal(errorsOf(result).length, 1)
  assert.equal(result.issues[0]?.field, 'header')
})

test('a sheet with no form-number column imports nothing', () => {
  const result = parseRoster([
    ['Name', 'Program'],
    ['ANJALI KUMARI', 'BCA'],
  ])
  assert.deepEqual(result.students, [])
  assert.equal(result.totalRows, 0)
  assert.match(errorsOf(result)[0]?.message ?? '', /form-number column/)
})

test('a sheet with no name column imports nothing', () => {
  const result = parseRoster([
    ['From No.', 'Program'],
    ['20260001', 'BCA'],
  ])
  assert.deepEqual(result.students, [])
  assert.match(errorsOf(result)[0]?.message ?? '', /name column/)
})

// ── the email column ────────────────────────────────────────────────────────

test('the email column is reported as deliberately ignored', () => {
  const result = parseRoster([HEADER, row(1, 'ANJALI KUMARI', 'BCA', '20260001')])
  const note = result.issues.find((i) => i.field === 'email')
  assert.ok(note, 'expected a header-level note about the email column')
  assert.equal(note.severity, 'warning')
  assert.equal(note.row, 0)
  // And nothing on the parsed student carries it.
  assert.equal('email' in (result.students[0] ?? {}), false)
})

// ── happy path ──────────────────────────────────────────────────────────────

test('parses a row the way the wizard will consume it', () => {
  const result = parseRoster([
    HEADER,
    row(
      1,
      '  ANJALI   KUMARI ',
      'BBA LL.B. (H)',
      '20260001',
      '9876543210',
      '9123456780',
      'anjali@example.com',
      'Full Payment',
    ),
  ])

  assert.equal(errorsOf(result).length, 0)
  assert.deepEqual(result.students[0], {
    serialNo: 1,
    formNumber: '20260001',
    name: 'ANJALI KUMARI',
    program: 'BBA LL.B. (H)',
    programLevel: 'UG',
    contactNo: '9876543210',
    altContactNo: '9123456780',
    extraContacts: [],
    paymentStatus: 'Full Payment',
    sourceRow: 2,
  })
  assert.equal(result.totalRows, 1)
  assert.equal(result.rejectedRows, 0)
})

test('accepts the payment-status values the sheet actually contains', () => {
  const result = parseRoster([
    HEADER,
    row(1, 'A', 'BCA', '20260001', '9876543210', '', '', 'Full Payment'),
    row(2, 'B', 'BCA', '20260002', '9876543211', '', '', 'Part payment'),
    row(3, 'C', 'BCA', '20260003', '9876543212', '', '', ''),
  ])
  assert.deepEqual(
    result.students.map((s) => s.paymentStatus),
    ['Full Payment', 'Part payment', null],
  )
})

test('blank rows are skipped without being counted or reported', () => {
  const result = parseRoster([
    HEADER,
    row(1, 'ANJALI KUMARI', 'BCA', '20260001', '9876543210'),
    [null, null, null, null, null, null, null, null],
    ['', '   ', '', '', '', '', '', ''],
    row(2, 'AYUSH KUMAR', 'BCA', '20260002', '9876543211'),
  ])
  assert.equal(result.totalRows, 2)
  assert.equal(result.students.length, 2)
  assert.equal(errorsOf(result).length, 0)
})

test('Excel-numeric cells survive the trip', () => {
  // A form number stored as a number arrives as 20260001, not "20260001", and a
  // phone number stored as a number loses nothing because it has no leading zero.
  const result = parseRoster([HEADER, row(1, 'ANJALI KUMARI', 'BCA', 20260001, 9876543210)])
  assert.equal(result.students[0]?.formNumber, '20260001')
  assert.equal(result.students[0]?.contactNo, '9876543210')
})

// ── rejections ──────────────────────────────────────────────────────────────

test('a row with no form number is rejected', () => {
  const result = parseRoster([HEADER, row(1, 'ANJALI KUMARI', 'BCA', '', '9876543210')])
  assert.equal(result.students.length, 0)
  assert.equal(result.rejectedRows, 1)
  assert.equal(errorsOf(result)[0]?.field, 'formNumber')
})

test('an implausible form number is rejected rather than stored', () => {
  const result = parseRoster([
    HEADER,
    row(1, 'A', 'BCA', '12'),
    row(2, 'B', 'BCA', '123456789012345678901'),
  ])
  assert.equal(result.students.length, 0)
  assert.equal(result.rejectedRows, 2)
})

test('a row with no name is rejected — the gate has to read a name', () => {
  const result = parseRoster([HEADER, row(1, '', 'BCA', '20260001', '9876543210')])
  assert.equal(result.students.length, 0)
  assert.equal(errorsOf(result)[0]?.field, 'name')
})

test('a duplicate form number keeps the first row and skips the later one', () => {
  const result = parseRoster([
    HEADER,
    row(1, 'ANJALI KUMARI', 'BCA', '20260001', '9876543210'),
    row(2, 'SOMEONE ELSE', 'BBA', '20260001', '9123456780'),
  ])
  assert.equal(result.students.length, 1)
  assert.equal(result.students[0]?.name, 'ANJALI KUMARI')
  assert.equal(result.rejectedRows, 1)
  assert.match(errorsOf(result)[0]?.message ?? '', /first seen on row 2/)
})

test('the form number is compared on digits, so 2026-0001 duplicates 20260001', () => {
  const result = parseRoster([
    HEADER,
    row(1, 'A', 'BCA', '20260001'),
    row(2, 'B', 'BCA', '2026-0001'),
  ])
  assert.equal(result.students.length, 1)
  assert.equal(result.rejectedRows, 1)
})

test('duplicate names are not a problem — 64 of them exist in the real sheet', () => {
  const result = parseRoster([
    HEADER,
    row(1, 'ANJALI KUMARI', 'BCA', '20260001', '9876543210'),
    row(2, 'ANJALI KUMARI', 'BBA', '20260002', '9123456780'),
  ])
  assert.equal(result.students.length, 2)
  assert.equal(errorsOf(result).length, 0)
})

// ── phone merging ───────────────────────────────────────────────────────────

test('a slash-joined alt-contact cell fills the alternate and the overflow', () => {
  // The shape of 425 of the 830 demo rows.
  const result = parseRoster([
    HEADER,
    row(1, 'ANJALI KUMARI', 'BCA', '20260001', '9876543210', '7979866632/ 6201013902'),
  ])
  const student = result.students[0]
  assert.equal(student?.contactNo, '9876543210')
  assert.equal(student?.altContactNo, '7979866632')
  assert.deepEqual(student?.extraContacts, ['6201013902'])
})

test('a slash-joined primary cell supplies both numbers on its own', () => {
  // Row 81 of the demo sheet: two numbers in Contact No., alt column empty.
  const result = parseRoster([
    HEADER,
    row(1, 'ANJALI KUMARI', 'BCA', '20260001', '7644963307/8235152773', ''),
  ])
  assert.equal(result.students[0]?.contactNo, '7644963307')
  assert.equal(result.students[0]?.altContactNo, '8235152773')
})

test('the same number in both columns is stored once, not twice', () => {
  const result = parseRoster([
    HEADER,
    row(1, 'ANJALI KUMARI', 'BCA', '20260001', '9876543210', '+91 9876543210'),
  ])
  assert.equal(result.students[0]?.contactNo, '9876543210')
  assert.equal(result.students[0]?.altContactNo, null)
})

test('an unusable phone fragment is a warning against the column it came from', () => {
  const result = parseRoster([
    HEADER,
    row(1, 'ANJALI KUMARI', 'BCA', '20260001', '9876543210/12345', '00000'),
  ])
  assert.equal(errorsOf(result).length, 0)
  const dropped = result.issues.filter((i) => i.message.startsWith('Not a usable'))
  assert.deepEqual(
    dropped.map((i) => [i.field, i.value]),
    [
      ['contactNo', '12345'],
      ['altContactNo', '00000'],
    ],
  )
})

test('no usable phone number is a warning, not a rejection', () => {
  const result = parseRoster([HEADER, row(1, 'ANJALI KUMARI', 'BCA', '20260001', '', '')])
  assert.equal(result.students.length, 1)
  assert.equal(result.students[0]?.contactNo, null)
  assert.ok(result.issues.some((i) => i.message.includes('no way to reach')))
})

// ── programmes ──────────────────────────────────────────────────────────────

test('an unrecognised programme is kept verbatim and the row still imports', () => {
  const result = parseRoster([
    HEADER,
    row(1, 'A', 'B.Des. (Fashion)', '20260001', '9876543210'),
    row(2, 'B', 'B.Des. (Fashion)', '20260002', '9876543211'),
  ])
  assert.equal(result.students.length, 2)
  assert.equal(errorsOf(result).length, 0)
  // No warning, no bucket, no rewrite: a programme the parser has never seen is
  // not a problem to report. It is simply the student's programme.
  assert.equal(result.students[0]?.program, 'B.Des. (Fashion)')
  assert.equal(result.issues.filter((i) => i.field === 'program').length, 0)
})

test('a blank programme imports with UNKNOWN level', () => {
  const result = parseRoster([HEADER, row(1, 'ANJALI KUMARI', '', '20260001', '9876543210')])
  const student = result.students[0]
  assert.equal(student?.program, '')
  assert.equal(student?.programLevel, 'UNKNOWN')
  assert.ok(result.issues.some((i) => i.field === 'program' && i.message.startsWith('No programme')))
})

// ── report bounds ───────────────────────────────────────────────────────────

test('the issue list is capped and says so, so a bad file cannot write a huge report', () => {
  const rows: Cell[][] = [HEADER]
  for (let i = 0; i < 700; i += 1) rows.push(row(i + 1, '', 'BCA', ''))

  const result = parseRoster(rows)
  assert.equal(result.issuesTruncated, true)
  assert.ok(result.issues.length <= 500)
  assert.equal(result.rejectedRows, 700)
  assert.equal(result.totalRows, 700)
})

test('a reported value is truncated, never a whole row', () => {
  // A form number is the field a report is most likely to quote back, and the
  // one a corrupt file will make absurdly long. 500 characters in, 80 out.
  const long = '9'.repeat(500)
  const result = parseRoster([HEADER, row(1, 'A', 'BCA', long, '9876543210')])
  const reported = result.issues.find((i) => i.field === 'formNumber')
  assert.equal(reported?.value?.length, 80)
  assert.equal(result.rejectedRows, 1)
})

test('students.length plus rejectedRows always accounts for totalRows', () => {
  const result = parseRoster([
    HEADER,
    row(1, 'A', 'BCA', '20260001', '9876543210'),
    row(2, '', 'BCA', '20260002'),
    row(3, 'C', 'BCA', ''),
    row(4, 'D', 'BCA', '20260001'),
    row(5, 'E', 'B.Des. (Fashion)', '20260005'),
  ])
  assert.equal(result.students.length + result.rejectedRows, result.totalRows)
  assert.equal(result.totalRows, 5)
})
