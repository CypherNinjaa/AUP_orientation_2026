import { EVENT, GUEST_RELATIONSHIPS, PROGRAMMES } from './event'

/**
 * The registration form's model: what it holds, what counts as valid, and where
 * it goes.
 *
 * Deliberately free of React. The wizard owns the screens; this owns the rules,
 * so the same rules can be re-run on the server the moment the API exists
 * (decision D9 — never trust the client's idea of valid).
 */

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

export type Programme = (typeof PROGRAMMES)[number]
export type GuestRelationship = (typeof GUEST_RELATIONSHIPS)[number]

export interface RegisterDraft {
  /* Step 1 — about you */
  name: string
  enrolment: string
  programme: Programme | ''
  email: string
  mobile: string

  /* Step 2 — your guest */
  bringingGuest: boolean
  guestName: string
  guestRelationship: GuestRelationship | ''

  /* Step 3 — a photo of you.
     Held as a data URL in memory only. See `saveDraft`. */
  selfie: string | null

  /* Step 4 — check and submit */
  consented: boolean
}

export const EMPTY_DRAFT: RegisterDraft = {
  name: '',
  enrolment: '',
  programme: '',
  email: '',
  mobile: '',
  bringingGuest: false,
  guestName: '',
  guestRelationship: '',
  selfie: null,
  consented: false,
}

export type DraftField = keyof RegisterDraft
export type Errors = Partial<Record<DraftField, string>>

/* -------------------------------------------------------------------------- */
/* Consent                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Bump this whenever the wording below changes, in the same commit.
 *
 * India's DPDP Act 2023 requires consent to be specific and demonstrable, which
 * means the record has to say *which* words the student agreed to — not merely
 * that a box was ticked. The version is stored alongside the timestamp, so a
 * later rewrite of the notice cannot retroactively change what anybody agreed
 * to.
 */
export const CONSENT_VERSION = '2026-01-v1'

/** The exact words shown next to the consent checkbox, kept beside the version. */
export const CONSENT_TEXT =
  `I agree to ${EVENT.institution} storing the photo I have just taken, and using it only to ` +
  `confirm my identity at the gate during ${EVENT.programme.toLowerCase()} ${EVENT.year}. ` +
  `I understand it is deleted within 30 days of the programme ending, and that I can ask for it ` +
  `to be deleted sooner.`

/* -------------------------------------------------------------------------- */
/* Normalising                                                                */
/* -------------------------------------------------------------------------- */

