/**
 * The client's side of the API boundary.
 *
 * Every screen in the student portal, the admin console and the scanner talks to
 * the server through this file. It exists because the alternative — `fetch` at
 * each call site — reproduces the same four mistakes in twenty places: forgetting
 * that a non-2xx response still has a JSON body worth reading, forgetting that a
 * dropped connection throws rather than returning a status, forgetting
 * `credentials` on a cross-origin preview URL, and treating a 429's `retryAfter`
 * as a number when it arrived as a string.
 *
 * ## Nothing here throws
 *
 * Every function returns a discriminated `ApiResult`. A network failure, a 500 and
 * a validation error all arrive the same way, so a component renders one error
 * path rather than wrapping a call in `try`/`catch` and hoping. That is a
 * deliberate departure from the server-side convention in `lib/server/http.ts`,
 * where `abort` throws: on the server an unhandled failure should become a 500,
 * and in a component it should become a sentence on the screen.
 *
 * ## The error shape is the server's, verbatim
 *
 * `ApiError` from `@orientation/contracts` is what route handlers return, so
 * branching on `error.code` in a component is branching on the same string the
 * handler wrote. When the response is not JSON at all — a proxy's HTML 502 page, a
 * captive portal, a truncated body — this file synthesises an `ApiError` with the
 * nearest code, so the shape holds even when the server never spoke.
 */
import type { ApiError, ApiErrorCode } from '@orientation/contracts'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

/**
 * A failure that never reached the server, or reached it and got something that
 * was not JSON. `status` is 0 when the request itself failed.
 */
export interface TransportFailure {
  status: number
  error: ApiError
}

/** Milliseconds before a request is abandoned. */
const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Longer, for the two endpoints that do real work.
 *
 * A roster preview parses a 15,000-row workbook and an export writes one; both
 * regularly take more than fifteen seconds and neither is retryable, so timing
 * them out at the default would turn a working feature into an intermittent one.
 */
const SLOW_TIMEOUT_MS = 120_000
const SLOW_PATHS = ['/api/admin/roster/preview', '/api/admin/roster/commit', '/api/admin/export']

export interface RequestOptions {
  /** Passed through to `fetch`, so a caller can cancel or add a signal of its own. */
  signal?: AbortSignal
  /** Overrides the default timeout. */
  timeoutMs?: number
  /** Extra headers. `content-type` is set automatically for a JSON body. */
  headers?: Record<string, string>
}

function transportError(code: ApiErrorCode, message: string): ApiError {
  return { code, message }
}

/**
 * Turn whatever came back into an `ApiError`.
 *
 * A route handler returns the shape directly, so the common case is a cast. The
 * uncommon cases are the ones that matter: a Next.js error page (HTML), a
 * platform 502 (HTML), a captive portal (HTML with a 200), and an empty body on a
 * 204. None of those should surface as "undefined is not an object".
 */
async function readError(response: Response): Promise<ApiError> {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    try {
      const body = (await response.json()) as Partial<ApiError> | null
      if (body && typeof body.code === 'string' && typeof body.message === 'string') {
        return body as ApiError
      }
    } catch {
      // Fall through to the status-derived message below.
    }
  }

  // No usable body. Derive the least misleading code from the status: a 503 with
  // an HTML body from a load balancer means the same thing to a component as a
  // 503 the app produced.
  if (response.status === 401) return transportError('UNAUTHENTICATED', 'Your session has expired. Sign in again.')
  if (response.status === 403) return transportError('FORBIDDEN', 'You do not have access to that.')
  if (response.status === 404) return transportError('NOT_FOUND', 'That is not here.')
  if (response.status === 413) return transportError('PAYLOAD_TOO_LARGE', 'That file is too large.')
  if (response.status === 429) return transportError('RATE_LIMITED', 'Too many attempts. Wait a moment and try again.')
  if (response.status >= 500) {
    return transportError('SERVER_ERROR', 'Something broke on our side. Try again in a moment.')
  }
  return transportError('SERVER_ERROR', `The server answered ${String(response.status)}.`)
}

