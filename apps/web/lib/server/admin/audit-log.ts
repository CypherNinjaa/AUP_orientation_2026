/**
 * Reading the audit log.
 *
 * The log is append-only in Postgres — two triggers raise `restrict_violation` on
 * UPDATE and DELETE ([D20](../../../../../docs/01-decisions.md)) — so this module is
 * read-only by construction. There is no write path here and there must never be one:
 * every entry is written by the operation it describes, at the moment it happens.
 *
 * ## Reading the log is itself an audited act
 *
 * Deliberately *not* audited here, and that is the one exception in the system. An
 * entry per read would mean the log grows every time someone looks at it, and an
 * admin paging through a thousand rows would produce twenty entries that say nothing
 * except "an admin used the audit screen". The entries that matter — selfie views,
 * exports, roster previews — are audited at their own source. What this endpoint
 * exposes is metadata about actions, not the personal data itself: no selfie, no
 * contact number, no form number, because `writeAudit` redacts secret-shaped keys and
 * every caller writes summaries rather than rows.
 */
import 'server-only'

import { Prisma, prisma } from '@orientation/db'
import { PII_ACCESS_ACTIONS } from '@orientation/core/audit'
import type { AuditEntryView, AuditQuery, Page } from '@orientation/contracts'

const VIEW_SELECT = {
  id: true,
  actorId: true,
  actorLabel: true,
  actorRole: true,
  action: true,
  entityType: true,
  entityId: true,
  before: true,
  after: true,
  ip: true,
  userAgent: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect

type AuditRecord = Prisma.AuditLogGetPayload<{ select: typeof VIEW_SELECT }>

function toView(row: AuditRecord): AuditEntryView {
  return {
    id: row.id,
    actorId: row.actorId,
    actorLabel: row.actorLabel,
    actorRole: row.actorRole,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    // `Prisma.JsonValue` includes `Prisma.DbNull`/`JsonNull` sentinels, which serialise
    // as `null` anyway. Widened to `unknown` in the view so the client is not handed a
    // Prisma-specific type it has no way to import.
    before: row.before ?? null,
    after: row.after ?? null,
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listAuditEntries(query: AuditQuery): Promise<Page<AuditEntryView>> {
  const where: Prisma.AuditLogWhereInput = {}

  if (query.action !== undefined) where.action = query.action
  if (query.actorId !== undefined) where.actorId = query.actorId
  if (query.entityType !== undefined) where.entityType = query.entityType
  if (query.entityId !== undefined) where.entityId = query.entityId

  if (query.piiOnly) {
    // The filter that answers the DPDP question directly: "show me every time
    // somebody looked at personal data". A free-text `action` filter alongside it is
    // an intersection, which is what a request naming both should mean.
    where.action =
      query.action === undefined
        ? { in: [...PII_ACCESS_ACTIONS] }
        : { equals: query.action, in: [...PII_ACCESS_ACTIONS] }
  }

  if (query.from !== undefined || query.to !== undefined) {
    where.createdAt = {
      ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
      ...(query.to === undefined ? {} : { lte: new Date(query.to) }),
    }
  }

  const rows = await prisma.auditLog.findMany({
    where,
    // Newest first: unlike the moderation queue, an audit reader is almost always
    // asking "what just happened?" rather than working through a backlog.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
    select: VIEW_SELECT,
  })

  const items = rows.slice(0, query.limit)
  const nextCursor = rows.length > query.limit ? (items.at(-1)?.id ?? null) : null

  return { items: items.map(toView), nextCursor }
}

/**
 * The distinct actions actually present, for the filter dropdown.
 *
 * Built from the data rather than from `AUDIT_ACTION_VALUES` so the list is the
 * thirty-odd verbs that have happened here, not the full vocabulary. Cheap: the log
 * is indexed on `action`, and this is a page an admin opens rarely.
 */
export async function listAuditActions(): Promise<{ action: string; count: number }[]> {
  const rows = await prisma.auditLog.groupBy({
    by: ['action'],
    _count: { action: true },
    orderBy: { _count: { action: 'desc' } },
  })

  return rows.map((row) => ({ action: row.action, count: row._count.action }))
}
