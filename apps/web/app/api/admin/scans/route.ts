/**
 * GET /api/admin/scans — read the live scan history.
 *
 * Backs the Admin "Scan History" console. Returns paginated, searchable
 * scan history joining student info, volunteer info, gates, and outcomes,
 * along with live statistics.
 */
import { scanHistoryQuery, type ScanHistoryQuery } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { handle, ok, readQuery } from '@/lib/server/http'
import { listScanHistory } from '@/lib/server/admin/scans'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')
    const query = readQuery<ScanHistoryQuery>(request, scanHistoryQuery)

    const result = await listScanHistory(query)
    return ok(result, { headers: { 'cache-control': 'no-store' } })
  })
}
