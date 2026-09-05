/**
 * The student registration wizard's boundary.
 *
 * Four steps, four things that cross the network: a form-number claim, a draft
 * save, a submit, and a selfie replacement after a moderator asks for a retake.
 *
 * Two shapes of the sheet's data are absent from this file on purpose and it is
 * worth stating why in the contract rather than only in the handler:
 *
 *   - `E-Mail ID` is never returned. Identity is the Clerk account the student
 *     signed in with. A second, unverified address that the UI displays next to
 *     a name starts being treated as an auth factor by whoever reads it next.
 *   - `payment status` is never returned. It is admin-only. A student who sees
 *     "PENDING" on an orientation form will read it as "my seat is at risk", and
 *     the orientation desk cannot answer fee questions.
 *
 * And `program` is the verbatim string from the spreadsheet — `B.Tech CSE (AI &
 * ML)`, not a tidied bucket. The student sees what their admission letter says.
 */
import { z } from 'zod'
import { code10, companionRelationship, formNumber, personName, phone10, registrationStatus } from './common'
import type { CompanionRelationship, PassStatus, RegistrationStatus } from './common'

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — claim a form number
// ─────────────────────────────────────────────────────────────────────────────

export const lookupRequest = z.strictObject({
  formNumber,
})
export type LookupRequest = z.infer<typeof lookupRequest>

/** What the wizard fills into step 1. Read-only in the UI except `contactNo`. */
export interface AdmittedStudentPreview {
  formNumber: string
  name: string
  /** Exactly as the admissions sheet spells it. Never a grouped label. */
  program: string
  /** Bare 10 digits, or null when the sheet had no usable number. */
  contactNo: string | null
}

/**
 * Four outcomes, discriminated so the wizard branches on one field.
 *
 * `CLAIMED_BY_YOU` exists because the common way to hit this endpoint twice is a
 * student reloading the page mid-wizard. Reporting that as `CLAIMED` would tell
 * them their own form number was taken by someone else.
 *
 * Note that this endpoint returns a name and a phone number for any form number
 * an authenticated caller guesses, which is an enumeration surface. It is
 * mitigated rather than eliminated: sign-in is required, one account can claim
 * exactly one row, and the handler rate-limits per user and audits a caller who
 * exceeds the threshold. Auto-filling the contact number is a requirement — the
 * alternative is 15,000 students typing a number the university already has.
 */
export type LookupResponse =
  | { status: 'AVAILABLE'; student: AdmittedStudentPreview }
  | { status: 'CLAIMED_BY_YOU'; student: AdmittedStudentPreview }
  | { status: 'CLAIMED' }
  | { status: 'NOT_FOUND' }

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — companions
// ─────────────────────────────────────────────────────────────────────────────

export const companionInput = z.strictObject({
  relationship: companionRelationship,
  name: personName,
})
export type CompanionInput = z.infer<typeof companionInput>

/**
 * The hard ceiling on companions per pass.
 *
 * `SystemConfig.maxCompanions` is the operator's setting and may be lower, but it
 * cannot be higher — `settingsUpdateRequest` caps it at this number, the schema
 * caps the array at this number, and `Prisma.SystemConfig.maxCompanions` defaults
 * to it. Every public page that promises a seat count reads this rather than
 * writing the digit into a sentence, because a marketing page that says "one
 * guest" while the gate admits two is the kind of drift a family discovers at the
 * gate.
 */
export const MAX_COMPANIONS = 2

/**
 * Up to two companions (`SystemConfig.maxCompanions`), or none for "Coming
 * Alone".
 *
 * An empty array *is* "coming alone" — there is no separate boolean, because two
 * fields that encode one fact drift, and the one that drifts is the one the pass
 * prints. The draft schema is where a half-answered step 2 lives.
 *
 * Duplicate FATHER or MOTHER is refused; duplicate GUARDIAN is not. Two people
 * can both be a student's guardian. Nobody has two fathers attending under that
 * label, so a second FATHER row is a mis-click that would print twice on a pass.
 */
export const companionsInput = z
  .array(companionInput)
  .max(MAX_COMPANIONS, { error: `A pass admits at most ${String(MAX_COMPANIONS)} guests.` })
  .refine(
    (list) => {
      for (const relationship of ['FATHER', 'MOTHER'] as const) {
        if (list.filter((c) => c.relationship === relationship).length > 1) return false
      }
      return true
    },
    { error: 'Pick each of Father and Mother at most once.' },
  )

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — the selfie
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cap on the decoded image, before Cloudinary's transformation shrinks it.
 *
 * The capture component produces roughly 200–500 KB of JPEG at 1600px, so 6 MB
 * is generous by an order of magnitude and still small enough that a malicious
 * body is rejected by a length check rather than by an out-of-memory.
 */
export const SELFIE_MAX_BYTES = 6 * 1024 * 1024

export const SELFIE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/**
 * A capture from the live camera, as a data URL.
 *
 * A data URL rather than `multipart/form-data` with a `File`, and that is the
 * point: D3 requires the selfie to be taken at registration, not chosen from a
 * gallery. There is no file input anywhere in the wizard, so there is nothing to
 * point at an existing photo — the only producer of this field is a canvas the
 * capture component drew a video frame into.
 *
 * The base64 length check runs before decoding. Decoding first to find out the
 * image is 40 MB is how a handful of requests exhaust a container's memory.
 */
export const selfieDataUrl = z
  .string({ error: 'Take a selfie to continue.' })
  .refine((value) => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value), {
    error: 'That is not an image captured by the camera. Retake the selfie.',
  })
  .refine(
    (value) => {
      const body = value.slice(value.indexOf(',') + 1)
      // 4 base64 characters per 3 bytes; close enough for a size gate.
      return (body.length * 3) / 4 <= SELFIE_MAX_BYTES
    },
    { error: 'That image is too large. Retake the selfie.' },
  )

