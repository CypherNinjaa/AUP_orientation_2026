/**
 * GET /api/broadcast — the announcements this reader should currently see.
 *
 * The counterpart to the SSE `broadcast` event, and the reason a broadcast is a row
 * as well as a pub/sub message: a student who opens the app ninety seconds after
 * "the ceremony has moved to the auditorium" went out has to see it too. The stream
 * fills in whatever arrives afterwards; this is the state on load.
 *
 * ## The audience follows the role, not the request
 *
 * There is no `?audience=` parameter, deliberately. A volunteer-only message ("hold
 * the queue at Gate 1, the Registrar is crossing") is not confidential, but it is
 * operational noise that would frighten a nineteen-year-old reading it out of
 * context — and an audience a client can name is an audience a client can change.
 * `STUDENT` reads the student feed, anyone with a staff role reads the volunteer
 * feed, and `ALL` reaches both by virtue of the query in `listActiveBroadcasts`.
 */
import { requireActor } from '@/lib/server/auth'
import { listActiveBroadcasts } from '@/lib/server/admin/broadcast'
import { handle, ok } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request)
    const audience = actor.role === 'STUDENT' ? 'STUDENTS' : 'VOLUNTEERS'
    return ok(await listActiveBroadcasts(audience))
  })
}
