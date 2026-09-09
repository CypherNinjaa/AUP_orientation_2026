/**
 * DELETE /api/admin/registrations/[id] — completely and permanently delete a registration,
 * revoking any pass, clearing checkins, deleting the selfie, and releasing the admission claim.
 */
import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, rateLimited, userAgent } from '@/lib/server/http'
import { rateLimit } from '@/lib/server/redis'
import { deleteRegistrationCompletely } from '@/lib/server/admin/registrations'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const { id } = await context.params

    const limit = await rateLimit(`delete-reg:${actor.id}`, 100, 3600)
    if (!limit.ok) return rateLimited(limit)

    let reason: string | undefined
    try {
      const body = (await request.json()) as { reason?: string } | null
      reason = body?.reason
    } catch {
      // Body is optional for DELETE
    }

    const result = await deleteRegistrationCompletely(
      id,
      actor,
      {
        ip: clientIp(request),
        userAgent: userAgent(request),
      },
      reason,
    )

    return ok(result)
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return DELETE(request, context)
}
