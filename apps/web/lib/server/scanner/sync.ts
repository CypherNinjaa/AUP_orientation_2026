/**
 * Reconciling offline scans.
 *
 * A volunteer's phone decides every scan on its own and queues the result. When the
 * network comes back, the outbox posts up to 200 of them here. This module's job is to
 * turn that queue into `ScanEvent` rows (every attempt) and `CheckIn` rows (the
 * arrivals), without ever admitting one student twice and without losing the evidence
 * when a device got it wrong.
 *
 * ## The server re-decides. It does not rubber-stamp.
 *
 * The device's verdict arrives as `clientOutcome` and is stored as `clientDecision`,
 * but it is evidence, not an instruction. The server re-runs the same pure
 * `decideScan` against live data and its own clock, and the server's answer is what
 * lands in `outcome`. That is the whole point of `decide.ts` being pure and shared:
 * both sides run identical logic, so a disagreement is always attributable to a
 * difference in *input* — a stale manifest, a wrong clock — rather than to two
 * implementations having drifted apart.
 *
 * `agreed: false` comes back in the response and is not an error. It is not shown to
 * the volunteer as one either: by the time the sync happens the student is inside the
 * hall and nothing on the phone can change that. It is a number on the admin console,
 * and a per-device `conflictCount` that says "this phone needs its clock fixed" or
 * "this phone has not synced in an hour".
 *
 * ## Two inputs the server takes from the device on purpose
 *
 * `scannedAt` and `manifestGeneratedAt`. Both are device-reported and both could be
 * lies, and both are still the right values to use:
 *
 * - `scannedAt` is when the student actually stood at the gate. `recordedAt` is when
 *   the network came back. Ordering uses `recordedAt` (D9); forensics uses the pair.
 * - `manifestGeneratedAt` is what the device knew. Feeding the server's own "now"
 *   into `ScanContext` would make every offline scan look clock-suspect, because
 *   `decideScan` flags a `scannedAt` that predates the manifest by more than five
 *   minutes — which describes every scan taken during an hour-long outage.
 *
 * ## Duplicates
 *
 * Two different collisions, two different mechanisms:
 *
 * 1. **The same scan arriving twice.** The outbox retries on every flap, so this is
 *    routine, not exceptional. `ScanEvent.clientEventId` is UNIQUE and the device
 *    generates it before the scan is queued, so the second arrival finds the first
 *    and gets the original verdict back with `alreadyRecorded: true`. Without this,
 *    one dropped HTTP response becomes two check-ins for one student.
 *
 * 2. **Two different scans of the same pass.** Two lanes, one screenshot forwarded to
 *    a friend, or a student who walked back out and in again. `CheckIn.passId` is
 *    UNIQUE and that unique index *is* the concurrency control (D2/D9) — there is no
 *    lock anywhere in this path, deliberately, because a lock across a sync of 200
 *    events would serialise the whole fleet. The insert that loses raises `P2002`,
 *    which becomes a `DUPLICATE` verdict carrying `collidedWith` so the console can
 *    show which check-in won and from which device.
 */
import 'server-only'

import { Prisma, prisma } from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import { adminChannel } from '@orientation/core/realtime'
import {
  decideScan,
  type CodeSource,
  type KnownPass,
  type ScanContext,
  type ScanInput,
  type SignatureState,
} from '@orientation/core/scan'
import { parseCode10, verifyPassPayload } from '@orientation/core/pass'
import {
  MANIFEST_MAX_AGE_MS,
  type ScanEventInput,
  type ScanOutcome,
  type SyncEventResult,
  type SyncRequest,
  type SyncResponse,
} from '@orientation/contracts'

import type { Actor } from '../auth'
import { writeAudit } from '../audit'
import { getConfig } from '../config'
import { abort } from '../http'
import { getVerifyingKeys } from '../pass'
import { publish } from '../redis'
import type { RequestMeta } from '../registration'

