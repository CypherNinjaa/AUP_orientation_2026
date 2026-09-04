/**
 * GET/PATCH /api/admin/settings — the runtime switches.
 *
 * PATCH and not PUT: the console has one form with a dozen controls, and an admin
 * toggling registration open must not have to re-send a retention policy they never
 * looked at. `settingsUpdateRequest` refuses an empty body, so a no-op PATCH is a
 * validation error rather than a silent write that bumps `updatedAt`.
 */
import { settingsUpdateRequest, type SettingsUpdateRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, readJson, userAgent } from '@/lib/server/http'
import { readSettings, writeSettings } from '@/lib/server/admin/settings'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')
    return ok(await readSettings(), { headers: { 'cache-control': 'no-store' } })
  })
}

export async function PATCH(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const body = await readJson<SettingsUpdateRequest>(request, settingsUpdateRequest)

    const result = await writeSettings(body, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result, { headers: { 'cache-control': 'no-store' } })
  })
}
