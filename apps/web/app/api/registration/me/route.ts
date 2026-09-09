/**
 * GET /api/registration/me — everything the student portal shows, in one read.
 *
 * Scoped to the session's own user by construction: `readMe` queries
 * `Registration` by `userId`, so there is no id in the request that could be
 * changed to somebody else's. That is why this endpoint has no authorisation logic
 * beyond "signed in" — the query *is* the authorisation.
 *
 * Not cached. `cache-control: no-store` comes from `ok()`, and it matters here more
 * than anywhere else: a shared cache holding this response for even a few seconds
 * would serve one student's registration to the next visitor.
 */
import { getActor } from '@/lib/server/auth'
import { fail, handle, ok } from '@/lib/server/http'
import { readMe } from '@/lib/server/registration'
import { getStudentSessionFromRequest } from '@/lib/server/student-session'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const session = await getStudentSessionFromRequest(request)
    if (session) {
      return ok(await readMe(session.registrationId))
    }

    const actor = await getActor()
    if (actor) {
      return ok(await readMe(actor))
    }

    return fail('UNAUTHENTICATED', 'No active student session found.')
  })
}
