/**
 * GET /api/admin/registrations/[id]/detail — comprehensive student dossier & pass inspector.
 */
import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, userAgent } from '@/lib/server/http'
import { getRegistrationDetail } from '@/lib/server/admin/registrations'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const { id } = await context.params

    const result = await getRegistrationDetail(id, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result, { headers: { 'cache-control': 'no-store' } })
  })
}
