/**
 * GET /api/admin/stats — mission control's numbers.
 *
 * Polled by the admin home screen and republished over SSE as `stats.tick`, so it
 * is cached for three seconds in `readStats`. `?fresh=1` bypasses that, for the case
 * an operator has just committed a roster and wants to see it land.
 */
import { requireActor } from '@/lib/server/auth'
import { handle, ok } from '@/lib/server/http'
import { readStats } from '@/lib/server/admin/stats'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')

    const fresh = new URL(request.url).searchParams.get('fresh') === '1'
    const stats = await readStats({ fresh })

    return ok(stats, {
      // The three-second cache is server-side and shared. Telling the browser not
      // to keep its own copy is what makes `fresh=1` mean anything.
      headers: { 'cache-control': 'no-store' },
    })
  })
}
