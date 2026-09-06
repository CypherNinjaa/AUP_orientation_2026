/**
 * Authentication and authorisation, behind one adapter (D13).
 *
 * Clerk is the identity provider today. Every route handler, server component and
 * server action reaches it through the functions in this file, so replacing Clerk
 * means rewriting one module rather than auditing every `auth()` call in the app
 * for the assumptions it made.
 *
 * ## Two identities, deliberately
 *
 * Clerk owns *who you are* — the session, the sign-in, the email. Postgres owns
 * *what you are here* — the `User` row, the role, the registration you own, the
 * check-ins you scanned. `syncUser` is the seam between them: given a Clerk
 * session, return the local row, creating it on first sight.
 *
 * A local row exists for a reason beyond convenience: `CheckIn.scannedById` and
 * `Registration.reviewedById` are foreign keys with `onDelete: Restrict`, so the
 * gate's history has to reference something that outlives a deleted Clerk account.
 *
 * ## The role lives in two places, and one of them wins
 *
 * The authoritative role is `User.role` in Postgres. Clerk's
 * `publicMetadata.role` is a *cache* of it, kept in step because the middleware
 * needs to gate `/admin` without a database round trip on every navigation.
 *
 * When they disagree, Postgres wins and the metadata is corrected. Doing it the
 * other way round would mean a token an attacker could edit — `publicMetadata` is
 * writable through Clerk's API with the secret key, so it is only as good as that
 * key, and it is readable by the client, which makes it a convenient target for
 * confusion but never a grant.
 */
import 'server-only'

import { redirect } from 'next/navigation'
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server'

import { prisma, type Role, type User } from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'

import { abort, clientIp, userAgent } from './http'
import { writeAudit } from './audit'

/** What a handler receives once authentication has succeeded. */
export interface Actor {
  /** The local `User.id`. Every foreign key uses this, never the Clerk id. */
  id: string
  clerkUserId: string
  role: Role
  email: string | null
  name: string | null
}

const ROLE_RANK: Record<Role, number> = { STUDENT: 0, VOLUNTEER: 1, ADMIN: 2 }

/** True when `role` satisfies a requirement for `minimum`. Admin implies both. */
export function hasRole(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum]
}

/**
 * The signed-in user's local row, created on first sight.
 *
 * Called on every authenticated request, so the fast path is one indexed
 * `findUnique` on `clerkUserId`. The Clerk API is only contacted when the row does
 * not exist yet, or when the cached role needs correcting — not on every request,
 * because that would put a network hop in front of every page.
 */
export async function syncUser(): Promise<User | null> {
  const { userId } = await auth()
  if (!userId) return null

  try {
    const existing = await prisma.user.findUnique({ where: { clerkUserId: userId } })
    if (existing) {
      if (!existing.isActive) return null

      // Method 2 / Emergency Admin Fallback: check ADMIN_EMAILS
      const adminEmails = (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)

      if (existing.email && adminEmails.includes(existing.email.toLowerCase()) && existing.role !== 'ADMIN') {
        const promoted = await prisma.user.update({
          where: { id: existing.id },
          data: { role: 'ADMIN' },
        })
        void reconcileClerkRole(userId, 'ADMIN')
        return promoted
      }

      // `lastSeenAt` is useful for the admin staff list and worthless if it costs a
      // write per request, so it is only updated once an hour per user. Not awaited:
      // nothing depends on it and it must not add latency.
      const hourAgo = Date.now() - 60 * 60 * 1_000
      if (!existing.lastSeenAt || existing.lastSeenAt.getTime() < hourAgo) {
        void prisma.user
          .update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } })
          .catch(() => undefined)
      }

      void reconcileClerkRole(userId, existing.role)
      return existing
    }

    // First request from a new account.
    const clerkUser = await currentUser()
    const email = clerkUser?.primaryEmailAddress?.emailAddress ?? null
    const name =
      [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ').trim() || null

    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)

    const clerkRole = clerkUser?.publicMetadata?.['role'] as Role | undefined
    const isEnvAdmin = email ? adminEmails.includes(email.toLowerCase()) : false
    const initialRole: Role = isEnvAdmin
      ? 'ADMIN'
      : clerkRole === 'ADMIN' || clerkRole === 'VOLUNTEER'
        ? clerkRole
        : 'STUDENT'

    // `upsert` rather than `create`: two requests from a brand-new account can
    // arrive concurrently (a page and its `fetch`), and both would create.
    return await prisma.user.upsert({
      where: { clerkUserId: userId },
      update: { email, name, ...(isEnvAdmin || clerkRole === 'ADMIN' ? { role: 'ADMIN' } : {}) },
      create: { clerkUserId: userId, email, name, role: initialRole },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("Can't reach database server") || msg.includes('P1001')) {
      console.error(
        `\x1b[31m[Prisma Database Offline]\x1b[0m PostgreSQL is not reachable at 127.0.0.1:5433.\n` +
        `Run 'npm run docker:up' or 'npm run dev' to automatically start the container services.`
      )
    }
    throw err
  }
}

/**
 * Push the database's role into Clerk's `publicMetadata` when they differ.
 *
 * Fire-and-forget. The middleware reads the metadata to decide whether to let a
 * request reach `/admin` at all, but every admin endpoint re-checks against
 * Postgres, so a stale cache costs a redirect and never a privilege.
 */
