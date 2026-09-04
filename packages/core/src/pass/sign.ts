/**
 * ECDSA P-256 pass signing — server side.
 *
 * ## Why not HMAC
 *
 * The original spec said HMAC. HMAC verification requires the signing secret, so
 * offline verification on a volunteer's phone would mean shipping that secret to
 * every device at the gate. One rooted phone, one screen recording of the local
 * storage, one volunteer who keeps the PWA installed afterwards — and every pass
 * for the event can be forged. With ECDSA the device holds only the public key,
 * which forges nothing ([D5](../../../../docs/01-decisions.md)).
 *
 * ## Key handling
 *
 * Keys are PEM, base64-encoded into a single environment line so they survive
 * every deployment UI that mangles multi-line values. `PASS_PRIVATE_KEY` is
 * PKCS#8 and exists only on the server; `PASS_PUBLIC_KEY` is SPKI and is the
 * only half that ever reaches a browser.
 *
 * The `keyId` is the first eight hex characters of the SHA-256 of the public
 * key's DER encoding — derived, not configured, so it cannot drift out of step
 * with the key it names. It rides in the envelope so a device holding two public
 * keys knows which to try, which is what makes key rotation possible without a
 * flag day.
 *
 * ## Signature encoding
 *
 * `ieee-p1363` gives the raw 64-byte r‖s form. The default for Node is DER,
 * which is 70–72 bytes *and variable length* — variable length in a QR payload
 * whose format is positional is a bug waiting to happen, and WebCrypto's
 * `ECDSA` verify wants P1363 anyway, so DER would have to be converted on the
 * device.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { isCode10 } from './codes'
import { parseEnvelope, serialiseEnvelope, signableMessage } from './envelope'
import type { EnvelopeFields, PassEnvelope } from './envelope'

const CURVE = 'prime256v1'
const HASH = 'sha256'
const DSA_ENCODING = 'ieee-p1363' as const

export class PassKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PassKeyError'
  }
}

export interface SigningKey {
  keyId: string
  privateKey: KeyObject
  publicKey: KeyObject
  /** SPKI PEM. Safe to serve to a browser. */
  publicKeyPem: string
}

export interface VerifyingKey {
  keyId: string
  publicKey: KeyObject
  publicKeyPem: string
}

/**
 * Generate a fresh key pair, base64-encoded ready to paste into `.env`.
 *
 * Used by `npm run keys:generate`. Deliberately returns strings rather than
 * writing a file: a private key that a script drops on disk is a private key
 * somebody forgets to delete.
 */
export function generatePassKeyPair(): {
  keyId: string
  privateKeyBase64: string
  publicKeyBase64: string
  privateKeyPem: string
  publicKeyPem: string
} {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: CURVE })
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

  return {
    keyId: deriveKeyId(publicKey),
    privateKeyPem,
    publicKeyPem,
    privateKeyBase64: Buffer.from(privateKeyPem, 'utf8').toString('base64'),
    publicKeyBase64: Buffer.from(publicKeyPem, 'utf8').toString('base64'),
  }
}

/** First 8 hex of SHA-256 over the SPKI DER. Same key ⇒ same id, always. */
export function deriveKeyId(publicKey: KeyObject): string {
  const der = publicKey.export({ type: 'spki', format: 'der' })
  return createHash('sha256').update(der).digest('hex').slice(0, 8)
}

/**
 * Load the signing key from its base64 PEM.
 *
 * Accepts a bare PEM too, for the case where somebody pastes the file contents
 * straight in — refusing that would be pedantry, since the shape is unambiguous.
 */
export function loadSigningKey(privateKeyBase64: string): SigningKey {
  const pem = decodePem(privateKeyBase64, 'PASS_PRIVATE_KEY')

  let privateKey: KeyObject
  try {
    privateKey = createPrivateKey(pem)
  } catch (error) {
    throw new PassKeyError(
      `PASS_PRIVATE_KEY is not a usable PKCS#8 private key: ${describe(error)}. Regenerate with \`npm run keys:generate\`.`,
    )
  }

  if (privateKey.asymmetricKeyType !== 'ec') {
    throw new PassKeyError(
      `PASS_PRIVATE_KEY is an ${String(privateKey.asymmetricKeyType)} key; pass signing needs an EC P-256 key.`,
    )
  }

  const publicKey = createPublicKey(privateKey)
  return {
    keyId: deriveKeyId(publicKey),
    privateKey,
    publicKey,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }
}

export function loadVerifyingKey(publicKeyBase64: string): VerifyingKey {
  const pem = decodePem(publicKeyBase64, 'PASS_PUBLIC_KEY')

  let publicKey: KeyObject
  try {
    publicKey = createPublicKey(pem)
  } catch (error) {
    throw new PassKeyError(`PASS_PUBLIC_KEY is not a usable SPKI public key: ${describe(error)}.`)
  }

  return {
    keyId: deriveKeyId(publicKey),
    publicKey,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }
}

