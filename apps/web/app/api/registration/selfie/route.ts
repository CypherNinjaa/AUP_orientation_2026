/**
 * PUT /api/registration/selfie — a retake, after a moderator asked for one.
 *
 * Only valid from `REVISION_REQUESTED`. That restriction is the point of having a
 * separate endpoint rather than letting `submit` be idempotent: a student must not
 * be able to swap the photo on an approved registration, because that is exactly
 * the manoeuvre that would let one person register their own face and have another
 * attend on the pass.
 *
 * No registration-window check. A student asked for a retake at 11 pm on the last
 * day should be able to comply — the window governs *new* registrations, and
 * refusing a requested correction because the window shut would strand the student
 * in a state only an admin can leave.
 */
import { selfieReplaceRequest, type SelfieReplaceRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, rateLimited, readJson, userAgent } from '@/lib/server/http'
import { rateLimit } from '@/lib/server/redis'
import { replaceSelfie } from '@/lib/server/registration'
import { getStudentSessionFromRequest } from '@/lib/server/student-session'

export const dynamic = 'force-dynamic'

export async function PUT(request: Request): Promise<Response> {
  return handle(async () => {
    const session = await getStudentSessionFromRequest(request)
    const actor = session ? null : await requireActor(request)

    const limitKey = session ? `selfie:student:${session.registrationId}` : `selfie:${actor!.id}`
    const limit = await rateLimit(limitKey, 10, 3600)
    if (!limit.ok) return rateLimited(limit)

    const body = await readJson<SelfieReplaceRequest>(request, selfieReplaceRequest)

    const result = await replaceSelfie(
      session ? session.registrationId : actor!,
      { image: body.image, faceDetected: body.faceDetected },
      { ip: clientIp(request), userAgent: userAgent(request) },
    )

    return ok(result)
  })
}
