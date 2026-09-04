/**
 * POST /api/scanner/sync — drain a device's outbox.
 *
 * The endpoint the whole offline design converges on. A device posts up to 200 queued
 * scans; the server re-decides every one against live data and answers with a verdict
 * per event, keyed by the device's own `clientEventId` so a retry is free.
 *
 * ## Why the rate limit is generous
 *
 * Ten devices draining a twenty-minute backlog after an outage is a burst, and it is
 * exactly the moment the system must not push back — every rejected batch is a queue
 * that stays queued while the crowd keeps arriving. The cap is here to stop a runaway
 * client, not to shape normal traffic, and it is set per device rather than per
 * volunteer because devices are shared across shifts.
 */
import { syncRequest, type SyncRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, rateLimited, readJson, userAgent } from '@/lib/server/http'
import { syncScans } from '@/lib/server/scanner/sync'
import { rateLimit } from '@/lib/server/redis'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Larger than the 8 MB default would suggest is needed, and smaller than the contract
 * technically permits: 200 events × a 400-character raw code is well under a megabyte.
 * The body limit in `readJson` covers it without a special case.
 */
export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'VOLUNTEER')

    const body = await readJson<SyncRequest>(request, syncRequest)

    // Per device, 240 an hour: one batch every fifteen seconds sustained. The client
    // flushes on a two-second debounce when online, so this only bites a client stuck
    // in a retry loop — which is the case worth biting.
    const limit = await rateLimit(`sync:${body.deviceId}`, 240, 3600)
    if (!limit.ok) return rateLimited(limit)

    const result = await syncScans(body, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result, { headers: { 'cache-control': 'no-store, private' } })
  })
}
