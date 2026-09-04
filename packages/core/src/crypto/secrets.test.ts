import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes } from 'node:crypto'
import {
  SecretDecryptError,
  SecretsKeyError,
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  parseSecretsKey,
  secretEquals,
} from './secrets'

const KEY = randomBytes(32)
const OTHER_KEY = randomBytes(32)
const SECRET = 'aBcD3f_GhIjKlMnOpQrStUvWxYz012345' // shaped like a Cloudinary api_secret

// ── the key ─────────────────────────────────────────────────────────────────

test('a 32-byte key is accepted as hex, base64 or base64url', () => {
  const raw = randomBytes(32)
  assert.deepEqual(parseSecretsKey(raw.toString('hex')), raw)
  assert.deepEqual(parseSecretsKey(raw.toString('base64')), raw)
  assert.deepEqual(parseSecretsKey(raw.toString('base64url')), raw)
  assert.deepEqual(parseSecretsKey(`  ${raw.toString('hex')}  `), raw)
})

test('uppercase hex is accepted, because password managers produce it', () => {
  const raw = randomBytes(32)
  assert.deepEqual(parseSecretsKey(raw.toString('hex').toUpperCase()), raw)
})

test('a short key is refused rather than padded', () => {
  // The one place leniency would be a vulnerability: a padded key is a weak key.
  for (const bad of ['', '   ', 'hunter2', randomBytes(16).toString('hex'), randomBytes(31).toString('base64')]) {
    assert.throws(() => parseSecretsKey(bad), SecretsKeyError, JSON.stringify(bad.slice(0, 12)))
  }
})

test('an over-long key is refused rather than truncated', () => {
  assert.throws(() => parseSecretsKey(randomBytes(48).toString('base64')), SecretsKeyError)
  assert.throws(() => parseSecretsKey(randomBytes(64).toString('hex')), SecretsKeyError)
})

test('the key error names the variable and the fix', () => {
  try {
    parseSecretsKey('')
    assert.fail('expected a throw')
  } catch (error) {
    assert.ok(error instanceof SecretsKeyError)
    assert.match(error.message, /SECRETS_KEY/)
    assert.match(error.message, /keys:generate/)
  }
})

// ── round trip ──────────────────────────────────────────────────────────────

test('a secret round-trips exactly', () => {
  assert.equal(decryptSecret(encryptSecret(SECRET, KEY), KEY), SECRET)
})

test('the envelope is self-describing and versioned', () => {
  const envelope = encryptSecret(SECRET, KEY)
  const parts = envelope.split('.')
  assert.equal(parts.length, 4)
  assert.equal(parts[0], 'v1')
  assert.ok(isEncryptedSecret(envelope))
  // base64url throughout, so it survives a JSON round trip and a URL.
  for (const part of parts.slice(1)) assert.match(part, /^[A-Za-z0-9_-]+$/)
})

test('the plaintext never appears in the ciphertext', () => {
  const envelope = encryptSecret(SECRET, KEY)
  assert.ok(!envelope.includes(SECRET))
  assert.ok(!Buffer.from(envelope).toString('utf8').includes(SECRET))
})

test('encrypting the same secret twice gives different envelopes', () => {
  // A fresh IV every time. Reusing one with the same key breaks GCM completely,
  // and identical envelopes would show that immediately.
  const a = encryptSecret(SECRET, KEY)
  const b = encryptSecret(SECRET, KEY)
  assert.notEqual(a, b)
  assert.notEqual(a.split('.')[1], b.split('.')[1], 'IVs must differ')
  assert.equal(decryptSecret(a, KEY), SECRET)
  assert.equal(decryptSecret(b, KEY), SECRET)
})

test('IVs do not repeat across many encryptions', () => {
  const ivs = new Set<string>()
  for (let i = 0; i < 5000; i += 1) ivs.add(encryptSecret(SECRET, KEY).split('.')[1] ?? '')
  assert.equal(ivs.size, 5000)
})

test('empty, unicode and long values all round-trip', () => {
  for (const value of ['', 'a', '🔐 ключ 密钥', 'x'.repeat(10_000), SECRET]) {
    assert.equal(decryptSecret(encryptSecret(value, KEY), KEY), value, value.slice(0, 12))
  }
})

// ── tampering ───────────────────────────────────────────────────────────────

test('the wrong key fails to decrypt instead of returning garbage', () => {
  const envelope = encryptSecret(SECRET, KEY)
  assert.throws(() => decryptSecret(envelope, OTHER_KEY), SecretDecryptError)
})

