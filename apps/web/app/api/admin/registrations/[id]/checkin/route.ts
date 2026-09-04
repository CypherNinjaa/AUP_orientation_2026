/**
 * POST /api/admin/registrations/[id]/checkin — a help-desk arrival.
 *
 * For the student whose phone is dead and whose pass code is on a sheet of paper.
 * Writes the same `CheckIn` row a scanner writes, so the arrivals count, the
 * per-gate chart and the duplicate check all see it identically.
 */
import { manualCheckInRequest, type ManualCheckInRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, readJson, userAgent } from '@/lib/server/http'
import { recordManualCheckIn } from '@/lib/server/admin/registrations'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const { id } = await context.params
    const body = await readJson<ManualCheckInRequest>(request, manualCheckInRequest)

    const result = await recordManualCheckIn(id, body, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result, { status: 201 })
  })
}
