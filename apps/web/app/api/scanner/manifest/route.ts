/**
 * GET /api/scanner/manifest — download the offline snapshot.
 *
 * The most important read in the system. A volunteer device calls this once on shift
 * start and then every five minutes; after the first call the gate works whether or not
 * this endpoint is reachable.
 */
import { manifestQuery, type ManifestQuery } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, rateLimited, readQuery, userAgent } from '@/lib/server/http'
import { buildManifest } from '@/lib/server/scanner/manifest'
import { rateLimit } from '@/lib/server/redis'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'VOLUNTEER')

    // Sixty an hour per volunteer. The client polls every five minutes (twelve an hour)
    // and refetches on a `manifest.stale` push, so sixty leaves room for a device that
    // is being restarted repeatedly while staying well under "one phone accidentally
    // pulling 2 MB in a loop and saturating venue wifi for everyone else".
    const limit = await rateLimit(`manifest:${actor.id}`, 60, 3600)
    if (!limit.ok) return rateLimited(limit)

    const query = readQuery<ManifestQuery>(request, manifestQuery)

    // The gate is a header rather than a query parameter so it does not participate in
    // the delta cache key the client builds from `since`/`version`.
    const gateCode = request.headers.get('x-gate-code')?.trim() ?? 'MAIN'

    const manifest = await buildManifest(
      query,
      { gateCode: gateCode === '' ? 'MAIN' : gateCode },
      actor,
      { ip: clientIp(request), userAgent: userAgent(request) },
    )

    return ok(manifest, {
      headers: {
        // Never cached by anything in between. A manifest served from an intermediary
        // cache is a manifest that does not know about the revocation issued a minute
        // ago, and the whole revocation design depends on freshness at fetch time.
        'cache-control': 'no-store, private',
        // Read by the client without parsing the body, so it can decide whether to merge
        // or replace before spending time on 2 MB of JSON.
        'x-manifest-version': String(manifest.version),
        'x-manifest-full': manifest.full ? '1' : '0',
      },
    })
  })
}
