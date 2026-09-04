/**
 * POST /api/admin/registrations/[id]/restore — undo a revocation.
 *
 * No typed confirmation, unlike revoke: restoring the wrong pass admits somebody
 * who should have stayed out, which is recoverable by revoking again, whereas
 * revoking the wrong pass strands a student at the gate at the moment they are
 * standing in front of it.
 */
import { restorePassRequest, type RestorePassRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { handle, ok, readJson } from '@/lib/server/http'
import { restore } from '@/lib/server/admin/registrations'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const { id } = await context.params
    const body = await readJson<RestorePassRequest>(request, restorePassRequest)

    return ok(await restore(id, body, actor))
  })
}
