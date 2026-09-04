/**
 * Primitives every boundary shares.
 *
 * Two rules hold for this whole package:
 *
 *   1. Requests are validated at runtime. A route handler parses its body or
 *      query through one of these schemas and never casts. If a field is not in
 *      a schema it does not reach the database.
 *   2. Responses are plain TypeScript types, not schemas. Validating outbound
 *      data spends CPU proving something the server just constructed, and it
 *      turns a harmless added field into a 500. The types live here anyway so
 *      that the client and the handler cannot drift.
 *
 * Where a value has a canonical form — a phone number, a form number, a name in
 * three kinds of whitespace — the schema *transforms* to it rather than merely
 * accepting it. Normalising at the edge means the rest of the codebase can
 * assume it, and the alternative is discovering that a form number was stored
 * with a trailing space six weeks later at the gate.
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Identifiers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A Prisma `cuid()` id — v1, 25 characters, leading `c`.
 *
 * `z.cuid()` and not `z.cuid2()`: the schema's `@default(cuid())` is cuid v1,
 * and cuid2 validation rejects it. Getting this wrong fails every id in the
 * database, which is the kind of mistake that looks like a database outage.
 */
export const cuid = z.cuid({ error: 'Not a valid id.' })

/**
 * The admissions sheet's `From No.` (sic), as the student types it.
 *
 * Normalisation mirrors `packages/core/roster/parse.ts` exactly — strip every
 * non-digit, then require 4 to 20 digits. It has to mirror it: the student types
 * this into the wizard, and it is matched against a column that was imported
 * through that parser. Two different rules here would produce a lookup that
 * fails for a student whose row imported perfectly.
 *
 * Students copy form numbers off admission letters, so `2 0 3 1 4 5 8 8`,
 * `20314588 `, and `2031-4588` all arrive. All three are the same student.
 */
export const formNumber = z
  .string({ error: 'Enter your form number.' })
  .trim()
  .min(1, { error: 'Enter your form number.' })
  .max(40, { error: 'That is too long to be a form number.' })
  .transform((value) => value.replace(/\D/g, ''))
  .refine((digits) => digits.length >= 4, {
    error: 'A form number has at least 4 digits. Check your admission letter.',
  })
  .refine((digits) => digits.length <= 20, {
    error: 'A form number has at most 20 digits.',
  })

/**
 * A pass's 10-digit gate code, in any format a volunteer might type it.
 *
 * The keypad shows `XXX-XXX-XXXX`, so hyphens and spaces arrive routinely, and a
 * volunteer reading a printed pass under a marquee will produce non-breaking
 * spaces from a copy-paste more often than seems plausible. The leading digit is
 * never 0 — see `generateCode10` — so a 10-digit string starting 0 is a typo,
 * not a pass, and saying so is more useful than NOT_FOUND.
 */
export const code10 = z
  .string({ error: 'Enter the 10-digit code.' })
  .max(24, { error: 'That is too long to be a pass code.' })
  .transform((value) => value.replace(/\D/g, ''))
  .refine((digits) => digits.length === 10, {
    error: 'A pass code is exactly 10 digits.',
  })
  .refine((digits) => !digits.startsWith('0'), {
    error: 'No pass code starts with 0 — check the first digit.',
  })

/** The help-desk reference, e.g. `AUP26-7F3K2Q`. Admits nobody; safe to say aloud. */
export const reference = z
  .string({ error: 'Enter a reference.' })
  .trim()
  .toUpperCase()
  .regex(/^AUP26-[0-9A-HJ-NP-Z]{6}$/, {
    error: 'A reference looks like AUP26-7F3K2Q.',
  })

// ─────────────────────────────────────────────────────────────────────────────
// People
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A person's name as a human typed it.
 *
 * Collapses internal whitespace and strips zero-width characters, which arrive
 * from PDF copy-paste and are invisible in every UI — including the one an admin
 * would use to work out why two names that look identical are not equal.
 *
 * Deliberately permissive about *content*: no alphabetic-only rule, because
 * Indian names legitimately contain `.`, `'`, `-`, and `/`, and a name filter
 * that rejects a real student at the last step of a registration is worse than
 * one that lets an odd string through to a human moderator.
 */
export const personName = z
  .string({ error: 'Enter a name.' })
  // The zero-width range is written as escapes on purpose. Pasting the literal
  // characters into a character class would make this line's own contents
  // invisible in an editor, which is the exact failure it exists to prevent.
  .transform((value) => value.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim())
  .refine((value) => value.length >= 2, { error: 'A name needs at least 2 characters.' })
  .refine((value) => value.length <= 120, { error: 'That name is too long.' })
  .refine((value) => /\p{L}/u.test(value), { error: 'A name needs at least one letter.' })

/**
 * An Indian mobile number, normalised to the bare 10 digits the roster stores.
 *
 * Accepts `+91`, `0091`, a leading `0`, and any arrangement of spaces or
 * hyphens, because all of those are on the admission letters and in the sheet.
 * Rejects a first digit below 6: Indian mobile numbers start 6–9, and a 10-digit
 * string starting 2 is a landline the student will not receive an SMS on.
 */
export const phone10 = z
  .string({ error: 'Enter a mobile number.' })
  .max(24, { error: 'That is too long to be a phone number.' })
  .transform((value) => {
    let digits = value.replace(/\D/g, '')
    // Peel the international access prefix, then the trunk prefix, then the
    // country code — each only when the result is exactly ten digits. The length
    // guard is the safety: Indian mobiles start 6–9, so `9198765432` is itself a
    // plausible number and an unguarded `91` strip would mangle it.
    if (digits.length === 14 && digits.startsWith('00')) digits = digits.slice(2)
    if (digits.length === 13 && digits.startsWith('0')) digits = digits.slice(1)
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
    return digits
  })
  .refine((digits) => digits.length === 10, {
    error: 'An Indian mobile number is 10 digits.',
  })
  .refine((digits) => /^[6-9]/.test(digits), {
    error: 'An Indian mobile number starts with 6, 7, 8 or 9.',
  })

