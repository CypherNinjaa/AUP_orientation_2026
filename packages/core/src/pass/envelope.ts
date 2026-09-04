/**
 * The QR payload format — parsing and serialising only, no cryptography.
 *
 * Kept apart from `sign.ts` on purpose. Signing needs `node:crypto` and happens
 * on the server; verifying happens on a volunteer's phone with WebCrypto; and
 * *reading* the envelope has to work in both, plus in a test, plus in a log
 * viewer. So the string format lives in a file with no imports at all, and the
 * two crypto implementations both build on it.
 *
 * ## Format
 *
 * ```
 * AUP26.1.<keyId>.<code10>.<notBefore>.<notAfter>.<signature>
 *       │ │       │        └──────────┬──────────┘ └── 64-byte P-256 sig, base64url
 *       │ │       └── 8 hex chars identifying the signing key
 *       │ └── format version
 *       └── namespace, so a scanner can reject a QR from another system fast
 * ```
 *
 * The signed message is the whole string *up to but not including* the final
 * separator and signature. Nothing is re-serialised before verification, so
 * there is no canonicalisation question and no way for a re-encoding to change
 * what was signed — a class of bug that JSON-based signed payloads have to work
 * hard to avoid.
 *
 * ## Why the code, and only the code
 *
 * The envelope carries the 10-digit code as its subject and nothing else. It does
 * not carry the student's name, programme, or guest count, for two reasons that
 * both matter:
 *
 *   1. A QR is a thing people photograph and post. Anything in it is public.
 *   2. All three scan paths — QR, Code128, keypad — resolve to the same
 *      `code10`, so the manifest is keyed once and the display data has one
 *      source. A QR that carried its own copy of the name could disagree with it.
 *
 * Timestamps are epoch **minutes** in base 36, which is five characters for the
 * next thirty years and keeps the QR small enough to scan off a cracked screen.
 */

export const ENVELOPE_NAMESPACE = 'AUP26'
export const ENVELOPE_VERSION = '1'
const SEPARATOR = '.'
const PART_COUNT = 7

export interface PassEnvelope {
  keyId: string
  code10: string
  /** Epoch milliseconds, rounded down to the minute. */
  notBefore: number
  /** Epoch milliseconds, rounded down to the minute. */
  notAfter: number
  /** Base64url, 64 raw bytes when decoded (P-256 r‖s). */
  signature: string
  /** The exact bytes that were signed, as a string. */
  signedMessage: string
}

export interface EnvelopeFields {
  keyId: string
  code10: string
  notBefore: number
  notAfter: number
}

/**
 * Build the signable message. Call this, sign the result, then `serialise`.
 *
 * Timestamps are truncated to the minute *here* rather than at signing time, so
 * the value that gets signed and the value that gets parsed back are identical.
 * A signature over a millisecond timestamp that is then printed to the minute
 * verifies against a different string and fails for no visible reason.
 */
export function signableMessage(fields: EnvelopeFields): string {
  return [
    ENVELOPE_NAMESPACE,
    ENVELOPE_VERSION,
    fields.keyId,
    fields.code10,
    toMinutes36(fields.notBefore),
    toMinutes36(fields.notAfter),
  ].join(SEPARATOR)
}

export function serialiseEnvelope(fields: EnvelopeFields, signature: string): string {
  return `${signableMessage(fields)}${SEPARATOR}${signature}`
}

/**
 * Parse a scanned string into an envelope, or `null` if it is not one.
 *
 * `null` covers every kind of "this is not our QR": a URL, a UPI string, a
 * WhatsApp contact card, a truncated read. The caller turns that into a plain
 * `INVALID` verdict — there is nothing useful to say about the internals of
 * somebody else's barcode.
 */
export function parseEnvelope(raw: string): PassEnvelope | null {
  const text = raw.trim()
  if (!text.startsWith(`${ENVELOPE_NAMESPACE}${SEPARATOR}`)) return null

  const parts = text.split(SEPARATOR)
  if (parts.length !== PART_COUNT) return null

  const [, version, keyId, code10, nbf, exp, signature] = parts as [
    string, string, string, string, string, string, string,
  ]

  if (version !== ENVELOPE_VERSION) return null
  if (!/^[0-9a-f]{8}$/.test(keyId)) return null
  if (!/^[1-9][0-9]{9}$/.test(code10)) return null
  if (!/^[0-9a-z]{1,8}$/.test(nbf) || !/^[0-9a-z]{1,8}$/.test(exp)) return null
  if (!/^[A-Za-z0-9_-]{86,88}$/.test(signature)) return null

  const notBefore = fromMinutes36(nbf)
  const notAfter = fromMinutes36(exp)
  if (notBefore === null || notAfter === null) return null

  return {
    keyId,
    code10,
    notBefore,
    notAfter,
    signature,
    // Reconstructed by removing the signature, not by re-joining the fields:
    // whatever the scanner read is what gets verified, byte for byte.
    signedMessage: text.slice(0, text.length - signature.length - SEPARATOR.length),
  }
}

/** True for anything that begins like one of our envelopes, valid or not. */
export function looksLikeEnvelope(raw: string): boolean {
  return raw.trim().startsWith(`${ENVELOPE_NAMESPACE}${SEPARATOR}`)
}

const MS_PER_MINUTE = 60_000

function toMinutes36(epochMs: number): string {
  return Math.floor(epochMs / MS_PER_MINUTE).toString(36)
}

function fromMinutes36(text: string): number | null {
  const minutes = Number.parseInt(text, 36)
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  return minutes * MS_PER_MINUTE
}
