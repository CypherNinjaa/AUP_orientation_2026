/**
 * GET /api/admin/scans/student/[id] — read all scan history for a specific student pass.
 */
import { requireActor } from '@/lib/server/auth'
import { handle, ok } from '@/lib/server/http'
import { getStudentScanHistory } from '@/lib/server/admin/scans'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, segment: Params): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')
    const { id } = await segment.params

    const scans = await getStudentScanHistory(id)
    return ok(scans, { headers: { 'cache-control': 'no-store' } })
  })
}
