/**
 * POST /api/admin/bootstrap — the first admin.
 *
 * Chicken and egg: `POST /api/admin/staff` grants roles and requires ADMIN, so on a
 * fresh deployment nobody can grant anybody anything. This is the way out, and it is
 * built to be used exactly once:
 *
 *   1. Set `ADMIN_BOOTSTRAP_KEY` in the environment (24 characters minimum).
 *   2. Sign in through Clerk as yourself.
 *   3. `POST` here with `{ "key": "…" }`.
 *   4. **Remove the variable and redeploy.**
 *
 * Step 4 is not optional. While the variable is set, anybody who signs in and knows
 * the key is one request away from ADMIN.
 *
 * ## Why it is not just an env comparison
 *
 * - `secretEquals` is timing-safe. A plain `===` on a secret leaks its prefix to
 *   anyone willing to measure, and this particular secret grants the whole console.
 * - It refuses once any admin exists. That turns "a leaked key is a permanent
 *   backdoor" into "a leaked key is useless the moment setup finished", without
 *   depending on anybody remembering step 4.
 * - It is rate-limited by IP as well as by user, because the caller controls their
 *   own account and can make as many as they like.
 * - It requires an authenticated session first, so an unauthenticated attacker with
 *   the key still has nothing to attach the role to.
 */
import { z } from 'zod'

import { prisma } from '@orientation/db'
import { secretEquals } from '@orientation/core/crypto/secrets'

import { requireActor, setRole } from '@/lib/server/auth'
import { abort, clientIp, handle, ok, rateLimited, readJson, userAgent } from '@/lib/server/http'
import { env } from '@/lib/server/env'
import { rateLimit } from '@/lib/server/redis'
import { writeAudit } from '@/lib/server/audit'
import { AUDIT_ACTIONS } from '@orientation/core/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const bootstrapRequest = z.strictObject({ key: z.string().min(1).max(200) })
type BootstrapRequest = z.infer<typeof bootstrapRequest>

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    // Any signed-in user. The key is the authorisation; the session only says which
    // account the role lands on.
    const actor = await requireActor(request, 'STUDENT')

    const ip = clientIp(request)
    const limit = await rateLimit(`bootstrap:${ip ?? actor.id}`, 5, 3600)
    if (!limit.ok) return rateLimited(limit)

    if (env.ADMIN_BOOTSTRAP_KEY === undefined) {
      // Deliberately the same shape of answer as a wrong key, so probing cannot
      // distinguish "not enabled" from "enabled but you guessed wrong".
      abort('FORBIDDEN', 'Bootstrap is not available.')
    }

    const body = await readJson<BootstrapRequest>(request, bootstrapRequest)

    if (!secretEquals(body.key, env.ADMIN_BOOTSTRAP_KEY)) {
      await writeAudit({
        action: AUDIT_ACTIONS.ACCESS_DENIED,
        entityType: 'User',
        entityId: actor.id,
        actor,
        after: { route: 'admin/bootstrap', reason: 'bad_key' },
        ip,
        userAgent: userAgent(request),
      })
      abort('FORBIDDEN', 'Bootstrap is not available.')
    }

    const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } })
    if (admins > 0) {
      // Setup is finished. From here roles come from the console, where they are
      // attributable to a person rather than to a shared string in an env file.
      abort(
        'CONFLICT',
        'An admin already exists. Ask them to grant the role, and remove ADMIN_BOOTSTRAP_KEY from the environment.',
      )
    }

    if (actor.role === 'ADMIN') {
      abort('CONFLICT', 'You are already an admin.')
    }

    // `setRole` writes Postgres, mirrors to Clerk, and writes its own ROLE_GRANTED
    // entry. `by: actor` records the grant as self-issued, which is the truth.
    await setRole(actor.id, 'ADMIN', actor, 'First admin, via ADMIN_BOOTSTRAP_KEY')

    return ok(
      {
        role: 'ADMIN' as const,
        // Said in the response as well as in the docs, because this is the screen the
        // operator is looking at when they have the chance to act on it.
        next: 'Remove ADMIN_BOOTSTRAP_KEY from the environment and redeploy.',
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  })
}
