/**
 * GET /api/admin/scans/volunteer/[id] — read volunteer profile, stats & activity history.
 */
import { requireActor } from '@/lib/server/auth'
import { abort, handle, ok } from '@/lib/server/http'
import { getVolunteerActivity } from '@/lib/server/admin/scans'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, segment: Params): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')
    const { id } = await segment.params

    const activity = await getVolunteerActivity(id)
    if (!activity) {
      abort('NOT_FOUND', `No volunteer found with ID "${id}".`)
    }

    return ok(activity, { headers: { 'cache-control': 'no-store' } })
  })
}
