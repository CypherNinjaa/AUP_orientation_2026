/**
 * The volunteer scanner's boundary.
 *
 * This is the only part of the system that has to work with no network, so the
 * shapes here are designed around a device that may be hours behind and may have
 * decided a hundred verdicts on its own before it gets to speak to the server.
 *
 * ## The manifest holds names. It does not hold selfies.
 *
 * `KnownPass` in `packages/core/scan/decide.ts` carries `name`, `program` and
 * `guestNames`, and that is deliberate: a volunteer has to be able to say "Anjali?
 * Go ahead" and to notice three people presenting a two-guest pass. Those strings
 * are already printed on the student's own pass, so a manifest is not the place
 * they leak from.
 *
 * Selfies are different and are never cached (D7). They are biometric-adjacent
 * personal data, they are fetched one at a time over the network as ~60-second
 * signed URLs, and every fetch is audited. A lost phone therefore carries a list
 * of names — bad — and not a face database — much worse.
 *
 * ## Verdicts are computed on the device and re-computed on the server
 *
 * The device sends what it decided (`clientDecision`) as well as what it saw. The
 * server re-runs the same `decideScan` against live data and stores both. When
 * they differ the manifest was stale or the device is being replayed, and the
 * admin console surfaces the count per device. The server's answer always wins;
 * the device's answer is evidence, not an instruction.
 */
import { z } from 'zod'
import { code10, cuid, scanMethod } from './common'
import type { ScanOutcome } from './common'

// ─────────────────────────────────────────────────────────────────────────────
// Manifest
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How old a manifest may be before "not on the list" stops being believable.
 *
 * Thirty minutes. Past that, `decideScan` returns `STALE_MANIFEST` rather than
 * `INVALID` for an unknown code — "I do not know" and "you are not on the list"
 * are different sentences and only one of them should be said to a fresher.
 */
export const MANIFEST_MAX_AGE_MS = 30 * 60_000

/** How often an online device refetches. Well inside the staleness window. */
export const MANIFEST_REFRESH_MS = 5 * 60_000

export const manifestQuery = z.strictObject({
  /**
   * Epoch ms of the device's current snapshot, for a delta.
   *
   * At 15,000 passes a full manifest is roughly 2 MB of JSON, and ten devices
   * refetching that every five minutes over a marquee's wifi is 40 MB an hour of
   * mostly unchanged data. A delta carries the handful of passes issued since.
   * Omit it, or send a `version` that no longer matches, to get everything.
   */
  since: z.coerce.number().int().min(0).optional(),
  /** The `manifestVersion` the device last saw. A mismatch forces a full send. */
  version: z.coerce.number().int().min(0).optional(),
})
export type ManifestQuery = z.infer<typeof manifestQuery>

/** One entry, matching `KnownPass` in `packages/core/scan`. */
export interface ManifestPass {
  passId: string
  registrationId: string
  code10: string
  /** `REVOKED` entries are shipped, never omitted — see below. */
  status: 'ACTIVE' | 'REVOKED'
  registrationStatus: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REVISION_REQUESTED'
  /** Epoch ms, when the server already knows about a check-in. */
  checkedInAt: number | null
  name: string
  program: string
  guestCount: number
  guestNames: string[]
  /** QR life: total scans allowed for this pass (default 1). */
  scanLimit?: number
  /** How many times this pass has already been admitted (default 0 or 1 if checkedInAt). */
  scansCount?: number
}

/** A public verifying key. Only ever the public half (D5). */
export interface ManifestKey {
  keyId: string
  publicKeyPem: string
}

export interface ManifestResponse {
  /** `SystemConfig.manifestVersion`. A change invalidates the device's cache. */
  version: number
  /**
   * When the server built this, epoch ms. The one timestamp the device cannot
   * have invented, so `decideScan` sanity-checks the phone's clock against it.
   */
  generatedAt: number
  maxAgeMs: number
  /**
   * True for a full snapshot, false for a delta.
   *
   * A device applying a delta must merge; a device receiving a full snapshot must
   * replace. Getting that backwards leaves revoked passes in an IndexedDB store
   * forever, so it is stated rather than inferred from whether `since` was sent.
   */
  full: boolean
  gate: {
    id: string
    code: string
    name: string
    /** Epoch ms. Null means unrestricted. */
    opensAt: number | null
    closesAt: number | null
  }
  keys: ManifestKey[]
  /**
   * Passes, including revoked ones.
   *
   * Revoked entries carry `status: 'REVOKED'` and are never dropped. Omitting
   * them would make a revoked pass indistinguishable from one issued after this
   * snapshot — and an unknown pass with a valid signature is admitted, so a
   * revocation that turned a pass into "unknown but validly signed" would
   * un-revoke it. This is the subtlest rule in the offline design.
   */
  passes: ManifestPass[]
  /** On a delta: passes deleted outright. Rare — only a rolled-back import. */
  removedPassIds: string[]
  /** Total on the server, so a device can tell it is holding a partial set. */
  totalPasses: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A device identifier the volunteer app generates once and keeps.
 *
 * Not a fingerprint and not tied to a person: it exists so a device holding a
 * stale manifest, or replaying scans, can be identified and told to resync. A
 * UUID the app writes to IndexedDB on first run is exactly enough.
 */
export const deviceId = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    error: 'Device id must be a UUID.',
  })

/**
 * One scan the device already decided.
 *
 * `clientEventId` is generated on the device and is the idempotency key. The
 * outbox retries on every network flap, so the same event arrives two or three
 * times routinely; the server upserts on this id and returns the original
 * verdict. Without it, one lost response turns into two check-ins.
 */
