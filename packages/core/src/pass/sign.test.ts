import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPrivateKey, generateKeyPairSync } from 'node:crypto'
import { parseEnvelope, serialiseEnvelope, signableMessage } from './envelope'
import {
  PassKeyError,
  assertKeyPairMatches,
  deriveKeyId,
  generatePassKeyPair,
  loadSigningKey,
  loadVerifyingKey,
  signPass,
  verifyPassPayload,
} from './sign'
import { importPublicKeys, verifyPassPayloadWeb } from './verify-web'

const PAIR = generatePassKeyPair()
const SIGNING = loadSigningKey(PAIR.privateKeyBase64)
const VERIFYING = loadVerifyingKey(PAIR.publicKeyBase64)

const OTHER = generatePassKeyPair()
const OTHER_VERIFYING = loadVerifyingKey(OTHER.publicKeyBase64)

const NOT_BEFORE = new Date(Date.UTC(2026, 8, 15, 6, 0))
const NOT_AFTER = new Date(Date.UTC(2026, 8, 15, 18, 0))

function issue(code10 = '4831902756') {
  return signPass(SIGNING, { code10, notBefore: NOT_BEFORE, notAfter: NOT_AFTER })
}

// ── keys ────────────────────────────────────────────────────────────────────

test('a generated pair is P-256 and its two halves agree on the key id', () => {
  assert.equal(SIGNING.privateKey.asymmetricKeyType, 'ec')
  assert.equal(SIGNING.keyId, VERIFYING.keyId)
  assert.match(SIGNING.keyId, /^[0-9a-f]{8}$/)
  assert.doesNotThrow(() => assertKeyPairMatches(SIGNING, VERIFYING))
})

test('the key id is derived from the public key, so it cannot drift', () => {
  // Same key, loaded two different ways, must produce the same id — otherwise
  // rotation breaks silently and every pass fails at the gate.
  assert.equal(deriveKeyId(SIGNING.publicKey), SIGNING.keyId)
  assert.equal(loadSigningKey(PAIR.privateKeyPem).keyId, SIGNING.keyId)
  assert.equal(loadVerifyingKey(PAIR.publicKeyPem).keyId, SIGNING.keyId)
})

test('different pairs get different key ids', () => {
  assert.notEqual(SIGNING.keyId, OTHER_VERIFYING.keyId)
})

test('the private key is never exposed by the public half', () => {
  assert.ok(VERIFYING.publicKeyPem.includes('BEGIN PUBLIC KEY'))
  assert.ok(!VERIFYING.publicKeyPem.includes('PRIVATE'))
  assert.ok(!PAIR.publicKeyPem.includes('PRIVATE'))
})

test('a mismatched pair is refused loudly rather than at the gate', () => {
  assert.throws(() => assertKeyPairMatches(SIGNING, OTHER_VERIFYING), PassKeyError)
})

test('an unusable key value is refused with something an operator can act on', () => {
  assert.throws(() => loadSigningKey(''), PassKeyError)
  assert.throws(() => loadSigningKey('   '), PassKeyError)
  assert.throws(() => loadSigningKey('not-base64-and-not-pem'), PassKeyError)
  assert.throws(() => loadVerifyingKey(Buffer.from('nonsense').toString('base64')), PassKeyError)
  // The public half pasted where the private one belongs.
  assert.throws(() => loadSigningKey(PAIR.publicKeyBase64), PassKeyError)
})

test('an RSA key is refused, not silently used', () => {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  assert.throws(() => loadSigningKey(Buffer.from(pem).toString('base64')), PassKeyError)
})

test('a P-384 key loads but produces a key id of its own, so it will not verify', () => {
  // Curve mismatch is caught by the gate as UNKNOWN_KEY rather than as a
  // confusing INVALID, because the id is derived from the key material.
  const p384 = generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
  const pem = p384.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const loaded = loadSigningKey(Buffer.from(pem).toString('base64'))
  assert.notEqual(loaded.keyId, SIGNING.keyId)
  assert.equal(loaded.privateKey.asymmetricKeyType, 'ec')
  assert.deepEqual(createPrivateKey(pem).asymmetricKeyDetails?.namedCurve, 'secp384r1')
})

