/**
 * POST /api/admin/roster/commit — apply a previewed roster.
 *
 * Under a lock. Two admins committing two different files at the same moment would
 * both read the table, both compute a diff against it, and the second would write
 * updates derived from a state that no longer exists. The lock is named for the
 * operation and not for the file, because that is exactly the collision it prevents.
 */
import { rosterCommitRequest, type RosterCommitRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, fail, handle, ok, readJson, userAgent } from '@/lib/server/http'
import { withLock } from '@/lib/server/redis'
import { commitImport } from '@/lib/server/admin/roster'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** 15,000 individual updates in one transaction is the worst case. */
export const maxDuration = 300

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const body = await readJson<RosterCommitRequest>(request, rosterCommitRequest)

    const meta = { ip: clientIp(request), userAgent: userAgent(request) }

    const result = await withLock('roster:commit', 300_000, () => commitImport(body, actor, meta))

    // `withLock` returns undefined when the lock was held by somebody else. That is
    // not a failure of this request — it is another import in flight — so it gets a
    // sentence naming what to do rather than a 500.
    if (result === undefined) {
      return fail('CONFLICT', 'Another roster import is running. Wait for it to finish and try again.')
    }

    return ok(result, { status: 201 })
  })
}
