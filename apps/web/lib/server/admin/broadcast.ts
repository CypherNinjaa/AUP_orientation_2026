/**
 * Broadcasts: the announcement system.
 *
 * ## Persisted *and* published
 *
 * SSE only reaches a browser that is already connected. A student who opens the app
 * ninety seconds after "the ceremony has moved to the auditorium" goes out still has
 * to see it, so every broadcast is a row as well as a pub/sub message. The row is the
 * source of truth; the publish is an optimisation that makes it instant for whoever
 * is already looking.
 *
 * `publish` is deliberately not awaited and never throws — a Redis outage must not
 * stop an emergency announcement from being *recorded*, because the feed endpoint
 * reads rows, not the channel.
 *
 * ## EMERGENCY takes two actions
 *
 * `confirmEmergency` must be true. An EMERGENCY interrupts every connected screen at
 * once; in front of 15,000 people a mis-clicked severity is a crowd-safety incident,
 * and a boolean in the request body is the cheapest possible guard against a dropdown
 * that was one row off.
 */
import 'server-only'

import { Prisma, prisma } from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import { broadcastChannel } from '@orientation/core/realtime'
import type { BroadcastRequest, BroadcastView } from '@orientation/contracts'

import type { Actor } from '../auth'
import { writeAudit } from '../audit'
import { abort } from '../http'
import { publish } from '../redis'
import type { RequestMeta } from '../registration'

const VIEW_SELECT = {
  id: true,
  priority: true,
  audience: true,
  title: true,
  body: true,
  publishedAt: true,
  expiresAt: true,
  createdAt: true,
  createdBy: { select: { name: true, email: true } },
} satisfies Prisma.BroadcastSelect

type BroadcastRecord = Prisma.BroadcastGetPayload<{ select: typeof VIEW_SELECT }>

function toView(row: BroadcastRecord): BroadcastView {
  return {
    id: row.id,
    priority: row.priority,
    audience: row.audience,
    title: row.title,
    body: row.body,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdBy: row.createdBy?.name ?? row.createdBy?.email ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function sendBroadcast(
  input: BroadcastRequest,
  actor: Actor,
  meta: RequestMeta,
): Promise<BroadcastView> {
  if (input.priority === 'EMERGENCY' && !input.confirmEmergency) {
    abort(
      'VALIDATION_FAILED',
      'An emergency broadcast interrupts every screen. Confirm it deliberately.',
      { fields: { confirmEmergency: 'Tick this to send an emergency broadcast.' } },
    )
  }

  const expiresAt = input.expiresAt === undefined || input.expiresAt === null
    ? null
    : new Date(input.expiresAt)

  if (expiresAt !== null && expiresAt.getTime() <= Date.now()) {
    abort('VALIDATION_FAILED', 'That expiry is in the past — the message would never be shown.', {
      fields: { expiresAt: 'Pick a time in the future.' },
    })
  }

  const publishedAt = new Date()

  const row = await prisma.broadcast.create({
    data: {
      priority: input.priority,
      audience: input.audience,
      title: input.title,
      body: input.body,
      publishedAt,
      expiresAt,
      createdById: actor.id,
    },
    select: VIEW_SELECT,
  })

  await writeAudit({
    action: AUDIT_ACTIONS.BROADCAST_SENT,
    entityType: 'Broadcast',
    entityId: row.id,
    actor,
    after: {
      priority: row.priority,
      audience: row.audience,
      title: row.title,
      // The body in full. It was said to thousands of people; the audit log is not
      // where it becomes confidential.
      body: row.body,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  publish(broadcastChannel(), {
    type: 'broadcast',
    broadcastId: row.id,
    severity: row.priority,
    audience: row.audience,
    title: row.title,
    body: row.body,
    at: publishedAt.getTime(),
  })

  return toView(row)
}

/**
 * The broadcasts a given audience should currently see.
 *
 * Unexpired, published, newest first. Used by the student portal and the volunteer
 * app on load, so that a client which connects after a message went out still sees
 * it — the SSE stream fills in whatever arrives afterwards.
 */
export async function listActiveBroadcasts(
  audience: 'STUDENTS' | 'VOLUNTEERS',
  limit = 20,
): Promise<BroadcastView[]> {
  const now = new Date()

  const rows = await prisma.broadcast.findMany({
    where: {
      publishedAt: { not: null, lte: now },
      audience: { in: [audience, 'ALL'] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { publishedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 50),
    select: VIEW_SELECT,
  })

  return rows.map(toView)
}

/** Every broadcast, for the console's own history. */
export async function listAllBroadcasts(limit = 50): Promise<BroadcastView[]> {
  const rows = await prisma.broadcast.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
    select: VIEW_SELECT,
  })

  return rows.map(toView)
}

/**
 * Retract a broadcast by expiring it now.
 *
 * Not a delete. A message that went to 15,000 phones happened, and the record of it
 * is the answer to "who told them to go to the auditorium?". Setting `expiresAt` to
 * now removes it from every client's active list on their next read.
 */
export async function retractBroadcast(
  id: string,
  actor: Actor,
  meta: RequestMeta,
): Promise<BroadcastView> {
  const existing = await prisma.broadcast.findUnique({
    where: { id },
    select: { id: true, title: true, expiresAt: true },
  })

  if (existing === null) abort('NOT_FOUND', 'No such broadcast.')

  const now = new Date()
  if (existing.expiresAt !== null && existing.expiresAt <= now) {
    abort('CONFLICT', 'That broadcast has already expired.')
  }

  const row = await prisma.broadcast.update({
    where: { id },
    data: { expiresAt: now },
    select: VIEW_SELECT,
  })

  await writeAudit({
    action: AUDIT_ACTIONS.BROADCAST_SENT,
    entityType: 'Broadcast',
    entityId: row.id,
    actor,
    before: { expiresAt: existing.expiresAt?.toISOString() ?? null },
    after: { retracted: true, expiresAt: row.expiresAt?.toISOString() ?? null },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return toView(row)
}
