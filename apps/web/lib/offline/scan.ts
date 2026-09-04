/**
 * The scan path. Everything a verdict needs, and nothing that can await a network.
 *
 * ```
 *  raw string ──▶ parse ──▶ verify (WebCrypto) ──▶ decideScan ──▶ enqueue ──▶ UI
 *                                    ▲                 ▲
 *                            keys in memory     manifest in IndexedDB
 * ```
 *
 * `decideScan` is the shared pure function in `@orientation/core/scan` — the same
 * one the server runs in `/api/scanner/sync`. That is the whole basis for trusting
 * an offline verdict (D8): the device is not approximating the server's answer, it
 * is computing it.
 *
 * ## Why verification happens here and not inside `decideScan`
 *
 * WebCrypto is asynchronous and a verdict must not be able to await anything, so
 * the split is: verify here, await once, hand the *result* to a synchronous
 * decision. The await costs about a millisecond while the camera is still showing
 * the frame.
 *
 * ## The three input methods, and how much each claim is worth
 *
 * - **QR** carries a signed envelope. A valid signature is the server's own
 *   attestation and is the only thing that can admit a pass this device has never
 *   heard of.
 * - **Barcode** (Code128) carries the ten digits and nothing else. Worth exactly a
 *   manifest lookup.
 * - **Keypad** is a person reading digits off a screen. Worth the same as a
 *   barcode, and it is the documented route out of a failed signature: a QR that
 *   has been altered is refused, and the volunteer asks the student to read the
 *   number instead — a different claim, made by a human standing there.
 *
 * A QR that turns out not to be an envelope at all is *not* treated as tampering.
 * It falls back to a digit extraction, because a static QR containing the bare
 * code is a plausible thing to encounter and grading it as barcode-equivalent is
 * both safe and useful. Tampering is specifically an envelope that parsed and then
 * failed to verify, and that never falls through.
 */
import type { ScanMethod, ScanEventInput } from '@orientation/contracts'
import { parseCode10 } from '@orientation/core/pass'
import {
  importPublicKeys,
  verifyPassPayloadWeb,
  type PublicKeyRecord,
} from '@orientation/core/pass/verify-web'
import {
  badgeFor,
  decideScan,
  toneFor,
  type CodeSource,
  type KnownPass,
  type ScanContext,
  type ScanDecision,
  type SignatureState,
} from '@orientation/core/scan'

import type { ManifestMeta } from './db'
import { findPass, markCheckedInLocally } from './manifest'
import { enqueue } from './outbox'

/**
 * Everything the scan path needs that is not in IndexedDB.
 *
 * Held in memory by the scanner screen for the life of the page. The keys are here
 * rather than in storage on purpose (see `db.ts`): importing them per scan is the
 * difference between a verdict in 1 ms and a verdict in 15 ms, and at a gate that
 * is the difference between a queue moving and a queue forming.
 */
export interface ScannerSession {
  meta: ManifestMeta
  keys: ReadonlyMap<string, CryptoKey>
}

export async function openSession(meta: ManifestMeta): Promise<ScannerSession> {
  const records: PublicKeyRecord[] = meta.keys
  return { meta, keys: await importPublicKeys(records) }
}

function toCodeSource(method: ScanMethod): CodeSource {
  return method === 'MANUAL_CODE' ? 'KEYPAD' : method
}

interface Parsed {
  code: string | null
  signature: SignatureState
  notBefore: number | null
  notAfter: number | null
}

async function parseScanned(
  raw: string,
  method: ScanMethod,
  keys: ReadonlyMap<string, CryptoKey>,
): Promise<Parsed> {
  if (method !== 'QR') {
    return { code: parseCode10(raw), signature: 'ABSENT', notBefore: null, notAfter: null }
  }

  const result = await verifyPassPayloadWeb(raw, keys)

  if (result.envelope === null) {
    // Never was an envelope. Grade it as a barcode: extract digits, no signature.
    return { code: parseCode10(raw), signature: 'ABSENT', notBefore: null, notAfter: null }
  }

  if (result.state === 'UNAVAILABLE') {
    // No `crypto.subtle` — an insecure context, which the camera would have refused
    // anyway. The envelope's window is dropped along with its signature: unverified
    // validity dates are not evidence, and the gate window still applies.
    return { code: result.envelope.code10, signature: 'ABSENT', notBefore: null, notAfter: null }
  }

  return {
    code: result.envelope.code10,
    // `MALFORMED` cannot reach here — it implies a null envelope, handled above.
    signature: result.state === 'MALFORMED' ? 'ABSENT' : result.state,
    // Already epoch ms: the wire format is base-36 minutes, parsed back on the way in.
    notBefore: result.envelope.notBefore,
    notAfter: result.envelope.notAfter,
  }
}