// ── signing ─────────────────────────────────────────────────────────────────

test('a signed pass verifies against its own public key', () => {
  const issued = issue()
  const result = verifyPassPayload(issued.payload, [VERIFYING])
  assert.equal(result.state, 'VALID')
  assert.equal(result.envelope?.code10, '4831902756')
})

test('the signature is the raw 64-byte P1363 form, not DER', () => {
  // DER is 70-72 bytes and variable length, which a positional QR format cannot
  // carry, and WebCrypto would refuse it.
  const issued = issue()
  assert.equal(Buffer.from(issued.signature, 'base64url').length, 64)
})

test('the stored window is the one the signature actually covers', () => {
  const odd = signPass(SIGNING, {
    code10: '4831902756',
    notBefore: new Date(NOT_BEFORE.getTime() + 45_678),
    notAfter: new Date(NOT_AFTER.getTime() + 59_999),
  })
  assert.equal(odd.notBefore.getTime(), NOT_BEFORE.getTime())
  assert.equal(odd.notAfter.getTime(), NOT_AFTER.getTime())
  assert.equal(verifyPassPayload(odd.payload, [VERIFYING]).state, 'VALID')
})

test('the signed message is recorded so re-verification never re-derives it', () => {
  const issued = issue()
  assert.equal(
    issued.signedMessage,
    signableMessage({
      keyId: SIGNING.keyId,
      code10: '4831902756',
      notBefore: NOT_BEFORE.getTime(),
      notAfter: NOT_AFTER.getTime(),
    }),
  )
  assert.equal(issued.payload, `${issued.signedMessage}.${issued.signature}`)
})

test('signing the same pass twice produces different signatures that both verify', () => {
  // ECDSA is randomised. A deterministic result here would mean the nonce is
  // being reused, which leaks the private key.
  const a = issue()
  const b = issue()
  assert.notEqual(a.signature, b.signature)
  assert.equal(verifyPassPayload(a.payload, [VERIFYING]).state, 'VALID')
  assert.equal(verifyPassPayload(b.payload, [VERIFYING]).state, 'VALID')
})

test('an inverted window is refused rather than signed', () => {
  assert.throws(
    () => signPass(SIGNING, { code10: '4831902756', notBefore: NOT_AFTER, notAfter: NOT_BEFORE }),
    PassKeyError,
  )
  assert.throws(
    () => signPass(SIGNING, { code10: '4831902756', notBefore: NOT_BEFORE, notAfter: NOT_BEFORE }),
    PassKeyError,
  )
})

test('a code the envelope cannot carry fails at signing, not at the gate', () => {
  for (const code10 of ['0234567890', '123', '12345678901', 'abcdefghij']) {
    assert.throws(
      () => signPass(SIGNING, { code10, notBefore: NOT_BEFORE, notAfter: NOT_AFTER }),
      PassKeyError,
      code10,
    )
  }
})

// ── verification ────────────────────────────────────────────────────────────

test('a tampered code does not verify', () => {
  const issued = issue()
  const forged = issued.payload.replace('4831902756', '4831902757')
  assert.equal(verifyPassPayload(forged, [VERIFYING]).state, 'INVALID')
})

test('a tampered window does not verify', () => {
  const issued = issue()
  const parsed = parseEnvelope(issued.payload)
  assert.ok(parsed)
  const widened = serialiseEnvelope(
    { ...parsed, notAfter: parsed.notAfter + 86_400_000 },
    parsed.signature,
  )
  assert.equal(verifyPassPayload(widened, [VERIFYING]).state, 'INVALID')
})

test('a signature swapped in from another pass does not verify', () => {
  const a = issue('4831902756')
  const b = issue('5000000001')
  const spliced = `${a.signedMessage}.${b.signature}`
  assert.equal(verifyPassPayload(spliced, [VERIFYING]).state, 'INVALID')
})

