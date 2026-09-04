/**
 * GET/POST /api/admin/cloudinary — spare storage accounts.
 *
 * The POST body carries an API secret, which is the only request in the app that
 * does. It is verified against Cloudinary, encrypted, and stored; nothing in the
 * response can echo it back, because `CloudinaryConfigView` has no field for it.
 */
import { cloudinaryAddRequest, type CloudinaryAddRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, readJson, userAgent } from '@/lib/server/http'
import { addCloudinaryConfig, listCloudinaryConfigs } from '@/lib/server/admin/cloudinary'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')
    return ok(await listCloudinaryConfigs(), { headers: { 'cache-control': 'no-store' } })
  })
}

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const body = await readJson<CloudinaryAddRequest>(request, cloudinaryAddRequest)

    const result = await addCloudinaryConfig(body, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result, { status: 201, headers: { 'cache-control': 'no-store' } })
  })
}
