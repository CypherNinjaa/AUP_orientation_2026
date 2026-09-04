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
import { requireActor } from '@/lib/server/auth'
import { handle, ok } from '@/lib/server/http'
import { readMe } from '@/lib/server/registration'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request)
    return ok(await readMe(actor))
  })
}
