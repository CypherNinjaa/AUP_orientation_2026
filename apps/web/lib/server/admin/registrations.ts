/**
 * The registration list, and every decision an admin can make about one.
 *
 * ## Approval is where a pass comes from
 *
 * There are exactly two paths to a `Pass` row: `submitRegistration` issues one when
 * `autoApprove` is on, and `review()` here issues one when an admin approves. Both
 * go through `issuePass`, so the signing, the code generation and the manifest bump
 * cannot diverge between them.
 *
 * `REJECT` maps onto `REGISTRATION_REVISION_REQUESTED`'s sibling in the audit
 * vocabulary rather than getting its own action, because there is no
 * `REGISTRATION_REJECTED` in `AUDIT_ACTIONS` — see the note on `review()`.
 *
 * ## Manual check-in shares the scanner's constraint
 *
 * `recordManualCheckIn` writes the same `CheckIn` row a scanner writes, against the
 * same `passId UNIQUE`. A help-desk entry for somebody who already walked through
 * therefore fails the way a duplicate scan does (D2/D9) rather than creating a
 * second arrival. It also writes a `ScanEvent` with `clientEventId: null`, which is
 * how the audit trail distinguishes a human at a desk from a device at a gate.
 */
import 'server-only'

import { Prisma, prisma } from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import { parseEnvelope, signPass } from '@orientation/core/pass'
import { adminChannel, studentChannel } from '@orientation/core/realtime'
import {
  RETAKE_REASONS,
  type AdjustQrLifeRequest,
  type AdjustQrLifeResponse,
  type ManualCheckInRequest,
  type Page,
  type RegistrationDetailView,
  type RegistrationListQuery,
  type RegistrationRow,
  type RestorePassRequest,
  type ReverseCheckInRequest,
  type ReviewRequest,
  type ReviewResponse,
  type RevokePassRequest,
  type UserStatusRequest,
  type UserStatusResponse,
} from '@orientation/contracts'

import { type Actor, syncClerkUserStatus } from '../auth'
import { writeAudit } from '../audit'
import { bumpManifestVersion } from '../config'
import { abort, isCheckConstraintViolation } from '../http'
import { issueSelfiePath } from '../media/selfie-url'
import { getSigningKey, passWindow, issuePass, restorePass, revokePass } from '../pass'
import { publish } from '../redis'
import type { RequestMeta } from '../registration'

// ─────────────────────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────────────────────

const ROW_SELECT = {
  id: true,
  reference: true,
  status: true,
  name: true,
  program: true,
  contactNo: true,
  faceDetected: true,
  selfiePublicId: true,
  submittedAt: true,
  reviewNote: true,
  revisionCount: true,
  admittedStudent: { select: { formNumber: true } },
  _count: { select: { companions: true } },
  pass: {
    select: {
      code10: true,
      status: true,
      checkIn: { select: { recordedAt: true } },
    },
  },
} satisfies Prisma.RegistrationSelect

type RegistrationRecord = Prisma.RegistrationGetPayload<{ select: typeof ROW_SELECT }>

function toRow(record: RegistrationRecord): RegistrationRow {
  return {
    id: record.id,
    reference: record.reference,
    status: record.status,
    name: record.name,
    program: record.program,
    formNumber: record.admittedStudent.formNumber,
    contactNo: record.contactNo,
    guestCount: record._count.companions,
    hasSelfie: record.selfiePublicId !== null,
    faceDetected: record.faceDetected,
    submittedAt: record.submittedAt.toISOString(),
    passCode10: record.pass?.code10 ?? null,
    passStatus: record.pass?.status ?? null,
    checkedInAt: record.pass?.checkIn?.recordedAt.toISOString() ?? null,
    reviewNote: record.reviewNote,
    revisionCount: record.revisionCount,
  }
}

/**
 * Build the `where` clause.
 *
 * `q` searches four things a person might have in front of them: a name, a form
 * number off an admission letter, a help-desk reference read over the phone, and a
 * ten-digit pass code off a screen. Which one it is can be inferred from the shape,
 * but a help desk types what they see and an OR across all four is one index scan
 * on a table this size.
 *
 * `contains` and not a full-text index: 15,000 rows is small enough that a
 * sequential scan on a name is a few milliseconds, and a `tsvector` column would be
 * a migration and a trigger to maintain for a query an admin runs by hand.
 */
