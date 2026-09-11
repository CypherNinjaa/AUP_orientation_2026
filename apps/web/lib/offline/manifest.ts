/**
 * The device's copy of the manifest.
 *
 * Fetch, merge, look up. The lookup is the only one of the three on the critical
 * path — a volunteer holding a phone at a queue of freshers — so it is a single
 * indexed `get` by code and nothing else.
 *
 * ## Full versus delta
 *
 * `ManifestResponse.full` is stated by the server, not inferred here. A full
 * snapshot replaces the store; a delta merges into it and applies
 * `removedPassIds`. Getting that backwards leaves revoked passes in the store
 * forever, which is why the flag exists rather than being derived from whether a
 * `since` was sent.
 *
 * ## The rule that is easy to get wrong
 *
 * A manifest must never clear a local check-in that has not synced yet.
 *
 * Consider a device that admits Anjali while offline, then briefly gets signal and
 * refetches the manifest before its outbox drains. The server has no check-in for
 * Anjali, so its row says `checkedInAt: null`. Written naively, that overwrite
 * erases the device's own memory of admitting her, and the next scan of her pass
 * says ADMITTED instead of ALREADY USED — a duplicate entry caused by *getting
 * better connectivity*.
 *
 * So on merge, a local `checkedInAt` survives a null from the server for exactly
 * as long as the scan that produced it is still in the outbox. Once it has
 * drained, the server is authoritative again — which matters in the other
 * direction: an admin who deliberately reverses a check-in needs that reversal to
 * reach the gate, and it does, on the first manifest after the outbox is empty.
 */
import type { ManifestPass, ManifestResponse } from '@orientation/contracts'
import { MANIFEST_MAX_AGE_MS } from '@orientation/contracts'

import { SINGLETON, scannerDb, type ManifestMeta } from './db'

/**
 * Codes with an admitted scan still waiting to sync.
 *
 * Small by construction — the outbox drains in seconds when there is a network and
 * only grows during an outage — so a full walk is cheaper than an index.
 */
export async function pendingAdmittedCodes(): Promise<Set<string>> {
  const db = await scannerDb()
  const codes = new Set<string>()
  for (const entry of await db.getAll('outbox')) {
    if (entry.admitted && entry.code10 !== null) codes.add(entry.code10)
  }
  return codes
}

/**
 * Write a manifest response into the local stores.
 *
 * One transaction over both stores: a device that stored passes and then failed to
 * store the metadata would be holding a snapshot it cannot date, and an undatable
 * snapshot cannot be checked for staleness — the failure would be invisible until
 * a volunteer turned somebody away with it.
 */
export async function applyManifest(response: ManifestResponse): Promise<ManifestMeta> {
  const db = await scannerDb()
  const protectedCodes = await pendingAdmittedCodes()

  const meta: ManifestMeta = {
    version: response.version,
    generatedAt: response.generatedAt,
    maxAgeMs: response.maxAgeMs,
    gate: response.gate,
    keys: response.keys,
    totalPasses: response.totalPasses,
    storedAt: Date.now(),
  }

  const tx = db.transaction(['passes', 'manifest'], 'readwrite')
  const passes = tx.objectStore('passes')

  if (response.full) {
    // Replace. Anything the server did not send in a full snapshot does not exist,
    // and keeping it would mean a rolled-back import stays admittable at the gate.
    await passes.clear()
  }

  for (const pass of response.passes) {
    if (protectedCodes.has(pass.code10)) {
      const local = await passes.get(pass.code10)
      if (local !== undefined) {
        const localScans = local.scansCount ?? (local.checkedInAt != null ? 1 : 0)
        const serverScans = pass.scansCount ?? (pass.checkedInAt != null ? 1 : 0)
        const mergedScans = Math.max(localScans, serverScans)
        // Local unsynced admit/scans outrank the server's not-yet-informed state.
        await passes.put({
          ...pass,
          checkedInAt: local.checkedInAt ?? pass.checkedInAt,
          scansCount: mergedScans,
        })
        continue
      }
    }
    await passes.put(pass)
  }

  // Deltas only, and rare: a pass is normally revoked rather than deleted, and a
  // revoked pass must stay in the manifest. This handles a rolled-back import,
  // where the rows genuinely no longer exist.
  if (response.removedPassIds.length > 0) {
    const byPassId = passes.index('by-pass-id')
    for (const passId of response.removedPassIds) {
      const key = await byPassId.getKey(passId)
      if (key !== undefined) await passes.delete(key)
    }
  }

  await tx.objectStore('manifest').put(meta, SINGLETON)
  await tx.done

  return meta
}

export async function readManifestMeta(): Promise<ManifestMeta | undefined> {
  const db = await scannerDb()
  return db.get('manifest', SINGLETON)
}

/** The one operation on the scan path. Indexed `get`, no parsing, no walk. */
export async function findPass(code10: string): Promise<ManifestPass | undefined> {
  const db = await scannerDb()
  return db.get('passes', code10)
}

export async function countPasses(): Promise<number> {
  const db = await scannerDb()
  return db.count('passes')
}

/**
 * Record locally that a pass has been used.
 *
 * Called the instant a scan admits, before anything touches the network. Without
 * this, scanning the same pass twice on the same offline device admits twice —
 * `decideScan` rule 6 reads `checkedInAt`, and if nothing ever writes it while
 * offline, that rule is dead code for the entire outage.
 *
 * Never overwrites an existing timestamp: the first admit is the one that counts,
 * and that is also the rule the server's `CheckIn.passId` unique index enforces.
 */
export async function markCheckedInLocally(code10: string, at: number): Promise<void> {
  const db = await scannerDb()
  const tx = db.transaction('passes', 'readwrite')
  const existing = await tx.store.get(code10)
  if (existing !== undefined) {
    const currentScans = (existing.scansCount ?? (existing.checkedInAt !== null ? 1 : 0)) + 1
    await tx.store.put({
      ...existing,
      checkedInAt: existing.checkedInAt ?? at,
      scansCount: currentScans,
    })
  }
  await tx.done
}

/**
 * How stale the snapshot is, and whether that is past believing.
 *
 * `undefined` meta is not the same as an old one: a device with no manifest at all
 * has never synced, and the UI says "sync before you scan" rather than showing an
 * age. Both are `stale`, and only one is a device that should be at a gate.
 */
export function manifestAge(
  meta: ManifestMeta | undefined,
  now = Date.now(),
): { ageMs: number | null; stale: boolean; maxAgeMs: number } {
  if (meta === undefined) return { ageMs: null, stale: true, maxAgeMs: MANIFEST_MAX_AGE_MS }
  const ageMs = Math.max(0, now - meta.generatedAt)
  return { ageMs, stale: ageMs > meta.maxAgeMs, maxAgeMs: meta.maxAgeMs }
}
