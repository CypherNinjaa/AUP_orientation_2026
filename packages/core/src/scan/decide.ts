/**
 * ★ THE scan decision.
 *
 * Pure. No I/O. No imports from next, prisma, the browser, or `node:*`.
 * Synchronous, and it must stay synchronous: a verdict at a gate cannot be
 * allowed to await anything, because the thing it would await is a network.
 *
 * Imported by BOTH the offline scanner (`apps/web/lib/offline`) AND the server
 * sync endpoint (`apps/web/app/api/scanner/sync`). One implementation means the
 * offline verdict and the online verdict can never disagree, which is the entire
 * basis for trusting offline mode ([D8](../../../../docs/01-decisions.md)).
 *
 * Everything else in the system is replaceable. If this function is wrong,
 * students get turned away at the gate.
 *
 * ---
 *
 * ## What the caller does first
 *
 * This function does not parse a QR and does not verify a signature. Both are
 * done by the caller, because verification is async in the browser (WebCrypto)
 * and this function is not allowed to be. The caller hands over what it found.
 *
 * ## Precedence, and why it is in this order
 *
 * The order below is the whole design. Each rule answers a question that makes
 * the later ones meaningless, so the sequence is not arbitrary:
 *
 *  1. **No code at all** → `INVALID`. Nothing to look up.
 *  2. **Signature present but broken** → `INVALID`. This is the one that looks
 *     like it should fall through to a manifest check and must not: if a
 *     tampered envelope were admitted because the code inside it happens to be
 *     real, the signature would authorise nothing and the whole scheme would be
 *     decoration. The volunteer's route out is the keypad — the student reads
 *     the ten digits off their own screen — which is a *different* claim, made
 *     by a person standing there, not by a QR that has been edited.
 *  3. **Unknown to the manifest** → depends on why:
 *     - a *valid signature* is the server's own attestation, so the pass is
 *       admitted even though this device has never heard of it. This is what
 *       lets a student who registered forty minutes ago walk in while every
 *       device at the gate is holding an hour-old snapshot.
 *     - otherwise, if the manifest is too old to be believed → `STALE_MANIFEST`,
 *       *not* `INVALID`. "I do not know" and "you are not on the list" are
 *       different sentences and only one of them should be said to a fresher.
 *     - otherwise → `INVALID`.
 *  4. **Revoked** → `REVOKED`. Beats every remaining check: a revoked pass that
 *     is also outside the gate window is revoked, and that is what the volunteer
 *     needs to hear.
 *  5. **Registration not approved** → `NOT_APPROVED`. Send them to the desk.
 *  6. **Already checked in** → `DUPLICATE`. Single gate entry, one check-in per
 *     pass, ever ([D2](../../../../docs/01-decisions.md)).
 *  7. **Outside the validity window** → `OUT_OF_WINDOW`, and *overridable*. The
 *     only soft verdict in the set. A student at the gate ten minutes before it
 *     officially opens is not a security problem, and a volunteer must be able
 *     to wave them through without the system pretending they do not exist.
 *  8. Otherwise → `ADMITTED`.
 *
 * ## The clock
 *
 * Every window check depends on the device clock, and a volunteer's phone can be
 * wrong — a factory-reset Android with no SIM comes up in 2015. So the clock is
 * sanity-checked against the one timestamp the device cannot have invented: the
 * moment the server generated the manifest it is holding. A clock behind that is
 * provably wrong, and when it is, window enforcement is *skipped* rather than
 * applied to nonsense, and `clockSuspect` is set so the scan syncs with a flag on
 * it ([D23](../../../../docs/01-decisions.md)).
 *
 * ## Revoked passes stay in the manifest
 *
 * They are shipped with `status: 'REVOKED'`, not omitted. Omitting them would
 * make a revoked pass indistinguishable from one issued after the snapshot — and
 * rule 3 admits the latter on a valid signature. A revocation that turned a pass
 * into "unknown, but validly signed" would un-revoke it.
 */

export type ScanOutcome =
  | 'ADMITTED'
  | 'DUPLICATE'
  | 'REVOKED'
  | 'NOT_APPROVED'
  | 'OUT_OF_WINDOW'
  | 'STALE_MANIFEST'
  | 'INVALID'

/**
 * Machine-readable cause, for the `ScanEvent` log and admin reporting. The
 * outcome is what the volunteer sees; the reason is what an incident review reads.
 */
export type ScanReason =
  | 'OK'
  | 'OK_SIGNATURE_ONLY'
  | 'NO_CODE'
  | 'NOT_OUR_CODE'
  | 'SIGNATURE_FAILED'
  | 'SIGNING_KEY_UNKNOWN'
  | 'NOT_IN_MANIFEST'
  | 'MANIFEST_TOO_OLD'
  | 'PASS_REVOKED'
  | 'REGISTRATION_PENDING'
  | 'REGISTRATION_REVISION'
  | 'REGISTRATION_DRAFT'
  | 'ALREADY_CHECKED_IN'
  | 'GATE_NOT_OPEN'
  | 'GATE_CLOSED'
  | 'PASS_NOT_YET_VALID'
  | 'PASS_EXPIRED'

