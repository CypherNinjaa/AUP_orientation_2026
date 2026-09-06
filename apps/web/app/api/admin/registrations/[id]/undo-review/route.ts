/**
 * POST /api/admin/registrations/[id]/undo-review — revert an approved or rejected registration back to pending review.
 */
import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, rateLimited, userAgent } from '@/lib/server/http'
import { rateLimit } from '@/lib/server/redis'
import { undoRegistrationReview } from '@/lib/server/admin/registrations'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const { id } = await context.params

    const limit = await rateLimit(`undo-review:${actor.id}`, 300, 3600)
    if (!limit.ok) return rateLimited(limit)

    const result = await undoRegistrationReview(id, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result)
  })
}
