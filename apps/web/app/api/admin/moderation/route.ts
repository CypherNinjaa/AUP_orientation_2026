/**
 * GET /api/admin/moderation — the selfie review queue.
 *
 * A GET that writes: one `SELFIE_VIEWED` audit entry per item returned. That is
 * unusual and it is correct — fetching this list is the act of viewing those faces,
 * and an audit trail that only recorded the single-image endpoint would miss the way
 * moderators actually look at them.
 *
 * `no-store` for the same reason the selfie paths expire in a minute: nothing about
 * this response may sit in a shared cache.
 */
import { moderationQueueQuery, type ModerationQueueQuery } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, readQuery, userAgent } from '@/lib/server/http'
import { listModerationQueue } from '@/lib/server/admin/moderation'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const query = readQuery<ModerationQueueQuery>(request, moderationQueueQuery)

    const page = await listModerationQueue(query, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(page, { headers: { 'cache-control': 'no-store' } })
  })
}
