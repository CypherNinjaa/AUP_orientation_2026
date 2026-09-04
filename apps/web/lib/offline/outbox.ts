/**
 * The outbox: scans that have happened but not yet been told to anybody.
 *
 * This store holds the only copy of a check-in taken during an outage. Everything
 * else on the device is a cache with an authoritative origin; this is origin data,
 * and the rules here are written accordingly — nothing is deleted until the server
 * has acknowledged that exact event by id.
 *
 * ## Idempotency does the heavy lifting
 *
 * Each event carries a `clientEventId` generated at scan time. The server upserts
 * on it and replays the original verdict, so a batch that is posted twice — the
 * response was lost, the tab was backgrounded mid-flight, the volunteer pulled
 * down to refresh — produces one check-in and one answer. That is what makes the
 * retry policy here allowed to be dumb: retry, then retry again.
 *
 * ## Ordering
 *
 * Drained oldest-first, and the server processes a batch sequentially for the same
 * reason. Two scans of the same pass in one batch must be resolved in the order
 * the device produced them, so that "the first one wins" means the first one the
 * volunteer actually took rather than whichever database connection was free.
 *
 * ## Quarantine
 *
 * An event the server keeps rejecting with a 4xx is a bug, not a network problem,
 * and retrying it forever would block every event queued behind it. After
 * `MAX_ATTEMPTS` it stops being included in batches and starts being counted
 * instead, so it surfaces as "3 scans could not be sent" on the volunteer's screen
 * and in the admin console rather than as a silent stall. It is never deleted:
 * a quarantined event is still the record of a student who walked through a gate.
 */
import type { ScanEventInput, SyncRequest, SyncResponse } from '@orientation/contracts'

import { scannerDb, type OutboxEntry } from './db'
import { markCheckedInLocally } from './manifest'

/** The server's cap, matched exactly. A larger batch would be rejected whole. */
const BATCH_SIZE = 200

/**
 * Ten is generous for a flaky network and short enough that a genuinely broken
 * event surfaces within one shift rather than at the post-mortem.
 */
const MAX_ATTEMPTS = 10

/** Most drains are one batch. The cap stops a bug turning into an unbounded loop. */
const MAX_BATCHES_PER_DRAIN = 20

export interface QueuedScan {
  event: ScanEventInput
  /** Resolved at scan time; see `OutboxEntry.code10`. */
  code10: string | null
  admitted: boolean
}

export async function enqueue(scan: QueuedScan): Promise<void> {
  const db = await scannerDb()
  const entry: OutboxEntry = {
    event: scan.event,
    code10: scan.code10,
    admitted: scan.admitted,
    queuedAt: Date.now(),
    attempts: 0,
    lastError: null,
  }
  // `put`, not `add`: the key is the client event id, so a caller that somehow
  // enqueues the same scan twice overwrites rather than throwing at the gate.
  await db.put('outbox', entry)
}

export interface OutboxStatus {
  /** Everything still in the store, including quarantined events. */
  total: number
  /** Events a drain will actually attempt. */
  sendable: number
  quarantined: number
  /** Epoch ms of the oldest queued scan, for "12 minutes behind" on screen. */
  oldestQueuedAt: number | null
}

export async function outboxStatus(): Promise<OutboxStatus> {
  const db = await scannerDb()
  const all = await db.getAll('outbox')
  let sendable = 0
  let oldest: number | null = null
  for (const entry of all) {
    if (entry.attempts < MAX_ATTEMPTS) sendable += 1
    if (oldest === null || entry.queuedAt < oldest) oldest = entry.queuedAt
  }
  return {
    total: all.length,
    sendable,
    quarantined: all.length - sendable,
    oldestQueuedAt: oldest,
  }
}

async function nextBatch(): Promise<OutboxEntry[]> {
  const db = await scannerDb()
  // Index walk in queued order, filtered then sliced. The store is small — it only
  // grows during an outage — so this is cheaper than maintaining a second index on
  // attempts, and much easier to reason about.
  const ordered = await db.getAllFromIndex('outbox', 'by-queued-at')
  return ordered.filter((entry) => entry.attempts < MAX_ATTEMPTS).slice(0, BATCH_SIZE)
}

async function recordFailure(entries: readonly OutboxEntry[], message: string): Promise<void> {
  const db = await scannerDb()
  const tx = db.transaction('outbox', 'readwrite')
  for (const entry of entries) {
    // Re-read: a scan taken while the request was in flight must not be clobbered
    // by a stale copy from before it was queued.
    const current = await tx.store.get(entry.event.clientEventId)
    if (current === undefined) continue
    await tx.store.put({ ...current, attempts: current.attempts + 1, lastError: message })
  }
  await tx.done
}

export type DrainOutcome =
  | { status: 'empty' }
  | { status: 'offline' }
  | { status: 'busy' }
  /** The server answered. `sent`/`conflicts` are cumulative across batches. */
  | {
      status: 'synced'
      sent: number
      conflicts: number
      remaining: number
      manifestStale: boolean
      manifestVersion: number
      /** `serverTime - Date.now()` from the last batch. Positive: device is behind. */
      clockOffsetMs: number
    }
  /** Network or 5xx. The events are untouched and will be retried. */
  | { status: 'failed'; message: string; remaining: number }
  /** The server refused this device outright. Stop; an operator must intervene. */
  | { status: 'blocked'; message: string; remaining: number }

