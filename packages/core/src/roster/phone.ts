/**
 * Indian mobile number normalisation for roster imports.
 *
 * The admissions sheet does not hold one number per cell. Profiling the 830-row
 * demo file found:
 *   - 3 rows where `Contact No.` holds two numbers joined by a slash, e.g.
 *     `7644963307/8235152773`
 *   - 425 of 830 `Alt. contact no.` cells with the same pattern, some with a
 *     space after the slash (`7979866632/ 6201013902`), some with a leading space
 *   - values Excel had already coerced to a number, so they arrive without any
 *     leading zero
 *
 * Nothing downstream can use a cell like that: the wizard auto-fills one phone
 * field, and the help desk needs to dial one number. So each cell is split, each
 * fragment normalised, the first valid one becomes the primary, and the rest are
 * kept in `extraContacts` rather than discarded — a parent's second number is
 * exactly what the help desk reaches for when a student is unreachable.
 */

/** Fragments are separated by any of these in the source data. */
const SEPARATORS = /[/,;|]|\s{2,}|\bor\b/gi

export interface PhoneParseResult {
  /** Normalised 10-digit numbers, in the order they appeared, deduplicated. */
  valid: string[]
  /** Fragments that were non-empty but not a usable Indian mobile number. */
  rejected: string[]
}

/**
 * One fragment to a bare 10-digit number, or null.
 *
 * Accepts the forms that actually turn up: `+91 98765 43210`, `919876543210`,
 * `09876543210`, `9876543210`. Rejects anything that is not a 10-digit number
 * starting 6-9, which is the whole of the Indian mobile range — a landline or a
 * truncated number is worse than no number, because it looks callable.
 */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits === '') return null

  let local = digits
  if (local.length === 12 && local.startsWith('91')) local = local.slice(2)
  else if (local.length === 13 && local.startsWith('091')) local = local.slice(3)
  else if (local.length === 11 && local.startsWith('0')) local = local.slice(1)

  return /^[6-9]\d{9}$/.test(local) ? local : null
}

/** Split a cell that may hold several numbers and normalise each. */
export function parsePhoneCell(raw: string | null | undefined): PhoneParseResult {
  const valid: string[] = []
  const rejected: string[] = []
  if (raw === null || raw === undefined) return { valid, rejected }

  for (const fragment of String(raw).split(SEPARATORS)) {
    const trimmed = (fragment ?? '').trim()
    if (trimmed === '') continue
    const normalised = normalisePhone(trimmed)
    if (normalised === null) rejected.push(trimmed)
    else if (!valid.includes(normalised)) valid.push(normalised)
  }

  return { valid, rejected }
}

/** Display form for admin tables and the help desk: `98765 43210`. */
export function formatPhone(tenDigits: string): string {
  return /^\d{10}$/.test(tenDigits)
    ? `${tenDigits.slice(0, 5)} ${tenDigits.slice(5)}`
    : tenDigits
}
