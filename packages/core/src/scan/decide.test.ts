/**
 * Exhaustive tests for the scan decision.
 *
 * This is the function that turns students away, so the tests cover every
 * combination of pass status, signature state, manifest staleness, validity
 * window and prior check-in — not a representative sample of them.
 *
 * Two properties are asserted structurally rather than case by case, because
 * they are the ones a future edit is most likely to break by accident:
 *
 *   - `admits` is true for exactly one outcome, `ADMITTED`.
 *   - every `ScanReason` the union declares is actually reachable.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { badgeFor, decideScan, toneFor } from './decide'
import type { KnownPass, ScanContext, ScanDecision, ScanInput, ScanReason } from './decide'

const NOW = Date.UTC(2026, 8, 15, 9, 30) // 15 Sep 2026, 09:30 UTC
const MINUTE = 60_000
const HOUR = 60 * MINUTE

const CTX: ScanContext = {
  manifestGeneratedAt: NOW - 10 * MINUTE,
  manifestMaxAgeMs: 30 * MINUTE,
  gateOpensAt: null,
  gateClosesAt: null,
}

const PASS: KnownPass = {
  passId: 'pass_1',
  registrationId: 'reg_1',
  code10: '4831902756',
  status: 'ACTIVE',
  registrationStatus: 'APPROVED',
  checkedInAt: null,
  name: 'ANJALI KUMARI',
  program: 'BBA LL.B. (H)',
  guestCount: 0,
  guestNames: [],
}

function qr(over: Partial<ScanInput> = {}): ScanInput {
  return {
    code: PASS.code10,
    source: 'QR',
    signature: 'VALID',
    notBefore: NOW - 2 * HOUR,
    notAfter: NOW + 8 * HOUR,
    scannedAt: NOW,
    ...over,
  }
}

function keypad(over: Partial<ScanInput> = {}): ScanInput {
  return {
    code: PASS.code10,
    source: 'KEYPAD',
    signature: 'ABSENT',
    notBefore: null,
    notAfter: null,
    scannedAt: NOW,
    ...over,
  }
}

/** Every reason produced anywhere in this file, for the reachability test. */
const seen = new Set<ScanReason>()
function decide(input: ScanInput, known: KnownPass | null, ctx: ScanContext = CTX): ScanDecision {
  const decision = decideScan(input, known, ctx)
  seen.add(decision.reason)
  // Invariant, asserted on every single call rather than once: admitting is the
  // only thing that writes a CheckIn, so nothing but ADMITTED may set it.
  assert.equal(decision.admits, decision.outcome === 'ADMITTED', decision.reason)
  return decision
}

// ── the happy paths ─────────────────────────────────────────────────────────

test('a signed QR for an active approved pass is admitted', () => {
  const d = decide(qr(), PASS)
  assert.equal(d.outcome, 'ADMITTED')
  assert.equal(d.reason, 'OK')
  assert.equal(d.overridable, false)
  assert.equal(d.clockSuspect, false)
  assert.ok(d.message.includes('ANJALI KUMARI'))
})

test('all three sources admit the same pass identically', () => {
  for (const input of [qr(), keypad(), keypad({ source: 'BARCODE' })]) {
    const d = decide(input, PASS)
    assert.equal(d.outcome, 'ADMITTED', input.source)
  }
})

test('the admit message names the guest count, because the gate counts heads', () => {
  assert.ok(decide(keypad(), { ...PASS, guestCount: 1 }).message.includes('+1 guest.'))
  assert.ok(decide(keypad(), { ...PASS, guestCount: 2 }).message.includes('+2 guests.'))
  assert.ok(!decide(keypad(), PASS).message.includes('guest'))
})

// ── nothing usable was read ─────────────────────────────────────────────────

test('an unreadable QR is invalid without mentioning internals', () => {
  const d = decide(qr({ code: null, signature: 'ABSENT', notBefore: null, notAfter: null }), null)
  assert.equal(d.outcome, 'INVALID')
  assert.equal(d.reason, 'NOT_OUR_CODE')
  assert.equal(d.pass, null)
})

test('a short keypad entry asks for the rest of the digits', () => {
  const d = decide(keypad({ code: null }), null)
  assert.equal(d.reason, 'NO_CODE')
  assert.ok(d.message.includes('ten digits'))
})

// ── the downgrade rule: a broken signature never falls through ───────────────

