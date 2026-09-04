/**
 * AES-256-GCM for the small number of secrets that have to live in the database.
 *
 * There is exactly one class of those today: the API secret of a *secondary*
 * Cloudinary account, added by an admin from the settings screen when the primary
 * account's free tier fills up. The primary credentials come from the process
 * environment and never touch a table.
 *
 * A column holding a plaintext API secret is a credential that leaks with a
 * backup, a `SELECT *` in a support session, or a read-only analytics grant. So
 * the ciphertext is what is stored, and the key that opens it lives only in
 * `SECRETS_KEY` in the environment — the same place the primary credentials are.
 * A database dump on its own is then worth nothing.
 *
 * GCM rather than CBC because it authenticates: a tampered ciphertext fails to
 * decrypt rather than decrypting into garbage that gets sent to Cloudinary as a
 * signature. The IV is random per encryption and stored alongside, which is
 * required — reusing an IV with the same key breaks GCM completely.
 *
 * Framework-free and dependency-free: `node:crypto` only.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

/** Versioned so the format can change without guessing at what a column holds. */
const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12 // 96 bits, the GCM standard. Longer is not better here.
const TAG_BYTES = 16

export class SecretsKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecretsKeyError'
  }
}

export class SecretDecryptError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecretDecryptError'
  }
}

/**
 * Turn the `SECRETS_KEY` environment value into 32 raw bytes.
 *
 * Accepts base64, base64url, or hex, because whichever one the operator's
 * password manager hands them should work. Anything that does not decode to
 * exactly 32 bytes is refused loudly at the point of use rather than silently
 * padded — a short key is a weak key, and this is the one place that cannot be
 * lenient.
 */
export function parseSecretsKey(raw: string): Buffer {
  const text = raw.trim()
  if (text === '') {
    throw new SecretsKeyError('SECRETS_KEY is empty. Generate one with `npm run keys:generate`.')
  }

  const candidates: Buffer[] = []
  if (/^[0-9a-fA-F]{64}$/.test(text)) candidates.push(Buffer.from(text, 'hex'))
  candidates.push(Buffer.from(text, 'base64'))

  for (const candidate of candidates) {
    if (candidate.length === KEY_BYTES) return candidate
  }

  throw new SecretsKeyError(
    `SECRETS_KEY must decode to ${String(KEY_BYTES)} bytes (base64 or hex); got ${String(
      candidates[0]?.length ?? 0,
    )}. Generate one with \`npm run keys:generate\`.`,
  )
}

/**
 * `v1.<iv>.<tag>.<ciphertext>`, each part base64url.
 *
 * One self-describing string rather than four columns: it moves between tables,
 * survives a JSON round trip, and cannot be half-copied.
 */
export function encryptSecret(plaintext: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new SecretsKeyError(`Key must be ${String(KEY_BYTES)} bytes; got ${String(key.length)}.`)
  }

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [VERSION, b64u(iv), b64u(tag), b64u(ciphertext)].join('.')
}

export function decryptSecret(envelope: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new SecretsKeyError(`Key must be ${String(KEY_BYTES)} bytes; got ${String(key.length)}.`)
  }

  const parts = envelope.split('.')
  if (parts.length !== 4) {
    throw new SecretDecryptError('Not an encrypted secret envelope: expected four dot-separated parts.')
  }

  const [version, ivPart, tagPart, ctPart] = parts as [string, string, string, string]
  if (version !== VERSION) {
    throw new SecretDecryptError(`Unsupported secret envelope version "${version}".`)
  }

  const iv = unb64u(ivPart)
  const tag = unb64u(tagPart)
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new SecretDecryptError('Encrypted secret envelope is malformed (bad IV or tag length).')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  try {
    return Buffer.concat([decipher.update(unb64u(ctPart)), decipher.final()]).toString('utf8')
  } catch {
    // `final()` throws when the tag does not match, which means either the wrong
    // key or a modified ciphertext. Both are the same operational answer: this
    // credential cannot be used, and nobody should be told which of the two it is.
    throw new SecretDecryptError(
      'Could not decrypt the stored secret. Either SECRETS_KEY has changed since it was written, or the stored value was altered.',
    )
  }
}

/** True when `envelope` looks like output of `encryptSecret`. Cheap shape check. */
export function isEncryptedSecret(envelope: string): boolean {
  return envelope.startsWith(`${VERSION}.`) && envelope.split('.').length === 4
}

/**
 * Constant-time comparison for shared secrets that arrive over HTTP — a webhook
 * token, an admin bootstrap key. `===` on a string leaks its answer in timing.
 */
export function secretEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function b64u(buffer: Buffer): string {
  return buffer.toString('base64url')
}

function unb64u(text: string): Buffer {
  return Buffer.from(text, 'base64url')
}
