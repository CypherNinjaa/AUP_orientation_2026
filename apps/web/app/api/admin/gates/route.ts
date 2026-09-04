/**
 * GET/PUT /api/admin/gates — the entry lanes.
 *
 * PUT and not POST: the body carries the gate code, so the request is idempotent —
 * sending it twice leaves one gate in the same state, which is the right behaviour
 * for a form somebody double-clicks on event morning.
 */
import { gateUpdateRequest, type GateUpdateRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, readJson, userAgent } from '@/lib/server/http'
import { listGates, upsertGate } from '@/lib/server/admin/settings'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')
    return ok({ items: await listGates() }, { headers: { 'cache-control': 'no-store' } })
  })
}

export async function PUT(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const body = await readJson<GateUpdateRequest>(request, gateUpdateRequest)

    const result = await upsertGate(body, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result)
  })
}
