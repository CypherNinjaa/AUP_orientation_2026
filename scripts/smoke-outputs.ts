/**
 * Runtime smoke check for the three output paths that typechecking cannot prove.
 *
 * A PDF, an xlsx and a CSV read are all "compiles fine, produces garbage" risks:
 * pdf-lib throws at draw time on a character Helvetica lacks, exceljs writes a
 * workbook Excel refuses to open, and a CSV parser is only as good as the first
 * real file it meets. So each is executed once here against deliberately awkward
 * input, and the bytes are inspected.
 *
 * Run: node --import tsx scripts/smoke-outputs.ts
 */
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { toCsv, toXlsx, exportFilename, exportMime } from '@orientation/core/export'
import { readRosterCsv } from '@orientation/core/roster/workbook'

import { renderPassPdf } from '../apps/web/lib/server/pass-render'

let failures = 0

function check(label: string, condition: boolean, detail: string): void {
  if (condition) {
    console.log(`  ok    ${label} — ${detail}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${label} — ${detail}`)
  }
}

async function pdf(): Promise<void> {
  console.log('\nrenderPassPdf')
  const bytes = await renderPassPdf({
    // Devanagari and an accent: neither is WinAnsi, and both are realistic for an
    // Amity Patna roster. `winAnsi()` must transliterate rather than throw.
    name: 'Anjali Śrīvāstava (अंजली)',
    program: 'B.Tech. Computer Science & Engineering',
    reference: 'AUP26-7K3M9Q',
    code10: '4820193756',
    qrPayload: 'AUP26.1.k1a.4820193756.rd8w.rd9k.MEUCIQDx',
    guestCount: 2,
    companions: [
      { relationship: 'FATHER', name: 'Rakesh Śrīvāstava' },
      { relationship: 'MOTHER', name: 'Sunita Devi' },
    ],
    issuedAt: new Date('2026-08-14T04:30:00.000Z'),
  })

  const header = Buffer.from(bytes.slice(0, 5)).toString('latin1')
  check('header', header === '%PDF-', `first five bytes are ${JSON.stringify(header)}`)
  check('size', bytes.byteLength > 4_000, `${String(bytes.byteLength)} bytes`)

  const tail = Buffer.from(bytes.slice(-1024)).toString('latin1')
  check('trailer', tail.includes('%%EOF'), 'ends with %%EOF')

  const out = join(tmpdir(), 'orientation-smoke-pass.pdf')
  writeFileSync(out, bytes)
  console.log(`        wrote ${out}`)
}

interface Row {
  reference: string
  name: string
  guests: number
  checkedIn: Date | null
}

const SPEC = {
  // Over 31 characters and containing a forbidden `/`: `safeSheetName` must fix both
  // or Excel refuses to open the file with an error that does not mention why.
  sheetName: 'Registrations / Check-ins 2026 — full dump',
  columns: [
    { header: 'Reference', value: (row: Row) => row.reference, width: 14 },
    { header: 'Name', value: (row: Row) => row.name, width: 28 },
    { header: 'Guests', value: (row: Row) => row.guests },
    { header: 'Checked in', value: (row: Row) => row.checkedIn },
  ],
  rows: [
    { reference: 'AUP26-7K3M9Q', name: 'Anjali Śrīvāstava', guests: 2, checkedIn: new Date('2026-08-14T04:31:00Z') },
    // The three CSV hazards in one row: an embedded comma, an embedded quote, and a
    // leading `=` that Excel would otherwise execute as a formula.
    { reference: 'AUP26-2B8XCD', name: 'Kumar, Ravi "RK"', guests: 0, checkedIn: null },
    { reference: 'AUP26-9WQ4RT', name: '=1+1', guests: 1, checkedIn: null },
  ],
}

function csv(): void {
  console.log('\ntoCsv')
  const buffer = toCsv(SPEC)
  const text = buffer.toString('utf8')

  check('bom', text.charCodeAt(0) === 0xfeff, 'starts with a UTF-8 BOM so Excel reads Devanagari')
  check('header row', text.includes('Reference,Name,Guests,Checked in'), 'headers present')
  check(
    'quote escaping',
    text.includes('"Kumar, Ravi ""RK"""'),
    'comma and doubled quotes escaped',
  )
  check(
    'formula neutralised',
    /'=1\+1|"'=1\+1"/.test(text),
    'leading = is prefixed so Excel does not evaluate it',
  )
  check('row count', text.trim().split('\n').length === 4, '1 header + 3 rows')
}

