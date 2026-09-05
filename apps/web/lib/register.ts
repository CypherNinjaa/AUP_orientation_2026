/**
 * The registration wizard's model: what it holds, what counts as valid, and
 * where it goes.
 *
 * Deliberately free of React. The wizard owns the screens; this owns the rules.
 *
 * ## The rules are not written here
 *
 * Every validator below delegates to the Zod schema in `@orientation/contracts`
 * that the route handler will run on the same value, through the same
 * `parseInput` helper. So a message the student reads before submitting is the
 * identical string they would have read after, keyed by the identical field path.
 *
 * That is the whole reason this file is thin. The previous version hand-wrote
 * `validateMobile` and friends beside a server that did not exist yet; now that
 * it does, a second implementation of "what is a valid Indian mobile number"
 * would be a second implementation to keep in step — and the one that drifts is
 * always the one the student hits.
 *
 * ## What the client still owns
 *
 * Three things the contract cannot express: which step a field belongs to, what
 * survives a reload, and which of two saved drafts is the newer.
 */
import {
  companionsInput,
  formNumber as formNumberSchema,
  lookupRequest,
  parseInput,
  personName,
  selfieInput,
  submitRequest,
  type AdmittedStudentPreview,
  type ApiError,
  type CompanionInput,
  type CompanionRelationship,
  type DraftData,
  type DraftResponse,
  type LookupResponse,
  type MeResponse,
  type ParseOutcome,
  type SelfieReplaceResponse,
  type SubmitResponse,
  phone10,
} from '@orientation/contracts'

import { apiDelete, apiGet, apiPost, apiPut, type ApiResult } from './api'
import { COMPANION_RELATIONSHIPS, EVENT } from './event'

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

export interface RegisterDraft {
  /* Step 1 — about you.
     `formNumber` is the only thing typed here. `name` and `program` come back
     from the admissions row; the student may correct the name (sheets misspell
     them, and the gate has to match the name on the pass to the person holding
     it) but never the programme, which is what their admission letter says. */
  formNumber: string
  name: string
  program: string
  contactNo: string

  /* Step 2 — your guests.
     An empty array *is* "coming alone". There is no separate boolean, because
     two fields encoding one fact drift, and the one that drifts is the one the
     pass prints. A row with an empty `name` is a half-answered step 2 and is
     legal here; it is filtered out before anything crosses the network. */
  companions: CompanionInput[]

  /* Step 3 — a photo of you.
     A data URL, held in memory only. See `saveDraft`. `faceDetected` is what the
     in-browser detector saw when the frame was taken: advisory, never a gate. */
  selfie: string | null
  faceDetected: boolean

  /* Step 4 — check and submit. This sitting only. */
  consented: boolean
}

/**
 * A blank form.
 *
 * Spread it rather than mutating it — `{ ...EMPTY_DRAFT }` shares the
 * `companions` array, so every update must replace that array rather than push
 * to it. Every helper here does.
 */
export const EMPTY_DRAFT: RegisterDraft = {
  formNumber: '',
  name: '',
  program: '',
  contactNo: '',
  companions: [],
  selfie: null,
  faceDetected: false,
  consented: false,
}

/**
 * Field problems, keyed by the path the server would have used.
 *
 * A flat `Record<string, string>` rather than a union of known keys, because
 * nested paths (`companions.0.name`, `selfie.image`) are what both Zod and the
 * route handler produce, and a type that cannot hold them would have to be
 * translated at every boundary.
 */
export type Errors = Record<string, string>

/**
 * Which step owns a field.
 *
 * The one piece of knowledge the contract genuinely does not have. It is what
 * lets a `VALIDATION_FAILED` or `ALREADY_CLAIMED` arriving from the submit at
 * step 4 send the student back to step 1 with the message attached to the right
 * control, instead of showing them a sentence about a field they cannot see.
 *
 * `undefined` means "no step owns this" — a whole-object issue, or a code like
 * `RATE_LIMITED`. Those belong at the top of the panel, not on a control.
 */
export function stepOfField(field: string): number | undefined {
  if (field === 'formNumber' || field === 'name' || field === 'contactNo' || field === 'program') {
    return 0
  }
  if (field === 'companions' || field.startsWith('companions.')) return 1
  if (field === 'selfie' || field.startsWith('selfie.')) return 2
  if (field === 'consentAccepted' || field === 'consentVersion' || field === 'consented') return 3
  return undefined
}

