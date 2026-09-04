/**
 * GET /api/admin/audit/actions — the verbs present in the log, with counts.
 *
 * Feeds the filter dropdown. Built from the data rather than from the full
 * `AUDIT_ACTION_VALUES` vocabulary, so the list is what has actually happened on this
 * deployment instead of thirty-four options of which six are used.
 */
import { requireActor } from '@/lib/server/auth'
import { handle, ok } from '@/lib/server/http'
import { listAuditActions } from '@/lib/server/admin/audit-log'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')
    return ok(await listAuditActions(), {
      // Sixty seconds. The list changes when a new *kind* of thing happens, which is
      // rare, and the dropdown is re-read on every page open.
      headers: { 'cache-control': 'private, max-age=60' },
    })
  })
}