/** Collapses runs of whitespace and trims. Safe to run on any text field. */
export function tidy(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * The enrolment number is the key we match against the admission record, so it
 * is stored in one shape regardless of how it was typed — upper case, no spaces.
 */
export function normaliseEnrolment(value: string) {
  return value.replace(/\s+/g, '').toUpperCase()
}

/** Just the digits of an Indian mobile number, with a leading 91 dropped. */
export function normaliseMobile(value: string) {
  const digits = value.replace(/\D+/g, '')
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Error messages say what to do, not what went wrong — "Enter the mobile number
 * you gave on your application" beats "Invalid input". Nothing here apologises
 * and nothing blames.
 *
 * The rules are as loose as they can be while still catching typos. A form that
 * rejects a real student's real name is a worse failure than one that lets a
 * mistyped one through, because the second is fixable at the help desk and the
 * first sends somebody away.
 */

function validateName(value: string): string | undefined {
  const name = tidy(value)
  if (!name) return 'Enter your name as it appears on your application.'
  if (name.length < 2) return 'That looks too short — enter your full name.'
  // Anything with a letter in it. No two-word rule: plenty of students have one
  // legal name, and a form that will not accept it is the form's problem.
  if (!/\p{L}/u.test(name)) return 'Enter your name using letters.'
  return undefined
}

function validateEnrolment(value: string): string | undefined {
  const id = normaliseEnrolment(value)
  if (!id) return 'Enter your enrolment or application number.'
  // Length and character class only. The real format is unconfirmed (TODO(R1)),
  // and guessing a pattern here would reject valid numbers at 3am with nobody
  // around to override it.
  if (id.length < 5) return 'That looks too short. Check the number on your offer letter.'
  if (id.length > 24) return 'That looks too long. Check the number on your offer letter.'
  if (!/^[A-Z0-9/-]+$/.test(id)) return 'Use only letters, numbers, hyphens and slashes.'
  return undefined
}

function validateEmail(value: string): string | undefined {
  const email = tidy(value)
  if (!email) return 'Enter an email address — your pass is sent there too.'
  // One @, something either side, a dot in the domain, no spaces. Everything
  // stricter than this has a history of rejecting real addresses.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Check the address — it needs an @ and a domain, like name@example.com.'
  }
  return undefined
}

function validateMobile(value: string): string | undefined {
  const digits = normaliseMobile(value)
  if (!digits) return 'Enter a mobile number we can reach you on.'
  if (digits.length !== 10) return 'Enter the 10 digits of an Indian mobile number.'
  if (!/^[6-9]/.test(digits)) return 'Indian mobile numbers start with 6, 7, 8 or 9.'
  return undefined
}

function validateProgramme(value: string): string | undefined {
  if (!value) return 'Choose the programme you have been admitted to.'
  return undefined
}

/** Step 1 — about you. */
export function validateAbout(d: RegisterDraft): Errors {
  const errors: Errors = {}
  const name = validateName(d.name)
  if (name) errors.name = name
  const enrolment = validateEnrolment(d.enrolment)
  if (enrolment) errors.enrolment = enrolment
  const programme = validateProgramme(d.programme)
  if (programme) errors.programme = programme
  const email = validateEmail(d.email)
  if (email) errors.email = email
  const mobile = validateMobile(d.mobile)
  if (mobile) errors.mobile = mobile
  return errors
}

/**
 * Step 2 — your guest.
 *
 * Coming alone is always valid, and is the default. Only somebody who has said
 * they are bringing a guest is asked anything.
 */
export function validateGuest(d: RegisterDraft): Errors {
  if (!d.bringingGuest) return {}
  const errors: Errors = {}
  const name = validateName(d.guestName)
  if (name) errors.guestName = "Enter your guest's name, or choose to come alone."
  if (!d.guestRelationship) errors.guestRelationship = 'Choose how you know them.'
  return errors
}

/** Step 3 — a photo of you. */
export function validateSelfie(d: RegisterDraft): Errors {
  return d.selfie ? {} : { selfie: 'Take a photo before going on.' }
}

/** Step 4 — check and submit. */
export function validateConsent(d: RegisterDraft): Errors {
  return d.consented ? {} : { consented: 'Tick the box to agree before submitting.' }
}

/** Validators indexed by step, so the wizard never hard-codes which is which. */
export const STEP_VALIDATORS = [
  validateAbout,
  validateGuest,
  validateSelfie,
  validateConsent,
] as const

/* -------------------------------------------------------------------------- */
/* Draft persistence                                                          */
/* -------------------------------------------------------------------------- */

const DRAFT_KEY = 'orientation2026:register:draft:v1'

/**
 * What gets written to localStorage — note the absence of `selfie` and
 * `consented`.
 *
 * The photo is left out on purpose and this is not an optimisation. A selfie is
 * sensitive personal data under the DPDP Act; localStorage is readable by any
 * script on the origin, survives the tab closing, and is very often on a shared
 * or borrowed phone. It stays in React state and dies with the tab.
 *
 * `consented` is left out for a different reason: agreement has to be given by
 * the person submitting, in this sitting, having just read the words. Restoring
 * a tick from three days ago would be a record of consent nobody gave.
 */
type StoredDraft = Omit<RegisterDraft, 'selfie' | 'consented'>

export function saveDraft(d: RegisterDraft) {
  if (typeof window === 'undefined') return
  const stored: StoredDraft = {
    name: d.name,
    enrolment: d.enrolment,
    programme: d.programme,
    email: d.email,
    mobile: d.mobile,
    bringingGuest: d.bringingGuest,
    guestName: d.guestName,
    guestRelationship: d.guestRelationship,
  }
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(stored))
  } catch {
    // Private browsing, a full quota, storage disabled by policy. Losing the
    // draft is a small inconvenience; a thrown error mid-keystroke is not.
  }
}

