/**
 * The selfie moderation queue.
 *
 * ## Fetching this list is a PII read, and it says so
 *
 * Every item carries a fresh ~60-second signed selfie path, which means loading one
 * page of this queue hands a moderator twenty students' faces. `SELFIE_VIEWED` is in
 * `PII_ACCESS_ACTIONS` and one entry is written per item, in a single
 * `writeAuditMany` — the DPDP audit trail's whole purpose is answering "who looked
 * at whose photograph, and when", and a queue view is the largest single answer to
 * that question in the system.
 *
 * That is deliberately expensive on paper: 50 audit rows per page load. At the
 * volumes involved — a handful of moderators for a few days — it is a few thousand
 * rows total, and the alternative is an audit trail that quietly omits the most
 * common way selfies are actually seen.
 *
 * ## `flagged` ordering
 *
 * `faceDetected: false` first, then a roster-name divergence, then oldest-first.
 * Those are the two mechanical signals available: the detector saw nothing, or the
 * name the student typed does not match the admissions sheet. Everything else in the
 * queue needs a human to look at the picture, and for those the fair order is the
 * order they arrived in.
 */
import 'server-only'

import { Prisma, prisma } from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import type { ModerationItem, ModerationQueueQuery, Page } from '@orientation/contracts'

import type { Actor } from '../auth'
import { writeAuditMany } from '../audit'
import { issueSelfiePath } from '../media/selfie-url'
import type { RequestMeta } from '../registration'

const ITEM_SELECT = {
  id: true,
  reference: true,
  status: true,
  name: true,
  program: true,
  faceDetected: true,
  selfiePublicId: true,
  submittedAt: true,
  admittedStudent: { select: { formNumber: true, name: true } },
  _count: { select: { companions: true } },
} satisfies Prisma.RegistrationSelect

export async function listModerationQueue(
  query: ModerationQueueQuery,
  actor: Actor,
  meta: RequestMeta,
): Promise<Page<ModerationItem>> {
  const where: Prisma.RegistrationWhereInput =
    query.filter === 'all'
      ? { status: { not: 'DRAFT' } }
      : query.filter === 'flagged'
        ? { status: { not: 'DRAFT' }, selfiePublicId: { not: null }, faceDetected: false }
        : { status: 'PENDING_REVIEW' }

  const records = await prisma.registration.findMany({
    where,
    select: ITEM_SELECT,
    // Oldest first. A queue that shows newest first leaves the student who
    // registered on day one waiting until the queue happens to empty.
    orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    take: query.limit + 1,
    ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
  })

  const hasMore = records.length > query.limit
  const page = hasMore ? records.slice(0, query.limit) : records

  const items: ModerationItem[] = page.map((record) => ({
    registrationId: record.id,
    reference: record.reference,
    status: record.status,
    name: record.name,
    rosterName: record.admittedStudent.name,
    program: record.program,
    formNumber: record.admittedStudent.formNumber,
    faceDetected: record.faceDetected,
    submittedAt: record.submittedAt.toISOString(),
    // Minted per request and bound to this moderator's `User.id`. Never persisted,
    // never cached, and useless in anybody else's browser.
    selfieUrl:
      record.selfiePublicId === null ? null : issueSelfiePath(record.id, actor.id).path,
    guestCount: record._count.companions,
  }))

  if (items.length > 0) {
    await writeAuditMany(
      items
        .filter((item) => item.selfieUrl !== null)
        .map((item) => ({
          action: AUDIT_ACTIONS.SELFIE_VIEWED,
          entityType: 'Registration',
          entityId: item.registrationId,
          actor,
          after: { reference: item.reference, via: 'moderation-queue', filter: query.filter },
          ip: meta.ip,
          userAgent: meta.userAgent,
        })),
    )
  }

  // `flagged` is a re-sort of the page, not of the query: a name mismatch cannot be
  // expressed in SQL against two columns on different tables without a raw join, and
  // sorting within the page is enough to put the interesting rows at the top of what
  // the moderator is looking at.
  if (query.filter === 'flagged') {
    items.sort((left, right) => rank(right) - rank(left))
  }

  return {
    items,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  }
}

function rank(item: ModerationItem): number {
  let score = 0
  if (item.faceDetected === false) score += 2
  if (item.name.trim().toLowerCase() !== item.rosterName.trim().toLowerCase()) score += 1
  return score
}
