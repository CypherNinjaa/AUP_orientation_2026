/**
 * POST /api/registration/lookup — step 1 of the wizard.
 *
 * ## Why this is rate limited harder than anything else
 *
 * It answers "who holds form number N" for any N. Sign-in is required, but a
 * signed-in student could still walk the number space and harvest names and phone
 * numbers of their whole cohort. Auto-filling the contact number is a hard
 * requirement — 15,000 students should not retype a number the university already
 * has — so the surface cannot be removed, only narrowed:
 *
 *   - 20 lookups per minute and 60 per hour, per *user*, not per IP. An IP is a
 *     campus NAT with a thousand students behind it.
 *   - A caller who trips the hourly limit is audited. One student mistyping their
 *     number six times is invisible; a script is not.
 *   - A claimed row returns no preview at all.
 */
import { lookupRequest, type LookupRequest } from '@orientation/contracts'
import { AUDIT_ACTIONS } from '@orientation/core/audit'

import { requireActor } from '@/lib/server/auth'
import { writeAudit } from '@/lib/server/audit'
import { getConfig, registrationClosedMessage, registrationWindow } from '@/lib/server/config'
import { clientIp, fail, handle, ok, rateLimited, readJson, userAgent } from '@/lib/server/http'
import { rateLimit } from '@/lib/server/redis'
import { lookupFormNumber } from '@/lib/server/registration'

export const dynamic = 'force-dynamic'

const PER_MINUTE = 20
const PER_HOUR = 60

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request)

    const config = await getConfig()
    const window = registrationWindow(config)
    if (!window.open) {
      return fail('REGISTRATION_CLOSED', registrationClosedMessage(window))
    }

    const minute = await rateLimit(`lookup:m:${actor.id}`, PER_MINUTE, 60)
    if (!minute.ok) return rateLimited(minute)

    const hour = await rateLimit(`lookup:h:${actor.id}`, PER_HOUR, 3600)
    if (!hour.ok) {
      await writeAudit({
        action: AUDIT_ACTIONS.ACCESS_DENIED,
        actor,
        entityType: 'Endpoint',
        entityId: '/api/registration/lookup',
        after: { reason: 'hourly lookup limit exceeded', limit: PER_HOUR },
        ip: clientIp(request),
        userAgent: userAgent(request),
      })
      return rateLimited(hour)
    }

    const body = await readJson<LookupRequest>(request, lookupRequest)
    return ok(await lookupFormNumber(actor, body.formNumber))
  })
}