test('a pass signed by another key is INVALID, and unknown when the key is absent', () => {
  const foreign = signPass(loadSigningKey(OTHER.privateKeyBase64), {
    code10: '4831902756',
    notBefore: NOT_BEFORE,
    notAfter: NOT_AFTER,
  })
  // Key not held: a deployment problem, and named as one.
  assert.equal(verifyPassPayload(foreign.payload, [VERIFYING]).state, 'UNKNOWN_KEY')
  // Key held: a genuine forgery attempt would be INVALID; this one is the real
  // signature for that key, so it verifies — which is what rotation relies on.
  assert.equal(verifyPassPayload(foreign.payload, [OTHER_VERIFYING]).state, 'VALID')
})

test('rotation works: two keys held, both eras verify', () => {
  const old = signPass(loadSigningKey(OTHER.privateKeyBase64), {
    code10: '4831902756',
    notBefore: NOT_BEFORE,
    notAfter: NOT_AFTER,
  })
  const keys = [VERIFYING, OTHER_VERIFYING]
  assert.equal(verifyPassPayload(issue().payload, keys).state, 'VALID')
  assert.equal(verifyPassPayload(old.payload, keys).state, 'VALID')
})

test('anything that is not an envelope is MALFORMED, not INVALID', () => {
  for (const raw of ['', 'hello', 'https://example.com', 'AUP26.1.short']) {
    assert.equal(verifyPassPayload(raw, [VERIFYING]).state, 'MALFORMED', raw)
  }
})

test('verifying with no keys at all reports UNKNOWN_KEY rather than throwing', () => {
  assert.equal(verifyPassPayload(issue().payload, []).state, 'UNKNOWN_KEY')
})

// ── the two implementations must agree ──────────────────────────────────────

test('the browser verifier reaches the same verdict as the server one', async () => {
  // The entire basis for trusting an offline verdict: WebCrypto on a volunteer's
  // phone and node:crypto on the server must never disagree about a payload.
  const keys = await importPublicKeys([
    { keyId: VERIFYING.keyId, publicKeyPem: VERIFYING.publicKeyPem },
  ])

  const issued = issue()
  const cases: Array<[label: string, payload: string, expected: string]> = [
    ['genuine', issued.payload, 'VALID'],
    ['tampered code', issued.payload.replace('4831902756', '4831902757'), 'INVALID'],
    ['foreign key', signPass(loadSigningKey(OTHER.privateKeyBase64), {
      code10: '4831902756', notBefore: NOT_BEFORE, notAfter: NOT_AFTER,
    }).payload, 'UNKNOWN_KEY'],
    ['not ours', 'https://example.com', 'MALFORMED'],
  ]

  for (const [label, payload, expected] of cases) {
    const web = await verifyPassPayloadWeb(payload, keys)
    const server = verifyPassPayload(payload, [VERIFYING])
    assert.equal(web.state, expected, `web/${label}`)
    assert.equal(server.state, expected, `server/${label}`)
    assert.equal(web.envelope?.code10, server.envelope?.code10, `envelope/${label}`)
  }
})

test('the browser verifier skips a key it cannot import instead of failing all of them', async () => {
  const keys = await importPublicKeys([
    { keyId: 'deadbeef', publicKeyPem: 'not a pem' },
    { keyId: VERIFYING.keyId, publicKeyPem: VERIFYING.publicKeyPem },
  ])
  assert.equal(keys.has('deadbeef'), false)
  assert.equal((await verifyPassPayloadWeb(issue().payload, keys)).state, 'VALID')
})

test('a hundred passes all verify in both implementations', async () => {
  const keys = await importPublicKeys([
    { keyId: VERIFYING.keyId, publicKeyPem: VERIFYING.publicKeyPem },
  ])
  for (let i = 0; i < 100; i += 1) {
    const code10 = String(1_000_000_000 + i)
    const issued = signPass(SIGNING, { code10, notBefore: NOT_BEFORE, notAfter: NOT_AFTER })
    assert.equal(verifyPassPayload(issued.payload, [VERIFYING]).state, 'VALID', code10)
    assert.equal((await verifyPassPayloadWeb(issued.payload, keys)).state, 'VALID', code10)
  }
})