/** The first problem in a set, for the summary line above a panel. */
export function firstError(errors: Errors): string | undefined {
  for (const key of Object.keys(errors)) {
    const message = errors[key]
    if (message) return message
  }
  return undefined
}

/**
 * The earliest step with a problem in it, so a failed submit lands where the
 * student can act rather than wherever they happened to be.
 */
export function firstErrorStep(errors: Errors): number | undefined {
  let earliest: number | undefined
  for (const key of Object.keys(errors)) {
    const step = stepOfField(key)
    if (step === undefined) continue
    if (earliest === undefined || step < earliest) earliest = step
  }
  return earliest
}

/* -------------------------------------------------------------------------- */
/* Consent                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The exact words shown beside the consent box.
 *
 * The version string is *not* here any more, and that matters. It lives in
 * `SystemConfig.consentVersion`, is read by the page and threaded through the
 * wizard, and is echoed back on submit where the server compares it. A constant
 * in this file would go stale the first time an admin changed the notice, and the
 * failure would be a `CONSENT_VERSION_MISMATCH` at the last step of every
 * registration.
 *
 * `retentionDays` comes from the same config for the same reason: an admin who
 * changes the retention period must not leave a promise of "30 days" on screen.
 */
export function consentText(retentionDays: number): string {
  return (
    `I agree to ${EVENT.institution} storing the photo I have just taken, and using it only to ` +
    `confirm my identity at the gate during ${EVENT.programme.toLowerCase()} ${EVENT.year}. ` +
    `I understand it is deleted within ${String(retentionDays)} days of the programme ending, and ` +
    `that I can ask for it to be deleted sooner.`
  )
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/** `undefined` when the value parsed; the first message when it did not. */
function problem(outcome: ParseOutcome<unknown>): string | undefined {
  return outcome.ok ? undefined : outcome.message
}

/**
 * Step 1 — about you.
 *
 * Note what this does *not* check: whether the form number was actually claimed.
 * A syntactically perfect number that belongs to nobody passes here and fails at
 * the lookup, which is the only thing that can know. The wizard refuses to leave
 * step 1 until the lookup has answered, and that gate lives there because it
 * needs the response, not the draft.
 */
export function validateAbout(d: RegisterDraft): Errors {
  const errors: Errors = {}
  const form = problem(parseInput(formNumberSchema, d.formNumber))
  if (form) errors.formNumber = form
  const name = problem(parseInput(personName, d.name))
  if (name) errors.name = name
  const contact = problem(parseInput(phone10, d.contactNo))
  if (contact) errors.contactNo = contact
  return errors
}

/**
 * Step 2 — your guests.
 *
 * Coming alone is valid and is the default, so an empty array yields no errors.
 * Anything else goes through the contract, which caps the list at two and refuses
 * a second Father or a second Mother. Keys are rewritten from the array-relative
 * paths Zod produces (`0.name`) to the ones the server produces
 * (`companions.0.name`), so a local failure and a remote one are indistinguishable
 * to the component rendering them.
 */
export function validateCompanions(d: RegisterDraft): Errors {
  const outcome = parseInput(companionsInput, d.companions)
  if (outcome.ok) return {}

  const errors: Errors = {}
  for (const [key, message] of Object.entries(outcome.fields)) {
    errors[key === '_' ? 'companions' : `companions.${key}`] = message
  }
  return errors
}

/** Step 3 — a photo of you. */
export function validateSelfie(d: RegisterDraft): Errors {
  const outcome = parseInput(selfieInput, { image: d.selfie, faceDetected: d.faceDetected })
  if (outcome.ok) return {}

  // `image` is what the contract calls it; `selfie` is what the step is called
  // and what the wizard keys its control by.
  const errors: Errors = {}
  for (const [key, message] of Object.entries(outcome.fields)) {
    errors[key === 'image' ? 'selfie' : `selfie.${key}`] = message
  }
  return errors
}

/** Step 4 — check and submit. */
export function validateConsent(d: RegisterDraft): Errors {
  const outcome = parseInput(submitRequest.shape.consentAccepted, d.consented)
  return outcome.ok ? {} : { consented: outcome.message }
}

/** Validators indexed by step, so the wizard never hard-codes which is which. */
export const STEP_VALIDATORS = [
  validateAbout,
  validateCompanions,
  validateSelfie,
  validateConsent,
] as const

/* -------------------------------------------------------------------------- */
/* Companions                                                                 */
/* -------------------------------------------------------------------------- */

/** Rows with a name in them. The only ones that may cross the network. */
export function realCompanions(companions: readonly CompanionInput[]): CompanionInput[] {
  return companions.filter((c) => tidy(c.name).length > 0)
}

/**
 * Whether a relationship can still be added.
 *
 * Father and Mother are one each; Guardian is unlimited within the seat count.
 * The rule is the contract's — this reads it off `COMPANION_RELATIONSHIPS` so
 * there is one place to change if a fourth relationship is ever added.
 */
export function relationshipAvailable(
  companions: readonly CompanionInput[],
  value: CompanionRelationship,
): boolean {
  const rule = COMPANION_RELATIONSHIPS.find((r) => r.value === value)
  if (!rule?.once) return true
  return !companions.some((c) => c.relationship === value)
}

/** The relationship a new row should default to: the first one still free. */
export function nextRelationship(
  companions: readonly CompanionInput[],
): CompanionRelationship | undefined {
  return COMPANION_RELATIONSHIPS.find((r) => relationshipAvailable(companions, r.value))?.value
}

/* -------------------------------------------------------------------------- */
/* Text                                                                       */
/* -------------------------------------------------------------------------- */

/** Collapses runs of whitespace and trims. Safe to run on any text field. */
export function tidy(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** `20314588` → `2031 4588`, for reading a long number back without squinting. */
export function spaceDigits(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length > 8 ? digits.replace(/(\d{4})(?=\d)/g, '$1 ') : digits
}

/* -------------------------------------------------------------------------- */
/* Draft persistence                                                          */
/* -------------------------------------------------------------------------- */

/**
 * v2. The v1 shape held `enrolment`, `programme`, `email` and a `bringingGuest`
 * boolean, none of which exist now, so a stored v1 draft is not migrated — it is
 * deleted on the first read. Migrating four dead fields into three live ones
 * would produce a resumed form that looks filled in and is not.
 */
const DRAFT_KEY = 'orientation2026:register:draft:v2'
const LEGACY_DRAFT_KEY = 'orientation2026:register:draft:v1'

/**
 * What gets written to `localStorage` — note the absence of `selfie` and
 * `consented`.
 *
 * The photo is left out on purpose and this is not an optimisation. A selfie is
 * sensitive personal data under the DPDP Act; `localStorage` is readable by any
 * script on the origin, survives the tab closing, and is very often on a shared
 * or borrowed phone. It stays in React state and dies with the tab.
 *
 * `consented` is left out for a different reason: agreement has to be given by
 * the person submitting, in this sitting, having just read the words. Restoring a
 * tick from three days ago would be a record of consent nobody gave.
 *
 * `faceDetected` goes with the photo. It is a fact about an image that is no
 * longer here, and a stored `true` beside a missing selfie is worse than nothing.
 */
interface StoredDraft {
  formNumber: string
  name: string
  program: string
  contactNo: string
  companions: CompanionInput[]
}

/** A draft plus when and where it was last written. */
export interface DraftSnapshot {
  step: number
  /** Epoch ms. The tiebreaker when a device and an account both have one. */
  at: number
  draft: RegisterDraft
  from: 'device' | 'account'
}

export function saveDraft(step: number, d: RegisterDraft): void {
  if (typeof window === 'undefined') return
  const stored: StoredDraft = {
    formNumber: d.formNumber,
    name: d.name,
    program: d.program,
    contactNo: d.contactNo,
    companions: d.companions,
  }
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 2, step, at: Date.now(), stored }))
  } catch {
    // Private browsing, a full quota, storage disabled by policy. Losing the
    // draft is a small inconvenience; a thrown error mid-keystroke is not.
  }
}

