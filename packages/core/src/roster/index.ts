/**
 * Roster ingestion, shared by the CLI seed and the admin upload endpoint.
 *
 * There is one parser, not two. The seed script and `/api/admin/roster` both call
 * `parseRoster`, so a file that previews cleanly in the admin UI seeds identically
 * from the command line, and a normalisation fix lands in both at once.
 *
 * The Excel reader is a separate export (`@orientation/core/roster/workbook`) so
 * exceljs is only pulled in where a real file is being read.
 */
export {
  normaliseHeader,
  parseRoster,
  resolveHeaders,
  type Cell,
  type ColumnMap,
  type HeaderResolution,
  type IssueSeverity,
  type RosterField,
  type RosterIssue,
  type RosterParseResult,
  type RosterStudent,
} from './parse'

export { formatPhone, normalisePhone, parsePhoneCell, type PhoneParseResult } from './phone'

export { PROGRAM_LEVELS, programLevel, type ProgramLevel } from './programs'