/**
 * Combine the caller's signal with a timeout.
 *
 * `AbortSignal.any` is the correct primitive and is available in every browser
 * this app supports, but it is new enough to be missing from older WebViews — and
 * a volunteer's device is exactly where an old WebView turns up. The fallback
 * wires the two together by hand rather than dropping the timeout.
 */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal
  done: () => void
} {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), timeoutMs)

  const onAbort = (): void => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

function timeoutFor(path: string, override: number | undefined): number {
  if (override !== undefined) return override
  return SLOW_PATHS.some((slow) => path.startsWith(slow)) ? SLOW_TIMEOUT_MS : DEFAULT_TIMEOUT_MS
}

/**
 * One request. The primitive every other function here is built on.
 *
 * `body` is a `FormData` for the roster upload and a plain object everywhere
 * else. `FormData` must not get a `content-type` header — the browser has to set
 * the multipart boundary itself — which is the one branch in this function.
 */
async function request<T>(
  method: string,
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers }
  if (body !== undefined && !isForm) headers['content-type'] = 'application/json'

  const { signal, done } = withTimeout(options.signal, timeoutFor(path, options.timeoutMs))

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal,
      // The session cookie. Same-origin in production; explicit because the
      // preview server and the app can differ in origin during development.
      credentials: 'same-origin',
      // Never a cached read. Every endpoint here is either live state or a
      // mutation, and a `no-store` GET that a browser answers from cache is the
      // hardest class of bug to see in a dashboard.
      cache: 'no-store',
    })
  } catch (cause) {
    done()
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      // Distinguish "the component unmounted" from "the network is gone". Only
      // the second is worth showing.
      if (options.signal?.aborted) {
        return { ok: false, error: transportError('SERVICE_UNAVAILABLE', 'Cancelled.') }
      }
      return {
        ok: false,
        error: transportError('SERVICE_UNAVAILABLE', 'That took too long. Check your connection and try again.'),
      }
    }
    return {
      ok: false,
      error: transportError('SERVICE_UNAVAILABLE', 'No connection. This will work again when you are back online.'),
    }
  }
  done()

  if (!response.ok) return { ok: false, error: await readError(response) }

  // 204 and 205 have no body by definition. Returning `undefined as T` is honest:
  // the caller's type parameter for such an endpoint is `void`.
  if (response.status === 204 || response.status === 205) return { ok: true, data: undefined as T }

  try {
    return { ok: true, data: (await response.json()) as T }
  } catch {
    return { ok: false, error: transportError('SERVER_ERROR', 'The server sent something unreadable.') }
  }
}

/** GET. `query` values that are `undefined` or `null` are dropped, not sent as "undefined". */
export function apiGet<T>(
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>,
  options?: RequestOptions,
): Promise<ApiResult<T>> {
  return request<T>('GET', query ? path + queryString(query) : path, undefined, options)
}

export function apiPost<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>> {
  return request<T>('POST', path, body ?? {}, options)
}

export function apiPatch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>> {
  return request<T>('PATCH', path, body ?? {}, options)
}

export function apiPut<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>> {
  return request<T>('PUT', path, body ?? {}, options)
}

export function apiDelete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>> {
  return request<T>('DELETE', path, body, options)
}

/**
 * `?a=1&b=two`, or `''` when nothing survives.
 *
 * Dropping `undefined` matters more than it looks: the admin list filters are all
 * optional and every one of them is `undefined` until the operator sets it. Sent
 * literally, `status=undefined` fails the Zod enum and the table shows a
 * validation error instead of the unfiltered list.
 */
export function queryString(query: Record<string, string | number | boolean | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}

/**
 * A sentence for a field, from an error that may or may not have one.
 *
 * The wizard and every admin form call this instead of reaching into
 * `error.fields` directly, because `fields` is optional and the nested paths Zod
 * produces (`companions.0.name`) are not what a form control is keyed by.
 */
export function fieldError(error: ApiError | null, field: string): string | undefined {
  if (!error?.fields) return undefined
  return error.fields[field] ?? error.fields[`${field}.0`]
}

/** True for the failures where retrying the same request could plausibly work. */
export function isRetryable(error: ApiError): boolean {
  return (
    error.code === 'SERVICE_UNAVAILABLE' ||
    error.code === 'SERVER_ERROR' ||
    error.code === 'RATE_LIMITED' ||
    error.code === 'UPLOAD_FAILED'
  )
}