/**
 * Device clock offset past which the console flags a phone.
 *
 * Not enforced — a scan is never rejected for a bad clock, because the student is
 * real and standing there. It only decides whether `clockOffsetMs` is worth
 * surfacing.
 */
const CLOCK_WARN_MS = 60_000

// ─────────────────────────────────────────────────────────────────────────────
// Parsing what the device read
// ─────────────────────────────────────────────────────────────────────────────

/** `MANUAL_CODE` in the wire contract is `KEYPAD` in the decision engine. */
function toCodeSource(method: ScanEventInput['method']): CodeSource {
  return method === 'MANUAL_CODE' ? 'KEYPAD' : method
}

interface ParsedCode {
  code: string | null
  signature: SignatureState
  notBefore: number | null
  notAfter: number | null
}

/**
 * Turn a raw scanned string into the three fields `decideScan` needs.
 *
 * The QR path verifies the ECDSA envelope with every currently trusted public key.
 * Core's verifier reports `MALFORMED` for a string that is not one of our envelopes
 * at all; `decideScan` has no such state and instead expects `code: null`, which its
 * rule 1 turns into "Not an Orientation pass". So `MALFORMED` maps to a null code
 * rather than to a signature state.
 *
 * The barcode and keypad paths carry no signature by construction — a Code128 strip
 * and a ten-digit keypad hold digits, not 700 bytes of base64 — so they pass `ABSENT`
 * and rely on manifest membership. That is why `decideScan` treats an unknown code
 * differently depending on manifest age.
 */