test('a tampered QR is invalid even when the code inside it is real', () => {
  // The single most important negative case. If this ever returns ADMITTED, the
  // signature authorises nothing and D5 is decoration.
  const d = decide(qr({ signature: 'INVALID' }), PASS)
  assert.equal(d.outcome, 'INVALID')
  assert.equal(d.reason, 'SIGNATURE_FAILED')
  assert.ok(d.message.includes('10-digit code'), 'must route the volunteer to the keypad')
})

test('a tampered QR is invalid ahead of every other pass state', () => {
  for (const known of [
    null,
    { ...PASS, status: 'REVOKED' as const },
    { ...PASS, checkedInAt: NOW - HOUR },
    { ...PASS, registrationStatus: 'PENDING_REVIEW' as const },
  ]) {
    assert.equal(decide(qr({ signature: 'INVALID' }), known).reason, 'SIGNATURE_FAILED')
  }
})

test('a pass signed with a key this device lacks says so, and says to sync', () => {
  const d = decide(qr({ signature: 'UNKNOWN_KEY' }), PASS)
  assert.equal(d.outcome, 'INVALID')
  assert.equal(d.reason, 'SIGNING_KEY_UNKNOWN')
  assert.ok(d.message.includes('Sync'))
})

// ── not in the manifest ─────────────────────────────────────────────────────

test('a validly signed pass the manifest has never seen is admitted', () => {
  // A student who registered after this device synced. The signature is the
  // server's own attestation; refusing it would break event-morning registration.
  const d = decide(qr(), null)
  assert.equal(d.outcome, 'ADMITTED')
  assert.equal(d.reason, 'OK_SIGNATURE_ONLY')
  assert.equal(d.pass, null)
})

test('an unsigned code the manifest has never seen is invalid', () => {
  const d = decide(keypad({ code: '4000000001' }), null)
  assert.equal(d.outcome, 'INVALID')
  assert.equal(d.reason, 'NOT_IN_MANIFEST')
})

test('an unknown code on a stale manifest is "needs sync", never "invalid"', () => {
  // "I do not know" and "you are not on the list" are different sentences and
  // only one of them is fair to say to a fresher.
  const stale: ScanContext = { ...CTX, manifestGeneratedAt: NOW - 3 * HOUR }
  const d = decide(keypad({ code: '4000000001' }), null, stale)
  assert.equal(d.outcome, 'STALE_MANIFEST')
  assert.equal(d.reason, 'MANIFEST_TOO_OLD')
  assert.equal(d.overridable, true)
})

test('the staleness boundary is the configured max age, exactly', () => {
  const atLimit: ScanContext = { ...CTX, manifestGeneratedAt: NOW - CTX.manifestMaxAgeMs }
  assert.equal(decide(keypad({ code: '4000000001' }), null, atLimit).reason, 'NOT_IN_MANIFEST')

  const overLimit: ScanContext = { ...CTX, manifestGeneratedAt: NOW - CTX.manifestMaxAgeMs - 1 }
  assert.equal(decide(keypad({ code: '4000000001' }), null, overLimit).reason, 'MANIFEST_TOO_OLD')
})

test('an expired signed pass the manifest lacks is out of window, not admitted', () => {
  const d = decide(qr({ notBefore: NOW - 3 * HOUR, notAfter: NOW - HOUR }), null)
  assert.equal(d.outcome, 'OUT_OF_WINDOW')
  assert.equal(d.reason, 'PASS_EXPIRED')
  assert.equal(d.overridable, true)
})

test('a not-yet-valid signed pass the manifest lacks is out of window', () => {
  const d = decide(qr({ notBefore: NOW + HOUR, notAfter: NOW + 9 * HOUR }), null)
  assert.equal(d.reason, 'PASS_NOT_YET_VALID')
})

// ── revocation ──────────────────────────────────────────────────────────────

test('a revoked pass is revoked, whatever else is true of it', () => {
  const revoked = { ...PASS, status: 'REVOKED' as const }
  for (const [label, input, known] of [
    ['plain', keypad(), revoked],
    ['also checked in', keypad(), { ...revoked, checkedInAt: NOW - HOUR }],
    ['also unapproved', keypad(), { ...revoked, registrationStatus: 'PENDING_REVIEW' as const }],
    ['also expired', keypad({ notAfter: NOW - HOUR, notBefore: NOW - 3 * HOUR }), revoked],
  ] as const) {
    const d = decide(input, known)
    assert.equal(d.outcome, 'REVOKED', label)
    assert.equal(d.overridable, false, `${label}: revocation is never overridable`)
  }
})