export function loadDraft(): DraftSnapshot | null {
  if (typeof window === 'undefined') return null

  let raw: string | null = null
  try {
    window.localStorage.removeItem(LEGACY_DRAFT_KEY)
    raw = window.localStorage.getItem(DRAFT_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const envelope = parsed as Record<string, unknown>
    const stored = envelope['stored']
    if (typeof stored !== 'object' || stored === null) return null

    const p = stored as Record<string, unknown>
    // Read field by field rather than spreading. A draft written by an older
    // build — or hand-edited — must not be able to introduce keys we then trust.
    const str = (key: string): string => (typeof p[key] === 'string' ? (p[key] as string) : '')

    const draft: RegisterDraft = {
      ...EMPTY_DRAFT,
      formNumber: str('formNumber'),
      name: str('name'),
      program: str('program'),
      contactNo: str('contactNo'),
      companions: readCompanions(p['companions']),
    }

    const step = typeof envelope['step'] === 'number' ? envelope['step'] : 0
    const at = typeof envelope['at'] === 'number' ? envelope['at'] : 0
    return { step: clampStep(step), at, draft, from: 'device' }
  } catch {
    return null
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* nothing useful to do */
  }
}

/** Rows from an untrusted source, with unknown relationships dropped. */
function readCompanions(value: unknown): CompanionInput[] {
  if (!Array.isArray(value)) return []
  const rows: CompanionInput[] = []
  for (const entry of value.slice(0, 2)) {
    if (typeof entry !== 'object' || entry === null) continue
    const row = entry as Record<string, unknown>
    const relationship = COMPANION_RELATIONSHIPS.find((r) => r.value === row['relationship'])
    if (!relationship) continue
    rows.push({
      relationship: relationship.value,
      name: typeof row['name'] === 'string' ? row['name'] : '',
    })
  }
  return rows
}

function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 0
  return Math.min(3, Math.max(0, Math.trunc(step)))
}

