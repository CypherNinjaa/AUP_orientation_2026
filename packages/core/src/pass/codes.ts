/**
 * Code and reference *generation*. The server half.
 *
 * Both values are random, not sequential. A sequential id lets anyone holding one
 * pass enumerate every other pass, and at the gate the 10-digit code is the
 * fallback that admits a student with a dead phone — so guessing one has to be
 * hopeless.
 *
 * On the length of `code10`: the original spec said six digits. With 15,000
 * passes live, a 6-digit space of 900,000 leaves one valid code every 60 guesses,
 * which a bored student finds in an afternoon. Ten digits is one in 666,666 at
 * the same intake, and typing four extra digits on a numeric keypad costs about a
 * second ([D6](../../../../docs/01-decisions.md)).
 *
 * `randomInt` and `randomBytes` are CSPRNG-backed; `Math.random` is not and must
 * never appear in this file.
 *
 * The formatting and parsing counterparts live in `identity.ts`, which has no
 * dependencies at all and is what the browser-side scanner imports — a bundle
 * that runs in a browser cannot contain `node:crypto`. They are re-exported here
 * so a server-side caller can keep importing one module.
 */
import { randomBytes, randomInt } from 'node:crypto'

import { CODE10_LENGTH, REFERENCE_ALPHABET, REFERENCE_BODY_LENGTH, REFERENCE_PREFIX } from './identity'

export {
  CODE10_LENGTH,
  REFERENCE_BODY_LENGTH,
  REFERENCE_PREFIX,
  formatCode10,
  isCode10,
  isReference,
  normaliseReference,
  parseCode10,
} from './identity'

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
