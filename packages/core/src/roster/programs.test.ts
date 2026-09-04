/**
 * Every distinct programme string in the 830-row admissions sheet, with the
 * level it must produce.
 *
 * This is a regression fence, not an illustration. `programLevel` is a stack of
 * ordered regexes and the order is easy to break — moving the `^M\.` rule above
 * the integrated-law rules silently reclassifies the 65 `BBA LL.B. (H)` school
 * leavers as postgraduates, which no test of a handful of representative cases
 * would catch.
 *
 * A `programGroup` column used to be asserted here too, mapping these 35 strings
 * onto 11 discipline buckets. It was removed on instruction: the programme the
 * student is shown is the one in the sheet, and admin charts group by that
 * verbatim string. The table below keeps the counts so that a change in the
 * total, or a new programme in a later export, is visible in a diff.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PROGRAM_LEVELS, programLevel } from './programs'
import type { ProgramLevel } from './programs'

const SHEET: ReadonlyArray<readonly [program: string, count: number, level: ProgramLevel]> = [
  ['BCA', 138, 'UG'],
  ['B.Tech (CSE)', 83, 'UG'],
  ['BBA', 77, 'UG'],
  ['LLM', 66, 'PG'],
  ['BBA LL.B. (H)', 65, 'UG'],
  ['B.A.,LL.B (H)', 64, 'UG'],
  ['B.Tech CSE (AI & ML)', 44, 'UG'],
  ['LL.B (H)', 42, 'PG'],
  ['MBA', 37, 'PG'],
  ['M.C.A.', 29, 'PG'],
  ['B.SC IT', 25, 'UG'],
  ['B.Com. (H)', 20, 'UG'],
  ['BA (J&MC)', 19, 'UG'],
  ['BBA (DM)', 17, 'UG'],
  ['BCA + MCA (Dual)', 15, 'UG'],
  ['BCA (Hons./Hons. with Research)', 10, 'UG'],
  ['B.Sc. (CP) (Hons./Hons. with Research)', 10, 'UG'],
  ['B.A. (Administration)', 9, 'UG'],
  ['M.Clin. Psy', 9, 'PG'],
  ['B.Tech CSE (Data Science)', 8, 'UG'],
  ['Ph.D. in Law (Jan)', 5, 'PHD'],
  ['B.A. (H) - English', 5, 'UG'],
  ['B.A. (J & MC) (Hons./Hons. with Research)', 5, 'UG'],
  ['Ph.D. in Law (Part Time) (Jan)', 4, 'PHD'],
  ['BBA (Hons./Hons. with Research)', 4, 'UG'],
  ['Ph.D in Physics (Part Time) (Jan)', 3, 'PHD'],
  ['Ph.D in Environmental Sciences (Jan)', 3, 'PHD'],
  ['B.Sc. (IT) (Hons./Hons. with Research)', 3, 'UG'],
  ['Ph.D in Management (Part Time) (Jan)(4.5Yrs)', 2, 'PHD'],
  ['Ph.D. (Management) (Jan)', 2, 'PHD'],
  ['B.Sc. (CP)', 2, 'UG'],
  ['BBA (DM) (Hons./Hons. with Research)', 2, 'UG'],
  ['B.A. (Administration) (Hons./Hons. with Research)', 1, 'UG'],
  ['B.Com. (Hons./Hons. with Research)', 1, 'UG'],
  ['B.A. (Psychology) (Hons./Hons. with Research)', 1, 'UG'],
]

test('the demo sheet has 35 distinct programmes covering 830 students', () => {
  assert.equal(SHEET.length, 35)
  assert.equal(
    SHEET.reduce((total, [, count]) => total + count, 0),
    830,
  )
})

test('every programme in the sheet gets its expected level', () => {
  for (const [program, , expected] of SHEET) {
    assert.equal(programLevel(program), expected, program)
  }
})

test('the integrated five-year law degrees are UG, not PG', () => {
  // 129 students between them. A bare LL.B is graduate entry; these two take
  // school leavers, and the string starts with the letter that means PG.
  assert.equal(programLevel('BBA LL.B. (H)'), 'UG')
  assert.equal(programLevel('B.A.,LL.B (H)'), 'UG')
  assert.equal(programLevel('LL.B (H)'), 'PG')
  assert.equal(programLevel('BCA + MCA (Dual)'), 'UG')
})

test('the qualifier suffixes do not change the level', () => {
  for (const [plain, honours] of [
    ['BCA', 'BCA (Hons./Hons. with Research)'],
    ['BBA', 'BBA (Hons./Hons. with Research)'],
    ['B.Com. (H)', 'B.Com. (Hons./Hons. with Research)'],
    ['Ph.D. in Law (Jan)', 'Ph.D. in Law (Part Time) (Jan)'],
  ] as const) {
    assert.equal(programLevel(honours), programLevel(plain), honours)
  }
})

test('an unrecognised programme is levelled, not rejected', () => {
  // An import must survive Admissions introducing something new. UG is the
  // assumption because the overwhelming majority of an orientation intake is.
  assert.equal(programLevel('B.Des. (Fashion)'), 'UG')
  assert.equal(programLevel('M.Des. (Fashion)'), 'PG')
})

test('a blank programme is UNKNOWN rather than assumed UG', () => {
  assert.equal(programLevel(''), 'UNKNOWN')
  assert.equal(programLevel('   '), 'UNKNOWN')
})

test('declared level values stay in sync with the exported list', () => {
  for (const [program, , level] of SHEET) {
    assert.ok(PROGRAM_LEVELS.includes(level), `${program}: ${level}`)
  }
})
