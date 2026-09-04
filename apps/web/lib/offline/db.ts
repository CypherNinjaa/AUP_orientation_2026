/**
 * The volunteer device's local database.
 *
 * Four object stores in one IndexedDB database, and between them they are the
 * reason a gate keeps moving when the wifi does not. Nothing here talks to the
 * network; `manifest.ts` fills the stores, `outbox.ts` drains one of them, and
 * `scan.ts` reads them to reach a verdict.
 *
 * ## Why IndexedDB and not localStorage
 *
 * Fifteen thousand passes is roughly 2 MB of JSON. `localStorage` caps at 5 MB
 * *per origin* across everything, is synchronous — so every read blocks the frame
 * the camera is trying to paint — and offers no indexes, meaning a lookup by code
 * would be a linear scan through a parsed 2 MB array on every frame that decodes
 * a QR. IndexedDB is asynchronous, indexed, and bounded by disk rather than by a
 * 5 MB cliff.
 *
 * ## What is in here, and what is deliberately not
 *
 * In: pass verification data including student names (D7 — a volunteer must be
 * able to say "Anjali? Go ahead"), the manifest's own metadata, this device's
 * identity, and the outbox of scans that have not reached the server.
 *
 * Not in: selfies, ever. Not in: signing keys of any kind — the manifest's public
 * keys are imported into memory at start-up by `scan.ts` and are refetched rather
 * than persisted. That costs a cold start with no network the ability to verify a
 * signature, which sounds worse than it is: every pass in the manifest is still
 * matched by code, and an *unknown* code with no verifiable signature is refused
 * either way. So the failure mode of a keyless cold start is "a student who
 * registered in the last hour has to go to the help desk", not "anything is
 * admitted".
 *
 * ## Versioning
 *
 * One version, and `upgrade` builds everything from nothing. If the shape ever
 * changes the right migration is almost certainly to drop the stores and refetch:
 * the manifest is a cache with an authoritative origin, so a migration that tries
 * to preserve it is risk taken on for no gain. The outbox is the exception — it
 * holds the only copy of scans taken offline — so any future version bump must
 * carry `outbox` forward untouched.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ManifestPass, ScanEventInput } from '@orientation/contracts'

const DB_NAME = 'orientation-scanner'
const DB_VERSION = 1

/** Both singleton stores use one fixed key. Named rather than `1` or `''`. */
export const SINGLETON = 'current' as const

/**
 * What the device knows about the snapshot it is holding.
 *
 * `generatedAt` is the load-bearing field: it is the one timestamp the device
 * cannot have invented, so `decideScan` uses it to catch a wrong device clock.
 */
export interface ManifestMeta {
  version: number
  /** Epoch ms, from the server. */
  generatedAt: number
  maxAgeMs: number
  gate: { id: string; code: string; name: string; opensAt: number | null; closesAt: number | null }
  /** Public verifying keys, as PEM. Imported into memory on read; see `scan.ts`. */
  keys: { keyId: string; publicKeyPem: string }[]
  /** Passes the server says exist, so the device can tell it holds a partial set. */
  totalPasses: number
  /** Device clock when this was stored. Diagnostic only — never used for windows. */
  storedAt: number
}

/** This device's identity and the gate it is working. */
export interface DeviceRecord {
  deviceId: string
  gateCode: string
  label: string | null
  /** `serverTime - Date.now()` at the last hello, ms. Positive: device is behind. */
  clockOffsetMs: number | null
  lastHelloAt: number | null
  lastSyncAt: number | null
}

/**
 * A scan waiting to reach the server.
 *
 * `ScanEventInput` is the wire shape and is not modified — the extra fields are
 * local bookkeeping and are stripped before the batch is posted. `attempts` is
 * what turns a permanently poisoned event into something visible rather than an
 * infinite retry loop nobody notices.
 */
export interface OutboxEntry {
  event: ScanEventInput
  /**
   * The code the scan resolved to, once, at scan time.
   *
   * `event.rawCode` is a signed envelope on the QR path and re-parsing it on every
   * manifest merge would mean re-verifying, in a transaction, on the wrong thread.
   * This is the resolved answer, and it is what `pendingAdmittedCodes()` reads to
   * protect an unsynced local check-in from being erased by a manifest refetch.
   */
  code10: string | null
  /** Whether this scan admitted somebody. Only those need protecting on merge. */
  admitted: boolean
  /** Device clock when queued, epoch ms. The drain order. */
  queuedAt: number
  attempts: number
  lastError: string | null
}

