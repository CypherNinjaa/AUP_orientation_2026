/**
 * ECDSA P-256 verification in the browser, for the offline scanner.
 *
 * The volunteer's device holds only public keys, so this file can do everything
 * the gate needs and nothing it should not. It is the mirror of the `verify` half
 * of `sign.ts`, deliberately kept in its own module so that importing verification
 * into a client bundle cannot drag `node:crypto` in with it.
 *
 * WebCrypto is async and `decideScan` is synchronous on purpose (a verdict must
 * not be able to await anything on the scan path). So the flow at the gate is:
 * verify here, `await` once, then hand the *result* to `decideScan`. The await
 * costs about a millisecond on a mid-range Android and happens while the camera
 * is still showing the frame.
 *
 * `subtle.verify` needs a secure context. The scanner is a PWA served over HTTPS,
 * and `localhost` counts, so the only environment this fails in is a plain-HTTP
 * deployment — which the camera would refuse to open in anyway.
 */
import { parseEnvelope } from './envelope'
import type { PassEnvelope } from './envelope'

export type SignatureState = 'VALID' | 'INVALID' | 'UNKNOWN_KEY' | 'MALFORMED' | 'UNAVAILABLE'

export interface WebVerifyResult {
  state: SignatureState
  envelope: PassEnvelope | null
}

/** A public key as the manifest ships it: id plus SPKI PEM. */
export interface PublicKeyRecord {
  keyId: string
  publicKeyPem: string
}

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const
const VERIFY_PARAMS = { name: 'ECDSA', hash: { name: 'SHA-256' } } as const

/**
 * Import the manifest's public keys once, at scanner start-up.
 *
 * Importing per scan is the difference between a verdict in 1 ms and a verdict
 * in 15 ms, and at a gate that is the difference between a queue moving and a
 * queue forming. Keys are held in memory only — never written to IndexedDB
 * alongside the manifest, so a stolen device has nothing signed to replay
 * against, and never in `localStorage`, which any injected script can read.
 */
export async function importPublicKeys(
  records: readonly PublicKeyRecord[],
): Promise<Map<string, CryptoKey>> {
  const keys = new Map<string, CryptoKey>()
  for (const record of records) {
    const der = pemToDer(record.publicKeyPem)
    if (der === null) continue
    try {
      keys.set(
        record.keyId,
        await crypto.subtle.importKey('spki', der, ALGORITHM, false, ['verify']),
      )
    } catch {
      // A key the browser will not import is a key that verifies nothing. Skip
      // it; the scanner then reports UNKNOWN_KEY for passes signed with it,
      // which is the honest answer and tells an operator exactly what is wrong.
    }
  }
  return keys
}

export async function verifyPassPayloadWeb(
  raw: string,
  keys: ReadonlyMap<string, CryptoKey>,
): Promise<WebVerifyResult> {
  const envelope = parseEnvelope(raw)
  if (envelope === null) return { state: 'MALFORMED', envelope: null }

  const key = keys.get(envelope.keyId)
  if (key === undefined) return { state: 'UNKNOWN_KEY', envelope }

  if (typeof crypto === 'undefined' || crypto.subtle === undefined) {
    return { state: 'UNAVAILABLE', envelope }
  }

  try {
    const ok = await crypto.subtle.verify(
      VERIFY_PARAMS,
      key,
      base64urlToBytes(envelope.signature),
      new TextEncoder().encode(envelope.signedMessage),
    )
    return { state: ok ? 'VALID' : 'INVALID', envelope }
  } catch {
    return { state: 'INVALID', envelope }
  }
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> | null {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '')
  if (body === '') return null
  try {
    return base64ToBytes(body)
  } catch {
    return null
  }
}

function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  return base64ToBytes(padded + '='.repeat((4 - (padded.length % 4)) % 4))
}

/**
 * The explicit `ArrayBuffer` type argument is not decoration: TypeScript 5.7
 * separated `Uint8Array<ArrayBuffer>` from `Uint8Array<ArrayBufferLike>`, and
 * `crypto.subtle` accepts only the former.
 */
function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}
