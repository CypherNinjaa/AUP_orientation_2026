/**
 * The two things a student is identified by, and how they are read.
 *
 *   `code10`     ten digits, typed on a keypad or read from a Code128 barcode
 *   `reference`  a short human-quotable registration id, e.g. AUP26-7F3K2Q
 *
 * This module is the *reading* half: formatting, parsing and validating. The
 * *generating* half lives in `codes.ts` next door, because generation needs a
 * CSPRNG and therefore `node:crypto`.
 *
 * That split is not tidiness. The volunteer scanner runs in a browser and has to
 * pull a code out of a barcode read with no network — so it imports `parseCode10`
 * — and a browser bundle cannot contain `node:crypto`. Keeping the pure half
 * reachable on its own (`@orientation/core/pass/identity`) is what lets the
 * offline scanner share the exact parser the server validates with, instead of a
 * second copy in the web app that can drift.
 *
 * Nothing here has a dependency of any kind. Anything added to this file must
 * stay that way.
 */

export const CODE10_LENGTH = 10
export const REFERENCE_PREFIX = 'AUP26'
export const REFERENCE_BODY_LENGTH = 6

/**
 * Crockford-style base32 with the ambiguous characters removed: no I, L, O, U,
 * and no 0 or 1. A reference gets read down a phone line to a help desk, and
 * "AUP26-1IO0LU" is unreadable by design.
 */
export const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

/** `1234567890` → `123-456-7890`. The only form ever shown to a human. */
export function formatCode10(code: string): string {
  if (!isCode10(code)) return code
  return `${code.slice(0, 3)}-${code.slice(3, 6)}-${code.slice(6)}`
}

/**
 * Pull a 10-digit code out of whatever the volunteer's device produced.
 *
 * Accepts the display form with hyphens, the bare digits from a Code128 scan,
 * spaces from a keypad, and the odd non-breaking space a copy-paste introduces.
 * Returns `null` rather than a partial code: at the gate, a half-read barcode
 * must fail visibly instead of matching the wrong student.
 */
export function parseCode10(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, '')
  return isCode10(digits) ? digits : null
}

export function isCode10(value: string): boolean {
  return new RegExp(`^[1-9][0-9]{${String(CODE10_LENGTH - 1)}}$`).test(value)
}

export function isReference(value: string): boolean {
  return new RegExp(
    `^${REFERENCE_PREFIX}-[${REFERENCE_ALPHABET}]{${String(REFERENCE_BODY_LENGTH)}}$`,
  ).test(value)
}

/**
 * Normalise a reference typed by a human: lowercase, missing hyphen, and the
 * substitutions people make for the characters the alphabet excludes.
 *
 * `O`→`0` is *not* one of them: zero is not in the alphabet either, so an `O`
 * can only have been meant as the letter, and there is no letter O. Such a
 * string is simply not a reference, and `isReference` will say so.
 */
export function normaliseReference(raw: string): string {
  const text = raw.trim().toUpperCase().replace(/[\s-]+/g, '')
  const body = text.startsWith(REFERENCE_PREFIX) ? text.slice(REFERENCE_PREFIX.length) : text
  return `${REFERENCE_PREFIX}-${body}`
}
