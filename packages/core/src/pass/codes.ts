/**
 * The three things a student can be identified by, and how they are generated.
 *
 *   `code10`     ten digits, typed on a keypad or read from a Code128 barcode
 *   `reference`  a short human-quotable registration id, e.g. AUP26-7F3K2Q
 *
 * Both are random, not sequential. A sequential id lets anyone holding one pass
 * enumerate every other pass, and at the gate the 10-digit code is the fallback
 * that admits a student with a dead phone — so guessing one has to be hopeless.
 *
 * On the length of `code10`: the original spec said six digits. With 15,000
 * passes live, a 6-digit space of 900,000 leaves one valid code every 60 guesses,
 * which a bored student finds in an afternoon. Ten digits is one in 666,666 at
 * the same intake, and typing four extra digits on a numeric keypad costs about a
 * second ([D6](../../../../docs/01-decisions.md)).
 *
 * Pure, dependency-free, `node:crypto` only. `randomInt` and `randomBytes` are
 * CSPRNG-backed; `Math.random` is not and must never appear in this file.
 */
import { randomBytes, randomInt } from 'node:crypto'

export const CODE10_LENGTH = 10
export const REFERENCE_PREFIX = 'AUP26'
export const REFERENCE_BODY_LENGTH = 6

/**
 * Crockford-style base32 with the ambiguous characters removed: no I, L, O, U,
 * and no 0 or 1. A reference gets read down a phone line to a help desk, and
 * "AUP26-1IO0LU" is unreadable by design.
 */
const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * Ten digits, never starting with zero.
 *
 * The leading digit is 1–9 so the code survives every place a number-shaped
 * string gets treated as a number: a spreadsheet cell, an Excel export, a JSON
 * round trip through a client that parses it. A code that displays as
 * `023-456-7890` in the app and `234567890` in the admin export is a support call.
 */
export function generateCode10(): string {
  let code = String(randomInt(1, 10))
  for (let i = 1; i < CODE10_LENGTH; i += 1) code += String(randomInt(0, 10))
  return code
}

/** `AUP26-7F3K2Q`. Uppercase, hyphenated, safe to read aloud. */
export function generateReference(): string {
  const bytes = randomBytes(REFERENCE_BODY_LENGTH * 2)
  let body = ''
  let i = 0
  while (body.length < REFERENCE_BODY_LENGTH) {
    // Rejection sampling: 256 is not a multiple of 30, so taking a raw byte
    // modulo 30 would make the first six letters of the alphabet slightly more
    // likely. Cheap to do correctly.
    const byte = bytes[i % bytes.length] ?? 0
    i += 1
    const limit = 256 - (256 % REFERENCE_ALPHABET.length)
    if (byte >= limit) continue
    body += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]
  }
  return `${REFERENCE_PREFIX}-${body}`
}

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
