import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ENVELOPE_NAMESPACE,
  ENVELOPE_VERSION,
  looksLikeEnvelope,
  parseEnvelope,
  serialiseEnvelope,
  signableMessage,
} from './envelope'
import type { EnvelopeFields } from './envelope'

const FIELDS: EnvelopeFields = {
  keyId: 'a1b2c3d4',
  code10: '4831902756',
  notBefore: Date.UTC(2026, 8, 15, 6, 0),
  notAfter: Date.UTC(2026, 8, 15, 18, 0),
}

/** 64 raw bytes, base64url — the shape a P-256 signature actually has. */
const SIG = Buffer.alloc(64, 7).toString('base64url')

test('the signable message is the envelope minus its signature', () => {
  const payload = serialiseEnvelope(FIELDS, SIG)
  const parsed = parseEnvelope(payload)
  assert.ok(parsed)
  assert.equal(parsed.signedMessage, signableMessage(FIELDS))
  assert.equal(payload, `${parsed.signedMessage}.${SIG}`)
})

test('the signed message is sliced from the input, not rebuilt from fields', () => {
  // This is the property that removes canonicalisation as a class of bug: what
  // the scanner read is what gets verified, byte for byte.
  const payload = serialiseEnvelope(FIELDS, SIG)
  const parsed = parseEnvelope(payload)
  assert.ok(parsed)
  assert.equal(payload.startsWith(parsed.signedMessage), true)
  assert.equal(parsed.signedMessage.length, payload.length - SIG.length - 1)
})

test('an envelope round-trips every field', () => {
  const parsed = parseEnvelope(serialiseEnvelope(FIELDS, SIG))
  assert.ok(parsed)
  assert.equal(parsed.keyId, FIELDS.keyId)
  assert.equal(parsed.code10, FIELDS.code10)
  assert.equal(parsed.signature, SIG)
  assert.equal(parsed.notBefore, FIELDS.notBefore)
  assert.equal(parsed.notAfter, FIELDS.notAfter)
})

test('timestamps are truncated to the minute at build time, not at parse time', () => {
  // If truncation happened later, a signature over milliseconds would be checked
  // against a message printed to the minute, and every pass would fail.
  const odd: EnvelopeFields = {
    ...FIELDS,
    notBefore: FIELDS.notBefore + 45_678,
    notAfter: FIELDS.notAfter + 59_999,
  }
  const parsed = parseEnvelope(serialiseEnvelope(odd, SIG))
  assert.ok(parsed)
  assert.equal(parsed.notBefore, FIELDS.notBefore)
  assert.equal(parsed.notAfter, FIELDS.notAfter)
  assert.equal(signableMessage(odd), signableMessage(FIELDS))
})

test('the payload is short enough to scan off a cracked screen', () => {
  const payload = serialiseEnvelope(FIELDS, SIG)
  // 5 + 1 + 1 + 8 + 10 + 5 + 5 + 86 plus six separators.
  assert.ok(payload.length < 130, `${String(payload.length)} chars`)
  assert.equal(payload.split('.').length, 7)
})

test('the namespace comes first so a foreign QR is rejected on the first character', () => {
  assert.ok(serialiseEnvelope(FIELDS, SIG).startsWith(`${ENVELOPE_NAMESPACE}.${ENVELOPE_VERSION}.`))
  assert.equal(looksLikeEnvelope('AUP26.1.a1b2c3d4.x'), true)
  assert.equal(looksLikeEnvelope('  AUP26.anything'), true)
  assert.equal(looksLikeEnvelope('https://amity.edu/pass/123'), false)
  assert.equal(looksLikeEnvelope('AUP27.1.a1b2c3d4'), false)
})

test('somebody else’s barcode is null, not an error', () => {
  for (const raw of [
    '',
    'hello',
    'https://example.com',
    'upi://pay?pa=someone@bank&am=100',
    'BEGIN:VCARD\nFN:Someone\nEND:VCARD',
    '1234567890',
    'AUP26', // namespace with no separator
    'AUP26.',
  ]) {
    assert.equal(parseEnvelope(raw), null, JSON.stringify(raw))
  }
})

test('a truncated or padded envelope is null', () => {
  const payload = serialiseEnvelope(FIELDS, SIG)
  assert.equal(parseEnvelope(payload.slice(0, -20)), null, 'clipped signature')
  assert.equal(parseEnvelope(payload.split('.').slice(0, 6).join('.')), null, 'missing part')
  assert.equal(parseEnvelope(`${payload}.extra`), null, 'extra part')
})

test('a future format version is refused rather than guessed at', () => {
  const payload = serialiseEnvelope(FIELDS, SIG).replace('AUP26.1.', 'AUP26.2.')
  assert.equal(parseEnvelope(payload), null)
})

test('a malformed key id is refused', () => {
  for (const keyId of ['A1B2C3D4', 'a1b2c3d', 'a1b2c3d4e', 'zzzzzzzz', '']) {
    assert.equal(parseEnvelope(serialiseEnvelope({ ...FIELDS, keyId }, SIG)), null, keyId)
  }
})

test('a code that is not ten digits starting 1-9 is refused', () => {
  for (const code10 of ['0234567890', '123456789', '12345678901', '12345abcde', '']) {
    assert.equal(parseEnvelope(serialiseEnvelope({ ...FIELDS, code10 }, SIG)), null, code10)
  }
})

test('a signature of the wrong length is refused at parse time', () => {
  // Cheaper than handing a bad length to WebCrypto, which throws rather than
  // returning false, and clearer in the log.
  for (const signature of [
    '',
    Buffer.alloc(32, 1).toString('base64url'),
    Buffer.alloc(70, 1).toString('base64url'), // DER-length, i.e. the wrong encoding
    `${SIG}!`,
    SIG.slice(0, 40),
  ]) {
    assert.equal(parseEnvelope(serialiseEnvelope(FIELDS, signature)), null, signature.slice(0, 12))
  }
})

test('a non-positive or unparseable timestamp is refused', () => {
  const payload = serialiseEnvelope(FIELDS, SIG)
  const parts = payload.split('.')
  for (const bad of ['0', '-', '!!', '']) {
    assert.equal(parseEnvelope([...parts.slice(0, 4), bad, parts[5], SIG].join('.')), null, bad)
    assert.equal(parseEnvelope([...parts.slice(0, 5), bad, SIG].join('.')), null, bad)
  }
})

test('surrounding whitespace from a scanner read is tolerated', () => {
  const payload = serialiseEnvelope(FIELDS, SIG)
  const parsed = parseEnvelope(`\n  ${payload}\r\n`)
  assert.ok(parsed)
  assert.equal(parsed.signedMessage, signableMessage(FIELDS))
})

test('the format stays stable, byte for byte', () => {
  // A golden string. If this changes, every pass already printed stops scanning,
  // so the change has to be deliberate enough to edit this line.
  assert.equal(signableMessage(FIELDS), 'AUP26.1.a1b2c3d4.4831902756.hr8i0.hr920')
})
