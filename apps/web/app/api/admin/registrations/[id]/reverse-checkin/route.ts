/**
 * POST /api/admin/registrations/[id]/reverse-checkin — undo an arrival.
 *
 * The one endpoint in the system that deletes a row. What it deletes is a
 * *current state* — "this pass has been used" — and not a log: the `ScanEvent`
 * rows stay, and the audit entry records every column of the deleted `CheckIn` so
 * the arrival is still provable afterwards.
 */
import { reverseCheckInRequest, type ReverseCheckInRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, readJson, userAgent } from '@/lib/server/http'
import { reverseCheckIn } from '@/lib/server/admin/registrations'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const { id } = await context.params
    const body = await readJson<ReverseCheckInRequest>(request, reverseCheckInRequest)

    const result = await reverseCheckIn(id, body, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result)
  })
}