function buildWhere(query: RegistrationListQuery): Prisma.RegistrationWhereInput {
  const where: Prisma.RegistrationWhereInput = {}

  if (query.status !== undefined) where.status = query.status
  if (query.program !== undefined) where.program = query.program
  if (query.noFace === true) where.faceDetected = false
  if (query.checkedIn !== undefined) {
    where.pass = query.checkedIn ? { checkIn: { isNot: null } } : { is: { checkIn: null } }
  }

  if (query.q !== undefined) {
    const digits = query.q.replace(/\D/g, '')
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { reference: { contains: query.q.toUpperCase() } },
      ...(digits.length >= 4
        ? [
          { admittedStudent: { formNumber: { contains: digits } } },
          { pass: { code10: { contains: digits } } },
        ]
        : []),
    ]
  }

  return where
}

export async function listRegistrations(
  query: RegistrationListQuery,
): Promise<Page<RegistrationRow>> {
  const orderBy: Prisma.RegistrationOrderByWithRelationInput =
    query.sort === 'name' ? { name: query.order } : { submittedAt: query.order }

  const records = await prisma.registration.findMany({
    where: buildWhere(query),
    select: ROW_SELECT,
    // `id` breaks ties. Cursor paging on a non-unique sort key silently repeats or
    // skips rows when two students submitted in the same millisecond, and two
    // students named "Aditya Kumar" is a certainty rather than a hypothetical.
    orderBy: [orderBy, { id: 'asc' }],
    take: query.limit + 1,
    ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
  })

  const hasMore = records.length > query.limit
  const items = hasMore ? records.slice(0, query.limit) : records

  return {
    items: items.map(toRow),
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Review
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Approve, ask for a retake, or reject.
 *
 * The three decisions are not symmetrical:
 *
 *   - **APPROVE** is the only one that creates something. It issues a pass inside a
 *     transaction with the status change, so a student cannot be `APPROVED` with no
 *     pass. Approving an already-approved registration that somehow has no pass
 *     issues one, which is the repair path for a partial failure.
 *   - **REQUEST_REVISION** is a message to the student, so the note is what matters.
 *     A canned reason and free text are joined rather than one overriding the other:
 *     "Your photo is too dark…" followed by "the light behind you is very bright"
 *     is more useful than either alone.
 *   - **REJECT** is terminal and there is no resubmission path, which is why the
 *     contract makes its note mandatory.
 *
 * ## Why REJECT does not have its own audit action
 *
 * `AUDIT_ACTIONS` has no `REGISTRATION_REJECTED`. Rather than widen the vocabulary
 * from a route handler — the enum is mirrored in a database column and a check
 * constraint — a rejection is recorded as `REGISTRATION_EDITED_BY_ADMIN` with the
 * status transition in `before`/`after`. The audit row therefore says exactly what
 * changed; it just does not have a dedicated verb. Adding one is a migration, and it
 * is listed in the docs as owed.
 */
export async function review(
  registrationId: string,
  input: ReviewRequest,
  actor: Actor,
  meta: RequestMeta,
): Promise<ReviewResponse> {
  const existing = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      status: true,
      userId: true,
      revisionCount: true,
      selfiePublicId: true,
      pass: { select: { id: true, code10: true, status: true } },
      _count: { select: { companions: true } },
    },
  })

  if (existing === null) abort('NOT_FOUND', 'No such registration.')

  if (existing.status === 'DRAFT') {
    abort('CONFLICT', 'That registration has not been submitted yet.')
  }

  const now = new Date()
  let passCode10: string | null = existing.pass?.code10 ?? null
  let nextStatus = existing.status

  if (input.decision === 'APPROVE') {
    if (existing.selfiePublicId === null) {
      // Approving a registration with no selfie would produce a pass the gate
      // cannot check a face against, which is the one thing the selfie is for (D3).
      abort('CONFLICT', 'That registration has no photo yet. Ask for a retake instead.')
    }

    const issued = await prisma.$transaction(async (tx) => {
      await tx.registration.update({
        where: { id: registrationId },
        data: {
          status: 'APPROVED',
          reviewedById: actor.id,
          reviewedAt: now,
          // Clearing the note matters: it is student-visible, and a stale "retake
          // your photo" next to an approved pass is a support call.
          reviewNote: input.note ?? null,
        },
      })

      if (existing.pass !== null) return null
      return issuePass(tx, registrationId, existing._count.companions)
    })

    if (issued !== null) passCode10 = issued.code10
    nextStatus = 'APPROVED'

    await writeAudit({
      action: AUDIT_ACTIONS.REGISTRATION_APPROVED,
      entityType: 'Registration',
      entityId: registrationId,
      actor,
      before: { status: existing.status, hasPass: existing.pass !== null },
      after: { status: 'APPROVED', passIssued: issued !== null },
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
  } else if (input.decision === 'REQUEST_REVISION') {
    const canned = input.reasonCode === undefined ? null : RETAKE_REASONS[input.reasonCode]
    const note = [canned, input.note].filter((part) => part !== null && part !== undefined).join(' ')

    if (note === '') {
      abort('VALIDATION_FAILED', 'Pick a reason or write one — the student sees this.')
    }

    await prisma.registration.update({
      where: { id: registrationId },
      data: {
        status: 'REVISION_REQUESTED',
        reviewedById: actor.id,
        reviewedAt: now,
        reviewNote: note,
        revisionCount: { increment: 1 },
      },
    })

    nextStatus = 'REVISION_REQUESTED'

    await writeAudit({
      action: AUDIT_ACTIONS.REGISTRATION_REVISION_REQUESTED,
      entityType: 'Registration',
      entityId: registrationId,
      actor,
      before: { status: existing.status, revisionCount: existing.revisionCount },
      after: {
        status: 'REVISION_REQUESTED',
        reasonCode: input.reasonCode ?? null,
        // The note is the message to the student, not personal data, so it is
        // recorded in full — an admin later asking "what did we tell them?" is the
        // whole point of the entry.
        note,
        revisionCount: existing.revisionCount + 1,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
  } else {
    // REJECT. The pass, if one exists, is revoked in the same breath: leaving an
    // ACTIVE pass on a rejected registration would admit them at the gate, because
    // `decideScan` reads the pass and not the registration's status for an entry
    // that is already in the manifest.
    await prisma.registration.update({
      where: { id: registrationId },
      data: {
        status: 'REJECTED',
        reviewedById: actor.id,
        reviewedAt: now,
        reviewNote: input.note,
      },
    })

    if (existing.pass !== null && existing.pass.status === 'ACTIVE') {
      await revokePass(existing.pass.id, `Registration rejected: ${input.note}`, actor)
      passCode10 = existing.pass.code10
    }

    nextStatus = 'REJECTED'

    await writeAudit({
      action: AUDIT_ACTIONS.REGISTRATION_EDITED_BY_ADMIN,
      entityType: 'Registration',
      entityId: registrationId,
      actor,
      before: { status: existing.status },
      after: { status: 'REJECTED', note: input.note, passRevoked: existing.pass !== null },
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
  }

  // The student's own dashboard is listening on their channel. `hasPass` is part of
  // the event because the portal shows a different screen for "approved" and
  // "approved and here is your pass".
  publish(studentChannel(registrationId), {
    type: 'registration.status',
    registrationId,
    status: nextStatus,
    hasPass: nextStatus === 'APPROVED' && passCode10 !== null,
    at: now.getTime(),
  })

  publish(adminChannel(), {
    type: 'registration.reviewed',
    approved: nextStatus === 'APPROVED',
    at: now.getTime(),
  })

  return {
    registrationId,
    status: nextStatus,
    passCode10: nextStatus === 'APPROVED' ? passCode10 : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pass revocation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Revoke a pass.
 *
 * `revokePass` writes its own audit entry and bumps the manifest version, so this
 * only resolves the registration to a pass and checks the typed confirmation. The
 * confirmation compares digits: an admin reading `XXX-XXX-XXXX` off the screen types
 * the hyphens about half the time.
 */
export async function revoke(
  registrationId: string,
  input: RevokePassRequest,
  actor: Actor,
): Promise<{ passId: string; code10: string }> {
  const pass = await prisma.pass.findUnique({
    where: { registrationId },
    select: { id: true, code10: true, status: true },
  })

  if (pass === null) abort('NOT_FOUND', 'That registration has no pass.')
  if (pass.status === 'REVOKED') abort('CONFLICT', 'That pass is already revoked.')

  if (input.confirmCode10.replace(/\D/g, '') !== pass.code10) {
    abort('VALIDATION_FAILED', 'That code does not match this pass. Check the row you clicked.')
  }

  await revokePass(pass.id, input.reason, actor)
  return { passId: pass.id, code10: pass.code10 }
}

export async function restore(
  registrationId: string,
  input: RestorePassRequest,
  actor: Actor,
): Promise<{ passId: string; code10: string }> {
  const pass = await prisma.pass.findUnique({
    where: { registrationId },
    select: { id: true, code10: true, status: true },
  })

  if (pass === null) abort('NOT_FOUND', 'That registration has no pass.')
  if (pass.status === 'ACTIVE') abort('CONFLICT', 'That pass is already active.')

  await restorePass(pass.id, input.reason, actor)
  return { passId: pass.id, code10: pass.code10 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual check-in
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a gate code to a gate, creating nothing.
 *
 * A typo'd gate code must not silently create a `Gate` row: the gate list is what
 * the manifest ships to devices and what the arrivals chart groups by, and an
 * accidental `MIAN` would be a lane that exists in the database and nowhere on the
 * ground.
 */
async function requireGate(code: string): Promise<{ id: string; code: string }> {
  const gate = await prisma.gate.findUnique({
    where: { code: code.toUpperCase() },
    select: { id: true, code: true, isActive: true },
  })

  if (gate === null) abort('NOT_FOUND', `There is no gate called "${code}".`)
  if (!gate.isActive) abort('CONFLICT', `Gate ${gate.code} is not active.`)

  return { id: gate.id, code: gate.code }
}

export async function recordManualCheckIn(
  registrationId: string,
  input: ManualCheckInRequest,
  actor: Actor,
  meta: RequestMeta,
): Promise<{ checkInId: string; recordedAt: string }> {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      name: true,
      status: true,
      pass: {
        select: {
          id: true,
          status: true,
          guestCount: true,
          checkIn: { select: { id: true, recordedAt: true, gate: { select: { code: true } } } },
        },
      },
    },
  })

  if (registration === null) abort('NOT_FOUND', 'No such registration.')
  if (registration.pass === null) abort('CONFLICT', 'That student has no pass to check in.')
  if (registration.pass.status === 'REVOKED') {
    abort('CONFLICT', 'That pass is revoked. Restore it first if this student should be admitted.')
  }

  if (registration.pass.checkIn !== null) {
    const at = registration.pass.checkIn.recordedAt.toISOString()
    abort(
      'CONFLICT',
      `${registration.name} already came through gate ${registration.pass.checkIn.gate.code} at ${at}.`,
    )
  }

  if (input.guestsAdmitted > registration.pass.guestCount) {
    abort(
      'VALIDATION_FAILED',
      `That pass covers ${String(registration.pass.guestCount)} guest(s).`,
    )
  }

  const gate = await requireGate(input.gateCode)
  const now = new Date()
  const passId = registration.pass.id

  try {
    const result = await prisma.$transaction(async (tx) => {
      // The attempt is logged as well as the outcome (D23), with a null
      // `clientEventId` — the column is the sync idempotency key and a human at a
      // desk has no outbox to retry from.
      const event = await tx.scanEvent.create({
        data: {
          passId,
          rawCode: 'MANUAL_ADMIN',
          method: 'MANUAL_CODE',
          outcome: 'ADMITTED',
          reason: 'admin_override',
          gateId: gate.id,
          scannedById: actor.id,
          // Same clock for both: an admin's browser and the server are the same
          // request, so there is no device drift to record.
          scannedAt: now,
          wasOffline: false,
          overridden: true,
        },
        select: { id: true },
      })

      const checkIn = await tx.checkIn.create({
        data: {
          passId,
          gateId: gate.id,
          scannedById: actor.id,
          method: 'MANUAL_CODE',
          guestsAdmitted: input.guestsAdmitted,
          scannedAt: now,
          recordedAt: now,
          wasOffline: false,
          scanEventId: event.id,
        },
        select: { id: true, recordedAt: true },
      })

      return checkIn
    })

    await writeAudit({
      action: AUDIT_ACTIONS.CHECKIN_OVERRIDDEN,
      entityType: 'CheckIn',
      entityId: result.id,
      actor,
      after: {
        registrationId,
        passId,
        gate: gate.code,
        guestsAdmitted: input.guestsAdmitted,
        note: input.note ?? null,
        manual: true,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    })

    publish(adminChannel(), {
      type: 'checkin.recorded',
      passId,
      gate: gate.code,
      at: result.recordedAt.getTime(),
    })

    return { checkInId: result.id, recordedAt: result.recordedAt.toISOString() }
  } catch (error) {
    // `CheckIn.passId` is UNIQUE and that is the whole mechanism (D2/D9). A scanner
    // sync landing between the read above and this write loses the race here, which
    // is correct — one arrival per pass — and says so rather than surfacing P2002.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      abort('CONFLICT', 'That pass was checked in a moment ago, from a scanner. Refresh the row.')
    }
    if (isCheckConstraintViolation(error)) {
      abort('VALIDATION_FAILED', 'That check-in was refused by a database rule.')
    }
    throw error
  }
}

/**
 * Reverse a check-in so a student who was scanned in error can enter.
 *
 * The one place the system deletes anything. D9 forbids rewriting history, and this
 * does not: the `ScanEvent` rows stay, the audit entry records the deleted row's
 * values in `before`, and only the `CheckIn` — which is a *current state*, not a log
 * — goes. Without it, one mis-scan locks a real student out of their own orientation
 * and the help desk has no answer.
 */
export async function reverseCheckIn(
  registrationId: string,
  input: ReverseCheckInRequest,
  actor: Actor,
  meta: RequestMeta,
): Promise<{ reversedCheckInId: string }> {
  const pass = await prisma.pass.findUnique({
    where: { registrationId },
    select: {
      id: true,
      checkIn: {
        select: {
          id: true,
          gateId: true,
          scannedById: true,
          method: true,
          guestsAdmitted: true,
          scannedAt: true,
          recordedAt: true,
          deviceId: true,
          wasOffline: true,
          scanEventId: true,
        },
      },
    },
  })

  if (pass === null) abort('NOT_FOUND', 'That registration has no pass.')
  if (pass.checkIn === null) abort('CONFLICT', 'That pass has not been checked in.')

  if (input.confirmCheckInId !== pass.checkIn.id) {
    abort('CONFLICT', 'That check-in has changed. Refresh and try again.')
  }

  const original = pass.checkIn

  await prisma.checkIn.delete({ where: { id: original.id } })

  await writeAudit({
    action: AUDIT_ACTIONS.CHECKIN_REVERSED,
    entityType: 'CheckIn',
    entityId: original.id,
    actor,
    // The whole row, because it no longer exists anywhere else. This entry is the
    // only remaining record that the arrival happened.
    before: {
      registrationId,
      passId: pass.id,
      gateId: original.gateId,
      scannedById: original.scannedById,
      method: original.method,
      guestsAdmitted: original.guestsAdmitted,
      scannedAt: original.scannedAt.toISOString(),
      recordedAt: original.recordedAt.toISOString(),
      deviceId: original.deviceId,
      wasOffline: original.wasOffline,
      scanEventId: original.scanEventId,
    },
    after: { reason: input.reason },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return { reversedCheckInId: original.id }
}

// ─────────────────────────────────────────────────────────────────────────────
// Full Administrative Powers: Inline Detail, QR Life, Undo Review, User Bans
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch comprehensive student data for the inline detail inspector.
 */
export async function getRegistrationDetail(
  id: string,
  actor: Actor,
  meta: RequestMeta,
): Promise<RegistrationDetailView> {
  const record = await prisma.registration.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          clerkUserId: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      },
      admittedStudent: {
        select: {
          formNumber: true,
          name: true,
          program: true,
          programLevel: true,
        },
      },
      reviewedBy: {
        select: {
          name: true,
          email: true,
        },
      },
      companions: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          name: true,
          relationship: true,
          position: true,
        },
      },
      pass: {
        select: {
          id: true,
          code10: true,
          status: true,
          guestCount: true,
          issuedAt: true,
          qrPayload: true,
          checkIn: {
            select: {
              id: true,
              recordedAt: true,
              guestsAdmitted: true,
              gate: {
                select: {
                  code: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!record) abort('NOT_FOUND', 'No such registration.')

  let selfieUrl: string | null = null
  if (record.selfiePublicId) {
    selfieUrl = issueSelfiePath(record.id, actor.id).path
    await writeAudit({
      action: AUDIT_ACTIONS.SELFIE_VIEWED,
      entityType: 'Registration',
      entityId: record.id,
      actor,
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
  }

  let passDetails: RegistrationDetailView['pass'] = null
  if (record.pass) {
    let notBefore: string | null = null
    let notAfter: string | null = null
    try {
      const parsed = parseEnvelope(record.pass.qrPayload)
      if (parsed) {
        notBefore = new Date(parsed.notBefore).toISOString()
        notAfter = new Date(parsed.notAfter).toISOString()
      }
    } catch {
      // Ignored for legacy or test mock envelopes
    }

    const [scansCount, passLimitRows] = await Promise.all([
      prisma.scanEvent.count({
        where: { passId: record.pass.id, outcome: 'ADMITTED' },
      }),
      prisma.$queryRaw<Array<{ scanLimit: number }>>`
        SELECT "scanLimit" FROM "Pass" WHERE id = ${record.pass.id}
      `,
    ])
    const scansUsed = Math.max(scansCount, record.pass.checkIn ? 1 : 0)
    const scanLimit = passLimitRows[0]?.scanLimit ?? 1
    const holdingScans = Math.max(0, scanLimit - scansUsed)

    passDetails = {
      id: record.pass.id,
      code10: record.pass.code10,
      status: record.pass.status,
      guestCount: record.pass.guestCount,
      scanLimit,
      scansUsed,
      holdingScans,
      issuedAt: record.pass.issuedAt.toISOString(),
      qrPayload: record.pass.qrPayload,
      notBefore,
      notAfter,
      checkIn: record.pass.checkIn
        ? {
          id: record.pass.checkIn.id,
          gateCode: record.pass.checkIn.gate.code,
          gateName: record.pass.checkIn.gate.name,
          recordedAt: record.pass.checkIn.recordedAt.toISOString(),
          guestsAdmitted: record.pass.checkIn.guestsAdmitted,
        }
        : null,
    }
  }

  return {
    id: record.id,
    reference: record.reference,
    status: record.status,
    name: record.name,
    program: record.program,
    programLevel: record.admittedStudent.programLevel,
    formNumber: record.admittedStudent.formNumber,
    contactNo: record.contactNo,
    email: record.user?.email ?? null,
    userId: record.user?.id ?? record.id,
    userIsActive: record.user?.isActive ?? true,
    userRole: record.user?.role ?? 'STUDENT',
    selfieUrl,
    faceDetected: record.faceDetected,
    submittedAt: record.submittedAt.toISOString(),
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    reviewedBy: record.reviewedBy?.name ?? record.reviewedBy?.email ?? null,
    reviewNote: record.reviewNote,
    revisionCount: record.revisionCount,
    companions: record.companions.map((c) => ({
      id: c.id,
      name: c.name,
      relationship: c.relationship,
      position: c.position,
    })),
    pass: passDetails,
  }
}

/**
 * Extend or reduce QR life (number of volunteer scans allowed) for a pass.
 */
export async function adjustPassQrLife(
  registrationId: string,
  input: AdjustQrLifeRequest,
  actor: Actor,
  meta: RequestMeta,
): Promise<AdjustQrLifeResponse> {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      reference: true,
      status: true,
      pass: {
        select: {
          id: true,
          code10: true,
          qrPayload: true,
          status: true,
        },
      },
    },
  })

  if (!reg) abort('NOT_FOUND', 'No such registration.')
  if (!reg.pass) abort('CONFLICT', 'This registration has no pass issued yet. Approve it first.')

  const pass = reg.pass

  // Calculate new scanLimit (QR Life as integer scans)
  const currentPassRows = await prisma.$queryRaw<Array<{ scanLimit: number }>>`
    SELECT "scanLimit" FROM "Pass" WHERE id = ${pass.id}
  `
  const currentScanLimit = currentPassRows[0]?.scanLimit ?? 1
  let newScanLimit = currentScanLimit

  if (input.scanLimit !== undefined) {
    newScanLimit = Math.max(0, input.scanLimit)
  } else if (input.deltaScans !== undefined) {
    newScanLimit = Math.max(0, newScanLimit + input.deltaScans)
  }

  let currentNotBefore: Date
  let currentNotAfter: Date

  try {
    const parsed = parseEnvelope(pass.qrPayload)
    if (parsed) {
      currentNotBefore = new Date(parsed.notBefore)
      currentNotAfter = new Date(parsed.notAfter)
    } else {
      const def = passWindow()
      currentNotBefore = def.notBefore
      currentNotAfter = def.notAfter
    }
  } catch {
    const def = passWindow()
    currentNotBefore = def.notBefore
    currentNotAfter = def.notAfter
  }

  let newNotBefore = currentNotBefore
  let newNotAfter = currentNotAfter
  let reissuedPayload: { payload: string; signedMessage: string; signature: string; keyId: string } | null = null

  if (input.notBefore || input.notAfter || input.deltaDays || input.deltaHours) {
    if (input.notBefore) newNotBefore = new Date(input.notBefore)
    if (input.notAfter) newNotAfter = new Date(input.notAfter)
    else if (input.deltaDays) newNotAfter = new Date(currentNotAfter.getTime() + input.deltaDays * 24 * 60 * 60 * 1000)
    else if (input.deltaHours) newNotAfter = new Date(currentNotAfter.getTime() + input.deltaHours * 60 * 60 * 1000)

    if (newNotAfter.getTime() > newNotBefore.getTime()) {
      const key = getSigningKey()
      reissuedPayload = signPass(key, {
        code10: pass.code10,
        notBefore: newNotBefore,
        notAfter: newNotAfter,
      })
    }
  }

  await prisma.$executeRaw`
    UPDATE "Pass" SET "scanLimit" = ${newScanLimit} WHERE id = ${pass.id}
  `

  if (reissuedPayload) {
    await prisma.pass.update({
      where: { id: pass.id },
      data: {
        qrPayload: reissuedPayload.payload,
        signedPayload: reissuedPayload.signedMessage,
        signature: reissuedPayload.signature,
        keyId: reissuedPayload.keyId,
      },
    })
  }

  const scansCount = await prisma.scanEvent.count({
    where: { passId: pass.id, outcome: 'ADMITTED' },
  })
  const hasCheckIn = await prisma.checkIn.findUnique({ where: { passId: pass.id } })
  const scansUsed = Math.max(scansCount, hasCheckIn ? 1 : 0)
  const holdingScans = Math.max(0, newScanLimit - scansUsed)

  await bumpManifestVersion('CONFIG')

  await writeAudit({
    action: AUDIT_ACTIONS.PASS_REISSUED,
    entityType: 'Pass',
    entityId: pass.id,
    actor,
    ip: meta.ip,
    userAgent: meta.userAgent,
    before: { scanLimit: currentScanLimit },
    after: {
      scanLimit: newScanLimit,
      scansUsed,
      holdingScans,
      deltaScans: input.deltaScans,
      reason: input.reason ?? 'QR life adjusted by administrator',
    },
  })

  // Broadcast realtime update to admin consoles
  await publish(adminChannel(), {
    type: 'registration.reviewed',
    approved: true,
    at: Date.now(),
  })

  return {
    passId: pass.id,
    code10: pass.code10,
    scanLimit: newScanLimit,
    scansUsed,
    holdingScans,
    notBefore: newNotBefore.toISOString(),
    notAfter: newNotAfter.toISOString(),
    qrPayload: reissuedPayload?.payload ?? pass.qrPayload,
  }
}

/**
 * Undo an accept or reject decision, restoring the registration to PENDING_REVIEW.
 */
export async function undoRegistrationReview(
  registrationId: string,
  actor: Actor,
  meta: RequestMeta,
): Promise<{ registrationId: string; status: 'PENDING_REVIEW' }> {
  const existing = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      status: true,
      name: true,
      pass: { select: { id: true, status: true, code10: true } },
    },
  })

  if (!existing) abort('NOT_FOUND', 'No such registration.')
  if (existing.status === 'PENDING_REVIEW') {
    abort('CONFLICT', 'Registration is already in pending review state.')
  }
  if (existing.status === 'DRAFT') {
    abort('CONFLICT', 'Draft registrations cannot be unreviewed.')
  }

  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.registration.update({
      where: { id: registrationId },
      data: {
        status: 'PENDING_REVIEW',
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
      },
    })

    if (existing.pass !== null && existing.pass.status === 'ACTIVE') {
      await tx.pass.update({
        where: { id: existing.pass.id },
        data: {
          status: 'REVOKED',
          revokedAt: now,
          revokedById: actor.id,
          revokedReason: 'Review decision undone by administrator',
        },
      })
    }
  })

  if (existing.pass !== null && existing.pass.status === 'ACTIVE') {
    await bumpManifestVersion('REVOCATION')
  }

  await writeAudit({
    action: AUDIT_ACTIONS.REGISTRATION_EDITED_BY_ADMIN,
    entityType: 'Registration',
    entityId: registrationId,
    actor,
    before: { status: existing.status, passStatus: existing.pass?.status ?? null },
    after: { status: 'PENDING_REVIEW', passStatus: existing.pass ? 'REVOKED' : null, undone: true },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  publish(studentChannel(registrationId), {
    type: 'registration.status',
    registrationId,
    status: 'PENDING_REVIEW',
    hasPass: false,
    at: now.getTime(),
  })

  publish(adminChannel(), {
    type: 'registration.reviewed',
    approved: false,
    at: now.getTime(),
  })

  return {
    registrationId,
    status: 'PENDING_REVIEW',
  }
}

/**
 * Ban or unban a user account (synced with Clerk and PostgreSQL).
 */
export async function setUserActiveStatus(
  registrationId: string,
  input: UserStatusRequest,
  actor: Actor,
  meta: RequestMeta,
): Promise<UserStatusResponse> {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          clerkUserId: true,
          role: true,
          isActive: true,
        },
      },
      pass: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  })

  if (!reg) abort('NOT_FOUND', 'No such registration.')
  const user = reg.user

  if (!user) {
    if (!input.isActive && reg.pass?.status === 'ACTIVE') {
      await revokePass(reg.pass.id, input.reason || 'Registration suspended by administrator', actor)
    }
    return {
      userId: reg.id,
      clerkUserId: '',
      isActive: input.isActive,
    }
  }

  if (user.id === actor.id && !input.isActive) {
    abort('CONFLICT', 'You cannot ban or deactivate your own administrator account.')
  }

  if (user.isActive === input.isActive) {
    abort('CONFLICT', input.isActive ? 'That user account is already active.' : 'That user account is already banned.')
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isActive: input.isActive },
  })

  void syncClerkUserStatus(user.clerkUserId, input.isActive, user.role)

  if (!input.isActive && reg.pass?.status === 'ACTIVE') {
    await revokePass(reg.pass.id, input.reason || 'User account suspended by administrator', actor)
  }

  await writeAudit({
    action: input.isActive ? AUDIT_ACTIONS.ROLE_GRANTED : AUDIT_ACTIONS.ROLE_REVOKED,
    entityType: 'User',
    entityId: user.id,
    actor,
    before: { isActive: user.isActive },
    after: { isActive: input.isActive, reason: input.reason ?? null },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  publish(adminChannel(), {
    type: 'registration.reviewed',
    approved: input.isActive,
    at: Date.now(),
  })

  return {
    userId: user.id,
    clerkUserId: user.clerkUserId,
    isActive: input.isActive,
  }
}