export function loadDraft(): RegisterDraft {
  if (typeof window === 'undefined') return EMPTY_DRAFT
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(DRAFT_KEY)
  } catch {
    return EMPTY_DRAFT
  }
  if (!raw) return EMPTY_DRAFT

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_DRAFT
    const p = parsed as Record<string, unknown>

    // Read field by field rather than spreading. A draft written by an older
    // build — or hand-edited — must not be able to introduce keys we then trust.
    const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '')
    const programme = str('programme')
    const relationship = str('guestRelationship')

    return {
      ...EMPTY_DRAFT,
      name: str('name'),
      enrolment: str('enrolment'),
      programme: (PROGRAMMES as readonly string[]).includes(programme)
        ? (programme as Programme)
        : '',
      email: str('email'),
      mobile: str('mobile'),
      bringingGuest: p['bringingGuest'] === true,
      guestName: str('guestName'),
      guestRelationship: (GUEST_RELATIONSHIPS as readonly string[]).includes(relationship)
        ? (relationship as GuestRelationship)
        : '',
    }
  } catch {
    return EMPTY_DRAFT
  }
}

export function clearDraft() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* nothing useful to do */
  }
}

/** True when a restored draft has anything in it worth telling the student about. */
export function draftHasContent(d: RegisterDraft) {
  return Boolean(
    tidy(d.name) || tidy(d.enrolment) || d.programme || tidy(d.email) || tidy(d.mobile),
  )
}

/* -------------------------------------------------------------------------- */
/* Submission                                                                 */
/* -------------------------------------------------------------------------- */

export type SubmitResult =
  | { ok: true; reference: string }
  | { ok: false; message: string; field?: DraftField }

/**
 * ⚠️ TODO(R1) — not wired to anything.
 *
 * This is the seam. When the API lands, the body of this function becomes a
 * POST to `/api/registrations` with the normalised payload below, and
 * everything above it stays exactly as it is. Until then it validates and
 * reports honestly that nothing was sent — see `REGISTRATION_OPEN`.
 *
 * The payload is built here rather than in the component so that the shape the
 * server will receive is defined next to the rules that produced it.
 */
// Annotated `boolean` rather than left as the literal `false`, so both branches
// of every `REGISTRATION_OPEN ? …` stay type-checked instead of one of them
// becoming dead code that quietly rots until the day it is switched on.
export const REGISTRATION_OPEN: boolean = false

export function buildPayload(d: RegisterDraft) {
  return {
    name: tidy(d.name),
    enrolment: normaliseEnrolment(d.enrolment),
    programme: d.programme,
    email: tidy(d.email).toLowerCase(),
    mobile: normaliseMobile(d.mobile),
    guest: d.bringingGuest
      ? { name: tidy(d.guestName), relationship: d.guestRelationship }
      : null,
    /** Data URL. The server strips EXIF and writes it to private storage. */
    selfie: d.selfie,
    consent: {
      version: CONSENT_VERSION,
      /** ISO 8601, UTC. Recorded again server-side — this one is a claim, not proof. */
      at: new Date().toISOString(),
      text: CONSENT_TEXT,
    },
  }
}

export async function submitRegistration(d: RegisterDraft): Promise<SubmitResult> {
  const errors = { ...validateAbout(d), ...validateGuest(d), ...validateSelfie(d), ...validateConsent(d) }
  const first = Object.keys(errors)[0] as DraftField | undefined
  if (first) {
    return { ok: false, message: errors[first] ?? 'Something above needs fixing.', field: first }
  }

  if (!REGISTRATION_OPEN) {
    return {
      ok: false,
      message:
        'Registration is not open yet, so nothing was sent. Everything you typed is still here.',
    }
  }

  // TODO(R1): replace with the real call.
  // const res = await fetch('/api/registrations', {
  //   method: 'POST',
  //   headers: { 'content-type': 'application/json' },
  //   body: JSON.stringify(buildPayload(d)),
  // })
  return { ok: false, message: 'Not implemented.' }
}
