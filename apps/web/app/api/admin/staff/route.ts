/**
 * GET/POST /api/admin/staff — who holds which role.
 *
 * POST grants a role by Clerk user id. The account must already exist, which means
 * the person has signed in at least once — the webhook creates the row then. Granting
 * a role to an id that has never signed in would mean inventing a user with no
 * verified email.
 */
import { roleGrantRequest, type RoleGrantRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { handle, ok, readJson } from '@/lib/server/http'
import { grantRole, listStaff } from '@/lib/server/admin/staff'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')
    return ok(await listStaff(), { headers: { 'cache-control': 'no-store' } })
  })
}

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const body = await readJson<RoleGrantRequest>(request, roleGrantRequest)

    return ok(await grantRole(body, actor), { headers: { 'cache-control': 'no-store' } })
  })
}