function parseScanned(event: ScanEventInput, keys: ReturnType<typeof getVerifyingKeys>): ParsedCode {
  if (event.method !== 'QR') {
    return {
      code: parseCode10(event.rawCode),
      signature: 'ABSENT',
      notBefore: null,
      notAfter: null,
    }
  }

  const result = verifyPassPayload(event.rawCode, keys)

  if (result.envelope === null) {
    // MALFORMED. Not our QR at all — a UPI code, a wifi code, a poster.
    return { code: null, signature: 'ABSENT', notBefore: null, notAfter: null }
  }

  return {
    code: result.envelope.code10,
    // The remaining three states line up one-for-one with the decision engine's.
    signature: result.state === 'MALFORMED' ? 'ABSENT' : result.state,
    // The gate schedule (Gate.opensAt) governs early entry; notBefore is relaxed
    // so QR scans match barcode admissions without date disparity.
    notBefore: null,
    notAfter: result.envelope.notAfter,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Live pass lookup
// ─────────────────────────────────────────────────────────────────────────────

const LIVE_PASS_SELECT = {
  id: true,
  registrationId: true,
  code10: true,
  status: true,
  guestCount: true,
  scanLimit: true,
  checkIn: {
    select: { id: true, recordedAt: true, deviceId: true },
  },
  _count: {
    select: {
      scanEvents: {
        where: { outcome: 'ADMITTED' as const },
      },
    },
  },
  registration: {
    select: {
      status: true,
      name: true,
      program: true,
      companions: { select: { name: true }, orderBy: { position: 'asc' as const } },
    },
  },
} as const

type LivePass = Prisma.PassGetPayload<{ select: typeof LIVE_PASS_SELECT }>

/**
 * The live equivalent of a manifest row.
 *
 * `REJECTED` has no place in `KnownPass.registrationStatus` and does not need one: a
 * rejection revokes the pass in the same transaction, and `status: 'REVOKED'` is
 * checked by `decideScan` before registration status is. Mapping it to
 * `REVISION_REQUESTED` is therefore unreachable in practice and is written out rather
 * than cast, so that a future sixth status fails loudly here instead of quietly
 * admitting somebody.
 */
function toKnownPass(pass: LivePass): KnownPass {
  const scanLimit = pass.scanLimit ?? 1
  const scansCount = pass._count?.scanEvents ?? (pass.checkIn !== null ? 1 : 0)
  return {
    passId: pass.id,
    registrationId: pass.registrationId,
    code10: pass.code10,
    status: pass.status,
    registrationStatus:
      pass.registration.status === 'REJECTED' ? 'REVISION_REQUESTED' : pass.registration.status,
    checkedInAt: pass.checkIn === null ? null : pass.checkIn.recordedAt.getTime(),
    name: pass.registration.name,
    program: pass.registration.program,
    guestCount: pass.guestCount,
    guestNames: pass.registration.companions.map((companion) => companion.name),
    scanLimit,
    scansCount,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Device bookkeeping
// ─────────────────────────────────────────────────────────────────────────────

interface ResolvedGate {
  id: string
  code: string
}

async function resolveGate(code: string): Promise<ResolvedGate> {
  const gate = await prisma.gate.findUnique({
    where: { code },
    select: { id: true, code: true, isActive: true },
  })

  if (gate === null) {
    abort('NOT_FOUND', `No gate is configured with the code "${code}". Check the device settings.`)
  }
  if (!gate.isActive) {
    abort('CONFLICT', `Gate "${code}" is switched off. Ask the control room which gate to use.`)
  }

  return { id: gate.id, code: gate.code }
}

/**
 * Find or register the device, and refuse a blocked one.
 *
 * A blocked device is one an admin marked lost or compromised. Its scans already
 * recorded stay recorded — D9 forbids rewriting history, and the people it admitted
 * really did walk in — but nothing further is accepted. `409` rather than `403` so the
 * outbox treats it as terminal and stops retrying: a phone that retries a rejected
 * batch every thirty seconds for twelve hours is a second incident on top of the
 * first.
 */
async function resolveDevice(
  deviceId: string,
  gate: ResolvedGate,
  actor: Actor,
): Promise<{ id: string; isBlocked: boolean }> {
  const device = await prisma.scannerDevice.upsert({
    where: { deviceId },
    create: { deviceId, gateId: gate.id, lastSeenById: actor.id },
    update: {},
    select: { id: true, isBlocked: true, blockedReason: true },
  })

  if (device.isBlocked) {
    abort(
      'CONFLICT',
      device.blockedReason === null
        ? 'This device has been blocked. Ask the control room.'
        : `This device has been blocked: ${device.blockedReason}`,
    )
  }

  return { id: device.id, isBlocked: device.isBlocked }
}

// ─────────────────────────────────────────────────────────────────────────────
// One event
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translate a device-reachable verdict into the server's wider vocabulary.
 *
 * `ScanOutcome` has eight members on the wire and `decideScan` produces seven. The
 * missing one is `NOT_FOUND`, and it exists because the two sides are answering
 * subtly different questions. A device that cannot find a code in its snapshot says
 * `STALE_MANIFEST` — "I might be out of date". The server has no snapshot; it has the
 * table. When it cannot find the code, there is genuinely no such pass.
 *
 * The exception is a signature that actively failed. That is not "no such pass", it is
 * "somebody presented a tampered pass", and flattening it to `NOT_FOUND` would lose
 * the only signal that distinguishes a typo from an attack.
 */
function serverOutcome(
  decided: ScanEventInput['clientOutcome'],
  signature: SignatureState,
  known: KnownPass | null,
  hadCode: boolean,
): ScanOutcome {
  if (!hadCode) return 'INVALID'
  if (known !== null) return decided
  if (signature === 'INVALID' || signature === 'UNKNOWN_KEY') return 'INVALID'
  return 'NOT_FOUND'
}

interface EventContext {
  gate: ResolvedGate
  deviceId: string
  actor: Actor
  batchId: string
  keys: ReturnType<typeof getVerifyingKeys>
  scanContext: ScanContext
  /** The manifest the device reported holding, recorded on every event it produced. */
  clientManifestVersion: number
  clientManifestGeneratedAt: Date | null
}

async function processEvent(
  event: ScanEventInput,
  ctx: EventContext,
): Promise<SyncEventResult> {
  // 1 ─ Idempotency. The outbox retries; this is the routine path, not the rare one.
  const existing = await prisma.scanEvent.findUnique({
    where: { clientEventId: event.clientEventId },
    select: {
      id: true,
      outcome: true,
      reason: true,
      clientDecision: true,
      wonCheckIn: { select: { id: true } },
      duplicateOf: { select: { id: true, recordedAt: true, deviceId: true } },
    },
  })

  if (existing !== null) {
    return {
      clientEventId: event.clientEventId,
      scanEventId: existing.id,
      outcome: existing.outcome,
      reason: existing.reason ?? '',
      // Recomputed from what was stored rather than re-derived, so a replay reports
      // exactly what the first attempt reported.
      agreed: existing.clientDecision === null || existing.clientDecision === existing.outcome,
      checkInId: existing.wonCheckIn?.id ?? null,
      collidedWith:
        existing.duplicateOf === null
          ? null
          : {
              checkInId: existing.duplicateOf.id,
              recordedAt: existing.duplicateOf.recordedAt.toISOString(),
              deviceId: existing.duplicateOf.deviceId,
            },
      alreadyRecorded: true,
    }
  }

  // 2 ─ Re-derive the code and the signature verdict from the raw string. The device's
  //     parse is not trusted; the raw bytes are re-parsed here.
  const parsed = parseScanned(event, ctx.keys)

  // 3 ─ Live data in place of the manifest row.
  const live =
    parsed.code === null
      ? null
      : await prisma.pass.findUnique({ where: { code10: parsed.code }, select: LIVE_PASS_SELECT })

  const known = live === null ? null : toKnownPass(live)

  const input: ScanInput = {
    code: parsed.code,
    source: toCodeSource(event.method),
    signature: parsed.signature,
    notBefore: parsed.notBefore,
    notAfter: parsed.notAfter,
    scannedAt: event.scannedAt,
  }

  const decision = decideScan(input, known, ctx.scanContext)

  const outcome = serverOutcome(decision.outcome, parsed.signature, known, parsed.code !== null)

  // 4 ─ An override is only honoured where the verdict said it could be. A device that
  //     claims an override on a REVOKED pass is either compromised or buggy; either way
  //     the answer is the verdict, and the claim is recorded on the event.
  const overrideHonoured = event.overridden && decision.overridable
  const admits = outcome === 'ADMITTED' && (decision.admits || overrideHonoured)

  const scannedAt = new Date(event.scannedAt)
  const recordedAt = new Date()

  const eventData = {
    clientEventId: event.clientEventId,
    passId: live?.id ?? null,
    rawCode: event.rawCode,
    method: event.method,
    reason: decision.reason,
    gateId: ctx.gate.id,
    scannedById: ctx.actor.id,
    deviceId: ctx.deviceId,
    scannedAt,
    recordedAt,
    wasOffline: event.wasOffline,
    clientDecision: event.clientOutcome,
    clientReason: event.clientReason,
    clientManifestVersion: ctx.clientManifestVersion,
    clientManifestGeneratedAt: ctx.clientManifestGeneratedAt,
    overridden: event.overridden,
    clockSuspect: decision.clockSuspect || event.clockSuspect,
    syncBatchId: ctx.batchId,
  }

  const agreed = event.clientOutcome === outcome

  // 5 ─ Not admitted: one row in the attempt log and nothing else.
  if (!admits || live === null) {
    const written = await prisma.scanEvent.create({
      data: {
        ...eventData,
        outcome,
        // A DUPLICATE knows which check-in it lost to, even when it never attempted an
        // insert — the manifest already told the device, and the console needs the link.
        duplicateOfId: outcome === 'DUPLICATE' ? (live?.checkIn?.id ?? null) : null,
      },
      select: { id: true },
    })

    return {
      clientEventId: event.clientEventId,
      scanEventId: written.id,
      outcome,
      reason: decision.reason,
      agreed,
      checkInId: null,
      collidedWith:
        outcome === 'DUPLICATE' && live !== null && live.checkIn !== null
          ? {
              checkInId: live.checkIn.id,
              recordedAt: live.checkIn.recordedAt.toISOString(),
              deviceId: live.checkIn.deviceId,
            }
          : null,
      alreadyRecorded: false,
    }
  }

  // 6 ─ Admitted. `ScanEvent` then `CheckIn`, one transaction, exactly as
  //     `admin/registrations.ts` does it — the two rows are one fact and a crash
  //     between them would leave an arrival with no attempt behind it.
  const guestsAdmitted = Math.min(event.guestsAdmitted, live.guestCount)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const written = await tx.scanEvent.create({
        data: { ...eventData, outcome: 'ADMITTED' },
        select: { id: true },
      })

      let checkInId = live.checkIn?.id ?? null

      // CheckIn.passId is UNIQUE. On the first admission, create the CheckIn row.
      // For multi-scan passes (scanLimit > 1), subsequent admissions write ScanEvent
      // and reuse the existing CheckIn record.
      if (checkInId === null) {
        const checkIn = await tx.checkIn.create({
          data: {
            passId: live.id,
            gateId: ctx.gate.id,
            scannedById: ctx.actor.id,
            method: event.method,
            guestsAdmitted,
            scannedAt,
            recordedAt,
            deviceId: ctx.deviceId,
            wasOffline: event.wasOffline,
            scanEventId: written.id,
          },
          select: { id: true },
        })
        checkInId = checkIn.id
      }

      return { scanEventId: written.id, checkInId }
    })

    return {
      clientEventId: event.clientEventId,
      scanEventId: result.scanEventId,
      outcome: 'ADMITTED',
      reason: decision.reason,
      agreed,
      checkInId: result.checkInId,
      collidedWith: null,
      alreadyRecorded: false,
    }
  } catch (error) {
    const isDuplicate =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

    // `guestsAdmitted <= Pass.guestCount` is enforced in the database as well as clamped
    // above. Reaching that constraint means the clamp and the constraint disagree, which
    // is a bug worth seeing rather than one to swallow into a friendly verdict.
    if (!isDuplicate) throw error

    // Somebody else got there first — the other lane, or this device's own earlier
    // batch. Write the attempt as the DUPLICATE it turned out to be, pointing at the
    // check-in that won. This is the write-order-wins rule (D9) in its concrete form.
    const winner = await prisma.checkIn.findUnique({
      where: { passId: live.id },
      select: { id: true, recordedAt: true, deviceId: true },
    })

    const written = await prisma.scanEvent.create({
      data: {
        ...eventData,
        outcome: 'DUPLICATE',
        reason: 'ALREADY_CHECKED_IN',
        duplicateOfId: winner?.id ?? null,
      },
      select: { id: true },
    })

    return {
      clientEventId: event.clientEventId,
      scanEventId: written.id,
      outcome: 'DUPLICATE',
      reason: 'ALREADY_CHECKED_IN',
      // The device said ADMITTED and it was right at the time — its manifest simply
      // predated the other lane's scan. Recorded as a disagreement because that is
      // what it is, and because the count is how the console spots a device that has
      // stopped syncing.
      agreed: false,
      checkInId: null,
      collidedWith:
        winner === null
          ? null
          : {
              checkInId: winner.id,
              recordedAt: winner.recordedAt.toISOString(),
              deviceId: winner.deviceId,
            },
      alreadyRecorded: false,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The batch
// ─────────────────────────────────────────────────────────────────────────────

export async function syncScans(
  body: SyncRequest,
  actor: Actor,
  meta: RequestMeta,
): Promise<SyncResponse> {
  const [config, gate] = await Promise.all([getConfig(), resolveGate(body.gateCode)])

  await resolveDevice(body.deviceId, gate, actor)

  const keys = getVerifyingKeys()
  const serverTime = Date.now()

  // A batch id, so every event that arrived together can be found together. Not a
  // database row: the batch is a grouping for forensics, not an entity with a
  // lifecycle, and `ScanEvent.syncBatchId` is indexed for exactly this query.
  const batchId = crypto.randomUUID()

  // Gate windows come from the gate row, which is the authority — a device may be
  // holding a window an admin has since moved.
  const gateRow = await prisma.gate.findUnique({
    where: { id: gate.id },
    select: { opensAt: true, closesAt: true },
  })

  const scanContext: ScanContext = {
    // The device's own manifest timestamp, not the server's clock. See the module note:
    // using `serverTime` here would mark every scan taken during an outage as
    // clock-suspect, which is the opposite of useful.
    manifestGeneratedAt: body.manifestGeneratedAt,
    manifestMaxAgeMs: MANIFEST_MAX_AGE_MS,
    gateOpensAt: gateRow?.opensAt?.getTime() ?? null,
    gateClosesAt: gateRow?.closesAt?.getTime() ?? null,
  }

  const eventContext: EventContext = {
    gate,
    deviceId: body.deviceId,
    actor,
    batchId,
    keys,
    scanContext,
    clientManifestVersion: body.manifestVersion,
    clientManifestGeneratedAt:
      body.manifestGeneratedAt === 0 ? null : new Date(body.manifestGeneratedAt),
  }

  // Sequential, in the order the device queued them. Not `Promise.all`: two events in
  // one batch can be for the same pass, and the unique index must see them one at a
  // time for "the first one wins" to mean the device's own ordering rather than
  // whichever connection the pool handed out first.
  const results: SyncEventResult[] = []
  for (const event of body.events) {
    results.push(await processEvent(event, eventContext))
  }

  const fresh = results.filter((result) => !result.alreadyRecorded)
  const accepted = fresh.filter((result) => result.checkInId !== null).length
  const conflicts = fresh.filter((result) => !result.agreed).length

  // Device clock minus server clock. `sentAt` is the closest thing to a paired reading
  // available — it was stamped a few hundred milliseconds before `serverTime`.
  const clockOffsetMs = body.sentAt - serverTime

  await prisma.scannerDevice.update({
    where: { deviceId: body.deviceId },
    data: {
      gateId: gate.id,
      lastSeenById: actor.id,
      manifestVersion: body.manifestVersion,
      manifestGeneratedAt: eventContext.clientManifestGeneratedAt,
      clockOffsetMs,
      lastSyncAt: new Date(serverTime),
      lastScanAt: new Date(serverTime),
      // Increments, not assignments: two batches can be in flight from one device and
      // a read-then-write would lose one of them.
      scanCount: { increment: fresh.length },
      conflictCount: { increment: conflicts },
      ...(meta.userAgent === undefined ? {} : { userAgent: meta.userAgent }),
    },
  })

  await writeAudit({
    action: AUDIT_ACTIONS.SCANNER_SYNCED,
    entityType: 'ScannerDevice',
    entityId: body.deviceId,
    actor,
    after: {
      batchId,
      gate: gate.code,
      events: body.events.length,
      fresh: fresh.length,
      replays: results.length - fresh.length,
      accepted,
      conflicts,
      manifestVersion: body.manifestVersion,
      currentManifestVersion: config.manifestVersion,
      ...(Math.abs(clockOffsetMs) > CLOCK_WARN_MS ? { clockOffsetMs } : {}),
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  // Fire and forget. The console's live numbers are a convenience; a Redis outage must
  // not fail a sync that has already been committed.
  publish(adminChannel(), {
    type: 'scanner.synced',
    deviceId: body.deviceId,
    accepted,
    conflicts,
    at: serverTime,
  })

  if (accepted > 0) {
    publish(adminChannel(), {
      type: 'checkin.recorded',
      passId: results.find((r) => r.checkInId !== null)?.checkInId ?? '',
      gate: gate.code,
      at: serverTime,
    })
  }

  return {
    batchId,
    accepted,
    conflicts,
    results,
    serverTime,
    // Told rather than implied. A device on an old version has to refetch before its
    // next scan, and the sync response is the one message it is guaranteed to read.
    manifestStale: body.manifestVersion !== config.manifestVersion,
    manifestVersion: config.manifestVersion,
  }
}