async function xlsx(): Promise<void> {
  console.log('\ntoXlsx')
  const buffer = await toXlsx(SPEC)

  // A real xlsx is a zip: 'PK\x03\x04'. Anything else is not openable.
  check('zip magic', buffer.subarray(0, 4).toString('latin1') === 'PK', 'PK\\x03\\x04')
  check('size', buffer.byteLength > 3_000, `${String(buffer.byteLength)} bytes`)

  // The sheet name lands in the workbook part. Read it back out of the zip's plain
  // bytes rather than reparsing: this is checking that sanitisation happened at all.
  const raw = buffer.toString('latin1')
  check('sheet name sanitised', !raw.includes('Registrations / Check-ins'), 'no forbidden slash')

  const out = join(tmpdir(), 'orientation-smoke-export.xlsx')
  writeFileSync(out, buffer)
  console.log(`        wrote ${out}`)
}

function names(): void {
  console.log('\nexportFilename / exportMime')
  const at = new Date('2026-08-14T04:30:00.000Z')
  const name = exportFilename('registrations', 'xlsx', at)
  check('filename', /^orientation2026-registrations-2026-08-14/.test(name), name)
  check(
    'mime',
    exportMime('xlsx').contentType ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    exportMime('xlsx').contentType,
  )
  check('csv mime', exportMime('csv').contentType === 'text/csv; charset=utf-8', 'text/csv')
}

function rosterCsv(): void {
  console.log('\nreadRosterCsv')
  // Exactly what "Save As → CSV UTF-8" produces from the admissions workbook: a BOM,
  // CRLF line endings, the sheet's own misspelled `From No.` header, a quoted field
  // containing a comma, and a blank trailing line.
  const source =
    '﻿' +
    'Si.No,Name,Program,From No.,Contact No.,Alt. contact no.,E-Mail ID,payment status\r\n' +
    '1,Anjali Srivastava,"B.Tech. CSE, Section A",13181463,9876543210,,anjali@example.com,PAID\r\n' +
    '2,Ravi Kumar,BBA,13181464,9876543211,9876543212,ravi@example.com,PENDING\r\n' +
    '\r\n'

  const read = readRosterCsv(Buffer.from(source, 'utf8'))

  // Four, not three: the input ends with a blank line as well as the row terminator,
  // and that blank line is a row. It is correct for the reader to surface it — the
  // reader's job is fidelity — and `parseRoster` drops all-empty rows silently, so it
  // never reaches an admin's preview. Asserted here so that contract stays explicit.
  check('row count', read.rows.length === 4, `${String(read.rows.length)} rows incl. header`)
  const blank = read.rows[3]
  check(
    'blank line is all-empty',
    blank !== undefined && blank.every((cell) => cell === '' || cell === null),
    'so parseRoster skips it rather than reporting an invalid row',
  )
  check('padded to width', blank?.length === 8, `${String(blank?.length)} cells, matching the header`)
  const header = read.rows[0]
  check('bom stripped', header?.[0] === 'Si.No', `first header cell is ${JSON.stringify(header?.[0])}`)
  check('sheet header spelling', header?.[3] === 'From No.', 'the sheet\'s own spelling preserved')
  const first = read.rows[1]
  check(
    'quoted comma',
    first?.[2] === 'B.Tech. CSE, Section A',
    `program is ${JSON.stringify(first?.[2])}`,
  )
  check('empty cell', first?.[5] === null || first?.[5] === '', 'missing alt contact is empty')
  check('sheets listed', read.sheets.length === 1, `${String(read.sheets.length)} sheet`)
}

async function main(): Promise<void> {
  await pdf()
  csv()
  await xlsx()
  names()
  rosterCsv()

  console.log(`\n${failures === 0 ? 'all output paths produce real bytes' : `${String(failures)} check(s) failed`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

void main()