/** How the code reached the scanner. Recorded; never trusted differently. */
export type CodeSource = 'QR' | 'BARCODE' | 'KEYPAD'

/** Result of the caller's signature check, or `ABSENT` for the non-QR paths. */
export type SignatureState = 'VALID' | 'INVALID' | 'UNKNOWN_KEY' | 'ABSENT'

export interface ScanInput {
  /**
   * The 10-digit code, already extracted. `null` when the scanned string was not
   * one of ours at all, or when a QR envelope failed to parse.
   */
  code: string | null
  source: CodeSource
  signature: SignatureState
  /** Validity window from the signed envelope, epoch ms. Null on the bare paths. */
  notBefore: number | null
  notAfter: number | null
  /** Device clock at the moment of the scan, epoch ms. */
  scannedAt: number
}

export type PassStatus = 'ACTIVE' | 'REVOKED'
export type RegistrationStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REVISION_REQUESTED'

/** One manifest entry. Verification data only — never a selfie ([D7]). */
export interface KnownPass {
  passId: string
  registrationId: string
  code10: string
  status: PassStatus
  registrationStatus: RegistrationStatus
  /** Epoch ms of a check-in this device already knows about, else null. */
  checkedInAt: number | null
  /** Display only. Shown to the volunteer so a human can match a face. */
  name: string
  program: string
  guestCount: number
  guestNames: readonly string[]
}

export interface ScanContext {
  /** When the server built the manifest this device is holding, epoch ms. */
  manifestGeneratedAt: number
  /**
   * How old a manifest may be before a "not found" stops being trustworthy.
   * Beyond it, an unknown code is `STALE_MANIFEST` rather than `INVALID`.
   */
  manifestMaxAgeMs: number
  /** Gate window from system config, epoch ms. Null means unrestricted. */
  gateOpensAt: number | null
  gateClosesAt: number | null
}

export interface ScanDecision {
  outcome: ScanOutcome
  reason: ScanReason
  /** One line for the volunteer. Imperative where there is something to do. */
  message: string
  /** True only for `ADMITTED`: the caller may write a `CheckIn`. */
  admits: boolean
  /** True when a volunteer is allowed to admit against this verdict anyway. */
  overridable: boolean
  /** True when the device clock is provably wrong and windows were not enforced. */
  clockSuspect: boolean
  /** The pass this decision is about, when one was identified. */
  pass: KnownPass | null
}

/**
 * How far behind the manifest a device clock may be before it is disbelieved.
 *
 * Not zero: a manifest fetched two seconds ago on a device whose clock is 30
 * seconds slow is not a broken clock, it is NTP. Five minutes is comfortably
 * outside normal drift and comfortably inside "this phone thinks it is 2015".
 */
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60_000

