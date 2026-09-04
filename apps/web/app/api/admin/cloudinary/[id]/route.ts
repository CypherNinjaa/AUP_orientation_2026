/**
 * PATCH /api/admin/cloudinary/[id] — enable, disable, reprioritise, clear an error.
 * POST  /api/admin/cloudinary/[id] — refresh usage from Cloudinary.
 *
 * There is no DELETE. A row that has taken uploads is the only record of which
 * account a stored selfie lives in — `Registration.selfieCloudName` points at it —
 * and deleting it would leave those images unreadable. Deactivating stops new uploads
 * and keeps reads working, which is what "remove this account" actually means here.
 */
import { cloudinaryUpdateRequest, type CloudinaryUpdateRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, readJson, userAgent } from '@/lib/server/http'
import { refreshCloudinaryUsage, updateCloudinaryConfig } from '@/lib/server/admin/cloudinary'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const { id } = await context.params
    const body = await readJson<CloudinaryUpdateRequest>(request, cloudinaryUpdateRequest)

    const result = await updateCloudinaryConfig(id, body, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result, { headers: { 'cache-control': 'no-store' } })
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')
    const { id } = await context.params

    return ok(await refreshCloudinaryUsage(id), { headers: { 'cache-control': 'no-store' } })
  })
}
