/**
 * The wizard's auto-save.
 *
 * `GET` to resume, `PUT` to save, `DELETE` to start over.
 *
 * ## Why a server-side draft at all
 *
 * `localStorage` already holds the draft and is the fast path — it survives a
 * refresh with no network. This row exists for the case `localStorage` cannot
 * cover: a student who starts on a library desktop and finishes on their phone,
 * which at a university is not an edge case. The client writes both and prefers
 * whichever is newer.
 *
 * ## What is deliberately not here
 *
 * The selfie. An image is sensitive personal data under the DPDP Act and consent
 * is step 4, so a photo captured at step 3 stays in browser memory until the
 * student agrees to store it. `draftData` has no field for it and this handler has
 * no branch for it.
 */
import { draftSaveRequest, type DraftResponse, type DraftSaveRequest } from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { fail, handle, noContent, ok, rateLimited, readJson } from '@/lib/server/http'
import { rateLimit } from '@/lib/server/redis'
import { discardDraft, readDraft, saveDraft } from '@/lib/server/registration'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request)
    const draft = await readDraft(actor)
    if (!draft) return fail('NOT_FOUND', 'No saved draft.')

    const body: DraftResponse = {
      step: draft.step,
      data: draft.data,
      updatedAt: draft.updatedAt.toISOString(),
    }
    return ok(body)
  })
}

export async function PUT(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request)

    // The client debounces to roughly one save every two seconds while typing, so
    // 60 a minute is a comfortable ceiling that still stops a wedged component
    // from writing in a loop. Not audited: a draft save is not an event, and
    // logging 15,000 students' keystroke batches would bury the log.
    const limit = await rateLimit(`draft:${actor.id}`, 60, 60)
    if (!limit.ok) return rateLimited(limit)

    const body = await readJson<DraftSaveRequest>(request, draftSaveRequest)
    const updatedAt = await saveDraft(actor, body.step, body.data)

    const response: DraftResponse = {
      step: body.step,
      data: body.data,
      updatedAt: updatedAt.toISOString(),
    }
    return ok(response)
  })
}

export async function DELETE(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request)
    await discardDraft(actor)
    return noContent()
  })
}