test('a modified ciphertext fails to decrypt', () => {
  // This is why GCM and not CBC: CBC would hand back garbage that then gets sent
  // to Cloudinary as a signature.
  const parts = encryptSecret(SECRET, KEY).split('.')
  const ct = Buffer.from(parts[3] ?? '', 'base64url')
  ct[0] = (ct[0] ?? 0) ^ 0xff
  const tampered = [parts[0], parts[1], parts[2], ct.toString('base64url')].join('.')
  assert.throws(() => decryptSecret(tampered, KEY), SecretDecryptError)
})

test('a modified auth tag fails to decrypt', () => {
  const parts = encryptSecret(SECRET, KEY).split('.')
  const tag = Buffer.from(parts[2] ?? '', 'base64url')
  tag[0] = (tag[0] ?? 0) ^ 0xff
  const tampered = [parts[0], parts[1], tag.toString('base64url'), parts[3]].join('.')
  assert.throws(() => decryptSecret(tampered, KEY), SecretDecryptError)
})

test('a swapped IV fails to decrypt', () => {
  const a = encryptSecret(SECRET, KEY).split('.')
  const b = encryptSecret(SECRET, KEY).split('.')
  assert.throws(() => decryptSecret([a[0], b[1], a[2], a[3]].join('.'), KEY), SecretDecryptError)
})

test('the decrypt error does not say which of the two causes it was', () => {
  // An operator gets one honest answer — this credential is unusable — and an
  // attacker gets no oracle distinguishing a wrong key from a wrong ciphertext.
  const wrongKey = (() => {
    try {
      decryptSecret(encryptSecret(SECRET, KEY), OTHER_KEY)
      return ''
    } catch (error) {
      return error instanceof Error ? error.message : ''
    }
  })()
  assert.match(wrongKey, /SECRETS_KEY has changed|was altered/)
})

test('a malformed envelope is refused with a shape complaint', () => {
  for (const bad of ['', 'v1', 'v1.a.b', 'v1.a.b.c.d', 'plaintext-secret']) {
    assert.throws(() => decryptSecret(bad, KEY), SecretDecryptError, JSON.stringify(bad))
  }
})

test('a future envelope version is refused rather than guessed at', () => {
  const envelope = encryptSecret(SECRET, KEY).replace(/^v1\./, 'v2.')
  assert.throws(() => decryptSecret(envelope, KEY), SecretDecryptError)
})

test('a bad IV or tag length is caught before the cipher sees it', () => {
  const parts = encryptSecret(SECRET, KEY).split('.')
  const shortIv = [parts[0], Buffer.alloc(8).toString('base64url'), parts[2], parts[3]].join('.')
  const shortTag = [parts[0], parts[1], Buffer.alloc(8).toString('base64url'), parts[3]].join('.')
  assert.throws(() => decryptSecret(shortIv, KEY), /malformed/)
  assert.throws(() => decryptSecret(shortTag, KEY), /malformed/)
})

test('a wrong-length key is refused on both sides', () => {
  assert.throws(() => encryptSecret(SECRET, randomBytes(16)), SecretsKeyError)
  assert.throws(() => decryptSecret(encryptSecret(SECRET, KEY), randomBytes(16)), SecretsKeyError)
})

// ── shape check ─────────────────────────────────────────────────────────────

test('isEncryptedSecret tells an encrypted column from a legacy plaintext one', () => {
  assert.equal(isEncryptedSecret(encryptSecret(SECRET, KEY)), true)
  for (const value of ['', SECRET, 'v1', 'v1.a.b', 'v2.a.b.c', 'a.b.c.d']) {
    assert.equal(isEncryptedSecret(value), false, JSON.stringify(value))
  }
})

// ── constant-time compare ───────────────────────────────────────────────────

test('secretEquals matches only identical strings', () => {
  assert.equal(secretEquals('token', 'token'), true)
  assert.equal(secretEquals('', ''), true)
  assert.equal(secretEquals('token', 'Token'), false)
  assert.equal(secretEquals('token', 'token '), false)
  assert.equal(secretEquals('token', 'tokes'), false)
})

test('secretEquals returns false on a length mismatch instead of throwing', () => {
  // timingSafeEqual throws on unequal lengths; a webhook with a short token must
  // get a 401, not a 500.
  assert.equal(secretEquals('short', 'much longer value'), false)
  assert.equal(secretEquals('', 'x'), false)
})

test('secretEquals handles multi-byte characters by byte length', () => {
  assert.equal(secretEquals('🔐', '🔐'), true)
  assert.equal(secretEquals('🔐', '🔑'), false)
})
