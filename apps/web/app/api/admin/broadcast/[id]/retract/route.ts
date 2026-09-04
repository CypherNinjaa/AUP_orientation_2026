/**
 * POST /api/admin/broadcast/[id]/retract — stop showing a broadcast.
 *
 * Sets `expiresAt` to now rather than deleting the row. The message was delivered;
 * unsending it is not a thing that exists, and the row is how anybody later answers
 * "who told them to go to the auditorium at 11:40?".
 */
import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, userAgent } from '@/lib/server/http'
import { retractBroadcast } from '@/lib/server/admin/broadcast'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const { id } = await context.params

    const result = await retractBroadcast(id, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result, { headers: { 'cache-control': 'no-store' } })
  })
}
