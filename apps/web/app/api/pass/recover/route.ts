/**
 * POST /api/pass/recover — Find / recover an existing orientation pass.
 *
 * Designed for multi-device access, changed phones, or cleared browser cookies.
 * A student provides their Application Form Number and registered Contact Number.
 * On match, a cryptographic session token is issued, set as an HttpOnly cookie,
 * and returned for client-side storage.
 */
import { recoverPassRequest, type RecoverPassRequest } from '@orientation/contracts'

import { clientIp, handle, ok, rateLimited, readJson } from '@/lib/server/http'
import { rateLimit } from '@/lib/server/redis'
import { recoverRegistration } from '@/lib/server/registration'
import { buildStudentSessionCookieHeader } from '@/lib/server/student-session'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const ip = clientIp(request) ?? '127.0.0.1'

    const limit = await rateLimit(`recover:ip:${ip}`, 10, 60)
    if (!limit.ok) return rateLimited(limit)

    const body = await readJson<RecoverPassRequest>(request, recoverPassRequest)

    const result = await recoverRegistration(body.formNumber, body.contactNo)

    return ok(result, {
      headers: {
        'set-cookie': buildStudentSessionCookieHeader(result.sessionToken),
      },
    })
  })
}
