/**
 * Mission control's numbers.
 *
 * ## Three denominators, never conflated
 *
 * `admitted` is the roster, `registered` is submissions, `checkedIn` is people
 * through the gate. Every event dashboard eventually divides one by the wrong
 * other, so they are computed separately here and named separately in
 * `StatsResponse`.
 *
 * ## Why the grouped figures are raw SQL
 *
 * `byProgram` needs admitted, registered and checked-in per programme string.
 * Through the client that is either three `groupBy` calls that cannot be joined,
 * or a `findMany` that drags 15,000 check-ins and their nested registrations into
 * Node to be counted. It is one `LEFT JOIN` chain in Postgres, and the chain is
 * safe from fan-out because `Registration.admittedStudentId`, `Pass.registrationId`
 * and `CheckIn.passId` are all `UNIQUE` — each row can match at most one row
 * downstream, so `count(r.id)` counts registrations and not join products.
 *
 * `count(*)::int` throughout: Postgres `count` is `bigint`, which Prisma's raw
 * layer hands back as a JavaScript `BigInt`, and `JSON.stringify` throws on those.
 * Casting in SQL is cheaper than mapping them afterwards and cannot be forgotten
 * on one branch.
 *
 * ## Why it is cached for three seconds
 *
 * The admin home screen polls this and an SSE `stats.tick` republishes it. During
 * arrivals that is a dozen operators plus a broadcast loop hitting eleven
 * aggregates over the same tables. Three seconds is under the refresh interval a
 * human perceives as live and turns a burst into one query set.
 */
import 'server-only'

import { Prisma, prisma } from '@orientation/db'
import type { ScanOutcome, StatsResponse } from '@orientation/contracts'

import { cacheGet, cacheSet } from '../redis'

const CACHE_KEY = 'admin:stats'
const CACHE_TTL_SECONDS = 3

/** How far back the arrivals sparkline goes. */
const ARRIVALS_WINDOW_MS = 2 * 60 * 60 * 1_000

/**
 * Cap on how many devices the disagreement list names.
 *
 * There are five to ten devices at one gate (D24). Twenty is headroom for a
 * volunteer reinstalling the app and generating a new id, and a bound on a column
 * that is otherwise attacker-influenced — `deviceId` comes from a request body.
 */
const MAX_DISAGREEMENT_ROWS = 20

interface ProgramRow {
  program: string
  admitted: number
  registered: number
  checkedIn: number
}

interface LevelRow {
  level: string
  admitted: number
  registered: number
  checkedIn: number
}

interface ArrivalRow {
  at: Date
  count: number
}

interface DisagreementRow {
  deviceId: string
  count: number
}

export async function readStats(options: { fresh?: boolean } = {}): Promise<StatsResponse> {
  if (options.fresh !== true) {
    const cached = await cacheGet<StatsResponse>(CACHE_KEY)
    if (cached) return cached
  }

  const now = new Date()
  const arrivalsFrom = new Date(now.getTime() - ARRIVALS_WINDOW_MS)
  const lastMinute = new Date(now.getTime() - 60_000)

  const [
    admitted,
    registered,
    approved,
    pendingReview,
    revisionRequested,
    passesIssued,
    passesRevoked,
    checkedIn,
    guestSum,
    arrivalsPerMinute,
    outcomeGroups,
    byProgram,
    byLevel,
    arrivals,
    clientDisagreements,
  ] = await Promise.all([
    prisma.admittedStudent.count(),
    prisma.registration.count(),
    prisma.registration.count({ where: { status: 'APPROVED' } }),
    prisma.registration.count({ where: { status: 'PENDING_REVIEW' } }),
    prisma.registration.count({ where: { status: 'REVISION_REQUESTED' } }),
    prisma.pass.count(),
    prisma.pass.count({ where: { status: 'REVOKED' } }),
    prisma.checkIn.count(),
    prisma.checkIn.aggregate({ _sum: { guestsAdmitted: true } }),
    prisma.checkIn.count({ where: { recordedAt: { gte: lastMinute } } }),
    prisma.scanEvent.groupBy({ by: ['outcome'], _count: { _all: true } }),

    prisma.$queryRaw<ProgramRow[]>(Prisma.sql`
      SELECT a."program"                AS "program",
             count(*)::int              AS "admitted",
             count(r."id")::int         AS "registered",
             count(c."id")::int         AS "checkedIn"
      FROM "AdmittedStudent" a
      LEFT JOIN "Registration" r ON r."admittedStudentId" = a."id"
      LEFT JOIN "Pass"         p ON p."registrationId"    = r."id"
      LEFT JOIN "CheckIn"      c ON c."passId"            = p."id"
      GROUP BY a."program"
      ORDER BY "admitted" DESC, a."program" ASC
    `),

    prisma.$queryRaw<LevelRow[]>(Prisma.sql`
      SELECT a."programLevel"    AS "level",
             count(*)::int       AS "admitted",
             count(r."id")::int  AS "registered",
             count(c."id")::int  AS "checkedIn"
      FROM "AdmittedStudent" a
      LEFT JOIN "Registration" r ON r."admittedStudentId" = a."id"
      LEFT JOIN "Pass"         p ON p."registrationId"    = r."id"
      LEFT JOIN "CheckIn"      c ON c."passId"            = p."id"
      GROUP BY a."programLevel"
      ORDER BY "admitted" DESC, a."programLevel" ASC
    `),

    // `recordedAt`, not `scannedAt`: the server's clock is the one authority for
    // ordering (D9), and a phone that is forty minutes out would otherwise put
    // arrivals in a bucket that never happened.
    prisma.$queryRaw<ArrivalRow[]>(Prisma.sql`
      SELECT date_trunc('minute', c."recordedAt") AS "at",
             count(*)::int                       AS "count"
      FROM "CheckIn" c
      WHERE c."recordedAt" >= ${arrivalsFrom}
      GROUP BY 1
      ORDER BY 1 ASC
    `),

    // A disagreement means the device's manifest was stale or it is being
    // replayed. Either way it names a phone somebody can walk over to.
    prisma.$queryRaw<DisagreementRow[]>(Prisma.sql`
      SELECT s."deviceId"    AS "deviceId",
             count(*)::int   AS "count"
      FROM "ScanEvent" s
      WHERE s."deviceId" IS NOT NULL
        AND s."clientDecision" IS NOT NULL
        AND s."clientDecision" <> s."outcome"
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT ${MAX_DISAGREEMENT_ROWS}
    `),
  ])

  const stats: StatsResponse = {
    admitted,
    registered,
    approved,
    pendingReview,
    revisionRequested,
    passesIssued,
    passesRevoked,
    checkedIn,
    guestsAdmitted: guestSum._sum.guestsAdmitted ?? 0,
    arrivalsPerMinute,
    arrivals: arrivals.map((row) => ({ at: row.at.toISOString(), count: row.count })),
    byProgram,
    byLevel,
    // The Prisma enum and the contract's enum are the same eight members, so this
    // needs no filtering — see the note on `scanOutcome` in contracts/common.ts.
    scanOutcomes: outcomeGroups
      .map((group) => ({ outcome: group.outcome satisfies ScanOutcome, count: group._count._all }))
      .sort((a, b) => b.count - a.count),
    clientDisagreements,
    generatedAt: now.toISOString(),
  }

  await cacheSet(CACHE_KEY, stats, CACHE_TTL_SECONDS)
  return stats
}