/** The two halves must be from the same pair, or every pass fails at the gate. */
export function assertKeyPairMatches(signing: SigningKey, verifying: VerifyingKey): void {
  if (signing.keyId !== verifying.keyId) {
    throw new PassKeyError(
      `PASS_PRIVATE_KEY (${signing.keyId}) and PASS_PUBLIC_KEY (${verifying.keyId}) are not a pair. Every pass would be signed with a key no device can verify.`,
    )
  }
}

export interface IssuedEnvelope {
  /** The full QR payload. */
  payload: string
  /** The signed message, stored so a re-verification never re-derives it. */
  signedMessage: string
  signature: string
  keyId: string
  notBefore: Date
  notAfter: Date
}

/**
 * Sign a pass.
 *
 * The window is part of the signed message, so a pass cannot be made valid for
 * a different day by editing anything a student can reach. Widen it by
 * re-issuing, never by ignoring it.
 */
export function signPass(
  key: SigningKey,
  input: { code10: string; notBefore: Date; notAfter: Date },
): IssuedEnvelope {
  if (!isCode10(input.code10)) {
    throw new PassKeyError(
      `Refusing to sign "${input.code10}": a pass code must be ten digits starting 1-9. Generate it with generateCode10().`,
    )
  }
  if (input.notAfter.getTime() <= input.notBefore.getTime()) {
    throw new PassKeyError('A pass validity window must end after it starts.')
  }

  const fields: EnvelopeFields = {
    keyId: key.keyId,
    code10: input.code10,
    notBefore: input.notBefore.getTime(),
    notAfter: input.notAfter.getTime(),
  }

  const message = signableMessage(fields)
  const signature = sign(HASH, Buffer.from(message, 'utf8'), {
    key: key.privateKey,
    dsaEncoding: DSA_ENCODING,
  }).toString('base64url')

  const parsed = parseEnvelope(serialiseEnvelope(fields, signature))
  if (parsed === null) {
    // Unreachable unless the format and the parser have drifted apart, which is
    // exactly the bug worth failing loudly on rather than shipping a QR nothing
    // can read.
    throw new PassKeyError('Signed a pass whose own envelope does not parse. This is a bug in pass/envelope.ts.')
  }

  return {
    payload: serialiseEnvelope(fields, signature),
    signedMessage: message,
    signature,
    keyId: key.keyId,
    // Round-tripped through the envelope so the stored dates are the ones the
    // signature actually covers, to the minute.
    notBefore: new Date(parsed.notBefore),
    notAfter: new Date(parsed.notAfter),
  }
}

export type SignatureState = 'VALID' | 'INVALID' | 'UNKNOWN_KEY' | 'MALFORMED'

export interface VerifyResult {
  state: SignatureState
  envelope: PassEnvelope | null
}

/**
 * Verify a scanned payload against the keys this server holds.
 *
 * `UNKNOWN_KEY` is distinct from `INVALID` because they mean opposite things
 * operationally: an unknown key id is a deployment problem (a pass signed by a
 * key this instance was not given), while an invalid signature over a known key
 * is a forgery or a corrupted read. The first is fixed by an operator, the second
 * by turning somebody away.
 */
export function verifyPassPayload(raw: string, keys: readonly VerifyingKey[]): VerifyResult {
  const envelope = parseEnvelope(raw)
  if (envelope === null) return { state: 'MALFORMED', envelope: null }

  const key = keys.find((candidate) => candidate.keyId === envelope.keyId)
  if (key === undefined) return { state: 'UNKNOWN_KEY', envelope }

  let ok = false
  try {
    ok = verify(
      HASH,
      Buffer.from(envelope.signedMessage, 'utf8'),
      { key: key.publicKey, dsaEncoding: DSA_ENCODING },
      Buffer.from(envelope.signature, 'base64url'),
    )
  } catch {
    // A signature of the wrong length throws rather than returning false.
    ok = false
  }

  return { state: ok ? 'VALID' : 'INVALID', envelope }
}

function decodePem(value: string, name: string): string {
  const text = value.trim()
  if (text === '') {
    throw new PassKeyError(`${name} is empty. Generate a key pair with \`npm run keys:generate\`.`)
  }
  if (text.includes('-----BEGIN')) return text

  const decoded = Buffer.from(text, 'base64').toString('utf8')
  if (!decoded.includes('-----BEGIN')) {
    throw new PassKeyError(
      `${name} is neither a PEM block nor base64-encoded PEM. Generate a key pair with \`npm run keys:generate\`.`,
    )
  }
  return decoded
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
