/**
 * POST /api/admin/registrations/[id]/qr-life — adjust pass validity lifespan and re-sign envelope.
 */
import { adjustQrLifeRequest, type AdjustQrLifeRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, rateLimited, readJson, userAgent } from '@/lib/server/http'
import { rateLimit } from '@/lib/server/redis'
import { adjustPassQrLife } from '@/lib/server/admin/registrations'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const { id } = await context.params

    const limit = await rateLimit(`qr-life:${actor.id}`, 300, 3600)
    if (!limit.ok) return rateLimited(limit)

    const body = await readJson<AdjustQrLifeRequest>(request, adjustQrLifeRequest)

    const result = await adjustPassQrLife(id, body, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result)
  })
}
