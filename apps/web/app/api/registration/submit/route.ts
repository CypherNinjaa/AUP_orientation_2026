/**
 * POST /api/registration/submit — step 4, and the only write that creates a pass.
 *
 * The body carries the selfie, so this is the one endpoint that regularly receives
 * megabytes. `readJson` caps it at 8 MB and the contract caps the decoded image at
 * 6 MB; both checks run before anything is decoded.
 *
 * Rate limited at 5 per hour per user. A student submits once. Five allows for a
 * genuine retry after a failed upload and a couple of validation rejections, and
 * refuses a loop that would upload to Cloudinary on every iteration.
 */
import { submitRequest, type SubmitRequest } from '@orientation/contracts'

import { getActor } from '@/lib/server/auth'
import { getConfig, registrationClosedMessage, registrationWindow } from '@/lib/server/config'
import { clientIp, fail, handle, ok, rateLimited, readJson, userAgent } from '@/lib/server/http'
import { rateLimit } from '@/lib/server/redis'
import { submitRegistration } from '@/lib/server/registration'
import { buildStudentSessionCookieHeader } from '@/lib/server/student-session'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await getActor()
    const ip = clientIp(request) ?? '127.0.0.1'

    const config = await getConfig()
    const window = registrationWindow(config)
    if (!window.open) {
      return fail('REGISTRATION_CLOSED', registrationClosedMessage(window))
    }

    const limitKey = actor ? `submit:${actor.id}` : `submit:ip:${ip}`
    const limit = await rateLimit(limitKey, 5, 3600)
    if (!limit.ok) return rateLimited(limit)

    const body = await readJson<SubmitRequest>(request, submitRequest)

    const result = await submitRegistration(actor, body, {
      ip,
      userAgent: userAgent(request),
    })

    const headers = result.sessionToken
      ? { 'set-cookie': buildStudentSessionCookieHeader(result.sessionToken) }
      : undefined

    return ok(result, { status: 201, headers })
  })
}