export interface ScanRequest {
  raw: string
  method: ScanMethod
  /** Companions the volunteer counted through. Clamped to the pass's allowance. */
  guestsAdmitted?: number
  /** True when the volunteer chose to admit against an overridable verdict. */
  overridden?: boolean
  /** Injected in tests. Left alone everywhere else. */
  now?: number
}

export interface ScanResult {
  decision: ScanDecision
  /** What the volunteer's screen shows: four words in a colour. */
  badge: string
  tone: 'ok' | 'warn' | 'bad'
  /** The idempotency key this scan was queued under. */
  clientEventId: string
  /** True when a local check-in was written and the outbox now owes the server. */
  admitted: boolean
  guestsAdmitted: number
}

/**
 * Decide one scan, record it locally, and queue it for the server.
 *
 * The order is deliberate: the local check-in is written *before* the outbox entry,
 * because a device that queued a scan but forgot it admitted somebody would admit
 * them again on a rescan. Both writes are local and neither waits for a network, so
 * the volunteer sees the badge within a frame either way.
 */
export async function performScan(
  request: ScanRequest,
  session: ScannerSession,
): Promise<ScanResult> {
  const scannedAt = request.now ?? Date.now()

  const parsed = await parseScanned(request.raw, request.method, session.keys)

  const known: KnownPass | null =
    parsed.code === null ? null : ((await findPass(parsed.code)) ?? null)

  const ctx: ScanContext = {
    manifestGeneratedAt: session.meta.generatedAt,
    manifestMaxAgeMs: session.meta.maxAgeMs,
    gateOpensAt: session.meta.gate.opensAt,
    gateClosesAt: session.meta.gate.closesAt,
  }

  const decision = decideScan(
    {
      code: parsed.code,
      source: toCodeSource(request.method),
      signature: parsed.signature,
      notBefore: parsed.notBefore,
      notAfter: parsed.notAfter,
      scannedAt,
    },
    known,
    ctx,
  )

  const overridden = request.overridden === true && decision.overridable
  const admitted = decision.admits || overridden

  // Clamped to what the pass actually allows. A volunteer holding down a plus
  // button must not be able to sign three guests onto a two-guest pass — and the
  // database enforces the same bound, so an unclamped value would be a 500 at
  // sync time instead of a corrected number here.
  const allowance = known?.guestCount ?? 0
  const guestsAdmitted = admitted
    ? Math.max(0, Math.min(request.guestsAdmitted ?? allowance, allowance))
    : 0

  const clientEventId = crypto.randomUUID()

  if (admitted && parsed.code !== null) {
    await markCheckedInLocally(parsed.code, scannedAt)
  }

  const event: ScanEventInput = {
    clientEventId,
    // Stored verbatim, before any parsing. A gate full of failures traces back to a
    // bad batch of printed passes only if the raw string was kept.
    rawCode: request.raw.slice(0, 400),
    method: request.method,
    scannedAt,
    clientOutcome: overridden && decision.outcome !== 'ADMITTED' ? 'ADMITTED' : decision.outcome,
    clientReason: decision.reason,
    guestsAdmitted,
    overridden,
    clockSuspect: decision.clockSuspect,
    // Set from the radio at scan time, not at queue time. A scan taken in a basement
    // and flushed in the car park was still an offline scan.
    wasOffline: typeof navigator === 'undefined' ? true : !navigator.onLine,
  }

  await enqueue({ event, code10: parsed.code, admitted })

  return {
    decision,
    badge: overridden ? 'ADMITTED' : badgeFor(decision.outcome),
    tone: overridden ? 'ok' : toneFor(decision.outcome),
    clientEventId,
    admitted,
    guestsAdmitted,
  }
}
