/**
 * Tests for the Excel adapter.
 *
 * These build a workbook with exceljs and read it back, rather than committing a
 * fixture file. The cell shapes below are not hypothetical — every one of them
 * came out of the real admissions sheet or out of a bug it caused.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { readRosterWorkbook } from './workbook'

/** Build a one-sheet workbook from raw cell values and return its bytes. */
async function workbookOf(
  rows: ExcelJS.CellValue[][],
  sheetName = 'Sheet1',
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  for (const [r, cells] of rows.entries()) {
    const row = sheet.getRow(r + 1)
    for (const [c, value] of cells.entries()) row.getCell(c + 1).value = value
    row.commit()
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

test('reads plain strings and numbers', async () => {
  const bytes = await workbookOf([
    ['Name', 'From No.'],
    ['ANJALI KUMARI', 20260001],
  ])
  const { rows } = await readRosterWorkbook(bytes)
  assert.deepEqual(rows[1], ['ANJALI KUMARI', 20260001])
})

test('a hyperlink cell yields its display text, not [object Object]', async () => {
  // The exact shape found in the demo sheet: one form number stored as a
  // hyperlink whose text is a *number*. Requiring a string here dropped the row,
  // and the student would have been told she was not admitted.
  //
  // The cast is the point of the test. exceljs types `CellHyperlinkValue.text` as
  // `string`, but its own reader hands back a number for this cell, so the shape
  // has to be built past the declaration to reproduce what the file contains.
  const numericHyperlink = { text: 13181463, hyperlink: 'javascript:void(0)' } as unknown as ExcelJS.CellValue

  const bytes = await workbookOf([
    ['Name', 'From No.'],
    ['RICHA GUPTA', numericHyperlink],
  ])
  const { rows } = await readRosterWorkbook(bytes)

  // Asserted as digits rather than as a number: exceljs's *writer* stringifies
  // the numeric text on the way out, while the real file stores it numeric. Both
  // are fine — `parseRoster` normalises a form number to digits either way. What
  // matters is that it is the display text and not the stringified object.
  assert.equal(String(rows[1]?.[1]), '13181463')
})

test('a hyperlink cell with string text yields the text, never the URL', async () => {
  const bytes = await workbookOf([
    ['E-Mail ID'],
    [{ text: 'someone@example.com', hyperlink: 'mailto:someone@example.com' }],
  ])
  const { rows } = await readRosterWorkbook(bytes)
  assert.equal(rows[1]?.[0], 'someone@example.com')
})

test('a rich text cell is joined into one string', async () => {
  const bytes = await workbookOf([
    ['Name'],
    [{ richText: [{ text: 'AYUSH ' }, { text: 'KUMAR' }] }],
  ])
  const { rows } = await readRosterWorkbook(bytes)
  assert.equal(rows[1]?.[0], 'AYUSH KUMAR')
})

test('a formula cell yields its cached result', async () => {
  const bytes = await workbookOf([
    ['From No.'],
    [{ formula: 'CONCATENATE("2026","0001")', result: '20260001' }],
  ])
  const { rows } = await readRosterWorkbook(bytes)
  assert.equal(rows[1]?.[0], '20260001')
})

test('a formula error cell yields null rather than the error text', async () => {
  const bytes = await workbookOf([['Contact No.'], [{ error: '#N/A' }]])
  const { rows } = await readRosterWorkbook(bytes)
  assert.equal(rows[1]?.[0], null)
})

test('rows are padded to the header width', async () => {
  // A student with no alternate number leaves trailing cells empty, and exceljs
  // reports a shorter row. Without padding, `payment status` would shift left into
  // the email column.
  const bytes = await workbookOf([
    ['Si.No', 'Name', 'Program', 'From No.', 'Contact No.', 'Alt. contact no.'],
    [1, 'ANJALI KUMARI', 'BCA', 20260001],
  ])
  const { rows } = await readRosterWorkbook(bytes)
  assert.equal(rows[0]?.length, 6)
  assert.equal(rows[1]?.length, 6)
  assert.deepEqual(rows[1]?.slice(4), [null, null])
})

test('reports every sheet and defaults to the first', async () => {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('Enrolled').getRow(1).getCell(1).value = 'first'
  workbook.addWorksheet('Notes').getRow(1).getCell(1).value = 'second'
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer())

  const read = await readRosterWorkbook(bytes)
  assert.equal(read.sheet.name, 'Enrolled')
  assert.equal(read.sheet.index, 1)
  assert.deepEqual(
    read.sheets.map((s) => s.name),
    ['Enrolled', 'Notes'],
  )
  assert.equal(read.rows[0]?.[0], 'first')
})

test('an explicit sheet index selects that sheet', async () => {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('Enrolled').getRow(1).getCell(1).value = 'first'
  workbook.addWorksheet('Notes').getRow(1).getCell(1).value = 'second'
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer())

  const read = await readRosterWorkbook(bytes, 2)
  assert.equal(read.sheet.name, 'Notes')
  assert.equal(read.rows[0]?.[0], 'second')
})

test('a missing sheet index names the sheets that do exist', async () => {
  const bytes = await workbookOf([['Name']], 'Enrolled')
  await assert.rejects(() => readRosterWorkbook(bytes, 4), /has 1: Enrolled/)
})