export const scanEventInput = z.strictObject({
  clientEventId: z.uuid({ error: 'Each scan needs a UUID.' }),
  /** Exactly what was read or typed, before parsing. Diagnoses a bad printer. */
  rawCode: z.string().min(1).max(400),
  method: scanMethod,
  /** Device clock, epoch ms. Recorded for forensics, never used for ordering. */
  scannedAt: z.number().int().min(0),
  /** What the device decided offline, so a disagreement is measurable. */
  clientOutcome: z.enum([
    'ADMITTED',
    'DUPLICATE',
    'REVOKED',
    'NOT_APPROVED',
    'OUT_OF_WINDOW',
    'STALE_MANIFEST',
    'INVALID',
  ]),
  clientReason: z.string().max(40),
  /** Companions the volunteer counted through. */
  guestsAdmitted: z.number().int().min(0).max(2).default(0),
  /** Set when the volunteer waved through an OUT_OF_WINDOW verdict. */
  overridden: z.boolean().default(false),
  /** True when the device's clock failed the sanity check at scan time. */
  clockSuspect: z.boolean().default(false),
  /** False only for a scan taken while the device happened to be online. */
  wasOffline: z.boolean().default(true),
})
export type ScanEventInput = z.infer<typeof scanEventInput>

/**
 * A batch from the outbox.
 *
 * Capped at 200 events. A device that has been offline for the whole morning
 * sends several batches rather than one 5 MB request, so a flaky connection loses
 * 200 events' worth of progress at most instead of all of it.
 */
export const syncRequest = z.strictObject({
  deviceId,
  gateCode: z.string().trim().min(1).max(20).default('MAIN'),
  /** Device clock when the batch was assembled, for drift measurement. */
  sentAt: z.number().int().min(0),
  /** The manifest the device was working from, so staleness is attributable. */
  manifestVersion: z.number().int().min(0),
  manifestGeneratedAt: z.number().int().min(0),
  events: z.array(scanEventInput).min(1).max(200),
})
export type SyncRequest = z.infer<typeof syncRequest>

/**
 * The server's verdict on one submitted event.
 *
 * `agreed: false` is not an error and is not shown to the volunteer as one — the
 * student is already through the gate or already turned away. It is a signal to
 * resync and a number on the admin console.
 */
export interface SyncEventResult {
  clientEventId: string
  /** The row the server wrote. Null when the event was a duplicate submission. */
  scanEventId: string | null
  /**
   * The server's own verdict, recomputed against live data.
   *
   * The full eight-member enum, not the seven a device can reach: a code the
   * device called `STALE_MANIFEST` comes back as `NOT_FOUND` when the server
   * looks and there is genuinely no such pass.
   */
  outcome: ScanOutcome
  reason: string
  agreed: boolean
  /** Set when this scan created the check-in. */
  checkInId: string | null
  /** On DUPLICATE: when the pass actually went through, and on which device. */
  collidedWith: { checkInId: string; recordedAt: string; deviceId: string | null } | null
  /** True when this exact `clientEventId` had already been recorded. */
  alreadyRecorded: boolean
}

export interface SyncResponse {
  batchId: string
  accepted: number
  /** Events whose server verdict differed from the device's. */
  conflicts: number
  results: SyncEventResult[]
  /**
   * Server clock at the moment the batch was processed, epoch ms.
   *
   * The device compares it with its own to measure drift, and shows the volunteer
   * a warning rather than silently producing timestamps that are hours out.
   */
  serverTime: number
  /** True when the device's manifest is behind and it should refetch now. */
  manifestStale: boolean
  manifestVersion: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Online lookups
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up one pass live, for a code the manifest does not have.
 *
 * The offline path is authoritative for a verdict; this exists for the case a
 * volunteer needs a name and a face for a code their device has never seen, with
 * a working network. It never writes a check-in — `/sync` does that — so it
 * cannot admit anybody by itself.
 */
export const scannerLookupQuery = z.strictObject({
  code: code10,
})
export type ScannerLookupQuery = z.infer<typeof scannerLookupQuery>

export interface ScannerLookupResponse {
  found: boolean
  pass: ManifestPass | null
  /** Present and freshly signed only when the volunteer is online. */
  selfieUrl: string | null
  /** Whether this pass has already been through. */
  checkedInAt: string | null
}

export const selfieRequestParams = z.strictObject({
  registrationId: cuid,
})
export type SelfieRequestParams = z.infer<typeof selfieRequestParams>

export interface SelfieResponse {
  /** Signed, ~60 seconds, never cached and never persisted. */
  url: string
  expiresAt: string
  /** The moderator's or volunteer's view is logged. This echoes that it was. */
  audited: true
}

// ─────────────────────────────────────────────────────────────────────────────
// Device registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A device announcing itself when the volunteer signs in.
 *
 * Not authentication — Clerk does that. This records which physical device a
 * volunteer is holding, so "device 4f2a is 40 minutes stale" names something an
 * operator can walk over to.
 */
export const deviceHelloRequest = z.strictObject({
  deviceId,
  gateCode: z.string().trim().min(1).max(20).default('MAIN'),
  /** Free-form, set by the volunteer: "Gate A – red lanyard". */
  label: z.string().trim().max(60).optional(),
  userAgent: z.string().max(300).optional(),
})
export type DeviceHelloRequest = z.infer<typeof deviceHelloRequest>

export interface DeviceHelloResponse {
  deviceId: string
  volunteerName: string | null
  gate: { id: string; code: string; name: string }
  manifestVersion: number
  serverTime: number
}