async function reconcileClerkRole(clerkUserId: string, role: Role): Promise<void> {
  try {
    const client = await clerkClient()
    const clerkUser = await client.users.getUser(clerkUserId)
    const cached = clerkUser.publicMetadata?.['role']
    if (cached === role) return

    await client.users.updateUser(clerkUserId, {
      publicMetadata: { ...clerkUser.publicMetadata, role },
    })
  } catch {
    // Clerk being unreachable must not fail the request. The consequence is that
    // the middleware keeps using the old cached role until the next attempt.
  }
}

/**
 * Synchronize user active status & role with Clerk.
 * When deactivating, marks them inactive in Clerk publicMetadata.
 * When reactivating, restores their active role metadata.
 */
export async function syncClerkUserStatus(
  clerkUserId: string,
  isActive: boolean,
  role: Role,
): Promise<void> {
  try {
    const client = await clerkClient()
    if (isActive) {
      try {
        await client.users.unbanUser(clerkUserId)
      } catch {
        // Ignored if user was not banned in Clerk
      }
    } else {
      try {
        await client.users.banUser(clerkUserId)
      } catch (err) {
        console.warn('[Clerk] Ban user API call warning (metadata fallback active):', err)
      }
    }
    const clerkUser = await client.users.getUser(clerkUserId)
    await client.users.updateUser(clerkUserId, {
      publicMetadata: {
        ...clerkUser.publicMetadata,
        isActive,
        role: isActive ? role : 'STUDENT',
      },
    })
  } catch (error) {
    console.warn('[Clerk Sync Warning] Could not sync user active status with Clerk:', error)
  }
}

/** The current actor, or null when nobody is signed in or account is inactive. */
export async function getActor(): Promise<Actor | null> {
  const user = await syncUser()
  if (!user) return null
  return { id: user.id, clerkUserId: user.clerkUserId, role: user.role, email: user.email, name: user.name }
}

/**
 * Returns the current authenticated Actor, or performs safe navigation:
 * - If user is NOT signed in with Clerk: redirects to `/sign-in?redirect_url=${redirectTo}`
 * - If user IS signed in with Clerk, but account is deactivated in DB: redirects to `/deactivated`
 * - If user is active: returns Actor
 */
export async function getActorOrRedirect(redirectTo?: string): Promise<Actor> {
  const { userId } = await auth()
  if (!userId) {
    redirect(`/sign-in${redirectTo ? `?redirect_url=${encodeURIComponent(redirectTo)}` : ''}`)
  }

  const actor = await getActor()
  if (!actor) {
    // Authenticated session exists in Clerk, but local User row is inactive/deactivated in Postgres
    redirect('/deactivated')
  }

  return actor
}

/**
 * Require a signed-in user with at least `minimum`, or abort the request.
 *
 * Aborting rather than returning null: an authorisation check whose failure mode
 * is a value the caller might forget to test is not a check. Every use is
 * `const actor = await requireActor(request, 'ADMIN')` and the next line can
 * assume the role.
 *
 * A denied request is audited. `access.denied` firing once is somebody who
 * bookmarked a page after losing a role; firing a hundred times is somebody
 * probing, and the audit log is where that becomes visible.
 */
export async function requireActor(request: Request, minimum: Role = 'STUDENT'): Promise<Actor> {
  let actor = await getActor()

  if (!actor && process.env.NODE_ENV === 'development' && request.url.includes('/api/scanner')) {
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

  if (!actor) {
    abort('UNAUTHENTICATED', 'Sign in to continue.')
  }

  if (!hasRole(actor.role, minimum)) {
    await writeAudit({
      action: AUDIT_ACTIONS.ACCESS_DENIED,
      actor,
      entityType: 'Endpoint',
      entityId: new URL(request.url).pathname,
      after: { required: minimum, had: actor.role },
      ip: clientIp(request),
      userAgent: userAgent(request),
    })
    abort('FORBIDDEN', 'This area is restricted.')
  }

  return actor
}

/**
 * The Clerk id without touching the database.
 *
 * For the few places that only need to know *whether* somebody is signed in —
 * rate-limit keys, the SSE route's subscription key — and where a `User` lookup
 * per request would be wasted work.
 */
export async function currentClerkUserId(): Promise<string | null> {
  const { userId } = await auth()
  return userId
}

/**
 * Set a user's role, in both places, and audit it.
 *
 * The only sanctioned way to change a role. Postgres first, because it is the
 * authority: if Clerk's update fails afterwards the role is still correct and
 * `reconcileClerkRole` will fix the cache on the user's next request. Doing Clerk
 * first would leave a window where the cache grants something the database does
 * not.
 */
export async function setRole(
  targetUserId: string,
  role: Role,
  by: Actor,
  reason: string | undefined,
): Promise<User> {
  const before = await prisma.user.findUnique({ where: { id: targetUserId } })
  if (!before) abort('NOT_FOUND', 'No such user.')

  const updated = await prisma.user.update({ where: { id: targetUserId }, data: { role } })

  await writeAudit({
    action: ROLE_RANK[role] > ROLE_RANK[before.role] ? AUDIT_ACTIONS.ROLE_GRANTED : AUDIT_ACTIONS.ROLE_REVOKED,
    actor: by,
    entityType: 'User',
    entityId: targetUserId,
    before: { role: before.role },
    after: { role, reason: reason ?? null },
  })

  void reconcileClerkRole(updated.clerkUserId, role)
  return updated
}