test('a revoked pass with a perfectly valid signature is still revoked', () => {
  // Revoked entries stay in the manifest for exactly this reason: omitting them
  // would make rule 3 admit them on the strength of the signature.
  assert.equal(decide(qr(), { ...PASS, status: 'REVOKED' }).outcome, 'REVOKED')
})

// ── registration status ─────────────────────────────────────────────────────

test('each unapproved registration status gets its own reason', () => {
  for (const [status, reason] of [
    ['PENDING_REVIEW', 'REGISTRATION_PENDING'],
    ['REVISION_REQUESTED', 'REGISTRATION_REVISION'],
    ['DRAFT', 'REGISTRATION_DRAFT'],
  ] as const) {
    const d = decide(keypad(), { ...PASS, registrationStatus: status })
    assert.equal(d.outcome, 'NOT_APPROVED', status)
    assert.equal(d.reason, reason)
  }
})

test('a revision request tells the volunteer the desk can fix it here', () => {
  const d = decide(keypad(), { ...PASS, registrationStatus: 'REVISION_REQUESTED' })
  assert.ok(d.message.includes('photo'))
})

// ── duplicates ──────────────────────────────────────────────────────────────

test('a second scan of a checked-in pass is ALREADY USED', () => {
  const d = decide(keypad(), { ...PASS, checkedInAt: NOW - 20 * MINUTE })
  assert.equal(d.outcome, 'DUPLICATE')
  assert.equal(d.reason, 'ALREADY_CHECKED_IN')
  assert.equal(d.overridable, false)
  assert.ok(d.message.includes('Do not give entry'))
})

test('a pass with scanLimit: 4 allows 4 scans and refuses the 5th scan', () => {
  const multiPass: KnownPass = {
    ...PASS,
    scanLimit: 4,
    scansCount: 0,
    checkedInAt: null,
  }

  // Scan 1
  const d1 = decide(keypad(), multiPass)
  assert.equal(d1.outcome, 'ADMITTED')
  assert.equal(d1.scansUsed, 1)
  assert.equal(d1.remainingScans, 3)
  assert.ok(d1.message.includes('Admitted — ANJALI KUMARI'))

  // Scan 2
  const d2 = decide(keypad(), { ...multiPass, scansCount: 1, checkedInAt: NOW - 10 * MINUTE })
  assert.equal(d2.outcome, 'ADMITTED')
  assert.equal(d2.scansUsed, 2)
  assert.equal(d2.remainingScans, 2)
  assert.ok(d2.message.includes('Admitted — ANJALI KUMARI'))

  // Scan 3
  const d3 = decide(keypad(), { ...multiPass, scansCount: 2, checkedInAt: NOW - 5 * MINUTE })
  assert.equal(d3.outcome, 'ADMITTED')
  assert.equal(d3.scansUsed, 3)
  assert.equal(d3.remainingScans, 1)
  assert.ok(d3.message.includes('Admitted — ANJALI KUMARI'))

  // Scan 4 (final scan)
  const d4 = decide(keypad(), { ...multiPass, scansCount: 3, checkedInAt: NOW - 2 * MINUTE })
  assert.equal(d4.outcome, 'ADMITTED')
  assert.equal(d4.scansUsed, 4)
  assert.equal(d4.remainingScans, 0)
  assert.ok(d4.message.includes('Admitted — ANJALI KUMARI'))

  // Scan 5 (exceeded QR life)
  const d5 = decide(keypad(), { ...multiPass, scansCount: 4, checkedInAt: NOW - MINUTE })
  assert.equal(d5.outcome, 'DUPLICATE')
  assert.equal(d5.reason, 'ALREADY_CHECKED_IN')
  assert.equal(d5.remainingScans, 0)
  assert.ok(d5.message.includes('Already used. This pass was scanned in earlier. Do not give entry.'))
})

test('a duplicate outranks the gate window but not revocation or approval', () => {
  const closed: ScanContext = { ...CTX, gateClosesAt: NOW - HOUR }
  const used = { ...PASS, checkedInAt: NOW - HOUR }
  assert.equal(decide(keypad(), used, closed).outcome, 'DUPLICATE')
  assert.equal(decide(keypad(), { ...used, status: 'REVOKED' }, closed).outcome, 'REVOKED')
  assert.equal(
    decide(keypad(), { ...used, registrationStatus: 'PENDING_REVIEW' }, closed).outcome,
    'NOT_APPROVED',
  )
})

