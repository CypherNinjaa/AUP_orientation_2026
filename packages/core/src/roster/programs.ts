/**
 * Programme level derivation.
 *
 * The admissions sheet is free text, and the verbatim string is what the system
 * uses everywhere a human reads it: the registration lookup returns it as-is,
 * the pass prints it as-is, the scanner shows it as-is. It is what the student's
 * admission letter says, and it is not this module's business to reinterpret it.
 *
 * A discipline-grouping layer used to live here (`PROGRAM_GROUPS`, a regex table
 * mapping 35 spellings onto 11 buckets). It was removed on instruction: the
 * lookup must return the actual programme from the sheet, never a derived group.
 * Admin charts group by the verbatim `program` column instead — the distribution
 * is longer-tailed, and it is the truth.
 *
 * What remains is the level (UG / PG / PHD), which is a different facet: it is
 * not a renaming of the programme, it is a fact about it, and the export and the
 * arrivals breakdown want it. It is never shown to a student in place of their
 * programme name.
 */

export const PROGRAM_LEVELS = ['UG', 'PG', 'PHD', 'UNKNOWN'] as const
export type ProgramLevel = (typeof PROGRAM_LEVELS)[number]

/**
 * Uppercase, collapse whitespace, and drop the qualifier suffixes that carry no
 * level information. `(Hons./Hons. with Research)`, `(Part Time)`, `(Jan)`
 * and `(4.5Yrs)` appear on 30-odd rows and only get in the way of matching.
 */
function canonical(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\(HONS\.?\s*\/\s*HONS\.?\s*WITH\s*RESEARCH\)/g, ' ')
    .replace(/\(PART\s*TIME\)/g, ' ')
    .replace(/\(FULL\s*TIME\)/g, ' ')
    .replace(/\((?:JAN|JULY|JUL)\)/g, ' ')
    .replace(/\(\d+(?:\.\d+)?\s*YRS?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * UG, PG, or PHD.
 *
 * Integrated five-year law (`BBA LL.B.`, `B.A.,LL.B`) is UG — it takes school
 * leavers. A bare `LL.B` is the three-year graduate-entry degree and is treated
 * as PG.
 *
 * Returns `'UNKNOWN'` only for an empty string: a roster upload must not fail
 * because Admissions introduced a programme nobody told us about, and an
 * unrecognised name is far more likely to be undergraduate than not.
 *
 * TODO(registrar): confirm the LL.B (H) duration at Patna. If it is the
 * five-year integrated programme this returns the wrong level, which affects
 * nothing but a chart label.
 */
export function programLevel(raw: string): ProgramLevel {
  const text = canonical(raw)

  if (text === '') return 'UNKNOWN'

  if (/\bPH\.?\s?D\b|\bDOCTORATE\b/.test(text)) return 'PHD'

  // Integrated dual and five-year degrees enrol at UG level even though they
  // award a postgraduate qualification.
  if (/\bDUAL\b|INTEGRATED/.test(text)) return 'UG'
  if (/\b[BM]\.?\s?B\.?\s?A\b.*\bLL\.?\s?B\b/.test(text)) return 'UG'
  if (/\bB\.?\s?A\.?\b.*\bLL\.?\s?B\b/.test(text)) return 'UG'

  if (/\bLL\.?\s?M\b/.test(text)) return 'PG'
  if (/\bLL\.?\s?B\b/.test(text)) return 'PG'

  // A leading M. is postgraduate: MBA, M.C.A., M.Clin. Psy, M.Sc, M.Tech.
  if (/^M\.?\s?[A-Z]/.test(text)) return 'PG'
  if (/\bM\.?\s?(?:BA|CA|SC|TECH|COM|A)\b/.test(text)) return 'PG'

  return 'UG'
}