export const selfieInput = z.strictObject({
  image: selfieDataUrl,
  /**
   * What the in-browser detector saw. Advisory only — D4 is explicit that a
   * missing face warns the student and sorts the moderation queue, and never
   * refuses a submission. A detector that blocks registration on a low-end phone
   * in bad light is a detector that stops a real student from attending.
   */
  faceDetected: z.boolean(),
})
export type SelfieInput = z.infer<typeof selfieInput>

/** PUT /api/registration/selfie — a retake, after a moderator asked for one. */
export const selfieReplaceRequest = selfieInput
export type SelfieReplaceRequest = z.infer<typeof selfieReplaceRequest>

export interface SelfieReplaceResponse {
  status: RegistrationStatus
  selfieUploadedAt: string
  /** Freshly signed, ~60 seconds. Not stored anywhere. */
  selfieUrl: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The wizard payload as it stands mid-flow. Every field optional, because a
 * draft is by definition incomplete and a save that rejects half-filled input is
 * a save that loses the student's work.
 *
 * The selfie is absent and must stay absent. An image is sensitive personal data
 * under the DPDP Act, and the student has not consented at step 3 — consent is
 * step 4. Until then the capture lives in browser memory, which is also why
 * `lib/register.ts` keeps it out of `localStorage`.
 */
export const draftData = z.strictObject({
  formNumber: formNumber.optional(),
  name: personName.optional(),
  program: z.string().max(200).optional(),
  contactNo: phone10.optional(),
  companions: companionsInput.optional(),
  faceDetected: z.boolean().optional(),
})
export type DraftData = z.infer<typeof draftData>

export const draftSaveRequest = z.strictObject({
  /** Furthest step reached, 0-indexed, so the student resumes in place. */
  step: z.number().int().min(0).max(3),
  data: draftData,
})
export type DraftSaveRequest = z.infer<typeof draftSaveRequest>

export interface DraftResponse {
  step: number
  data: DraftData
  updatedAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — consent and submit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One request creates the registration, uploads the selfie, and records consent.
 *
 * The selfie travels *with* the submit rather than in an earlier step because
 * consent is step 4. Uploading at step 3 would put a student's face in cloud
 * storage before they agreed to it, which is the specific thing the DPDP Act's
 * consent requirement is about. The cost is that a Cloudinary failure fails the
 * whole submit; the handler tries the fallback credential chain first, and a
 * retake is a better outcome than a stored image nobody consented to.
 *
 * `consentVersion` is echoed by the client and checked against
 * `SystemConfig.consentVersion`. A mismatch is refused, not coerced: the student
 * read older wording, and recording agreement to text they never saw is worse
 * than making them read the current text.
 */
export const submitRequest = z.strictObject({
  formNumber,
  /**
   * Confirmed by the student, seeded from the roster. Accepted rather than read
   * from the sheet because sheets misspell names, and the name on the pass has
   * to be the one the student will answer to at the gate. Divergence from the
   * roster is surfaced in the moderation queue.
   */
  name: personName,
  contactNo: phone10,
  companions: companionsInput,
  selfie: selfieInput,
  consentVersion: z
    .string()
    .min(1)
    .max(40),
  consentAccepted: z.literal(true, {
    error: 'You have to accept the consent notice to register.',
  }),
})
export type SubmitRequest = z.infer<typeof submitRequest>

export interface SubmitResponse {
  registrationId: string
  reference: string
  status: RegistrationStatus
  /** Present when the system auto-approved and issued a pass immediately. */
  pass: PassSummary | null
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/registration/me
// ─────────────────────────────────────────────────────────────────────────────

export interface PassSummary {
  code10: string
  /** `XXX-XXX-XXXX`, ready to print. */
  code10Formatted: string
  /** The exact string in the QR and the barcode, signature included. */
  qrPayload: string
  status: PassStatus
  guestCount: number
  issuedAt: string
  /** Null until the student walks through the gate. */
  checkedInAt: string | null
  revokedReason: string | null
}

export interface CompanionSummary {
  relationship: CompanionRelationship
  name: string
  position: number
}

/**
 * Everything the student portal needs in one read.
 *
 * `reviewNote` is the only moderation field here. `reviewedById`, timings and
 * internal notes stay on the admin side — a student needs to know what to fix,
 * not who decided it.
 */
export interface MeResponse {
  registration: {
    id: string
    reference: string
    status: RegistrationStatus
    name: string
    program: string
    contactNo: string
    submittedAt: string
    reviewNote: string | null
    revisionCount: number
    hasSelfie: boolean
    faceDetected: boolean | null
  } | null
  companions: CompanionSummary[]
  pass: PassSummary | null
  /** Whether a half-finished wizard is waiting. */
  draftStep: number | null
  registrationOpen: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Help desk
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a volunteer at the help desk types to find a student's registration.
 *
 * Either identifier alone is enough, so this is a union rather than an object
 * with two optional fields — the latter accepts `{}`, and a search with no term
 * is a full table scan.
 */
export const helpDeskQuery = z.union([
  z.strictObject({ by: z.literal('formNumber'), value: formNumber }),
  z.strictObject({ by: z.literal('code10'), value: code10 }),
  z.strictObject({ by: z.literal('reference'), value: z.string().trim().min(6).max(20) }),
])
export type HelpDeskQuery = z.infer<typeof helpDeskQuery>

export { registrationStatus }
