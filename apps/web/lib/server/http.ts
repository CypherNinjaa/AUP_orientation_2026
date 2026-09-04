/**
 * The shape of every response this app sends, and the one place errors become
 * status codes.
 *
 * ## Why a wrapper at all
 *
 * Route handlers written by hand drift. One returns `{ error: 'not found' }` with
 * a 404, the next returns `{ message: 'Not found' }` with a 400, a third throws
 * and Next renders an HTML error page into a `fetch` that was expecting JSON. The
 * client then needs a special case per endpoint. Funnelling through `ok`/`fail`
 * and `handle` means there is exactly one error shape (`ApiError` from
 * `@orientation/contracts`) and one place that maps a code to a status.
 *
 * ## Errors are values, not exceptions — except when they are
 *
 * A handler returns `fail('NOT_FOUND', …)` for an outcome it expected. For
 * anything it did not expect, `handle` catches, logs with a correlation id, and
 * returns a 500 whose body contains that id and nothing else. A stack trace or a
 * Prisma error message in a response body tells an attacker the table names.
 *
 * ## Prisma error translation
 *
 * `P2002` (unique violation) becomes 409 rather than 500, because it is how this
 * system is *designed* to detect a double check-in and a duplicate claim. A
 * generic 500 there would turn the intended concurrency control into an incident.
 */
import 'server-only'

import { Prisma } from '@orientation/db'
import {
  ERROR_STATUS,
  parseInput,
  type ApiError,
  type ApiErrorCode,
} from '@orientation/contracts'

import { isProduction } from './env'
import type { RateLimitResult } from './redis'

/** Headers on every JSON response. */
const JSON_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  /**
   * Nothing this API returns is cacheable by a shared cache. Several endpoints
   * return one student's own data keyed only by their session cookie, and a CDN
   * that cached `/api/registration/me` for sixty seconds would serve one
   * student's registration to the next visitor.
   */
  'cache-control': 'no-store, no-cache, must-revalidate',
  'x-content-type-options': 'nosniff',
}

export function ok<T>(body: T, init?: { status?: number; headers?: Record<string, string> }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { ...JSON_HEADERS, ...init?.headers },
  })
}

/** 204. For a `DELETE` or an action whose result the caller already knows. */
export function noContent(): Response {
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
}

export function fail(
  code: ApiErrorCode,
  message: string,
  extra?: { fields?: Record<string, string>; retryAfter?: number; headers?: Record<string, string> },
): Response {
  const body: ApiError = { code, message }
  if (extra?.fields) body.fields = extra.fields
  if (extra?.retryAfter !== undefined) body.retryAfter = extra.retryAfter

  const headers: Record<string, string> = { ...JSON_HEADERS, ...extra?.headers }
  if (extra?.retryAfter !== undefined) headers['retry-after'] = String(extra.retryAfter)

  return new Response(JSON.stringify(body), { status: ERROR_STATUS[code], headers })
}

/**
 * A rate-limit refusal, built from what the limiter returned.
 *
 * `Retry-After` is in seconds and rounded up: a client told to wait 0 seconds
 * retries immediately and gets refused again.
 */
export function rateLimited(result: RateLimitResult): Response {
  const seconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1_000))
  return fail('RATE_LIMITED', `Too many attempts. Try again in ${String(seconds)} seconds.`, {
    retryAfter: seconds,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading a request
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A thrown wrapper around a `Response`.
 *
 * Lets a helper deep in a handler abandon the request with a specific status
 * instead of returning a sentinel that every caller has to remember to check.
 * `handle` unwraps it. Nothing else should catch it.
 */
export class HttpError extends Error {
  readonly response: Response

  constructor(response: Response) {
    super('HttpError')
    this.name = 'HttpError'
    this.response = response
  }
}

export function abort(
  code: ApiErrorCode,
  message: string,
  extra?: { fields?: Record<string, string>; retryAfter?: number },
): never {
  throw new HttpError(fail(code, message, extra))
}

/**
 * The largest JSON body any endpoint accepts.
 *
 * 8 MB, set by the selfie: a 6 MB image is roughly 8 MB once base64-encoded. Every
 * other endpoint needs kilobytes. The check exists because `request.json()` will
 * happily buffer a 500 MB body into memory first and ask questions later.
 */
const MAX_BODY_BYTES = 8 * 1024 * 1024

/**
 * Parse and validate a JSON body in one step.
 *
 * Returns the typed value or aborts with a 400 whose `fields` map is keyed by
 * dotted path, which is exactly what the wizard needs to put a message under the
 * offending input.
 */
export async function readJson<T>(
  request: Request,
  schema: Parameters<typeof parseInput>[0],
): Promise<T> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    abort('UNSUPPORTED_MEDIA_TYPE', 'Send a JSON body with Content-Type: application/json.')
  }

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    abort('PAYLOAD_TOO_LARGE', 'That request is too large.')
  }

  let raw: string
  try {
    raw = await request.text()
  } catch {
    abort('VALIDATION_FAILED', 'The request body could not be read.')
  }

  // `content-length` is a claim; this is the measurement. A chunked request has
  // no length header at all.
  if (raw.length > MAX_BODY_BYTES) {
    abort('PAYLOAD_TOO_LARGE', 'That request is too large.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    abort('VALIDATION_FAILED', 'The request body is not valid JSON.')
  }

  const outcome = parseInput(schema, parsed)
  if (!outcome.ok) {
    abort('VALIDATION_FAILED', outcome.message, { fields: outcome.fields })
  }
  return outcome.data as T
}

