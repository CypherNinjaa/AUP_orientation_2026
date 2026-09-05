'use client'

/**
 * The student portal's reads.
 *
 * Two endpoints, one file, for the same reason `lib/register.ts` exists: a URL
 * spelled at four call sites is a URL that will be spelled wrong at one of them,
 * and `lib/api.ts` deliberately returns a result rather than throwing, so a screen
 * that wants an error to render needs the call already typed.
 */

import type { MeResponse } from '@orientation/contracts'

import type { PassRenderResponse } from '@/app/api/pass/route'
import { type ApiResult, apiGet } from '@/lib/api'

export type { PassRenderResponse }

/**
 * The rendered pass, symbologies included.
 *
 * Separate from `/api/registration/me` on purpose — see the note on the route. The
 * portal reads `me` on every load and every live event; it reads this once, when
 * there is a pass to draw.
 *
 * Fails with `NOT_FOUND` between submitting and being approved, which is a normal
 * state rather than an error, and the message the route returns is written to be
 * shown to the student as-is.
 */
export function fetchPass(signal?: AbortSignal): Promise<ApiResult<PassRenderResponse>> {
  return apiGet<PassRenderResponse>('/api/pass', undefined, { signal })
}

/** Everything else the portal needs: status, companions, the moderator's note. */
export function fetchMe(signal?: AbortSignal): Promise<ApiResult<MeResponse>> {
  return apiGet<MeResponse>('/api/registration/me', undefined, { signal })
}
