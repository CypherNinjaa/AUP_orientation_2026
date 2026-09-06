/**
 * The registration domain: claiming a form number, submitting, and reading back.
 *
 * Route handlers in `app/api/registration/*` are thin — they authenticate, rate
 * limit, validate, and call into here. The reason for the split is that two of
 * these operations are also reachable from the admin side (a help-desk volunteer
 * submitting on a student's behalf, an admin releasing a claim), and a rule that
 * lives in a route handler is a rule the second caller does not get.
 *
 * ## The one invariant everything here protects
 *
 * One `AdmittedStudent` row, one `Registration`, one `User`. Three unique
 * constraints enforce it in Postgres — `AdmittedStudent.claimedByUserId`,
 * `Registration.userId`, `Registration.admittedStudentId` — and this module is
 * written so that a concurrent double-submit hits one of them rather than
 * producing two passes for one seat. The check-then-write pattern below is a
 * courtesy that produces a good error message; the constraint is what makes it
 * correct.
 */
import 'server-only'

import {
  Prisma,
  prisma,
  type Companion,
  type Pass,
  type RegistrationStatus,
} from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import { formatCode10, generateReference } from '@orientation/core/pass'
import { normalisePhone } from '@orientation/core/roster'
import {
  type AdmittedStudentPreview,
  type CompanionSummary,
  type DraftData,
  type LookupResponse,
  type MeResponse,
  type PassSummary,
  type SelfieReplaceResponse,
  type SubmitRequest,
  type SubmitResponse,
} from '@orientation/contracts'

import type { Actor } from './auth'
import { getConfig } from './config'
import { abort } from './http'
import { writeAudit } from './audit'
import { CloudinaryUnavailableError, uploadSelfie } from './media/cloudinary'
import { issueSelfiePath } from './media/selfie-url'
import { issuePass } from './pass'
import { publish } from './redis'
import { studentChannel } from '@orientation/core/realtime'

