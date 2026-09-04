/**
 * The DPDP retention sweep — the thing that makes "we delete selfies" true.
 *
 * A selfie is sensitive personal data under India's DPDP Act 2023. The consent the
 * student gave at capture says the image is kept for a limited period and then
 * destroyed. Everything else in this codebase makes that *possible* — assets go up
 * as `type: 'authenticated'` so there is no durable URL, reads are ~60-second signed
 * URLs, every read is audited, nothing is cached on a volunteer device (D7). None of
 * it makes the promise *true*. This module is the only part that does.
 *
 * ## What it deletes, and what it deliberately does not
 *
 * The Cloudinary asset, and the six `selfie*` columns that point at it. The
 * `Registration` row survives — attendance, the pass, the check-in, and the consent
 * record are not personal data we promised to destroy, and an event whose attendance
 * figures evaporate a month later is a different kind of failure. So this is a
 * targeted erasure of one field, not a purge of the student.
 *
 * ## Why the anchor is `selfieUploadedAt` and not the event date
 *
 * "Thirty days post-event" was the wording in the plan, and it is worse. It means
 * the clock does not start for a student who registers in June until August, so the
 * same image sits in storage for eleven weeks rather than four — and it needs a
 * confirmed event date, which we still do not have (R1). Per-asset age is stricter,
 * needs no configuration that can be wrong, and reads off an index that already
 * exists for exactly this query (`@@index([selfieUploadedAt])`).
 *
 * ## Order of operations, and the orphan it avoids
 *
 * Cloudinary first, then the columns. The reverse order is the tempting one — the
 * database write cannot fail halfway — but it produces an asset that is still stored
 * and no longer referenced by anything, which is undeletable by any means short of
 * trawling the Cloudinary console by hand. So a failed destroy leaves the row
 * completely untouched and the sweep tries again on its next run, and the sweep
 * reports how many of those it hit rather than swallowing them.
 *
 * A crash *between* the destroy and the update is the acceptable failure: the row
 * still points at an asset that is gone, `signedSelfieUrl` 404s, and the next sweep
 * gets `absent` and clears the columns. Visibly missing beats invisibly retained.
 */
import 'server-only'

import { prisma } from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import type { Role } from '@orientation/db'

import { writeAudit } from '@/lib/server/audit'
import { getConfig } from '@/lib/server/config'
import { env } from '@/lib/server/env'
import { destroySelfie } from '@/lib/server/media/cloudinary'
import { withLock } from '@/lib/server/redis'

/**
 * Rows per run.
 *
 * Each one is a network round trip to Cloudinary, so a batch is bounded by how long
 * a request may reasonably take rather than by how much work there is. At 15,000
 * registrations the backlog on the first run after the event is the whole cohort;
 * it drains over consecutive runs, which is fine because nothing is late by more
 * than the cron interval.
 */
const DEFAULT_BATCH = 200

/** Longest a single run may hold the lock. Generous: 200 destroys over slow wifi. */
const LOCK_TTL_MS = 5 * 60_000

export interface SweepOptions {
  /** Injected by tests and by an admin previewing. Defaults to now. */
  now?: Date
  /** Report what would go, delete nothing. */
  dryRun?: boolean
  limit?: number
  /** Recorded on the audit entry. `null` for the cron, which is nobody. */
  actor?: { id: string; role: Role; email: string | null; name: string | null } | null
}

export interface SweepResult {
  /** Retention window in force for this run, from `SystemConfig`. */
  retentionDays: number
  /** Selfies uploaded at or before this instant are due. */
  cutoff: string
  /** Rows examined this run. Equal to `limit` when there is more to do. */
  examined: number
  /** Assets Cloudinary confirmed it destroyed. */
  deleted: number
  /** Assets already gone. Counted separately because a run of these means a bug. */
  absent: number
  /** Rows left alone for the next run. Non-zero means Cloudinary is unhappy. */
  failed: number
  /** True when more rows are due than this run took. */
  more: boolean
  dryRun: boolean
}

/**
 * Delete every selfie past its retention window.
 *
 * Safe to call repeatedly and from anywhere — a second concurrent run gets the lock
 * refused and returns `undefined` rather than double-deleting. A `SweepResult` of
 * all zeroes is the normal answer and means the sweep had nothing to do.
 */
export async function sweepSelfies(options: SweepOptions = {}): Promise<SweepResult | undefined> {
  return withLock('selfie-retention-sweep', LOCK_TTL_MS, () => run(options))
}

async function run(options: SweepOptions): Promise<SweepResult> {
  const config = await getConfig()
  const now = options.now ?? new Date()
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_BATCH, 1_000))
  const dryRun = options.dryRun === true

  const cutoff = new Date(now.getTime() - config.selfieRetentionDays * 24 * 60 * 60 * 1_000)

  const due = await prisma.registration.findMany({
    where: {
      selfiePublicId: { not: null },
      // `lte`, and the null case is excluded by the `selfiePublicId` filter above: a
      // row with a public id but no upload timestamp is a data bug, and skipping it
      // is better than treating a missing date as infinitely old.
      selfieUploadedAt: { lte: cutoff },
    },
    select: {
      id: true,
      selfiePublicId: true,
      selfieCloudName: true,
      selfieUploadedAt: true,
    },
    // Oldest first, so the longest-retained image is always the next one deleted.
    orderBy: { selfieUploadedAt: 'asc' },
    take: limit,
  })

  const result: SweepResult = {
    retentionDays: config.selfieRetentionDays,
    cutoff: cutoff.toISOString(),
    examined: due.length,
    deleted: 0,
    absent: 0,
    failed: 0,
    more: due.length === limit,
    dryRun,
  }

  if (dryRun || due.length === 0) return result

  for (const row of due) {
    if (row.selfiePublicId === null) continue

    // A row written before `selfieCloudName` existed, or by a path that did not set
    // it, belongs to the env account — that was the only account at the time.
    const cloudName = row.selfieCloudName ?? env.CLOUDINARY_CLOUD_NAME

    const outcome = await destroySelfie(row.selfiePublicId, cloudName)

    if (outcome === 'failed') {
      result.failed += 1
      continue
    }

    if (outcome === 'deleted') result.deleted += 1
    else result.absent += 1

    await prisma.registration.update({
      where: { id: row.id },
      data: {
        selfiePublicId: null,
        selfieCloudName: null,
        selfieVersion: null,
        selfieBytes: null,
        selfieWidth: null,
        selfieHeight: null,
        selfieUploadedAt: null,
      },
    })
  }

  // One entry for the batch, not one per student. Fifteen thousand audit rows saying
  // "deleted a selfie" is not a record anybody can read, and the append-only table is
  // the one place we cannot clean up afterwards. Counts and a window are the answer
  // to "did retention run, and did it work" — and no `entityId`, because the entity
  // is the whole cohort.
  await writeAudit({
    action: AUDIT_ACTIONS.SELFIE_RETENTION_SWEEP,
    entityType: 'Registration',
    actor: options.actor ?? null,
    after: {
      retentionDays: result.retentionDays,
      cutoff: result.cutoff,
      examined: result.examined,
      deleted: result.deleted,
      absent: result.absent,
      failed: result.failed,
      more: result.more,
    },
  })

  if (result.failed > 0) {
    console.error(
      `[retention] ${String(result.failed)} selfie(s) could not be deleted from Cloudinary and were left for the next run`,
    )
  }

  return result
}
