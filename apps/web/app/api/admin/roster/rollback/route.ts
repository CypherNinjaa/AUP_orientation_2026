/**
 * POST /api/admin/roster/rollback — undo the most recent committed import.
 *
 * Under the same lock as `/commit`: a rollback that interleaves with an import
 * would restore snapshot values on top of rows the import is still writing.
 */
import { rosterRollbackRequest, type RosterRollbackRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, fail, handle, ok, readJson, userAgent } from '@/lib/server/http'
import { withLock } from '@/lib/server/redis'
import { rollbackImport } from '@/lib/server/admin/roster-rollback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const body = await readJson<RosterRollbackRequest>(request, rosterRollbackRequest)

    const meta = { ip: clientIp(request), userAgent: userAgent(request) }

    const result = await withLock('roster:commit', 300_000, () => rollbackImport(body, actor, meta))

    if (result === undefined) {
      return fail('CONFLICT', 'A roster import is running. Wait for it to finish and try again.')
    }

    return ok(result)
  })
}