/** True when a restored draft has anything in it worth telling the student about. */
export function draftHasContent(d: RegisterDraft): boolean {
  return Boolean(
    tidy(d.formNumber) || tidy(d.name) || tidy(d.contactNo) || realCompanions(d.companions).length,
  )
}

/* -------------------------------------------------------------------------- */
/* Draft, on the server                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The subset of a draft the endpoint will accept.
 *
 * Every field is dropped unless it parses, because `draftData` validates what it
 * stores and a half-typed mobile number would 400 the whole save — losing the
 * fields that *were* ready. Half-filled companion rows are dropped for the same
 * reason.
 */
export function toDraftData(d: RegisterDraft): DraftData {
  const data: DraftData = {}

  const form = parseInput(formNumberSchema, d.formNumber)
  if (form.ok) data.formNumber = form.data

  const name = parseInput(personName, d.name)
  if (name.ok) data.name = name.data

  const program = tidy(d.program)
  if (program) data.program = program.slice(0, 200)

  const contact = parseInput(phone10, d.contactNo)
  if (contact.ok) data.contactNo = contact.data

  const companions = parseInput(companionsInput, realCompanions(d.companions))
  if (companions.ok) data.companions = companions.data

  return data
}

/** A stored draft, back into the form's shape. */
export function fromDraftData(data: DraftData): RegisterDraft {
  return {
    ...EMPTY_DRAFT,
    formNumber: data.formNumber ?? '',
    name: data.name ?? '',
    program: data.program ?? '',
    contactNo: data.contactNo ?? '',
    companions: readCompanions(data.companions),
  }
}

/**
 * Save to the account row as well as the device.
 *
 * Both, always, and the device first: `localStorage` is synchronous and cannot
 * fail for network reasons, so it is the copy that survives a bus tunnel. The row
 * exists for the other case — a student who fills two steps on a laptop and
 * finishes on a phone — which no amount of local storage can serve.
 *
 * The return value says which copies exist, so the wizard can be honest about it
 * rather than claiming "saved" when only one of the two happened.
 */
export async function pushDraft(step: number, d: RegisterDraft): Promise<'account' | 'device'> {
  saveDraft(step, d)
  const data = toDraftData(d)
  if (Object.keys(data).length === 0) return 'device'
  const result = await apiPut<DraftResponse>('/api/registration/draft', { step, data })
  return result.ok ? 'account' : 'device'
}

/**
 * Read the account's draft, or nothing.
 *
 * A `NOT_FOUND` here is the normal state for anybody registering for the first
 * time, so it is not an error and is never shown. Neither is a network failure:
 * the local copy is the fast path and this is the fallback, not the reverse.
 */
export async function pullDraft(): Promise<DraftSnapshot | null> {
  const result = await apiGet<DraftResponse>('/api/registration/draft')
  if (!result.ok) return null
  const at = Date.parse(result.data.updatedAt)
  return {
    step: clampStep(result.data.step),
    at: Number.isNaN(at) ? 0 : at,
    draft: fromDraftData(result.data.data),
    from: 'account',
  }
}

/** Forget the draft everywhere. Called after a successful submit, and on "start again". */
export async function dropDraft(): Promise<void> {
  clearDraft()
  await apiDelete<void>('/api/registration/draft')
}

