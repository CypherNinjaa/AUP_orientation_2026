/**
 * Spreadsheet adapter: file bytes → the 2D array `parseRoster` expects.
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

/**
 * Read a CSV export of the same roster.
 *
 * `ROSTER_EXTENSIONS` accepts `.csv` because "save as CSV" is what an admissions
 * office does when the xlsx will not open, and arriving at the upload screen with
 * the only file you have and being refused is a bad afternoon.
 *
 * Hand-rolled rather than `workbook.csv.read`: exceljs's CSV path guesses at
 * dates, and a form number is a bare digit string that must not be guessed at.
 * This does the one thing RFC 4180 actually requires — `""` inside a quoted field
 * is a literal quote — and returns every cell as a string, leaving all
 * interpretation to `parseRoster`, which is where the roster's rules live.
 *
 * Every value comes back as a string, including `Si.No`. `parseRoster` already
 * accepts that: `serialNo` goes through `Number()` and the phone columns are
 * parsed out of text regardless.
 */
export function readRosterCsv(data: ArrayBuffer | Buffer): WorkbookRead {
  const text = Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data)
    .toString('utf8')
    // Strip a UTF-8 BOM. Excel writes one, and it would otherwise become part of
    // the first header's text and stop `Si.No` from matching. Built from its code
    // point rather than written literally, because the literal character is
    // invisible in an editor — which is the whole reason it causes this bug.
    .replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), '')

  const rows: Cell[][] = []
  let row: Cell[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    // `charAt` rather than `text[i]`: under `noUncheckedIndexedAccess` the index
    // form is `string | undefined`, which it cannot be inside these bounds.
    const char = text.charAt(i)

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && field === '') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      // Swallow the LF of a CRLF pair so it does not open an empty row.
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  // A file with no trailing newline still has a last row.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // Same padding rule as the xlsx path: a row that ends in blanks must not
  // shift the columns to its left.
  const width = rows[0]?.length ?? 0
  for (const line of rows) {
    while (line.length < width) line.push(null)
  }

  const sheet: SheetChoice = { index: 1, name: 'CSV', rowCount: rows.length }
  return { rows, sheet, sheets: [sheet] }
}