interface ScannerSchema extends DBSchema {
  /**
   * Keyed by `code10`, because that is what a scan produces and a lookup by key
   * is the one operation on the critical path. `by-pass-id` exists solely for
   * `removedPassIds`, which is rare enough to afford an index walk.
   */
  passes: {
    key: string
    value: ManifestPass
    indexes: { 'by-pass-id': string }
  }
  manifest: {
    key: typeof SINGLETON
    value: ManifestMeta
  }
  device: {
    key: typeof SINGLETON
    value: DeviceRecord
  }
  outbox: {
    key: string
    value: OutboxEntry
    indexes: { 'by-queued-at': number }
  }
}

export type ScannerDb = IDBPDatabase<ScannerSchema>

let connection: Promise<ScannerDb> | null = null

/**
 * Open the database, once per page.
 *
 * The promise is cached rather than the resolved handle: two callers racing at
 * start-up — the manifest fetch and the outbox drain, which is exactly what
 * happens — would otherwise each open a connection, and the second would block on
 * the first's `versionchange` transaction.
 */
export function scannerDb(): Promise<ScannerDb> {
  if (typeof indexedDB === 'undefined') {
    // Reached only if this module is called during a server render. Not a
    // recoverable condition and not worth a silent no-op: a scanner that thinks
    // it has storage and does not would drop scans.
    return Promise.reject(new Error('Offline storage is only available in the browser.'))
  }

  connection ??= openDB<ScannerSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const passes = db.createObjectStore('passes', { keyPath: 'code10' })
      passes.createIndex('by-pass-id', 'passId', { unique: true })

      db.createObjectStore('manifest')
      db.createObjectStore('device')

      const outbox = db.createObjectStore('outbox', { keyPath: 'event.clientEventId' })
      outbox.createIndex('by-queued-at', 'queuedAt')
    },

    blocked() {
      // Another tab is holding an older version open. The scanner is a single-tab
      // app in practice, so this is a developer with two tabs rather than a
      // volunteer, and the console is the right audience.
      console.warn('[scanner] Database upgrade blocked by another tab.')
    },

    blocking() {
      // This tab is the one in the way. Close so the other can upgrade; the next
      // call reopens. Losing the handle is safe, losing the data would not be.
      void connection?.then((db) => {
        db.close()
        connection = null
      })
    },

    terminated() {
      // The browser killed the connection — backgrounded PWA, low memory. Drop the
      // cached promise so the next call reconnects instead of using a dead handle.
      connection = null
    },
  })

  return connection
}

/**
 * This device's identity, created on first run and never changed.
 *
 * Not a fingerprint: a UUID with no relationship to hardware or to a person. It
 * exists so "device 4f2a is forty minutes stale" names something an operator can
 * walk over to, and so an outbox surviving a reload is attributable to the device
 * that produced it.
 */
export async function ensureDevice(gateCode: string): Promise<DeviceRecord> {
  const db = await scannerDb()
  const existing = await db.get('device', SINGLETON)

  if (existing !== undefined) {
    if (existing.gateCode === gateCode) return existing
    // A volunteer moved to another gate mid-shift. The identity persists; only the
    // posting changes, so the device's scan history stays one thread.
    const moved: DeviceRecord = { ...existing, gateCode }
    await db.put('device', moved, SINGLETON)
    return moved
  }

  const created: DeviceRecord = {
    deviceId: crypto.randomUUID(),
    gateCode,
    label: null,
    clockOffsetMs: null,
    lastHelloAt: null,
    lastSyncAt: null,
  }
  await db.put('device', created, SINGLETON)
  return created
}

export async function patchDevice(patch: Partial<DeviceRecord>): Promise<void> {
  const db = await scannerDb()
  const existing = await db.get('device', SINGLETON)
  if (existing === undefined) return
  await db.put('device', { ...existing, ...patch }, SINGLETON)
}

/**
 * Wipe everything except the outbox.
 *
 * For sign-out on a shared device: the next volunteer must not inherit a list of
 * student names. The outbox survives deliberately — it holds scans that exist
 * nowhere else, and discarding it to tidy up a sign-out would lose check-ins.
 * `outbox.ts` reports what is still queued so a volunteer can be told not to hand
 * the phone over yet.
 */
export async function clearIdentifyingData(): Promise<void> {
  const db = await scannerDb()
  const tx = db.transaction(['passes', 'manifest', 'device'], 'readwrite')
  await Promise.all([
    tx.objectStore('passes').clear(),
    tx.objectStore('manifest').clear(),
    tx.objectStore('device').clear(),
    tx.done,
  ])
}