// ── windows ─────────────────────────────────────────────────────────────────

test('before the gate opens is overridable, not a refusal', () => {
  const d = decide(keypad(), PASS, { ...CTX, gateOpensAt: NOW + 30 * MINUTE })
  assert.equal(d.outcome, 'OUT_OF_WINDOW')
  assert.equal(d.reason, 'GATE_NOT_OPEN')
  assert.equal(d.overridable, true)
  assert.ok(d.message.includes('Admit anyway'))
})

test('after the gate closes is overridable', () => {
  const d = decide(keypad(), PASS, { ...CTX, gateClosesAt: NOW - MINUTE })
  assert.equal(d.reason, 'GATE_CLOSED')
  assert.equal(d.overridable, true)
})

test('the gate window boundaries are inclusive', () => {
  assert.equal(decide(keypad(), PASS, { ...CTX, gateOpensAt: NOW }).outcome, 'ADMITTED')
  assert.equal(decide(keypad(), PASS, { ...CTX, gateClosesAt: NOW }).outcome, 'ADMITTED')
  assert.equal(decide(keypad(), PASS, { ...CTX, gateOpensAt: NOW + 1 }).outcome, 'OUT_OF_WINDOW')
  assert.equal(decide(keypad(), PASS, { ...CTX, gateClosesAt: NOW - 1 }).outcome, 'OUT_OF_WINDOW')
})

test('a null gate window means unrestricted', () => {
  assert.equal(decide(keypad(), PASS, { ...CTX, gateOpensAt: null, gateClosesAt: null }).outcome, 'ADMITTED')
})

test('the signed window is enforced for a pass that is in the manifest too', () => {
  assert.equal(decide(qr({ notBefore: NOW + MINUTE }), PASS).reason, 'PASS_NOT_YET_VALID')
  assert.equal(decide(qr({ notAfter: NOW - MINUTE }), PASS).reason, 'PASS_EXPIRED')
})

test('the signed window beats the gate window when both are wrong', () => {
  // The pass window is signed and the gate window is config, so the specific
  // fact about this pass is the more useful thing to say.
  const d = decide(qr({ notAfter: NOW - HOUR }), PASS, { ...CTX, gateClosesAt: NOW - 2 * HOUR })
  assert.equal(d.reason, 'PASS_EXPIRED')
})

// ── the device clock ────────────────────────────────────────────────────────

test('a clock behind the manifest is flagged and windows are not enforced', () => {
  // A factory-reset phone with no SIM. Enforcing a window against 2015 would
  // refuse every pass at the gate.
  const d = decide(
    qr({ scannedAt: Date.UTC(2015, 0, 1), notBefore: NOW - HOUR, notAfter: NOW + HOUR }),
    PASS,
    { ...CTX, gateOpensAt: NOW, gateClosesAt: NOW + 2 * HOUR },
  )
  assert.equal(d.outcome, 'ADMITTED')
  assert.equal(d.clockSuspect, true)
})

test('normal NTP drift is not treated as a broken clock', () => {
  const d = decide(keypad({ scannedAt: CTX.manifestGeneratedAt - 30_000 }), PASS)
  assert.equal(d.clockSuspect, false)
})

test('a suspect clock still cannot admit a revoked or used pass', () => {
  const old = { scannedAt: Date.UTC(2015, 0, 1) }
  assert.equal(decide(keypad(old), { ...PASS, status: 'REVOKED' }).outcome, 'REVOKED')
  assert.equal(decide(keypad(old), { ...PASS, checkedInAt: NOW }).outcome, 'DUPLICATE')
})

test('a suspect clock cannot rescue an unsigned unknown code', () => {
  const d = decide(keypad({ code: '4000000001', scannedAt: Date.UTC(2015, 0, 1) }), null)
  assert.equal(d.outcome, 'STALE_MANIFEST')
  assert.equal(d.clockSuspect, true)
})

// ── the full cross product ──────────────────────────────────────────────────

