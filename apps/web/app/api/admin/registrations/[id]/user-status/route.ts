/**
 * POST /api/admin/registrations/[id]/user-status — ban or unban a student user account.
 */
import { userStatusRequest, type UserStatusRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, rateLimited, readJson, userAgent } from '@/lib/server/http'
import { rateLimit } from '@/lib/server/redis'
import { setUserActiveStatus } from '@/lib/server/admin/registrations'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const { id } = await context.params

    const limit = await rateLimit(`user-status:${actor.id}`, 300, 3600)
    if (!limit.ok) return rateLimited(limit)

    const body = await readJson<UserStatusRequest>(request, userStatusRequest)

    const result = await setUserActiveStatus(id, body, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result)
  })
}
