/**
 * Staff: who holds which role.
 *
 * Volunteers and admins, listed with the number of check-ins each has scanned —
 * which is the number an event manager actually wants at 10 a.m., because a
 * volunteer with a device and zero scans has a problem nobody has noticed yet.
 *
 * Granting a role goes through `setRole` in `lib/server/auth.ts`, which writes
 * Postgres first and mirrors to Clerk's `publicMetadata` afterwards, and writes its
 * own `ROLE_GRANTED`/`ROLE_REVOKED` audit entry. Nothing here duplicates either.
 */
import 'server-only'

import { Prisma, prisma } from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import type { Role, RoleGrantRequest, StaffView } from '@orientation/contracts'

import { writeAudit } from '../audit'
import { type Actor, setRole } from '../auth'
import { abort } from '../http'

const VIEW_SELECT = {
  id: true,
  clerkUserId: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  lastSeenAt: true,
  _count: { select: { checkInsScanned: true } },
} satisfies Prisma.UserSelect

type StaffRecord = Prisma.UserGetPayload<{ select: typeof VIEW_SELECT }>

function toView(row: StaffRecord): StaffView {
  return {
    id: row.id,
    clerkUserId: row.clerkUserId,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: row.isActive,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    checkInsScanned: row._count.checkInsScanned,
  }
}

/**
 * Everyone who is not a plain student.
 *
 * Students are excluded on purpose. There will be 15,000 of them and they are not
 * staff; the registration list is where a student is looked up.
 */
export async function listStaff(): Promise<StaffView[]> {
  const rows = await prisma.user.findMany({
    where: { role: { in: ['VOLUNTEER', 'ADMIN'] } },
    orderBy: [{ role: 'desc' }, { name: 'asc' }, { createdAt: 'asc' }],
    select: VIEW_SELECT,
  })

  return rows.map(toView)
}

/**
 * Grant or change a role.
 *
 * Takes a Clerk user id rather than an internal one: the person doing this is reading
 * it off the Clerk dashboard for somebody who has signed in once and is not yet in any
 * list here.
 */
export async function grantRole(
  input: RoleGrantRequest,
  actor: Actor,
): Promise<StaffView> {
  const target = await prisma.user.findUnique({
    where: { clerkUserId: input.clerkUserId },
    select: { id: true, role: true, clerkUserId: true, name: true, email: true },
  })

  if (target === null) {
    // They have to have signed in at least once. Creating the row here would mean
    // inventing a user with no verified email, and the Clerk webhook already creates
    // it the moment they do sign in.
    abort(
      'NOT_FOUND',
      'No account with that Clerk user id has signed in yet. Ask them to sign in once, then grant the role.',
    )
  }

  if (target.id === actor.id && input.role !== 'ADMIN') {
    // Self-demotion locks the last admin out of the console during an event. Refused
    // rather than warned about, because the recovery is a database session.
    abort('CONFLICT', 'You cannot remove your own admin role. Ask another admin to do it.')
  }

  if (target.role === input.role) {
    abort('CONFLICT', `That account already has the ${input.role.toLowerCase()} role.`)
  }

  if (target.role === 'ADMIN' && input.role !== 'ADMIN') {
    const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } })
    if (admins <= 1) {
      abort('CONFLICT', 'That is the only active admin. Promote somebody else first.')
    }
  }

  // Writes Postgres, mirrors to Clerk, and audits — all three inside `setRole`.
  await setRole(target.id, input.role, actor, input.reason)

  const updated = await prisma.user.findUniqueOrThrow({
    where: { id: target.id },
    select: VIEW_SELECT,
  })

  return toView(updated)
}

/**
 * Deactivate or reactivate an account.
 *
 * `isActive: false` rather than a delete, because `CheckIn.scannedById` is
 * `onDelete: Restrict` and a volunteer's scan history has to survive them leaving.
 * A deactivated volunteer's device stops being accepted by `/api/scanner/sync`.
 */
export async function setStaffActive(
  userId: string,
  isActive: boolean,
  actor: Actor,
): Promise<StaffView> {
  if (userId === actor.id && !isActive) {
    abort('CONFLICT', 'You cannot deactivate your own account.')
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  })

  if (existing === null) abort('NOT_FOUND', 'No such account.')
  if (existing.isActive === isActive) {
    abort('CONFLICT', isActive ? 'That account is already active.' : 'That account is already deactivated.')
  }

  if (existing.role === 'ADMIN' && !isActive) {
    const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } })
    if (admins <= 1) {
      abort('CONFLICT', 'That is the only active admin.')
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive },
    select: VIEW_SELECT,
  })

  // Deactivation is a role-shaped change even though the role column is untouched: it
  // removes every capability the account had. Recorded with the same two verbs so a
  // search for "who lost access" finds it.
  await writeAudit({
    action: isActive ? AUDIT_ACTIONS.ROLE_GRANTED : AUDIT_ACTIONS.ROLE_REVOKED,
    entityType: 'User',
    entityId: userId,
    actor,
    before: { isActive: existing.isActive, role: existing.role },
    after: { isActive: updated.isActive, role: updated.role },
  })

  return toView(updated)
}

/** Role counts, for the console header. */
export async function staffCounts(): Promise<Record<Role, number>> {
  const rows = await prisma.user.groupBy({
    by: ['role'],
    _count: { role: true },
    where: { isActive: true },
  })

  const counts: Record<Role, number> = { STUDENT: 0, VOLUNTEER: 0, ADMIN: 0 }
  for (const row of rows) counts[row.role] = row._count.role
  return counts
}
