/**
 * GET /api/scanner/lookup?code=… — look one pass up, online.
 *
 * The dispute endpoint. A volunteer whose device says "already used" against a student
 * who insists otherwise gets the server's own view plus a sixty-second selfie path.
 *
 * It never admits anybody. The only way a `CheckIn` is written from a device is
 * `POST /api/scanner/sync`, which is idempotent and duplicate-protected; a lookup that
 * could also admit would be a second entry path with neither property.
 */
import { scannerLookupQuery, type ScannerLookupQuery } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, rateLimited, readQuery, userAgent } from '@/lib/server/http'
import { lookupPass } from '@/lib/server/scanner/lookup'
import { rateLimit } from '@/lib/server/redis'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'VOLUNTEER')

    // Two hundred an hour. A volunteer resolving disputes by hand does a handful; two
    // hundred is a script walking the code space, and the audit entry per call means
    // that walk would also be the loudest thing in the log.
    const limit = await rateLimit(`scanner-lookup:${actor.id}`, 200, 3600)
    if (!limit.ok) return rateLimited(limit)

    const query = readQuery<ScannerLookupQuery>(request, scannerLookupQuery)

    const result = await lookupPass(query.code, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result, { headers: { 'cache-control': 'no-store, private' } })
  })
}
