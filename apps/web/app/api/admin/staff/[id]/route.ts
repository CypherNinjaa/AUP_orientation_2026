/**
 * PATCH /api/admin/staff/[id] — deactivate or reactivate an account.
 *
 * Not a DELETE. `CheckIn.scannedById` is `onDelete: Restrict` and a volunteer's scan
 * history is part of the arrival record — the row has to survive the person leaving
 * the team. Deactivating is what "remove this volunteer" means here: their device
 * stops being accepted and their history stays intact.
 */
import { z } from 'zod'

import { requireActor } from '@/lib/server/auth'
import { handle, ok, readJson } from '@/lib/server/http'
import { setStaffActive } from '@/lib/server/admin/staff'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const staffPatchRequest = z.strictObject({ isActive: z.boolean() })
type StaffPatchRequest = z.infer<typeof staffPatchRequest>

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const { id } = await context.params
    const body = await readJson<StaffPatchRequest>(request, staffPatchRequest)

    return ok(await setStaffActive(id, body.isActive, actor), {
      headers: { 'cache-control': 'no-store' },
    })
  })
}
