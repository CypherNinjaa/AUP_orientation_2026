/**
 * GET/POST /api/admin/broadcast — the announcement system.
 *
 * GET returns the console's history. POST sends. `DELETE` is not offered; retracting
 * is a POST to `[id]`, because a broadcast that went to thousands of phones happened,
 * and the record of it is the answer to "who told them to move?".
 */
import { broadcastRequest, type BroadcastRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, fail, handle, ok, rateLimited, readJson, userAgent } from '@/lib/server/http'
import { listAllBroadcasts, sendBroadcast } from '@/lib/server/admin/broadcast'
import { rateLimit } from '@/lib/server/redis'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')
    return ok(await listAllBroadcasts(), { headers: { 'cache-control': 'no-store' } })
  })
}

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')

    // Twenty an hour. A control room sending more than that is not communicating,
    // it is spamming 15,000 lock screens, and the rate limit is the only thing
    // standing between a stuck finger and that outcome.
    const limit = await rateLimit(`broadcast:${actor.id}`, 20, 3600)
    if (!limit.ok) return rateLimited(limit)

    const body = await readJson<BroadcastRequest>(request, broadcastRequest)

    const result = await sendBroadcast(body, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result, { status: 201, headers: { 'cache-control': 'no-store' } })
  })
}

/** Anything else on this path is a mistake worth naming rather than a 404. */
export async function DELETE(): Promise<Response> {
  return fail(
    'VALIDATION_FAILED',
    'Broadcasts are not deleted. Retract one with POST /api/admin/broadcast/{id}/retract.',
  )
}
