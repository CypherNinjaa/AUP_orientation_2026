/**
 * GET /api/admin/audit — read the append-only log.
 *
 * Read-only, and there is no POST. Every entry is written by the operation it
 * describes; a hand-written entry would be a forgery, and Postgres would take it
 * because an INSERT is the one thing the append-only triggers allow.
 *
 * `?piiOnly=true` is the DPDP filter: every recorded read of personal data.
 */
import { auditQuery, type AuditQuery } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { handle, ok, readQuery } from '@/lib/server/http'
import { listAuditEntries } from '@/lib/server/admin/audit-log'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')
    const query = readQuery<AuditQuery>(request, auditQuery)

    return ok(await listAuditEntries(query), { headers: { 'cache-control': 'no-store' } })
  })
}
