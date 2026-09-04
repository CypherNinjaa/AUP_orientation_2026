/**
 * Phone normalisation, using the exact malformed values found in the admissions
 * sheet rather than invented ones.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatPhone, normalisePhone, parsePhoneCell } from './phone'

test('accepts the forms a 10-digit Indian mobile arrives in', () => {
  for (const input of [
    '9876543210',
    '09876543210',
    '919876543210',
    '+91 98765 43210',
    '+91-98765-43210',
    ' 6203741009', // leading space, as stored in 1 demo cell
  ]) {
    assert.match(normalisePhone(input) ?? '', /^[6-9]\d{9}$/, input)
  }
})

test('rejects anything that is not a callable mobile number', () => {
  for (const input of ['', '-', 'N/A', '123', '5432109876', '98765432101', '12345']) {
    assert.equal(normalisePhone(input), null, input)
  }
})

test('known limitation: an 11-digit landline is indistinguishable from a mobile', () => {
  // `0612 2345678` is a Patna landline. Stripping the trunk `0` leaves
  // `6122345678`, which is a syntactically valid mobile number. Nothing in the
  // string says which it is, so it is accepted. Documented here so the behaviour
  // is a decision rather than a surprise.
  assert.equal(normalisePhone('0612 2345678'), '6122345678')
})

test('splits the three demo rows whose Contact No. holds two numbers', () => {
  // Rows 81, 130 and 436 of the sheet.
  for (const [cell, first, second] of [
    ['7644963307/8235152773', '7644963307', '8235152773'],
    ['9771279057/9113183313', '9771279057', '9113183313'],
    ['7004659016/7762947851', '7004659016', '7762947851'],
  ] as const) {
    const { valid, rejected } = parsePhoneCell(cell)
    assert.deepEqual(valid, [first, second], cell)
    assert.deepEqual(rejected, [])
  }
})

test('splits the alt-contact variants, including the space after the slash', () => {
  // 425 of 830 alt-contact cells hold two numbers; this is the spacing variant.
  assert.deepEqual(parsePhoneCell('7979866632/ 6201013902').valid, ['7979866632', '6201013902'])
  assert.deepEqual(parsePhoneCell('9876543210 , 9123456780').valid, ['9876543210', '9123456780'])
  assert.deepEqual(parsePhoneCell('9876543210 or 9123456780').valid, ['9876543210', '9123456780'])
})

test('deduplicates within a cell', () => {
  assert.deepEqual(parsePhoneCell('9876543210/9876543210').valid, ['9876543210'])
  assert.deepEqual(parsePhoneCell('+91 9876543210 / 09876543210').valid, ['9876543210'])
})

test('keeps unusable fragments separate instead of dropping them silently', () => {
  const { valid, rejected } = parsePhoneCell('9876543210/12345')
  assert.deepEqual(valid, ['9876543210'])
  assert.deepEqual(rejected, ['12345'])
})

test('handles empty and absent cells', () => {
  for (const cell of [null, undefined, '', '   ', '/', ' / ']) {
    assert.deepEqual(parsePhoneCell(cell), { valid: [], rejected: [] })
  }
})

test('formats for display without altering the stored value', () => {
  assert.equal(formatPhone('9876543210'), '98765 43210')
  assert.equal(formatPhone('123'), '123')
})
