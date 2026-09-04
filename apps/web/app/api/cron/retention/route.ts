/**
 * POST /api/cron/retention — the DPDP selfie retention sweep, on a schedule.
 *
 * Called by whatever holds the clock: a Railway cron service, an external pinger, or
 * an admin pressing the button in Settings. Runs at most once at a time regardless of
 * how many of those fire together (`withLock` inside `sweepSelfies`), and is safe to
 * call as often as anybody likes — a run with nothing due does one indexed query and
 * returns zeroes without writing an audit row.
 *
 * ## Two ways in, and why both exist
 *
 * - **`Authorization: Bearer $CRON_SECRET`** — the scheduler. No session, no cookie,
 *   compared with a timing-safe equality because a `===` on a secret leaks its prefix
 *   to anybody willing to measure.
 * - **An authenticated ADMIN session** — the console's "Run retention now", and the
 *   only route in when `CRON_SECRET` is unset. This is what keeps the promise
 *   keepable on a deployment where nobody wired up a scheduler.
 *
 * When `CRON_SECRET` is unset the bearer path is closed, not open. An unprotected
 * endpoint that deletes student selfies is a worse failure than a sweep that needs a
 * human to press a button.
 *
 * ## Why POST for something a cron would rather GET
 *
 * It deletes things. A GET that mutates gets fetched by a link prefetcher, a security
 * scanner, or a browser guessing at a URL bar completion, and this one would delete a
 * batch of selfies each time. Every scheduler can send a POST.
 *
 * `?dryRun=1` reports what is due and touches nothing — the safe way to answer "what
 * would this delete" before the first real run.
 */
import { z } from 'zod'

import { secretEquals } from '@orientation/core/crypto/secrets'

import { getActor } from '@/lib/server/auth'
import { env } from '@/lib/server/env'
import { abort, handle, ok, readQuery } from '@/lib/server/http'
import { sweepSelfies } from '@/lib/server/media/retention'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const query = z.object({
  dryRun: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((value) => value === '1' || value === 'true'),
  limit: z.coerce.number().int().min(1).max(1_000).optional(),
})
type Query = z.infer<typeof query>

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (header === null) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1] ?? null
}

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { dryRun, limit } = readQuery<Query>(request, query)

    const token = bearer(request)
    const scheduled =
      token !== null && env.CRON_SECRET !== undefined && secretEquals(token, env.CRON_SECRET)

    // The actor is looked up only when there is no valid bearer token, because a cron
    // has no session and resolving one would be a wasted round trip on every run.
    const actor = scheduled ? null : await getActor()

    if (!scheduled && actor?.role !== 'ADMIN') {
      // One answer for "wrong token", "no token", "signed in as a student" and "cron
      // is not configured". A caller probing this endpoint learns nothing about which.
      abort('FORBIDDEN', 'Not available.')
    }

    const result = await sweepSelfies({
      ...(dryRun ? { dryRun: true } : {}),
      ...(limit === undefined ? {} : { limit }),
      // `null` for the scheduler: a null actor in the audit log means the system did
      // it by itself, which is the truth and is more useful than a synthetic user.
      actor,
    })

    if (result === undefined) {
      // Another run holds the lock. Not an error — the work is being done — but the
      // caller should know its own request did nothing.
      return ok({ ran: false as const, reason: 'A retention sweep is already running.' })
    }

    return ok({ ran: true as const, ...result }, { headers: { 'cache-control': 'no-store' } })
  })
}
