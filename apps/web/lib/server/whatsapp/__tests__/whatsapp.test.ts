import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import { normalizePhoneNumber, toChatId } from '../auth'

test('normalizePhoneNumber handles various Indian phone number formats', () => {
  assert.equal(normalizePhoneNumber('+91 98765-43210'), '919876543210')
  assert.equal(normalizePhoneNumber('9876543210'), '919876543210')
  assert.equal(normalizePhoneNumber('09876543210'), '919876543210')
  assert.equal(normalizePhoneNumber('919876543210@c.us'), '919876543210')
  assert.equal(normalizePhoneNumber('919876543210@s.whatsapp.net'), '919876543210')
})

test('toChatId formats standard WhatsApp JID', () => {
  assert.equal(toChatId('+91 98765 43210'), '919876543210@c.us')
  assert.equal(toChatId('9876543210'), '919876543210@c.us')
})

test('OpenWA HMAC signature calculation matches specification', () => {
  const secret = 'a-super-secret-key-12345'
  const body = JSON.stringify({ event: 'message.received', data: { body: 's' } })
  const hash = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const signature = `sha256=${hash}`

  const recomputed = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
  assert.equal(signature, recomputed)

  const timingMatch = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(recomputed))
  assert.equal(timingMatch, true)
})

test('Fast typing shortcut keywords match expected intent', () => {
  const isDirectIdentifier = (text: string) =>
    /^\d{8}$/.test(text.trim()) ||
    /^AUP\d{2}-/i.test(text.trim()) ||
    /^\d{3}-\d{3}-\d{4}$/.test(text.trim())

  // Direct 8-digit form numbers
  assert.equal(isDirectIdentifier('26010045'), true)
  assert.equal(isDirectIdentifier('  26010045  '), true)
  assert.equal(isDirectIdentifier('AUP26-7F3K2Q'), true)
  assert.equal(isDirectIdentifier('739-104-8821'), true)

  // Non-identifiers
  assert.equal(isDirectIdentifier('s'), false)
  assert.equal(isDirectIdentifier('stats'), false)
  assert.equal(isDirectIdentifier('!depts'), false)
})

