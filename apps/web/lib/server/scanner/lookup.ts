/**
 * The two online-only scanner reads: one pass, and one device handshake.
 *
 * Both exist for the moments when the network *is* there. The offline path never
 * touches either — a scan is decided from the manifest — so an outage degrades these
 * to unavailable without degrading the gate.
 */
import 'server-only'

import { prisma } from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import type {
  DeviceHelloRequest,
  DeviceHelloResponse,
  ManifestPass,
  ScannerLookupResponse,
} from '@orientation/contracts'

import type { Actor } from '../auth'
import { auditPiiAccess } from '../audit'
import { getConfig } from '../config'
import { abort } from '../http'
import { issueSelfiePath } from '../media/selfie-url'
import type { RequestMeta } from '../registration'

// ─────────────────────────────────────────────────────────────────────────────
// Lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything about one pass, for a volunteer who is standing in front of a problem.
 *
 * This is the "the app says already used but she swears she just arrived" endpoint. It
 * returns the same shape the manifest ships plus the two things the manifest
 * deliberately withholds: a signed selfie path, and the server's own view of whether a
 * check-in exists.
 *
 * It never writes a check-in. `/api/scanner/sync` does that, and only that. A lookup
 * that could admit somebody would be a second, un-audited entry path with none of the
 * duplicate protection — and it would be reachable by typing a code into a URL bar.
 *
 * The selfie path is issued only when the caller asks for it, is bound to this
 * volunteer's user id, expires in sixty seconds, and writes a `SELFIE_VIEWED` audit
 * entry when it is redeemed (D14, DPDP). Issuing it here rather than embedding a
 * Cloudinary URL is what keeps "who looked at this student's face" answerable.
 */
export async function lookupPass(
  code10: string,
  actor: Actor,
  meta: RequestMeta,
): Promise<ScannerLookupResponse> {
  const pass = await prisma.pass.findUnique({
    where: { code10 },
    select: {
      id: true,
      registrationId: true,
      code10: true,
      status: true,
      guestCount: true,
      checkIn: { select: { recordedAt: true } },
      registration: {
        select: {
          status: true,
          name: true,
          program: true,
          selfiePublicId: true,
          companions: { select: { name: true }, orderBy: { position: 'asc' } },
        },
      },
    },
  })

  if (pass === null) {
    // A 200 with `found: false`, not a 404. The volunteer typed ten digits and the
    // answer "there is no such pass" is a result, not a failure — and the scanner UI
    // has one code path for a result and another for an error.
    return { found: false, pass: null, selfieUrl: null, checkedInAt: null }
  }

  const manifestPass: ManifestPass = {
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
  }

  // The path is only minted when there is something behind it. A path to a purged
  // selfie is a 404 the volunteer has to interpret; `null` is one they do not.
  const selfieUrl =
    pass.registration.selfiePublicId === null
      ? null
      : issueSelfiePath(pass.registrationId, actor.id).path

  await auditPiiAccess({
    action: AUDIT_ACTIONS.SELFIE_VIEWED,
    entityType: 'Registration',
    entityId: pass.registrationId,
    actor,
    after: {
      via: 'scanner/lookup',
      code10,
      // Recorded so that "the volunteer looked up a pass" and "the volunteer was handed
      // a way to see a face" stay separable questions.
      selfieOffered: selfieUrl !== null,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return {
    found: true,
    pass: manifestPass,
    selfieUrl,
    checkedInAt: pass.checkIn === null ? null : pass.checkIn.recordedAt.toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hello
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Device registration, and the clock reading that goes with it.
 *
 * Called once when a volunteer opens the scanner and picks a gate. Three jobs:
 *
 * 1. Create the `ScannerDevice` row so the console can list "six phones at MAIN, one
 *    of them last synced forty minutes ago".
 * 2. Refuse a blocked device *before* the volunteer starts scanning, rather than after
 *    a shift's worth of scans have queued up in an outbox that will never drain.
 * 3. Hand back `serverTime`, so the device can measure its own offset and warn its user
 *    instead of silently stamping every scan with a wrong `scannedAt`.
 *
 * The gate is looked up, never created. A typo here would otherwise produce a second
 * gate nobody is standing at, and split the arrival count across two rows.
 */
export async function deviceHello(
  body: DeviceHelloRequest,
  actor: Actor,
  meta: RequestMeta,
): Promise<DeviceHelloResponse> {
  const gate = await prisma.gate.findUnique({
    where: { code: body.gateCode },
    select: { id: true, code: true, name: true, isActive: true },
  })

  if (gate === null) {
    abort(
      'NOT_FOUND',
      `No gate is configured with the code "${body.gateCode}". Ask the control room which code to use.`,
    )
  }
  if (!gate.isActive) {
    abort('CONFLICT', `Gate "${gate.code}" is switched off. Ask the control room which gate to use.`)
  }

  const now = new Date()

  const device = await prisma.scannerDevice.upsert({
    where: { deviceId: body.deviceId },
    create: {
      deviceId: body.deviceId,
      gateId: gate.id,
      lastSeenById: actor.id,
      lastHelloAt: now,
      ...(body.label === undefined ? {} : { label: body.label }),
      ...(body.userAgent === undefined ? { userAgent: meta.userAgent ?? null } : { userAgent: body.userAgent }),
    },
    update: {
      gateId: gate.id,
      lastSeenById: actor.id,
      lastHelloAt: now,
      // Only overwrite the label when one was sent. A volunteer who set "Gate A – red
      // lanyard" on a shared phone should not lose it because the next shift's app
      // build stopped sending the field.
      ...(body.label === undefined ? {} : { label: body.label }),
      ...(body.userAgent === undefined ? {} : { userAgent: body.userAgent }),
    },
    select: { deviceId: true, isBlocked: true, blockedReason: true },
  })

  if (device.isBlocked) {
    abort(
      'CONFLICT',
      device.blockedReason === null
        ? 'This device has been blocked. Ask the control room.'
        : `This device has been blocked: ${device.blockedReason}`,
    )
  }

  const config = await getConfig()

  return {
    deviceId: device.deviceId,
    volunteerName: actor.name ?? actor.email,
    gate: { id: gate.id, code: gate.code, name: gate.name },
    manifestVersion: config.manifestVersion,
    serverTime: now.getTime(),
  }
}
