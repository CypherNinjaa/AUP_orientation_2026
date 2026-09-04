/**
 * GET /api/scanner/selfie/[registrationId] — mint a sixty-second path to one face.
 *
 * The volunteer's device holds a manifest with names and no photographs (D7). This is
 * the escape hatch for the case that makes a name insufficient: a pass on a phone that
 * is not obviously the person holding it. It is online-only by design — a face cached
 * on a device is exactly the outcome the manifest omits them to avoid.
 *
 * ## Why this returns a path rather than the image
 *
 * Two hops, and the second one is where the audit entry that matters is written. This
 * route mints a signed, audience-bound, sixty-second path; fetching that path runs
 * `/api/media/selfie/[registrationId]`, which re-checks the session, re-checks that the
 * selfie still exists, writes `SELFIE_VIEWED`, and redirects to a Cloudinary URL that
 * Cloudinary itself expires.
 *
 * So there are two audit rows for one act, and that is deliberate: this one records
 * that a volunteer *asked* for a face, the other records that the bytes were actually
 * served. During an incident review those are different questions — a volunteer who
 * requested forty faces in a minute is worth looking at whether or not the images
 * loaded.
 */
import { prisma } from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import { selfieRequestParams, type SelfieResponse } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { auditPiiAccess } from '@/lib/server/audit'
import { abort, clientIp, handle, ok, rateLimited, userAgent } from '@/lib/server/http'
import { issueSelfiePath } from '@/lib/server/media/selfie-url'
import { rateLimit } from '@/lib/server/redis'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ registrationId: string }> },
): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'VOLUNTEER')

    // Sixty an hour. A gate volunteer challenges a handful of identities across a whole
    // shift; sixty is a ceiling on "somebody is browsing the student body", and every
    // one of them is already in the audit log.
    const limit = await rateLimit(`scanner-selfie:${actor.id}`, 60, 3600)
    if (!limit.ok) return rateLimited(limit)

    const params = await context.params
    const { registrationId } = selfieRequestParams.parse(params)

    // Checked here so a volunteer is told "there is no photo" rather than being handed a
    // path that 404s sixty seconds of confusion later. `select` is the two columns the
    // decision needs and nothing else — this route has no business reading a name.
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      select: { id: true, reference: true, selfiePublicId: true },
    })

    if (registration === null) {
      abort('NOT_FOUND', 'No registration with that id.')
    }
    if (registration.selfiePublicId === null) {
      abort('NOT_FOUND', 'There is no photo on that registration.')
    }

    const issued = issueSelfiePath(registrationId, actor.id)

    await auditPiiAccess({
      action: AUDIT_ACTIONS.SELFIE_VIEWED,
      entityType: 'Registration',
      entityId: registration.id,
      actor,
      after: {
        via: 'scanner/selfie',
        // "Issued" rather than "served". The companion entry from the media route says
        // the bytes went out; this one only says a volunteer asked.
        stage: 'issued',
        reference: registration.reference,
      },
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    const body: SelfieResponse = {
      url: issued.path,
      expiresAt: issued.expiresAt.toISOString(),
      audited: true,
    }

    return ok(body, { headers: { 'cache-control': 'no-store, private' } })
  })
}
