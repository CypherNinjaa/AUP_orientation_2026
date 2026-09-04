/**
 * Excel adapter: workbook bytes → the 2D array `parseRoster` expects.
 *
 * Isolated in its own module and its own package export so exceljs stays out of
 * anything that only needs the pure parser — the browser never loads it, and the
 * unit tests do not need a fixture file.
 */
import ExcelJS from 'exceljs'
import type { Cell } from './parse'

export interface SheetChoice {
  /** 1-based index as shown in Excel's tab order. */
  index: number
  name: string
  rowCount: number
}

export interface WorkbookRead {
  rows: Cell[][]
  sheet: SheetChoice
  /** Every sheet in the file, so an admin can pick a different one. */
  sheets: SheetChoice[]
}

/**
 * `richText` cells (a name someone bolded halfway through) arrive as an object
 * rather than a string, and formula cells arrive as `{ formula, result }`. Both
 * turn up in hand-maintained spreadsheets, so flatten them here rather than
 * letting `String(cell)` produce `[object Object]`.
 */
function flatten(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    // A hyperlink cell is `{ text, hyperlink }`, and `text` is not necessarily a
    // string: one form number in the demo sheet is stored as
    // `{ text: 13181463, hyperlink: 'javascript:void(0)' }`, presumably by
    // whatever tool the admissions office pasted it from. Requiring a string here
    // sent it to `String(value)` → `"[object Object]"`, which failed the form
    // number check and dropped a genuinely admitted student from the import — she
    // would have been told at registration that she was not on the list. So
    // recurse instead, which also covers a hyperlink whose text is rich text.
    //
    // The `hyperlink` itself is never read. That one is `javascript:void(0)`, and
    // an uploaded file is not a place to trust a URL.
    if ('text' in value) return flatten(value.text as ExcelJS.CellValue)
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('')
    }
    if ('result' in value) return flatten(value.result as ExcelJS.CellValue)
    if ('error' in value) return null
  }
  return String(value)
}

/**
 * Read one sheet out of an xlsx buffer.
 *
 * Defaults to the first sheet. `exceljs` reports a row's `cellCount` from the
 * stored dimension, which can be short when trailing cells are blank, so the row
 * length is taken from the header row and every row padded to it — otherwise a
 * student with no alternate number produces a shorter array and the payment
 * status column shifts left.
 */
export async function readRosterWorkbook(
  data: ArrayBuffer | Buffer,
  sheetIndex?: number,
): Promise<WorkbookRead> {
  const workbook = new ExcelJS.Workbook()
  const buffer = data instanceof ArrayBuffer ? data : new Uint8Array(data).buffer
  await workbook.xlsx.load(buffer as ArrayBuffer)

  const sheets: SheetChoice[] = workbook.worksheets.map((sheet, i) => ({
    index: i + 1,
    name: sheet.name,
    rowCount: sheet.actualRowCount,
  }))

  if (sheets.length === 0) throw new Error('The workbook contains no sheets.')

  const wanted = sheetIndex ?? 1
  const worksheet = workbook.worksheets[wanted - 1]
  if (worksheet === undefined) {
    throw new Error(
      `Sheet ${wanted} does not exist. The workbook has ${String(sheets.length)}: ${sheets
        .map((s) => s.name)
        .join(', ')}.`,
    )
  }

  const rows: Cell[][] = []
  let width = 0

  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: Cell[] = []
    // `row.values` is 1-based with a hole at index 0.
    const values = row.values as ExcelJS.CellValue[]
    for (let column = 1; column < values.length; column += 1) {
      cells.push(flatten(values[column]))
    }
    if (rows.length === 0) width = cells.length
    while (cells.length < width) cells.push(null)
    rows.push(cells)
  })

  const chosen = sheets[wanted - 1]
  if (chosen === undefined) throw new Error(`Sheet ${String(wanted)} vanished while reading.`)

  return { rows, sheet: chosen, sheets }
}