export function decideScan(
  input: ScanInput,
  known: KnownPass | null,
  ctx: ScanContext,
): ScanDecision {
  const clockSuspect = input.scannedAt < ctx.manifestGeneratedAt - CLOCK_SKEW_TOLERANCE_MS

  const base = { clockSuspect, admits: false, overridable: false, pass: known }

  // 1 ─ nothing usable was read.
  if (input.code === null) {
    return {
      ...base,
      pass: null,
      outcome: 'INVALID',
      reason: input.source === 'QR' ? 'NOT_OUR_CODE' : 'NO_CODE',
      message:
        input.source === 'QR'
          ? 'Not an Orientation pass. Ask them to open their pass in the app.'
          : 'Enter all ten digits from the pass.',
    }
  }

  // 2 ─ a signature that is present and does not hold. Never falls through.
  if (input.signature === 'INVALID') {
    return {
      ...base,
      outcome: 'INVALID',
      reason: 'SIGNATURE_FAILED',
      message: 'This QR has been altered. Type the 10-digit code from their screen instead.',
    }
  }

  if (input.signature === 'UNKNOWN_KEY') {
    return {
      ...base,
      outcome: 'INVALID',
      reason: 'SIGNING_KEY_UNKNOWN',
      message: 'This pass was signed with a key this device does not have. Sync, then rescan.',
    }
  }

  // 3 ─ not in the manifest.
  if (known === null) {
    const signedWindowOk =
      input.notBefore !== null &&
      input.notAfter !== null &&
      (clockSuspect || (input.scannedAt >= input.notBefore && input.scannedAt <= input.notAfter))

    if (input.signature === 'VALID' && signedWindowOk) {
      // The server signed this. It is newer than the manifest, not fake.
      return {
        ...base,
        outcome: 'ADMITTED',
        reason: 'OK_SIGNATURE_ONLY',
        admits: true,
        message: 'Admitted — registered after this device last synced.',
      }
    }

    if (input.signature === 'VALID' && input.notAfter !== null && input.scannedAt > input.notAfter) {
      return {
        ...base,
        outcome: 'OUT_OF_WINDOW',
        reason: 'PASS_EXPIRED',
        overridable: true,
        message: 'This pass has expired. Send them to the help desk.',
      }
    }

    if (input.signature === 'VALID' && input.notBefore !== null && input.scannedAt < input.notBefore) {
      return {
        ...base,
        outcome: 'OUT_OF_WINDOW',
        reason: 'PASS_NOT_YET_VALID',
        overridable: true,
        message: 'This pass is not valid yet. Check the date on their screen.',
      }
    }

    const age = input.scannedAt - ctx.manifestGeneratedAt
    if (clockSuspect || age > ctx.manifestMaxAgeMs) {
      return {
        ...base,
        outcome: 'STALE_MANIFEST',
        reason: 'MANIFEST_TOO_OLD',
        overridable: true,
        message: 'This device needs to sync before it can check this code. Try another device.',
      }
    }

    return {
      ...base,
      outcome: 'INVALID',
      reason: 'NOT_IN_MANIFEST',
      message: 'No pass with this code. Send them to the help desk.',
    }
  }

  // 4 ─ revoked. Outranks every remaining check.
  if (known.status === 'REVOKED') {
    return {
      ...base,
      outcome: 'REVOKED',
      reason: 'PASS_REVOKED',
      message: 'This pass has been revoked. Send them to the help desk.',
    }
  }

  // 5 ─ the registration behind it is not approved.
  if (known.registrationStatus !== 'APPROVED') {
    return {
      ...base,
      outcome: 'NOT_APPROVED',
      reason:
        known.registrationStatus === 'REVISION_REQUESTED'
          ? 'REGISTRATION_REVISION'
          : known.registrationStatus === 'DRAFT'
            ? 'REGISTRATION_DRAFT'
            : 'REGISTRATION_PENDING',
      message:
        known.registrationStatus === 'REVISION_REQUESTED'
          ? 'Their registration needs a new photo. Help desk can redo it here.'
          : 'Their registration is still being checked. Send them to the help desk.',
    }
  }

  // 6 ─ one check-in per pass, ever.
  if (known.checkedInAt !== null) {
    return {
      ...base,
      outcome: 'DUPLICATE',
      reason: 'ALREADY_CHECKED_IN',
      message: 'Already used. This pass was scanned in earlier.',
    }
  }

  // 7 ─ windows. Skipped entirely when the clock cannot be trusted.
  if (!clockSuspect) {
    if (input.notBefore !== null && input.scannedAt < input.notBefore) {
      return {
        ...base,
        outcome: 'OUT_OF_WINDOW',
        reason: 'PASS_NOT_YET_VALID',
        overridable: true,
        message: 'This pass is not valid yet. Check the date on their screen.',
      }
    }

    if (input.notAfter !== null && input.scannedAt > input.notAfter) {
      return {
        ...base,
        outcome: 'OUT_OF_WINDOW',
        reason: 'PASS_EXPIRED',
        overridable: true,
        message: 'This pass has expired. Send them to the help desk.',
      }
    }

    if (ctx.gateOpensAt !== null && input.scannedAt < ctx.gateOpensAt) {
      return {
        ...base,
        outcome: 'OUT_OF_WINDOW',
        reason: 'GATE_NOT_OPEN',
        overridable: true,
        message: 'The gate is not open yet. Admit anyway if you are letting them through.',
      }
    }

    if (ctx.gateClosesAt !== null && input.scannedAt > ctx.gateClosesAt) {
      return {
        ...base,
        outcome: 'OUT_OF_WINDOW',
        reason: 'GATE_CLOSED',
        overridable: true,
        message: 'The gate has closed. Admit anyway if you are letting them through.',
      }
    }
  }

  // 8 ─ admitted.
  return {
    ...base,
    outcome: 'ADMITTED',
    reason: 'OK',
    admits: true,
    message:
      known.guestCount > 0
        ? `Admitted — ${known.name}, +${String(known.guestCount)} guest${known.guestCount > 1 ? 's' : ''}.`
        : `Admitted — ${known.name}.`,
  }
}

/**
 * Badge text for the scanner UI, per the four the brief names plus the two soft
 * states that would otherwise be flattened into "INVALID" and lose their meaning.
 */
export function badgeFor(outcome: ScanOutcome): string {
  switch (outcome) {
    case 'ADMITTED':
      return 'ADMITTED'
    case 'DUPLICATE':
      return 'ALREADY USED'
    case 'REVOKED':
      return 'REVOKED'
    case 'NOT_APPROVED':
      return 'NOT APPROVED'
    case 'OUT_OF_WINDOW':
      return 'OUT OF WINDOW'
    case 'STALE_MANIFEST':
      return 'NEEDS SYNC'
    case 'INVALID':
      return 'INVALID'
  }
}

/**
 * Feedback tone. Three, not seven: a volunteer glancing at a phone in sunlight
 * reads a colour, and the message reads the detail.
 */
export function toneFor(outcome: ScanOutcome): 'ok' | 'warn' | 'bad' {
  switch (outcome) {
    case 'ADMITTED':
      return 'ok'
    case 'OUT_OF_WINDOW':
    case 'STALE_MANIFEST':
    case 'NOT_APPROVED':
      return 'warn'
    case 'DUPLICATE':
    case 'REVOKED':
    case 'INVALID':
      return 'bad'
  }
}
