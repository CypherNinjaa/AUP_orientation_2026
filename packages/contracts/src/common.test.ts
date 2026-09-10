/**
 * The normalisers, tested against what students and volunteers actually type.
 *
 * These schemas are the only place a value's canonical form is decided, so a bug
 * here does not throw — it stores a form number with a trailing space that never
 * matches the roster, or a phone number nobody can call. Every case below is one
 * I expect to see in the real data, not a synthetic edge.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  code10,
  formNumber,
  parseInput,
  personName,
  phone10,
  reference,
  ERROR_STATUS,
  API_ERROR_CODES,
} from './common'
import { companionsInput, selfieDataUrl, submitRequest } from './registration'
import {
  createStudentRequest,
  reviewRequest,
  rosterCommitRequest,
  rosterStudentsQuery,
  settingsUpdateRequest,
} from './admin'
import { scanEventInput, syncRequest } from './scanner'

// ─── form number ─────────────────────────────────────────────────────────────

test('a form number normalises the way the roster parser normalises it', () => {
  for (const input of ['20314588', ' 20314588 ', '2031-4588', '2 0 3 1 4 5 8 8', '20314588\n']) {
    assert.equal(formNumber.parse(input), '20314588', input)
  }
})

test('a form number outside 4 to 20 digits is refused', () => {
  assert.equal(formNumber.safeParse('123').success, false)
  assert.equal(formNumber.safeParse('1'.repeat(21)).success, false)
  assert.equal(formNumber.safeParse('1234').success, true)
  assert.equal(formNumber.safeParse('1'.repeat(20)).success, true)
})

test('a form number of only punctuation is refused, not silently emptied', () => {
  const result = formNumber.safeParse('----')
  assert.equal(result.success, false)
})

// ─── pass code ───────────────────────────────────────────────────────────────

test('a pass code parses from every format a volunteer might type', () => {
  for (const input of ['4831902756', '483-190-2756', '483 190 2756', '(483) 190-2756']) {
    assert.equal(code10.parse(input), '4831902756', input)
  }
})

test('a pass code starting with 0 is named as a typo, not reported as not found', () => {
  const result = code10.safeParse('0831902756')
  assert.equal(result.success, false)
  assert.match(result.error?.issues[0]?.message ?? '', /starts with 0/)
})

test('a partially typed pass code is refused', () => {
  assert.equal(code10.safeParse('483190275').success, false)
  assert.equal(code10.safeParse('48319027561').success, false)
})

// ─── name ────────────────────────────────────────────────────────────────────

test('a name collapses whitespace and strips the characters nobody can see', () => {
  assert.equal(personName.parse('  ANJALI   KUMARI '), 'ANJALI KUMARI')
  assert.equal(personName.parse('ANJALI​KUMARI'), 'ANJALIKUMARI')
  assert.equal(personName.parse('﻿Ayush Kumar'), 'Ayush Kumar')
})

test('a name keeps the punctuation real Indian names contain', () => {
  for (const name of ["M. Sai Prasad", "D'Souza Maria", 'Ram-Kumar Singh', 'K/O Rajesh']) {
    assert.equal(personName.parse(name), name, name)
  }
})

test('a name with no letters is refused', () => {
  assert.equal(personName.safeParse('...').success, false)
  assert.equal(personName.safeParse('12345').success, false)
})

test('a name in Devanagari is accepted', () => {
  assert.equal(personName.parse('अंजली कुमारी'), 'अंजली कुमारी')
})

// ─── phone ───────────────────────────────────────────────────────────────────

test('a phone number normalises to the bare ten digits the roster stores', () => {
  for (const input of [
    '9876543210',
    '+91 9876543210',
    '+91-98765-43210',
    '09876543210',
    '0091 9876543210',
    '98765 43210',
  ]) {
    assert.equal(phone10.parse(input), '9876543210', input)
  }
})

test('a number that is not a mobile is refused', () => {
  assert.equal(phone10.safeParse('2234567890').success, false, 'starts with 2')
  assert.equal(phone10.safeParse('98765').success, false, 'too short')
  assert.equal(phone10.safeParse('98765432109').success, false, 'eleven digits, no prefix')
  assert.equal(phone10.safeParse('').success, false)
})

test('a mobile beginning 91 survives normalisation', () => {
  // The country-code strip is length-guarded for exactly this: 9198765432 is a
  // plausible ten-digit mobile, and an unguarded `91` strip would turn it into
  // an eight-digit number that fails validation for the wrong reason.
  assert.equal(phone10.parse('9198765432'), '9198765432')
})

test('a landline with an STD code is accepted, and that is a known limitation', () => {
  // 0612-2234567 is a Patna landline. Strip the trunk prefix and it is ten digits
  // starting with 6 — indistinguishable from a mobile without an STD-code table.
  // Rejecting all 11-digit 0-prefixed numbers would instead reject 09876543210,
  // which is how a large share of students write their own mobile. The common
  // case wins; a wrong contact number is a support call, not a failed gate entry.
  assert.equal(phone10.parse('06122234567'), '6122234567')
})

// ─── reference ───────────────────────────────────────────────────────────────

test('a reference is case-insensitive and rejects the ambiguous letters', () => {
  assert.equal(reference.parse('aup26-7f3k2q'), 'AUP26-7F3K2Q')
  assert.equal(reference.safeParse('AUP26-7F3K2O').success, false, 'O is not a zero')
  assert.equal(reference.safeParse('AUP26-7F3K2I').success, false, 'I is not a one')
  assert.equal(reference.safeParse('AUP25-7F3K2Q').success, false, 'wrong year')
})

// ─── companions ──────────────────────────────────────────────────────────────

test('coming alone is an empty list, and three guests are refused', () => {
  assert.deepEqual(companionsInput.parse([]), [])
  assert.equal(
    companionsInput.safeParse([
      { relationship: 'FATHER', name: 'Rajesh Kumar' },
      { relationship: 'MOTHER', name: 'Sunita Devi' },
      { relationship: 'GUARDIAN', name: 'Amit Singh' },
    ]).success,
    false,
  )
})

test('two guardians are allowed; two fathers are not', () => {
  assert.equal(
    companionsInput.safeParse([
      { relationship: 'GUARDIAN', name: 'Amit Singh' },
      { relationship: 'GUARDIAN', name: 'Priya Singh' },
    ]).success,
    true,
  )
  assert.equal(
    companionsInput.safeParse([
      { relationship: 'FATHER', name: 'Rajesh Kumar' },
      { relationship: 'FATHER', name: 'Rajesh Kumar' },
    ]).success,
    false,
  )
})

test('a companion with an unknown relationship is refused', () => {
  assert.equal(
    companionsInput.safeParse([{ relationship: 'BROTHER', name: 'Rahul' }]).success,
    false,
  )
})

// ─── selfie ──────────────────────────────────────────────────────────────────

const TINY_JPEG = `data:image/jpeg;base64,${'A'.repeat(400)}`

test('a camera capture is accepted and anything that is not one is refused', () => {
  assert.equal(selfieDataUrl.safeParse(TINY_JPEG).success, true)
  assert.equal(selfieDataUrl.safeParse('data:image/gif;base64,AAAA').success, false, 'gif')
  assert.equal(selfieDataUrl.safeParse('https://example.com/me.jpg').success, false, 'a URL')
  assert.equal(
    selfieDataUrl.safeParse('data:text/html;base64,PHNjcmlwdD4=').success,
    false,
    'html smuggled in a data url',
  )
  assert.equal(selfieDataUrl.safeParse('').success, false)
})

test('an oversized capture is refused on its base64 length, before it is decoded', () => {
  // 9 MB of base64 is ~6.75 MB decoded, over the 6 MB cap.
  const huge = `data:image/jpeg;base64,${'A'.repeat(9 * 1024 * 1024)}`
  const result = selfieDataUrl.safeParse(huge)
  assert.equal(result.success, false)
  assert.match(result.error?.issues[0]?.message ?? '', /too large/)
})

// ─── submit ──────────────────────────────────────────────────────────────────

function validSubmit(): unknown {
  return {
    formNumber: '2031-4588',
    name: '  Anjali   Kumari ',
    contactNo: '+91 98765 43210',
    companions: [{ relationship: 'MOTHER', name: 'Sunita Devi' }],
    selfie: { image: TINY_JPEG, faceDetected: true },
    consentVersion: '2026-01-v1',
    consentAccepted: true,
  }
}

test('a submit normalises every field on the way through', () => {
  const parsed = submitRequest.parse(validSubmit())
  assert.equal(parsed.formNumber, '20314588')
  assert.equal(parsed.name, 'Anjali Kumari')
  assert.equal(parsed.contactNo, '9876543210')
})

test('a submit without consent is refused, and says so in a sentence', () => {
  const result = submitRequest.safeParse({ ...(validSubmit() as object), consentAccepted: false })
  assert.equal(result.success, false)
  assert.match(result.error?.issues[0]?.message ?? '', /accept the consent notice/)
})

test('a submit carrying an extra field is refused rather than silently trimmed', () => {
  // The field that matters: the sheet's payment status must not be able to arrive
  // from a client and be written to a registration.
  const result = submitRequest.safeParse({
    ...(validSubmit() as object),
    paymentStatus: 'PAID',
  })
  assert.equal(result.success, false)
})

test('a submit cannot smuggle in an email either', () => {
  const result = submitRequest.safeParse({
    ...(validSubmit() as object),
    email: 'someone@example.com',
  })
  assert.equal(result.success, false)
})

// ─── admin ───────────────────────────────────────────────────────────────────

test('a revision request needs a reason of some kind', () => {
  assert.equal(reviewRequest.safeParse({ decision: 'APPROVE' }).success, true)
  assert.equal(reviewRequest.safeParse({ decision: 'REJECT' }).success, false, 'no note')
  assert.equal(
    reviewRequest.safeParse({ decision: 'REJECT', note: 'Not an admitted student.' }).success,
    true,
  )
  assert.equal(
    reviewRequest.safeParse({ decision: 'REQUEST_REVISION', reasonCode: 'NO_FACE' }).success,
    true,
  )
  assert.equal(
    reviewRequest.safeParse({ decision: 'REQUEST_REVISION', reasonCode: 'NOT_A_REASON' }).success,
    false,
  )
})

test('a roster commit is pinned to the bytes that were previewed', () => {
  const base = { importId: 'c' + 'l'.repeat(24), fileHash: 'a'.repeat(64) }
  assert.equal(rosterCommitRequest.safeParse(base).success, true)
  assert.equal(rosterCommitRequest.parse(base).allowDuplicateFile, false, 'refusal is the default')
  assert.equal(
    rosterCommitRequest.safeParse({ ...base, fileHash: 'nope' }).success,
    false,
    'not a sha-256',
  )
  assert.equal(rosterCommitRequest.safeParse({ fileHash: base.fileHash }).success, false, 'no id')
})

test('a settings patch refuses an empty body and an out-of-range retention', () => {
  assert.equal(settingsUpdateRequest.safeParse({}).success, false)
  assert.equal(settingsUpdateRequest.safeParse({ registrationOpen: true }).success, true)
  assert.equal(settingsUpdateRequest.safeParse({ selfieRetentionDays: 30 }).success, true)
  assert.equal(
    settingsUpdateRequest.safeParse({ selfieRetentionDays: 36500 }).success,
    false,
    'ten years is not a retention policy',
  )
  assert.equal(settingsUpdateRequest.safeParse({ selfieRetentionDays: 0 }).success, false)
  assert.equal(settingsUpdateRequest.safeParse({ maxCompanions: 5 }).success, false)
})

// ─── scanner ─────────────────────────────────────────────────────────────────

const UUID = '4f2a1c8e-6b3d-4e7f-9a1b-2c3d4e5f6a7b'

function validEvent(over: Record<string, unknown> = {}): unknown {
  return {
    clientEventId: UUID,
    rawCode: 'AUP26.1.33dcaf34.4831902756.hr8i0.hr920.abc',
    method: 'QR',
    scannedAt: Date.UTC(2026, 8, 15, 9, 30),
    clientOutcome: 'ADMITTED',
    clientReason: 'OK',
    ...over,
  }
}

test('a scan event defaults the fields a device may omit', () => {
  const parsed = scanEventInput.parse(validEvent())
  assert.equal(parsed.guestsAdmitted, 0)
  assert.equal(parsed.overridden, false)
  assert.equal(parsed.clockSuspect, false)
  assert.equal(parsed.wasOffline, true, 'a scan is assumed offline unless stated')
})

test('a scan event must carry a UUID idempotency key', () => {
  assert.equal(scanEventInput.safeParse(validEvent({ clientEventId: 'abc' })).success, false)
  assert.equal(scanEventInput.safeParse(validEvent({ clientEventId: undefined })).success, false)
})

test('every outcome decideScan can return is an accepted clientOutcome', () => {
  // If decideScan gains an outcome and this list does not, a device reporting it
  // gets a 400 at the gate. Kept in step with packages/core/scan/decide.ts.
  for (const outcome of [
    'ADMITTED',
    'DUPLICATE',
    'REVOKED',
    'NOT_APPROVED',
    'OUT_OF_WINDOW',
    'STALE_MANIFEST',
    'INVALID',
  ]) {
    assert.equal(scanEventInput.safeParse(validEvent({ clientOutcome: outcome })).success, true, outcome)
  }
  assert.equal(scanEventInput.safeParse(validEvent({ clientOutcome: 'NOT_FOUND' })).success, false)
})

test('a sync batch is bounded and needs at least one event', () => {
  const base = {
    deviceId: UUID,
    sentAt: Date.now(),
    manifestVersion: 1,
    manifestGeneratedAt: Date.now() - 60_000,
  }
  assert.equal(syncRequest.safeParse({ ...base, events: [] }).success, false)
  assert.equal(syncRequest.safeParse({ ...base, events: [validEvent()] }).success, true)
  assert.equal(syncRequest.parse({ ...base, events: [validEvent()] }).gateCode, 'MAIN')

  const many = Array.from({ length: 201 }, (_, i) => validEvent({ clientEventId: UUID.slice(0, -1) + (i % 10) }))
  assert.equal(syncRequest.safeParse({ ...base, events: many }).success, false)
})

test('a device id must be a UUID, because the database also insists', () => {
  const base = { sentAt: Date.now(), manifestVersion: 1, manifestGeneratedAt: 0, events: [validEvent()] }
  assert.equal(syncRequest.safeParse({ ...base, deviceId: 'phone-1' }).success, false)
  assert.equal(syncRequest.safeParse({ ...base, deviceId: UUID }).success, true)
})

// ─── the error contract ──────────────────────────────────────────────────────

test('every error code has an HTTP status', () => {
  for (const code of API_ERROR_CODES) {
    const status = ERROR_STATUS[code]
    assert.equal(typeof status, 'number', code)
    assert.ok(status >= 400 && status <= 599, `${code} -> ${status}`)
  }
  assert.equal(Object.keys(ERROR_STATUS).length, API_ERROR_CODES.length, 'no orphan statuses')
})

// ─── parseInput ──────────────────────────────────────────────────────────────

test('parseInput returns one message per field, not a stack trace', () => {
  const result = parseInput(submitRequest, {
    formNumber: '12',
    name: '.',
    contactNo: '123',
    companions: [],
    selfie: { image: 'nope', faceDetected: true },
    consentVersion: '2026-01-v1',
    consentAccepted: true,
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.fields['formNumber'], 'form number reported')
  assert.ok(result.fields['name'], 'name reported')
  assert.ok(result.fields['contactNo'], 'contact reported')
  assert.ok(result.fields['selfie.image'], 'nested path is dotted')
  assert.equal(typeof result.message, 'string')
  assert.ok(result.message.length > 0)
})

test('parseInput never throws on hostile input', () => {
  for (const input of [null, undefined, 0, '', [], { __proto__: { admin: true } }, NaN]) {
    const result = parseInput(submitRequest, input)
    assert.equal(result.ok, false)
  }
})

test('parseInput returns the transformed value, not the raw one', () => {
  const result = parseInput(submitRequest, validSubmit())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.contactNo, '9876543210')
})

// ─── manual student addition ────────────────────────────────────────────────

test('createStudentRequest accepts valid manual student details', () => {
  const parsed = createStudentRequest.safeParse({
    formNumber: ' 8024222 ',
    name: ' Aarav Sharma ',
    program: ' B.Tech (Computer Science & Engineering) ',
    programLevel: 'UG',
    contactNo: ' 9876543210 ',
    altContactNo: ' 9876543211 ',
    paymentStatus: 'Success',
  })
  assert.equal(parsed.success, true)
  if (!parsed.success) return
  assert.equal(parsed.data.formNumber, '8024222')
  assert.equal(parsed.data.name, 'Aarav Sharma')
  assert.equal(parsed.data.contactNo, '9876543210')
  assert.equal(parsed.data.altContactNo, '9876543211')
})

test('createStudentRequest rejects invalid contact numbers', () => {
  const parsed = createStudentRequest.safeParse({
    formNumber: '8024222',
    name: 'Aarav Sharma',
    program: 'B.Tech',
    contactNo: '12345',
  })
  assert.equal(parsed.success, false)
})

test('rosterStudentsQuery sets default page and limit', () => {
  const parsed = rosterStudentsQuery.parse({})
  assert.equal(parsed.page, 1)
  assert.equal(parsed.limit, 20)
})