/**
 * The draft to resume from: whichever of the two copies is newer.
 *
 * Newest-wins rather than a merge. Merging two drafts field by field produces a
 * third one the student never typed, and the field most likely to differ is the
 * one they just corrected.
 */
export async function resumeDraft(): Promise<DraftSnapshot | null> {
  const local = loadDraft()
  const remote = await pullDraft()
  if (!remote) return local
  if (!local) return remote
  return remote.at > local.at ? remote : local
}

/* -------------------------------------------------------------------------- */
/* Step 1 — the claim                                                         */
/* -------------------------------------------------------------------------- */

/** A local validation failure, in the exact shape the server would have sent. */
function validationError(outcome: Extract<ParseOutcome<unknown>, { ok: false }>): ApiError {
  return { code: 'VALIDATION_FAILED', message: outcome.message, fields: outcome.fields }
}

/**
 * Claim a form number.
 *
 * Validated here first so a plainly wrong number costs nothing: the endpoint is
 * rate-limited per user precisely because it is an enumeration surface, and
 * spending one of a student's twenty attempts a minute on a value the contract
 * would have refused is spending it badly.
 */
export async function lookupStudent(rawFormNumber: string): Promise<ApiResult<LookupResponse>> {
  const parsed = parseInput(lookupRequest, { formNumber: rawFormNumber })
  if (!parsed.ok) return { ok: false, error: validationError(parsed) }
  return apiPost<LookupResponse>('/api/registration/lookup', parsed.data)
}

/**
 * Fill step 1 from the admissions row.
 *
 * `name` and `program` are overwritten, because the row is the authority for
 * both and this only runs when the student has just asked for it. `contactNo` is
 * seeded only when empty — a student who corrected the sheet's stale number and
 * then re-checked their form number would otherwise watch their correction
 * disappear.
 */
export function applyStudent(d: RegisterDraft, student: AdmittedStudentPreview): RegisterDraft {
  return {
    ...d,
    formNumber: student.formNumber,
    name: student.name,
    program: student.program,
    contactNo: tidy(d.contactNo) === '' ? (student.contactNo ?? '') : d.contactNo,
  }
}

/* -------------------------------------------------------------------------- */
/* Submission                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The request body, before validation.
 *
 * There is no `program`. The server reads it from the admissions row, and a field
 * the student cannot edit has no business arriving in a request body — accepting
 * one would mean the programme printed on a pass could differ from the one the
 * university admitted them to.
 */
export function buildPayload(d: RegisterDraft, consentVersion: string) {
  return {
    formNumber: d.formNumber,
    name: d.name,
    contactNo: d.contactNo,
    companions: realCompanions(d.companions),
    selfie: { image: d.selfie, faceDetected: d.faceDetected },
    consentVersion,
    consentAccepted: d.consented,
  }
}

/**
 * Create the registration.
 *
 * Parsed against the server's own schema before it is sent, so an incomplete
 * form fails locally with the same message and the same field keys it would have
 * failed with remotely, and the wizard has exactly one error path to render.
 *
 * Safe to retry. A second submit for a form number this account already claimed
 * returns the existing registration rather than a conflict, so a student who taps
 * twice, or whose connection dropped after the request left, gets their pass
 * rather than an error.
 */
export async function submitRegistration(
  d: RegisterDraft,
  consentVersion: string,
): Promise<ApiResult<SubmitResponse>> {
  const parsed = parseInput(submitRequest, buildPayload(d, consentVersion))
  if (!parsed.ok) return { ok: false, error: validationError(parsed) }
  return apiPost<SubmitResponse>('/api/registration/submit', parsed.data)
}

/**
 * Replace the photo after a moderator asked for a retake.
 *
 * Not part of the wizard — this is the student portal's, and it is the one thing
 * a student can still change once a registration exists. No consent is re-taken:
 * the notice they agreed to covers the photo used to identify them at the gate,
 * and this is that photo.
 */
export async function replaceSelfie(
  image: string,
  faceDetected: boolean,
): Promise<ApiResult<SelfieReplaceResponse>> {
  const parsed = parseInput(selfieInput, { image, faceDetected })
  if (!parsed.ok) return { ok: false, error: validationError(parsed) }
  return apiPut<SelfieReplaceResponse>('/api/registration/selfie', parsed.data)
}

/** Everything the student portal needs in one read. */
export function fetchMe(): Promise<ApiResult<MeResponse>> {
  return apiGet<MeResponse>('/api/registration/me')
}
