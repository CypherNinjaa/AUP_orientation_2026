/**
 * POST /api/admin/roster/preview — parse an uploaded roster and write nothing.
 *
 * Multipart, so the body is read with `request.formData()` rather than `readJson`:
 * a roster may be 20 MB and is not JSON. `previewUpload` does the size and
 * extension checks itself.
 *
 * Rate limited at 10 per hour per admin. A preview reads the whole
 * `AdmittedStudent` table into memory and parses up to 15,000 rows, so it is the
 * most expensive request in the console, and an admin previews a handful of files
 * in an afternoon.
 */
import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, rateLimited, userAgent } from '@/lib/server/http'
import { rateLimit } from '@/lib/server/redis'
import { previewUpload } from '@/lib/server/admin/roster'

export const dynamic = 'force-dynamic'

/**
 * Node, not Edge: the parser is exceljs and the hash is `node:crypto`.
 *
 * Stated rather than left to inference, because a roster upload streaming through
 * an Edge runtime would fail at the first `Buffer`.
 */
export const runtime = 'nodejs'

/** A 20 MB parse of 15,000 rows against a full table read. */
export const maxDuration = 120

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')

    const limit = await rateLimit(`roster:preview:${actor.id}`, 10, 3600)
    if (!limit.ok) return rateLimited(limit)

    const preview = await previewUpload(request, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(preview)
  })
}