/** The same, for a query string. */
export function readQuery<T>(request: Request, schema: Parameters<typeof parseInput>[0]): T {
  const url = new URL(request.url)
  const raw: Record<string, string> = {}
  for (const [key, value] of url.searchParams) raw[key] = value

  const outcome = parseInput(schema, raw)
  if (!outcome.ok) {
    abort('VALIDATION_FAILED', outcome.message, { fields: outcome.fields })
  }
  return outcome.data as T
}

/**
 * The caller's IP, for rate limiting and the audit log.
 *
 * Behind Railway's proxy the socket address is the proxy, so `x-forwarded-for` is
 * the only source — and it is client-controlled, so it can be forged. That is
 * acceptable for what it is used for: rate limiting is a speed bump, and an audit
 * entry records what was claimed. It must never be used for authorisation.
 *
 * The *first* entry is taken, which is the original client in a well-formed chain.
 */
export function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first.slice(0, 45) // an IPv6 address is at most 45 chars
  }
  return request.headers.get('x-real-ip')?.slice(0, 45) ?? undefined
}

export function userAgent(request: Request): string | undefined {
  return request.headers.get('user-agent')?.slice(0, 300) ?? undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// The outer wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a handler, turning anything unexpected into a logged 500.
 *
 * The correlation id is the whole point of the exercise: the student sees
 * "something went wrong, reference 8f2a1c", the operator greps the log for
 * `8f2a1c` and finds the stack. Neither the message nor the stack crosses the
 * network in production.
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof HttpError) return error.response

    const translated = translatePrisma(error)
    if (translated) return translated

    const reference = Math.random().toString(36).slice(2, 8)
    console.error(`[api:${reference}]`, error)

    return fail(
      'SERVER_ERROR',
      isProduction
        ? `Something went wrong on our side. Quote reference ${reference} if you contact the help desk.`
        : `${String((error as Error)?.message ?? error)} (reference ${reference})`,
    )
  }
}

/**
 * Turn the Prisma errors that are part of this system's *design* into their
 * intended status codes.
 *
 * Only the ones that are genuinely expected. Everything else falls through to a
 * 500, because a `P2021` (table does not exist) is a deployment failure and
 * dressing it up as a 409 would hide it.
 */
function translatePrisma(error: unknown): Response | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined

  switch (error.code) {
    case 'P2002':
      // Unique violation. The intended mechanism for a double check-in (D2), a
      // second claim on one form number, and a duplicate `clientEventId`. The
      // message is deliberately generic — the caller knows which resource it was
      // trying to create, and naming the constraint would name the column.
      return fail('CONFLICT', 'That has already been recorded.')

    case 'P2025':
      // "An operation depended on a record that was required but not found."
      return fail('NOT_FOUND', 'That record no longer exists.')

    case 'P2003':
      return fail('CONFLICT', 'That refers to something that no longer exists.')

    case 'P2034':
      // Write conflict / deadlock, retryable. Told to try again rather than
      // presented as a failure, because it usually succeeds on the second go.
      return fail('CONFLICT', 'That collided with another change. Try again.')

    default:
      return undefined
  }
}

/**
 * A CHECK-constraint violation from one of the 19 named guards in the migrations.
 *
 * These are assertions about data that the API is also supposed to enforce, so one
 * firing means the API let something through — a bug on this side, not the
 * caller's. Surfaced as a 500 with the constraint name in the log so it is
 * findable, never as a 400 that blames the student.
 */
export function isCheckConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    error.message.includes('violates check constraint')
  )
}