// ─────────────────────────────────────────────────────────────────────────────
// Enums, mirrored from the Prisma schema
// ─────────────────────────────────────────────────────────────────────────────

// Written out rather than imported from `@orientation/db`. Contracts are
// imported by client components; `@orientation/db` pulls in the Prisma runtime,
// and one stray `import type` that a bundler fails to erase would put it in a
// browser bundle. The `satisfies` checks in `apps/web/lib/server` catch drift.

export const registrationStatus = z.enum([
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REVISION_REQUESTED',
  'REJECTED',
])
export type RegistrationStatus = z.infer<typeof registrationStatus>

export const companionRelationship = z.enum(['FATHER', 'MOTHER', 'GUARDIAN'])
export type CompanionRelationship = z.infer<typeof companionRelationship>

export const passStatus = z.enum(['ACTIVE', 'REVOKED'])
export type PassStatus = z.infer<typeof passStatus>

export const scanMethod = z.enum(['QR', 'BARCODE', 'MANUAL_CODE'])
export type ScanMethod = z.infer<typeof scanMethod>

/**
 * All eight values the `ScanOutcome` column can hold — the full Prisma enum, not
 * the subset a device can produce.
 *
 * `packages/core/scan/decide.ts` has its own seven-member union: everything here
 * except `NOT_FOUND`, which only a server with the live table can reach. A device
 * says `STALE_MANIFEST` ("I do not know") where the server says `NOT_FOUND`
 * ("there is no such pass"), and both have to be storable because a `ScanEvent`
 * records the device's verdict alongside the server's.
 *
 * This list must stay identical to the database enum. A `groupBy` on the column
 * is typed by it, so a missing member here is a type error at the admin stats
 * query rather than a silently dropped bar on a chart.
 */
export const scanOutcome = z.enum([
  'ADMITTED',
  'DUPLICATE',
  'INVALID',
  'REVOKED',
  'NOT_APPROVED',
  'OUT_OF_WINDOW',
  'STALE_MANIFEST',
  'NOT_FOUND',
])
export type ScanOutcome = z.infer<typeof scanOutcome>

export const broadcastPriority = z.enum(['INFO', 'WARNING', 'EMERGENCY'])
export type BroadcastPriority = z.infer<typeof broadcastPriority>

export const broadcastAudience = z.enum(['STUDENTS', 'VOLUNTEERS', 'ALL'])
export type BroadcastAudience = z.infer<typeof broadcastAudience>

export const role = z.enum(['STUDENT', 'VOLUNTEER', 'ADMIN'])
export type Role = z.infer<typeof role>

// ─────────────────────────────────────────────────────────────────────────────
// Paging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cursor paging for the admin lists.
 *
 * Cursor and not offset: the roster is 15,000 rows and the registration list
 * grows while an admin is reading it, so `OFFSET 200` silently skips or repeats
 * rows between page loads. `limit` is capped at 100 because the cap is the only
 * thing standing between one query string and a 15,000-row JSON response.
 */
export const pageQuery = z.object({
  cursor: cuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
export type PageQuery = z.infer<typeof pageQuery>

export interface Page<T> {
  items: T[]
  /** Pass back as `cursor`. Null when this is the last page. */
  nextCursor: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The shape of every non-2xx response in the app.
 *
 * `code` is for the client to branch on, `message` is shown to a human, and
 * `fields` maps a form field to the first thing wrong with it so the wizard can
 * highlight step 2 without re-implementing the validation.
 */
export interface ApiError {
  code: ApiErrorCode
  message: string
  fields?: Record<string, string>
  /** Present on 429. Seconds until the caller may retry. */
  retryAfter?: number
}

export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'REGISTRATION_CLOSED',
  'ALREADY_CLAIMED',
  'ALREADY_SUBMITTED',
  'CONSENT_VERSION_MISMATCH',
  'UPLOAD_FAILED',
  'STORAGE_EXHAUSTED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'SERVER_ERROR',
  'SERVICE_UNAVAILABLE',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

/** HTTP status for each code, so a handler never has to remember one. */
export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  REGISTRATION_CLOSED: 403,
  ALREADY_CLAIMED: 409,
  ALREADY_SUBMITTED: 409,
  CONSENT_VERSION_MISMATCH: 409,
  UPLOAD_FAILED: 502,
  STORAGE_EXHAUSTED: 507,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing helper
// ─────────────────────────────────────────────────────────────────────────────

export type ParseOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fields: Record<string, string> }

/**
 * Parse untrusted input into the `ApiError` shape in one step.
 *
 * Route handlers call this instead of `schema.parse`, because a thrown ZodError
 * becomes a 500 unless every handler remembers to catch it — and the one that
 * forgets is the one a student hits. `fields` takes the *first* issue per path:
 * a form field with three simultaneous complaints is a form field the student
 * will fix one at a time anyway.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): ParseOutcome<z.infer<S>> {
  const result = schema.safeParse(input)
  if (result.success) return { ok: true, data: result.data }

  const fields: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const path = issue.path.map((segment) => String(segment)).join('.')
    const key = path === '' ? '_' : path
    if (fields[key] === undefined) fields[key] = issue.message
  }

  const first = result.error.issues[0]
  return {
    ok: false,
    message: first?.message ?? 'That input could not be read.',
    fields,
  }
}
