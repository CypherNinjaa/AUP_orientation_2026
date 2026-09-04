/**
 * POST /api/admin/registrations/[id]/revoke — invalidate a pass.
 *
 * `revokePass` writes the audit entry and bumps the manifest version itself, so
 * every scanner learns within its refresh interval that this pass is now a
 * `REVOKED` verdict rather than an admit. The route only resolves the id and
 * checks the typed confirmation.
 */
import { revokePassRequest, type RevokePassRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { handle, ok, readJson } from '@/lib/server/http'
import { revoke } from '@/lib/server/admin/registrations'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const { id } = await context.params
    const body = await readJson<RevokePassRequest>(request, revokePassRequest)

    return ok(await revoke(id, body, actor))
  })
}
