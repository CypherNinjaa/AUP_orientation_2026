/**
 * POST /api/admin/registrations/[id]/review — approve, ask for a retake, or reject.
 *
 * The only endpoint besides `submit` that can create a pass, and the only one that
 * can take one away by rejecting. Rate limited generously: a moderator working a
 * queue of 500 photos is a legitimate burst, and the limit is there to catch a
 * runaway script, not a fast human.
 */
import { reviewRequest, type ReviewRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, rateLimited, readJson, userAgent } from '@/lib/server/http'
import { rateLimit } from '@/lib/server/redis'
import { review } from '@/lib/server/admin/registrations'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const { id } = await context.params

    const limit = await rateLimit(`review:${actor.id}`, 600, 3600)
    if (!limit.ok) return rateLimited(limit)

    const body = await readJson<ReviewRequest>(request, reviewRequest)

    const result = await review(id, body, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result)
  })
}
