/**
 * Tabular export: rows in, bytes out.
 *
 * Deliberately knows nothing about registrations, check-ins or Prisma. It takes column
 * definitions and plain objects and returns a file, which means the two things that go
 * wrong in export code — a column order that drifts between formats, and a CSV that
 * Excel mangles — are fixed in one place for every dataset.
 *
 * Lives in `packages/core` because `exceljs` is already a dependency here (the roster
 * reader uses it) and pulling a second copy into the web app to write the same file
 * format would be silly.
 *
 * ## Why CSV is hand-rolled
 *
 * `exceljs` can write CSV, but its writer does not emit a UTF-8 BOM, and Excel on
 * Windows — which is what the registrar's office runs — reads a BOM-less UTF-8 CSV as
 * the system codepage. Every Devanāgarī name and every `’` in a programme title comes
 * out as mojibake. Three lines of our own quoting logic is a better trade than that.
 */
import ExcelJS from 'exceljs'

/** A cell value we are prepared to write. */
export type CellValue = string | number | boolean | Date | null | undefined

export interface ExportColumn<Row> {
  /** Header text, exactly as it should appear in the file. */
  header: string
  /** Pulls the value out of a row. */
  value: (row: Row) => CellValue
  /** Column width in characters. xlsx only; ignored by CSV. */
  width?: number
}

export interface ExportSpec<Row> {
  /** Worksheet name. Sanitised for xlsx, ignored by CSV. */
  sheetName: string
  columns: ExportColumn<Row>[]
  rows: Row[]
}

/**
 * Excel forbids `[ ] : * ? / \` in a sheet name and caps it at 31 characters.
 *
 * A name that breaks either rule makes the whole file unopenable, with an error
 * message that does not mention the sheet name — so it is normalised here rather than
 * trusted from a caller.
 */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim()
  const collapsed = cleaned.replace(/\s+/g, ' ')
  return collapsed.length === 0 ? 'Sheet1' : collapsed.slice(0, 31)
}

/**
 * A cell as text, before any quoting.
 *
 * A `Date` becomes ISO 8601 — the one format that survives being read back by
 * anything. A boolean becomes `yes`/`no`, because `TRUE` in a spreadsheet column of
 * names reads as a formula result rather than an answer.
 */
function stringify(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

/**
 * One cell, as a CSV field.
 *
 * Quoted whenever it contains a comma, a quote, a newline, or leading/trailing
 * whitespace that would otherwise be eaten.
 */
function csvField(text: string): string {
  if (text === '') return ''

  const needsQuotes =
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r') ||
    text !== text.trim()

  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * A leading character that Excel would execute.
 *
 * A cell starting `=`, `+`, `-` or `@` is a formula to Excel, and a student who types
 * `=cmd|' /c calc'!A0` into a name field has written a CSV injection that fires on the
 * registrar's machine when they open the export. Prefixing a single quote makes Excel
 * treat it as text. Applied to CSV only: the xlsx writer sets the cell type
 * explicitly, so a string cell there is never evaluated.
 */
const FORMULA_LEADERS = new Set(['=', '+', '-', '@', '\t', '\r'])

/**
 * Neutralise, then quote — in that order.
 *
 * The reverse order is the classic bug: prefixing a quote onto an already-quoted field
 * means reasoning about where the quotes are, and the escaping of any embedded `"`
 * gets applied twice.
 */
function csvSafe(value: CellValue): string {
  const text = stringify(value)
  if (text === '') return ''

  const neutralised = FORMULA_LEADERS.has(text.charAt(0)) ? `'${text}` : text
  return csvField(neutralised)
}

/**
 * The UTF-8 byte-order mark.
 *
 * Built from its code point rather than written literally, so an editor that strips
 * invisible characters cannot silently remove the one thing standing between the
 * registrar and a screen full of mojibake.
 */
const BOM = String.fromCharCode(0xfeff)

/** Render a spec as CSV bytes, BOM included. */
export function toCsv<Row>(spec: ExportSpec<Row>): Buffer {
  const lines: string[] = [spec.columns.map((column) => csvField(column.header)).join(',')]

  for (const row of spec.rows) {
    lines.push(spec.columns.map((column) => csvSafe(column.value(row))).join(','))
  }

  // CRLF, because the audience is Excel on Windows.
  return Buffer.from(`${BOM}${lines.join('\r\n')}\r\n`, 'utf8')
}

/** Render a spec as an xlsx workbook. */
export async function toXlsx<Row>(spec: ExportSpec<Row>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Orientation 2026'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(safeSheetName(spec.sheetName), {
    // Freezes the header row, so scrolling 15,000 rows does not lose the column names.
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  sheet.columns = spec.columns.map((column) => ({
    header: column.header,
    width: column.width ?? Math.max(12, Math.min(40, column.header.length + 4)),
  }))

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.alignment = { vertical: 'middle' }

  for (const row of spec.rows) {
    sheet.addRow(
      spec.columns.map((column) => {
        const value = column.value(row)
        // `undefined` leaves the cell genuinely empty; `null` would write a blank
        // string, which reads the same but sorts differently.
        return value === null ? undefined : value
      }),
    )
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(1, spec.columns.length) },
  }

  const written = await workbook.xlsx.writeBuffer()
  return Buffer.from(written)
}

/** Content type and extension for a format. */
export function exportMime(format: 'xlsx' | 'csv'): { contentType: string; extension: string } {
  return format === 'csv'
    ? { contentType: 'text/csv; charset=utf-8', extension: 'csv' }
    : {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: 'xlsx',
      }
}

/**
 * A filename that survives a `Content-Disposition` header.
 *
 * ASCII only and no quotes: a non-ASCII filename needs RFC 5987 encoding, and a quote
 * in an unencoded filename terminates the header value early — which turns a download
 * into a broken response rather than a badly-named file.
 */
export function exportFilename(dataset: string, format: 'xlsx' | 'csv', at = new Date()): string {
  const stamp = at.toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const safe = dataset.replace(/[^a-zA-Z0-9-]/g, '-')
  return `orientation2026-${safe}-${stamp}.${exportMime(format).extension}`
}
