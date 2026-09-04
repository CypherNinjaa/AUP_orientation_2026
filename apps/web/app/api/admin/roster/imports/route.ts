/**
 * GET /api/admin/roster/imports — the import history.
 *
 * Includes dry runs. A preview that was never committed is exactly the evidence an
 * admin wants when working out why a column did not map, and hiding it would make
 * the history look like a shorter story than it was.
 */
import { requireActor } from '@/lib/server/auth'
import { handle, ok } from '@/lib/server/http'
import { listImports } from '@/lib/server/admin/roster'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')

    const raw = new URL(request.url).searchParams.get('limit')
    const parsed = raw === null ? 30 : Number(raw)
    const limit = Number.isFinite(parsed) ? parsed : 30

    return ok({ items: await listImports(limit) })
  })
}