export interface DrainContext {
  deviceId: string
  gateCode: string
  manifestVersion: number
  manifestGeneratedAt: number
}

/**
 * Single-flight.
 *
 * Two triggers fire together routinely — the `online` event and the periodic timer
 * both land the moment a phone reconnects. The server would deduplicate the
 * result, but posting the same 200 events twice over the connection that just came
 * back is the wrong way to spend it.
 */
let draining = false

export async function drainOutbox(ctx: DrainContext): Promise<DrainOutcome> {
  if (draining) return { status: 'busy' }

  // Trusted only as a fast negative. `navigator.onLine === true` means "there is an
  // interface", which on a campus captive portal means very little; a false is
  // reliable, and skipping a doomed fetch keeps the radio quiet.
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { status: 'offline' }

  draining = true
  try {
    let sent = 0
    let conflicts = 0
    let manifestStale = false
    let manifestVersion = ctx.manifestVersion
    let clockOffsetMs = 0
    let sawAnything = false

    for (let batch = 0; batch < MAX_BATCHES_PER_DRAIN; batch += 1) {
      const entries = await nextBatch()
      if (entries.length === 0) {
        // Nothing sendable left. `empty` on the first pass means there was nothing to
        // do at all — including the case where everything left is quarantined, which
        // `outboxStatus` reports separately and a drain cannot fix.
        if (!sawAnything) return { status: 'empty' }
        const status = await outboxStatus()
        return {
          status: 'synced',
          sent,
          conflicts,
          remaining: status.total,
          manifestStale,
          manifestVersion,
          clockOffsetMs,
        }
      }

      sawAnything = true

      const body: SyncRequest = {
        deviceId: ctx.deviceId,
        gateCode: ctx.gateCode,
        sentAt: Date.now(),
        manifestVersion: ctx.manifestVersion,
        manifestGeneratedAt: ctx.manifestGeneratedAt,
        events: entries.map((entry) => entry.event),
      }

      let response: Response
      try {
        response = await fetch('/api/scanner/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          // The outbox is the retry mechanism; a cached response would be a lie.
          cache: 'no-store',
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Network unavailable'
        await recordFailure(entries, message)
        const status = await outboxStatus()
        return { status: 'failed', message, remaining: status.total }
      }

      if (response.status === 409) {
        // The sync route aborts CONFLICT for a blocked device. A 403 would invite the
        // client to re-authenticate, which is not the problem; this stops the loop.
        await recordFailure(entries, 'Device blocked by an administrator')
        const status = await outboxStatus()
        return {
          status: 'blocked',
          message: 'This device has been blocked. Ask the control room before scanning further.',
          remaining: status.total,
        }
      }

      if (!response.ok) {
        const message = `Sync failed (${String(response.status)})`
        await recordFailure(entries, message)
        const status = await outboxStatus()
        return { status: 'failed', message, remaining: status.total }
      }

      const result = (await response.json()) as SyncResponse

      manifestStale = manifestStale || result.manifestStale
      manifestVersion = result.manifestVersion
      clockOffsetMs = result.serverTime - Date.now()

      const byId = new Map(entries.map((entry) => [entry.event.clientEventId, entry]))
      const db = await scannerDb()
      const tx = db.transaction('outbox', 'readwrite')
      const acknowledged: string[] = []

      for (const item of result.results) {
        if (!byId.has(item.clientEventId)) continue
        acknowledged.push(item.clientEventId)
        // Acknowledged by id, so a partial answer leaves the rest queued rather than
        // dropping a batch on the strength of a 200.
        await tx.store.delete(item.clientEventId)
        if (!item.agreed) conflicts += 1
      }
      await tx.done
      sent += acknowledged.length

      // Fold the server's answer back into the local manifest. The case that matters:
      // the device admitted somebody the server says was already in. Without this the
      // device would keep saying ADMITTED on a rescan of a pass it now knows is used.
      for (const item of result.results) {
        if (item.collidedWith === null) continue
        const entry = byId.get(item.clientEventId)
        if (entry?.code10 == null) continue
        const at = Date.parse(item.collidedWith.recordedAt)
        if (!Number.isNaN(at)) await markCheckedInLocally(entry.code10, at)
      }

      if (acknowledged.length < entries.length) {
        // The server answered fewer events than were sent. Not expected — it returns
        // one result per event — so stop rather than loop on whatever is left.
        await recordFailure(
          entries.filter((entry) => !acknowledged.includes(entry.event.clientEventId)),
          'No result returned for this event',
        )
        const status = await outboxStatus()
        return { status: 'failed', message: 'Partial sync', remaining: status.total }
      }
    }

    const status = await outboxStatus()
    return {
      status: 'synced',
      sent,
      conflicts,
      remaining: status.total,
      manifestStale,
      manifestVersion,
      clockOffsetMs,
    }
  } finally {
    draining = false
  }
}
