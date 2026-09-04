/**
 * GET /api/admin/export — download a dataset.
 *
 * A GET that has a side effect: it writes a `DATA_EXPORTED` audit entry. That is
 * unusual and it is the point — a download of 15,000 names is the largest egress of
 * personal data the system performs, and the entry is what makes it answerable.
 *
 * A GET rather than a POST because the browser has to do the downloading. A fetch would
 * mean holding several megabytes in JavaScript memory to build a blob URL; a plain link
 * hands the bytes to the browser's own download machinery, which is what a file this
 * size wants.
 */
import { exportQuery, type ExportQuery } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, rateLimited, readQuery, userAgent } from '@/lib/server/http'
import { buildExport } from '@/lib/server/admin/export'
import { rateLimit } from '@/lib/server/redis'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')

    // Thirty an hour. Each one is a full table scan and a multi-megabyte buffer; a
    // browser tab left on a page that refetches would otherwise hold the process
    // building workbooks nobody reads.
    const limit = await rateLimit(`export:${actor.id}`, 30, 3600)
    if (!limit.ok) return rateLimited(limit)

    const query = readQuery<ExportQuery>(request, exportQuery)

    const result = await buildExport(query, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    // `new Response`, not `ok()`: the body is bytes rather than the `{ data }` envelope
    // every JSON route uses.
    return new Response(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        'content-type': result.contentType,
        'content-length': String(result.bytes.byteLength),
        'content-disposition': `attachment; filename="${result.filename}"`,
        'cache-control': 'no-store, private',
        // Read by the console so it can show "15,432 rows" without parsing the file.
        'x-row-count': String(result.rowCount),
      },
    })
  })
}
