import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CODE10_LENGTH,
  REFERENCE_PREFIX,
  formatCode10,
  generateCode10,
  generateReference,
  isCode10,
  isReference,
  normaliseReference,
  parseCode10,
} from './codes'

test('a generated code is ten digits and never starts with zero', () => {
  for (let i = 0; i < 2000; i += 1) {
    const code = generateCode10()
    assert.equal(code.length, CODE10_LENGTH)
    assert.match(code, /^[1-9][0-9]{9}$/)
    // The property that matters: it survives being treated as a number, which
    // is what a spreadsheet export does to it.
    assert.equal(String(Number(code)), code)
  }
})

test('generated codes do not collide at event scale', () => {
  // 20,000 draws from a 9 × 10⁹ space. A collision here means the generator is
  // not actually random, not that we got unlucky.
  const codes = new Set<string>()
  for (let i = 0; i < 20_000; i += 1) codes.add(generateCode10())
  assert.equal(codes.size, 20_000)
})

test('every digit position uses its full range', () => {
  // Catches a modulo or slice bug that quietly pins a position to a few values.
  const seen: Set<string>[] = Array.from({ length: CODE10_LENGTH }, () => new Set())
  for (let i = 0; i < 3000; i += 1) {
    const code = generateCode10()
    for (let p = 0; p < CODE10_LENGTH; p += 1) seen[p]?.add(code[p] ?? '')
  }
  assert.equal(seen[0]?.size, 9, 'leading digit should cover 1-9')
  for (let p = 1; p < CODE10_LENGTH; p += 1) {
    assert.equal(seen[p]?.size, 10, `position ${String(p)} should cover 0-9`)
  }
})

test('a reference is prefixed, uppercase and free of ambiguous characters', () => {
  for (let i = 0; i < 2000; i += 1) {
    const reference = generateReference()
    assert.ok(isReference(reference), reference)
    assert.ok(reference.startsWith(`${REFERENCE_PREFIX}-`))
    assert.doesNotMatch(reference.slice(REFERENCE_PREFIX.length + 1), /[ILOU01]/)
  }
})

test('references do not collide across a plausible intake', () => {
  // 30⁶ ≈ 729M, so 15,000 draws should be clean. Rejection sampling being wrong
  // would show up here as a skew, and in the alphabet test above as a gap.
  const references = new Set<string>()
  for (let i = 0; i < 15_000; i += 1) references.add(generateReference())
  assert.ok(references.size > 14_990, `${String(references.size)} unique of 15000`)
})

test('the whole reference alphabet is reachable', () => {
  const chars = new Set<string>()
  for (let i = 0; i < 5000; i += 1) {
    for (const char of generateReference().slice(REFERENCE_PREFIX.length + 1)) chars.add(char)
  }
  assert.equal(chars.size, 30, [...chars].sort().join(''))
})

test('a code is displayed grouped and nothing else is touched', () => {
  assert.equal(formatCode10('1234567890'), '123-456-7890')
  // Not a code: returned unchanged rather than mangled into a fake one.
  assert.equal(formatCode10('123'), '123')
  assert.equal(formatCode10('0234567890'), '0234567890')
  assert.equal(formatCode10(''), '')
})

test('a code round-trips through its display form', () => {
  for (let i = 0; i < 500; i += 1) {
    const code = generateCode10()
    assert.equal(parseCode10(formatCode10(code)), code)
  }
})

test('parsing accepts every shape a device or a human produces', () => {
  for (const raw of [
    '1234567890',
    '123-456-7890',
    '123 456 7890',
    ' 1234567890 ',
    '123 456 7890', // non-breaking spaces from a copy-paste
    'code: 1234567890',
    '(123) 456-7890',
  ]) {
    assert.equal(parseCode10(raw), '1234567890', raw)
  }
})

test('a partial read is null, never a partial code', () => {
  // A half-read barcode must fail visibly rather than match the wrong student.
  for (const raw of ['', '123456789', '12345678901', 'abcdefghij', '0234567890', '-', '12-34-56']) {
    assert.equal(parseCode10(raw), null, raw)
  }
})

test('isCode10 rejects everything that is not exactly one', () => {
  assert.ok(isCode10('1000000000'))
  assert.ok(isCode10('9999999999'))
  for (const value of ['0000000000', '999999999', '99999999999', '12345 6789', '1e9', ' 1234567890']) {
    assert.equal(isCode10(value), false, value)
  }
})

test('a reference typed by a human is normalised into the canonical form', () => {
  for (const raw of [
    'aup26-7f3k2q',
    'AUP267F3K2Q',
    ' aup26 7f3k2q ',
    'AUP26--7F3K2Q',
    '7f3k2q', // just the body, as read off a help-desk note
  ]) {
    assert.equal(normaliseReference(raw), 'AUP26-7F3K2Q', raw)
  }
})

test('normalising does not invent a valid reference out of an invalid one', () => {
  // O is not in the alphabet and is not silently turned into a zero, because a
  // zero is not in the alphabet either. It is simply not a reference.
  assert.equal(isReference(normaliseReference('AUP26-7O3K2Q')), false)
  assert.equal(isReference(normaliseReference('AUP26-7F3K2')), false)
  assert.equal(isReference(normaliseReference('AUP26-7F3K2QQ')), false)
})

test('a generated reference survives normalisation unchanged', () => {
  for (let i = 0; i < 500; i += 1) {
    const reference = generateReference()
    assert.equal(normaliseReference(reference), reference)
    assert.equal(normaliseReference(reference.toLowerCase()), reference)
  }
})