/** Request metadata carried into the audit log. */
export interface RequestMeta {
  ip?: string | undefined
  userAgent?: string | undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — the form-number claim
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a form number.
 *
 * Returns the *verbatim* `program` string from the admissions sheet. There is no
 * grouping, bucketing or tidying step: the student's admission letter says
 * `B.Tech CSE (AI & ML)` and so does this. A derived label would be a second
 * source of truth for the one field a student uses to confirm they typed the right
 * number.
 *
 * Never returns `paymentStatus` or the sheet's `E-Mail ID` — see the contract's
 * header for why, and note that the `select` below is the enforcement, not the
 * comment.
 */
export async function lookupFormNumber(
  actor: Actor,
  formNumber: string,
): Promise<LookupResponse> {
  const row = await prisma.admittedStudent.findUnique({
    where: { formNumber },
    select: {
      formNumber: true,
      name: true,
      program: true,
      contactNo: true,
      isClaimed: true,
      claimedByUserId: true,
    },
  })

  if (!row) return { status: 'NOT_FOUND' }

  const preview: AdmittedStudentPreview = {
    formNumber: row.formNumber,
    name: row.name,
    program: row.program,
    contactNo: row.contactNo,
  }

  if (!row.isClaimed) return { status: 'AVAILABLE', student: preview }
  if (row.claimedByUserId === actor.id) return { status: 'CLAIMED_BY_YOU', student: preview }

  // Deliberately no preview. Somebody else's name is not this caller's to see
  // just because they guessed the number next to their own.
  return { status: 'CLAIMED' }
}

// ─────────────────────────────────────────────────────────────────────────────
// The draft
// ─────────────────────────────────────────────────────────────────────────────

export async function readDraft(
  actor: Actor,
): Promise<{ step: number; data: DraftData; updatedAt: Date } | null> {
  const draft = await prisma.registrationDraft.findUnique({ where: { userId: actor.id } })
  if (draft) {
    return {
      step: draft.step,
      // The column is `Json`, so what comes back is `JsonValue`. It was written by
      // this app after Zod validation, but a shape written by an older deploy can
      // still be sitting there — the client re-validates before using it.
      data: (draft.data ?? {}) as DraftData,
      updatedAt: draft.updatedAt,
    }
  }

  // If no draft exists, check if user has an existing registration (e.g. revision or resubmission)
  // to prefill the form so the student does not have to retype everything.
  const reg = await prisma.registration.findUnique({
    where: { userId: actor.id },
    include: {
      admittedStudent: { select: { formNumber: true } },
      companions: { orderBy: { position: 'asc' } },
    },
  })

  if (reg && reg.admittedStudent) {
    return {
      step: 1,
      data: {
        formNumber: reg.admittedStudent.formNumber,
        name: reg.name,
        program: reg.program,
        contactNo: reg.contactNo ?? '',
        companions: reg.companions.map((c) => ({
          name: c.name,
          relationship: c.relationship,
        })),
      },
      updatedAt: reg.submittedAt,
    }
  }

  return null
}

export async function saveDraft(actor: Actor, step: number, data: DraftData): Promise<Date> {
  const payload = data as unknown as Prisma.InputJsonObject
  const draft = await prisma.registrationDraft.upsert({
    where: { userId: actor.id },
    update: { step, data: payload },
    create: { userId: actor.id, step, data: payload },
  })
  return draft.updatedAt
}

export async function discardDraft(actor: Actor): Promise<void> {
  await prisma.registrationDraft.deleteMany({ where: { userId: actor.id } })
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — submit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the registration.
 *
 * The order of operations is the interesting part, and it is deliberate:
 *
 *   1. Pre-flight checks (window open, consent current, form number claimable).
 *      Cheap, and they produce the specific message the wizard shows.
 *   2. Upload the selfie to Cloudinary. **Outside** the transaction, because a
 *      network call to a third party inside a Postgres transaction holds a row
 *      lock for as long as their CDN feels like taking, and at 15,000 students
 *      that is how a connection pool dies.
 *   3. One transaction: claim the row, create the registration and companions,
 *      and — when auto-approve is on — issue the pass.
 *
 * The cost of step 2 preceding step 3 is an orphaned Cloudinary asset when the
 * transaction then fails. That is acceptable and self-correcting: the public id is
 * derived from the form number, so a retry overwrites the same asset rather than
 * accumulating copies, and the retention sweep collects anything left behind.
 * The opposite order — transaction first, upload after — would produce a
 * registration whose selfie does not exist, which is a record that cannot be
 * moderated and a student who cannot be verified at the gate.
 */
export async function submitRegistration(
  actor: Actor,
  input: SubmitRequest,
  meta: RequestMeta,
): Promise<SubmitResponse> {
  const config = await getConfig()

  if (input.consentVersion !== config.consentVersion) {
    // Refused rather than silently corrected. Recording agreement to text the
    // student never read is worse than making them read the current text.
    abort(
      'CONSENT_VERSION_MISMATCH',
      'The consent notice has been updated. Reload the page and read it again before submitting.',
    )
  }

  if (input.companions.length > config.maxCompanions) {
    abort('VALIDATION_FAILED', `A pass admits at most ${String(config.maxCompanions)} guests.`, {
      fields: { companions: `Remove ${String(input.companions.length - config.maxCompanions)}.` },
    })
  }

  // An existing registration is the common case for a double-submit — a student
  // double-tapping the button, or a retried request after a flaky connection.
  // Returning what already exists is friendlier than a 409 and is safe, because
  // nothing here is being changed.
  const existing = await prisma.registration.findUnique({
    where: { userId: actor.id },
    include: { pass: true },
  })
  if (existing && existing.status === 'APPROVED') {
    return {
      registrationId: existing.id,
      reference: existing.reference,
      status: existing.status,
      pass: existing.pass ? toPassSummary(existing.pass, null) : null,
    }
  }

  const admitted = await prisma.admittedStudent.findUnique({
    where: { formNumber: input.formNumber },
    select: { id: true, name: true, program: true, programLevel: true, isClaimed: true, claimedByUserId: true },
  })

  if (!admitted) {
    abort('VALIDATION_FAILED', 'That form number is not on the admissions list.', {
      fields: { formNumber: 'Check the number on your admission letter.' },
    })
  }
  if (admitted.isClaimed && admitted.claimedByUserId !== actor.id) {
    abort('ALREADY_CLAIMED', 'That form number has already been registered.', {
      fields: { formNumber: 'Contact the help desk if this is your number.' },
    })
  }

  const reference = existing ? existing.reference : generateReference()

  // Upload before the transaction. See the doc comment above.
  let uploaded
  try {
    uploaded = await uploadSelfie(input.selfie.image, reference)
  } catch (error) {
    if (error instanceof CloudinaryUnavailableError) {
      // The student can do nothing about this and should not be told to try a
      // different photo. `attempts` stays in the log — it names accounts.
      console.error('[registration] selfie upload failed on every account', error.attempts)
      abort(
        'UPLOAD_FAILED',
        'We could not store your photo just now. Wait a moment and submit again — nothing else you entered has been lost.',
      )
    }
    throw error
  }

  const autoApprove = config.autoApprove
  const status: RegistrationStatus = autoApprove ? 'APPROVED' : 'PENDING_REVIEW'
  const now = new Date()

  const created = await prisma.$transaction(async (tx) => {
    // The claim and the registration in one atomic step. Two students racing on
    // one form number both reach here; the `claimedByUserId` unique index and
    // the conditional `updateMany` below mean exactly one wins.
    const claim = await tx.admittedStudent.updateMany({
      where: {
        id: admitted.id,
        // Either unclaimed, or already claimed by this same user (a retry after a
        // transaction that failed *after* the claim landed).
        OR: [{ isClaimed: false }, { claimedByUserId: actor.id }],
      },
      data: { isClaimed: true, claimedByUserId: actor.id, claimedAt: now },
    })

    if (claim.count === 0) {
      abort('ALREADY_CLAIMED', 'That form number was registered a moment ago by someone else.', {
        fields: { formNumber: 'Contact the help desk if this is your number.' },
      })
    }

    if (existing) {
      if (existing.admittedStudentId !== admitted.id) {
        await tx.admittedStudent.update({
          where: { id: existing.admittedStudentId },
          data: { isClaimed: false, claimedByUserId: null, claimedAt: null },
        })
      }

      await tx.companion.deleteMany({ where: { registrationId: existing.id } })
      if (existing.pass) {
        await tx.pass.deleteMany({ where: { registrationId: existing.id } })
      }

      const registration = await tx.registration.update({
        where: { id: existing.id },
        data: {
          admittedStudentId: admitted.id,
          status,
          name: input.name,
          program: admitted.program,
          contactNo: input.contactNo,
          selfiePublicId: uploaded.publicId,
          selfieCloudName: uploaded.cloudName,
          selfieVersion: uploaded.version,
          selfieBytes: uploaded.bytes,
          selfieWidth: uploaded.width,
          selfieHeight: uploaded.height,
          selfieUploadedAt: now,
          faceDetected: input.selfie.faceDetected,
          consentVersion: input.consentVersion,
          consentedAt: now,
          submittedAt: now,
          reviewNote: null,
          reviewedById: null,
          reviewedAt: null,
          companions: {
            create: input.companions.map((companion, index) => ({
              relationship: companion.relationship,
              name: companion.name,
              position: index + 1,
            })),
          },
        },
        include: { companions: { orderBy: { position: 'asc' } } },
      })

      const pass = autoApprove
        ? await issuePass(tx, registration.id, input.companions.length)
        : null

      await tx.registrationDraft.deleteMany({ where: { userId: actor.id } })

      return { registration, pass }
    }

    const registration = await tx.registration.create({
      data: {
        reference,
        userId: actor.id,
        admittedStudentId: admitted.id,
        status,
        // The student's confirmed spelling, not the sheet's. The name on the pass
        // has to be the one they answer to at the gate.
        name: input.name,
        // The programme is *not* accepted from the client. It is the sheet's, read
        // server-side — a field the student cannot edit has no business arriving
        // in a request body.
        program: admitted.program,
        contactNo: input.contactNo,
        selfiePublicId: uploaded.publicId,
        selfieCloudName: uploaded.cloudName,
        selfieVersion: uploaded.version,
        selfieBytes: uploaded.bytes,
        selfieWidth: uploaded.width,
        selfieHeight: uploaded.height,
        selfieUploadedAt: now,
        faceDetected: input.selfie.faceDetected,
        consentVersion: input.consentVersion,
        consentedAt: now,
        submittedAt: now,
        companions: {
          create: input.companions.map((companion, index) => ({
            relationship: companion.relationship,
            name: companion.name,
            position: index + 1,
          })),
        },
      },
      include: { companions: { orderBy: { position: 'asc' } } },
    })

    const pass = autoApprove
      ? await issuePass(tx, registration.id, input.companions.length)
      : null

    // The draft has served its purpose. Deleted inside the transaction so a
    // failed submit leaves the student's work exactly where it was.
    await tx.registrationDraft.deleteMany({ where: { userId: actor.id } })

    return { registration, pass }
  })

  await writeAudit({
    action: AUDIT_ACTIONS.REGISTRATION_SUBMITTED,
    actor,
    entityType: 'Registration',
    entityId: created.registration.id,
    after: {
      reference,
      formNumber: input.formNumber,
      status,
      companions: input.companions.length,
      faceDetected: input.selfie.faceDetected,
      autoApproved: autoApprove,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  await writeAudit({
    action: AUDIT_ACTIONS.SELFIE_UPLOADED,
    actor,
    entityType: 'Registration',
    entityId: created.registration.id,
    after: {
      cloudName: uploaded.cloudName,
      accountLabel: uploaded.accountLabel,
      bytes: uploaded.bytes,
      faceDetected: input.selfie.faceDetected,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  // The student's own page updates without a poll. Fire-and-forget: `publish`
  // does not throw and a missed event costs a manual refresh.
  publish(studentChannel(created.registration.id), {
    type: 'registration.status',
    registrationId: created.registration.id,
    status,
    hasPass: created.pass !== null,
    at: now.getTime(),
  })

  return {
    registrationId: created.registration.id,
    reference,
    status,
    pass: created.pass ? toPassSummary(created.pass, null) : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The retake
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace a selfie after a moderator asked for one.
 *
 * Only from `REVISION_REQUESTED`. A student cannot swap the photo on an approved
 * registration — that is the one action that would let somebody register with
 * their own face and then attend with a different one.
 *
 * The old asset is overwritten rather than deleted-then-uploaded, because the
 * public id is derived from the reference. That is what `overwrite: true` in the
 * upload options is for, and it means a failed retake leaves the previous photo
 * intact instead of leaving the record with none.
 */
export async function replaceSelfie(
  actor: Actor,
  input: { image: string; faceDetected: boolean },
  meta: RequestMeta,
): Promise<SelfieReplaceResponse> {
  const registration = await prisma.registration.findUnique({
    where: { userId: actor.id },
    select: { id: true, reference: true, status: true, revisionCount: true, selfiePublicId: true },
  })

  if (!registration) abort('NOT_FOUND', 'You have not registered yet.')
  if (registration.status !== 'REVISION_REQUESTED') {
    abort(
      'CONFLICT',
      registration.status === 'APPROVED'
        ? 'Your registration is approved. Contact the help desk if the photo needs changing.'
        : 'Your photo can only be replaced when a reviewer has asked for a retake.',
    )
  }

  let uploaded
  try {
    uploaded = await uploadSelfie(input.image, registration.reference)
  } catch (error) {
    if (error instanceof CloudinaryUnavailableError) {
      console.error('[registration] retake upload failed on every account', error.attempts)
      abort('UPLOAD_FAILED', 'We could not store your photo just now. Try again in a moment.')
    }
    throw error
  }

  const now = new Date()
  const updated = await prisma.registration.update({
    where: { id: registration.id },
    data: {
      selfiePublicId: uploaded.publicId,
      selfieCloudName: uploaded.cloudName,
      selfieVersion: uploaded.version,
      selfieBytes: uploaded.bytes,
      selfieWidth: uploaded.width,
      selfieHeight: uploaded.height,
      selfieUploadedAt: now,
      faceDetected: input.faceDetected,
      // Back into the queue, and the review note is cleared so the student is not
      // still being shown a reason they have now acted on.
      status: 'PENDING_REVIEW',
      reviewNote: null,
      reviewedById: null,
      reviewedAt: null,
    },
  })

  await writeAudit({
    action: AUDIT_ACTIONS.SELFIE_REPLACED,
    actor,
    entityType: 'Registration',
    entityId: registration.id,
    before: { publicId: registration.selfiePublicId, revisionCount: registration.revisionCount },
    after: { cloudName: uploaded.cloudName, bytes: uploaded.bytes, faceDetected: input.faceDetected },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  publish(studentChannel(registration.id), {
    type: 'registration.status',
    registrationId: registration.id,
    status: 'PENDING_REVIEW',
    hasPass: false,
    at: now.getTime(),
  })

  const signed = issueSelfiePath(registration.id, actor.id)

  return {
    status: updated.status,
    selfieUploadedAt: now.toISOString(),
    selfieUrl: signed.path,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/registration/me
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything the student portal needs, in one read.
 *
 * One query with two includes rather than four round trips, because this runs on
 * every load of the student dashboard and again on every SSE reconnect.
 */
export async function readMe(actor: Actor): Promise<MeResponse> {
  const config = await getConfig()

  const [registration, draft] = await Promise.all([
    prisma.registration.findUnique({
      where: { userId: actor.id },
      include: {
        companions: { orderBy: { position: 'asc' } },
        pass: { include: { checkIn: { select: { scannedAt: true } } } },
      },
    }),
    prisma.registrationDraft.findUnique({
      where: { userId: actor.id },
      select: { step: true },
    }),
  ])

  if (!registration) {
    return {
      registration: null,
      companions: [],
      pass: null,
      draftStep: draft?.step ?? null,
      registrationOpen: config.registrationOpen,
    }
  }

  return {
    registration: {
      id: registration.id,
      reference: registration.reference,
      status: registration.status,
      name: registration.name,
      program: registration.program,
      contactNo: registration.contactNo,
      submittedAt: registration.submittedAt.toISOString(),
      reviewNote: registration.reviewNote,
      revisionCount: registration.revisionCount,
      // Whether one exists, never the id. A Cloudinary public id in a client
      // payload is a string somebody will eventually try to build a URL from.
      hasSelfie: registration.selfiePublicId !== null,
      faceDetected: registration.faceDetected,
    },
    companions: registration.companions.map(toCompanionSummary),
    pass: registration.pass
      ? toPassSummary(registration.pass, registration.pass.checkIn?.scannedAt ?? null)
      : null,
    draftStep: draft?.step ?? null,
    registrationOpen: config.registrationOpen,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shapers
// ─────────────────────────────────────────────────────────────────────────────

export function toPassSummary(pass: Pass, checkedInAt: Date | null): PassSummary {
  return {
    code10: pass.code10,
    code10Formatted: formatCode10(pass.code10),
    qrPayload: pass.qrPayload,
    status: pass.status,
    guestCount: pass.guestCount,
    issuedAt: pass.issuedAt.toISOString(),
    checkedInAt: checkedInAt?.toISOString() ?? null,
    revokedReason: pass.revokedReason,
  }
}

export function toCompanionSummary(companion: Companion): CompanionSummary {
  return {
    relationship: companion.relationship,
    name: companion.name,
    position: companion.position,
  }
}

/**
 * Release a claim so the form number can be registered again.
 *
 * Admin-only, and destructive: it deletes the registration, which cascades to the
 * companions and the pass. For the case where a student registered against the
 * wrong form number and the help desk has to undo it.
 *
 * The selfie is *not* deleted here. It is left for the retention sweep, because a
 * mistaken release should not be the thing that destroys the only photo of a
 * student who then re-registers correctly within the hour.
 */
export async function releaseClaim(
  registrationId: string,
  reason: string,
  by: Actor,
): Promise<void> {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: { id: true, reference: true, admittedStudentId: true, userId: true, status: true },
  })
  if (!registration) abort('NOT_FOUND', 'No such registration.')

  await prisma.$transaction([
    prisma.registration.delete({ where: { id: registration.id } }),
    prisma.admittedStudent.update({
      where: { id: registration.admittedStudentId },
      data: { isClaimed: false, claimedByUserId: null, claimedAt: null },
    }),
  ])

  await writeAudit({
    action: AUDIT_ACTIONS.REGISTRATION_CLAIM_RELEASED,
    actor: by,
    entityType: 'Registration',
    entityId: registration.id,
    before: { reference: registration.reference, status: registration.status },
    after: { reason },
  })
}

/**
 * Normalise a contact number the way the roster parser does.
 *
 * Exported so the wizard's server-side path and the help desk agree. A number
 * stored as `+91 98765 43210` in one row and `9876543210` in another is a number
 * nobody can search for.
 */
export function normaliseContact(raw: string): string | null {
  return normalisePhone(raw)
}