test('every combination of status, approval, check-in and signature is decided', () => {
  const statuses = ['ACTIVE', 'REVOKED'] as const
  const approvals = ['APPROVED', 'PENDING_REVIEW', 'REVISION_REQUESTED', 'DRAFT'] as const
  const checkIns = [null, NOW - HOUR]
  const signatures = ['VALID', 'INVALID', 'UNKNOWN_KEY', 'ABSENT'] as const
  const windows = [
    { notBefore: null, notAfter: null },
    { notBefore: NOW - HOUR, notAfter: NOW + HOUR },
    { notBefore: NOW + HOUR, notAfter: NOW + 2 * HOUR },
    { notBefore: NOW - 2 * HOUR, notAfter: NOW - HOUR },
  ]

  let count = 0
  for (const status of statuses)
    for (const registrationStatus of approvals)
      for (const checkedInAt of checkIns)
        for (const signature of signatures)
          for (const window of windows)
            for (const known of [null, { ...PASS, status, registrationStatus, checkedInAt }]) {
              const d = decide({ ...qr(), signature, ...window }, known)
              count += 1
              // Nothing may throw, every outcome must be one of the seven, and
              // the admits invariant is checked inside `decide`.
              assert.ok(
                [
                  'ADMITTED', 'DUPLICATE', 'REVOKED', 'NOT_APPROVED',
                  'OUT_OF_WINDOW', 'STALE_MANIFEST', 'INVALID',
                ].includes(d.outcome),
              )
              assert.ok(d.message.length > 0)
              assert.ok(badgeFor(d.outcome).length > 0)
              assert.ok(['ok', 'warn', 'bad'].includes(toneFor(d.outcome)))
            }

  assert.equal(count, 2 * 4 * 2 * 4 * 4 * 2)
})

test('a revoked pass is never admitted, across the whole cross product', () => {
  for (const signature of ['VALID', 'INVALID', 'UNKNOWN_KEY', 'ABSENT'] as const)
    for (const checkedInAt of [null, NOW - HOUR])
      for (const registrationStatus of ['APPROVED', 'PENDING_REVIEW'] as const) {
        const d = decide(
          { ...qr(), signature },
          { ...PASS, status: 'REVOKED', checkedInAt, registrationStatus },
        )
        assert.equal(d.admits, false, `${signature}/${String(checkedInAt)}/${registrationStatus}`)
      }
})

test('a checked-in pass is never admitted twice, across the whole cross product', () => {
  for (const signature of ['VALID', 'ABSENT'] as const)
    for (const window of [
      { notBefore: null, notAfter: null },
      { notBefore: NOW - HOUR, notAfter: NOW + HOUR },
    ]) {
      const d = decide({ ...qr(), signature, ...window }, { ...PASS, checkedInAt: NOW - MINUTE })
      assert.equal(d.admits, false)
    }
})

// ── the union is fully exercised ────────────────────────────────────────────

test('every declared ScanReason is reachable', () => {
  // If a reason is added to the union and never produced, either the rule that
  // should produce it is missing or the reason is dead. Both are worth failing on.
  const declared: ScanReason[] = [
    'OK', 'OK_SIGNATURE_ONLY', 'NO_CODE', 'NOT_OUR_CODE', 'SIGNATURE_FAILED',
    'SIGNING_KEY_UNKNOWN', 'NOT_IN_MANIFEST', 'MANIFEST_TOO_OLD', 'PASS_REVOKED',
    'REGISTRATION_PENDING', 'REGISTRATION_REVISION', 'REGISTRATION_DRAFT',
    'ALREADY_CHECKED_IN', 'GATE_NOT_OPEN', 'GATE_CLOSED', 'PASS_NOT_YET_VALID',
    'PASS_EXPIRED',
  ]
  const missing = declared.filter((reason) => !seen.has(reason))
  assert.deepEqual(missing, [], `unreachable reasons: ${missing.join(', ')}`)
})

test('badges and tones cover all seven outcomes', () => {
  for (const outcome of [
    'ADMITTED', 'DUPLICATE', 'REVOKED', 'NOT_APPROVED', 'OUT_OF_WINDOW',
    'STALE_MANIFEST', 'INVALID',
  ] as const) {
    assert.match(badgeFor(outcome), /^[A-Z ]+$/)
    assert.ok(['ok', 'warn', 'bad'].includes(toneFor(outcome)))
  }
  assert.equal(badgeFor('DUPLICATE'), 'ALREADY USED')
  assert.equal(toneFor('ADMITTED'), 'ok')
})
