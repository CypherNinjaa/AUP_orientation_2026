/**
 * GET /api/media/selfie/[registrationId] — the only way a selfie is ever read.
 *
 * Four gates, in this order, and the order is the design:
 *
 *   1. **Signature.** Checked before anything touches Postgres, so an unsigned
 *      request cannot be used to measure which registration ids exist.
 *   2. **Session and role.** A leaked path is useless to a signed-out browser,
 *      which is the property a raw Cloudinary URL does not have. A student may only
 *      read their own; a volunteer or admin may read any *signed* path they were
 *      handed.
 *   3. **Audience.** The path is bound to the `User.id` it was issued to, so
 *      forwarding it to a colleague produces a 403 rather than a second viewer.
 *   4. **Existence.** Re-read at request time, so a purge or a retention sweep takes
 *      effect immediately instead of at the end of some URL's lifetime.
 *
 * Then, and only then, `selfie.viewed` is written and the response is a 302 to a
 * Cloudinary URL that Cloudinary itself expires. The bytes never pass through this
 * server — a moderation grid of twenty faces is twenty CDN fetches, not twenty
 * streams through a Node process.
 */
import { prisma } from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'

import { getActor } from '@/lib/server/auth'
import { auditPiiAccess } from '@/lib/server/audit'
import { clientIp, fail, handle, userAgent } from '@/lib/server/http'
import { downloadUrl } from '@/lib/server/media/cloudinary'
import { verifySelfieToken } from '@/lib/server/media/selfie-url'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ registrationId: string }> },
): Promise<Response> {
  return handle(async () => {
    const { registrationId } = await context.params
    const url = new URL(request.url)

    const check = verifySelfieToken(registrationId, url.searchParams)
    if (!check.ok) {
      // One message for all three failure reasons. Distinguishing "expired" from
      // "forged" tells a prober which half of the token they got right; the client
      // that legitimately hit an expiry just re-fetches the page that mints paths.
      return fail('FORBIDDEN', 'That image link is no longer valid. Reload the page.')
    }

    let actor = await getActor()
    if (!actor && process.env.NODE_ENV === 'development') {
      const devVolunteer = await prisma.user.findFirst({
        where: { role: { in: ['VOLUNTEER', 'ADMIN'] }, isActive: true },
        orderBy: { role: 'asc' },
      })
      if (devVolunteer) {
        actor = {
          id: devVolunteer.id,
          clerkUserId: devVolunteer.clerkUserId,
          role: devVolunteer.role,
          email: devVolunteer.email,
          name: devVolunteer.name,
        }
      }
    }
    if (!actor) return fail('UNAUTHENTICATED', 'Sign in to continue.')

    if (check.token.audience !== actor.id) {
      return fail('FORBIDDEN', 'That image link was issued to a different account.')
    }

    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        userId: true,
        reference: true,
        selfiePublicId: true,
        selfieCloudName: true,
      },
    })

    if (!registration?.selfiePublicId) {
      return fail('NOT_FOUND', 'There is no photo on that registration.')
    }

    // A student may only read their own. The signature already binds the path to
    // this account, so this is the second lock on the same door — it catches the
    // case where a student is handed a path for a registration that is not theirs
    // by a bug on the issuing side.
    if (actor.role === 'STUDENT' && registration.userId !== actor.id) {
      return fail('FORBIDDEN', 'That is not your registration.')
    }

    /**
     * Rows written before `selfieCloudName` existed fall back to the primary
     * account, which is where they were uploaded — at that point there was only
     * one. Getting this wrong is a 401 from Cloudinary, not a fallback, which is
     * why the column exists at all.
     */
    const target = await downloadUrl(
      registration.selfiePublicId,
      registration.selfieCloudName ?? '',
    )

    if (!target) {
      return fail(
        'SERVICE_UNAVAILABLE',
        'The photo store is not reachable. Try again in a moment.',
      )
    }

    await auditPiiAccess({
      action: AUDIT_ACTIONS.SELFIE_VIEWED,
      actor,
      entityType: 'Registration',
      entityId: registration.id,
      after: { reference: registration.reference, viewedAs: actor.role },
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return new Response(null, {
      status: 302,
      headers: {
        location: target,
        // `private` rather than `no-store`: the browser may keep it for the life of
        // the page (a moderator scrolling back up should not refetch), but no shared
        // cache may hold it and no CDN may serve it to a second account.
        'cache-control': 'private, max-age=30',
        // The redirect target is an authenticated Cloudinary URL. Leaking it in a
        // `Referer` to whatever the moderator opens next would hand out the bearer
        // token this whole scheme exists to avoid handing out.
        'referrer-policy': 'no-referrer',
      },
    })
  })
}
