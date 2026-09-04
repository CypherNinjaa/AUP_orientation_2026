/**
 * GET /api/admin/registrations — the roster of people who registered.
 *
 * The console's main table. Cursor-paged rather than offset-paged because an admin
 * working a moderation queue is looking at a list that grows underneath them, and
 * `skip: 200` on a list that gained three rows shows three rows twice.
 */
import { registrationListQuery } from '@orientation/contracts'
import type { RegistrationListQuery } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { handle, ok, readQuery } from '@/lib/server/http'
import { listRegistrations } from '@/lib/server/admin/registrations'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')
    const query = readQuery<RegistrationListQuery>(request, registrationListQuery)

    return ok(await listRegistrations(query), { headers: { 'cache-control': 'no-store' } })
  })
}
