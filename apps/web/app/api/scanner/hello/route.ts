/**
 * POST /api/scanner/hello — register a device and read the server clock.
 *
 * Called once when a volunteer opens the scanner and picks a gate, and again on every
 * app restart. Cheap on purpose: a device that cannot complete a hello should still be
 * able to scan from a manifest it already holds, so nothing downstream treats a failed
 * hello as fatal.
 */
import { deviceHelloRequest, type DeviceHelloRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, rateLimited, readJson, userAgent } from '@/lib/server/http'
import { deviceHello } from '@/lib/server/scanner/lookup'
import { rateLimit } from '@/lib/server/redis'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'VOLUNTEER')

    const body = await readJson<DeviceHelloRequest>(request, deviceHelloRequest)

    // A hundred an hour per device. A PWA that reloads on every backgrounding will call
    // this often and legitimately; a hundred is generous for that and still a ceiling.
    const limit = await rateLimit(`hello:${body.deviceId}`, 100, 3600)
    if (!limit.ok) return rateLimited(limit)

    const result = await deviceHello(body, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result, { headers: { 'cache-control': 'no-store, private' } })
  })
}
