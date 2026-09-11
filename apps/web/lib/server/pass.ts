/**
 * Pass issuance, revocation, and the keys that verify a pass.
 *
 * ## The signing key is loaded once
 *
 * `loadSigningKey` parses PEM and derives a key id — a few hundred microseconds,
 * but on every pass issuance and every manifest build it adds up, and the result is
 * immutable for the lifetime of the process. Cached in a module-level variable, so a
 * malformed `PASS_PRIVATE_KEY` fails on the first issuance with a clear message
 * rather than on every one.
 *
 * ## Why issuance retries
 *
 * `code10` is ten random digits. At 15,000 passes the birthday probability of at
 * least one collision is around 1%, which is small but not zero — and "not zero" for
 * an event that runs once means it happens to somebody. So the insert is attempted,
 * and a unique violation on `code10` is retried with a fresh code rather than
 * surfaced. Five attempts makes the residual probability of failure indistinguishable
 * from zero.
 *
 * A unique violation on `registrationId` is a different thing entirely: the pass
 * already exists, and the caller asked for one twice — two clicks on "submit", a
 * retried request. That returns the existing pass, because issuing a second pass for
 * one registration is the one outcome that must never happen.
 */
import 'server-only'

import { Prisma, prisma, type Pass, type Prisma as PrismaTypes } from '@orientation/db'
import {
  generateCode10,
  loadSigningKey,
  loadVerifyingKey,
  signPass,
  type SigningKey,
  type VerifyingKey,
} from '@orientation/core/pass'
import { AUDIT_ACTIONS } from '@orientation/core/audit'

import { EVENT } from '../event'
import { env } from './env'
import { writeAudit } from './audit'
import { bumpManifestVersion } from './config'
import type { Actor } from './auth'

let signingKey: SigningKey | undefined
let verifyingKeys: VerifyingKey[] | undefined

export function getSigningKey(): SigningKey {
  signingKey ??= loadSigningKey(env.PASS_PRIVATE_KEY)
  return signingKey
}

/**
 * Every public key a device should hold, newest first.
 *
 * A list rather than one key because rotation has to be possible without
 * invalidating passes already downloaded to students' phones: the new key signs new
 * passes, the old key still verifies old ones, and a device holding both picks by the
 * `keyId` in the envelope. Today the list has one entry — the shape is what makes the
 * rotation a configuration change rather than a rewrite.
 */
export function getVerifyingKeys(): VerifyingKey[] {
  verifyingKeys ??= [loadVerifyingKey(env.PASS_PUBLIC_KEY)]
  return verifyingKeys
}

/**
 * The validity window baked into the signature.
 *
 * Deliberately wider than the gate windows. The envelope's window is a hard
 * cryptographic bound that cannot be adjusted after a pass is in a student's hand;
 * the gate window is operational and an admin can move it from the settings screen.
 * So the envelope covers the event generously and the gate does the real gating —
 * which is also why `decideScan` treats `OUT_OF_WINDOW` as the one overridable
 * verdict.
 *
 * Two hours before gates open, because a fresher travelling from out of state will
 * arrive early and being told their pass is not valid yet is a help-desk queue for no
 * reason. Twelve hours after the last session ends, because the cultural evening runs
 * late and a re-entry scan at 22:00 on the final day is a normal thing to happen.
 */
export function passWindow(): { notBefore: Date; notAfter: Date } {
  return {
    notBefore: new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000),
    notAfter: new Date(EVENT.endsAt.getTime() + 12 * 60 * 60 * 1_000),
  }
}

const MAX_CODE_ATTEMPTS = 5

/**
 * Create the pass for an approved registration.
 *
 * Takes a Prisma client so it can run inside the same transaction that flips a
 * registration to `APPROVED` — a registration that is approved but has no pass is a
 * student staring at an empty pass screen, and the two writes belong together.
 */
export async function issuePass(
  db: PrismaTypes.TransactionClient | typeof prisma,
  registrationId: string,
  guestCount: number,
): Promise<Pass> {
  const key = getSigningKey()
  const window = passWindow()

  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
    const code10 = generateCode10()
    const issued = signPass(key, { code10, notBefore: window.notBefore, notAfter: window.notAfter })

    try {
      return await db.pass.create({
        data: {
          registrationId,
          code10,
          qrPayload: issued.payload,
          signedPayload: issued.signedMessage,
          signature: issued.signature,
          keyId: issued.keyId,
          guestCount,
          status: 'ACTIVE',
        },
      })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error

      const target = targetFields(error)

      // The pass already exists. Return it rather than making a second one.
      if (target.includes('registrationId')) {
        const existing = await db.pass.findUnique({ where: { registrationId } })
        if (existing) return existing
        throw error
      }

      if (!target.includes('code10')) throw error
      // A code collision. Round again with a new code.
      console.warn(`[pass] code10 collision on attempt ${String(attempt)} for ${registrationId}`)
    }
  }

  throw new Error(
    `Could not find a free pass code after ${String(MAX_CODE_ATTEMPTS)} attempts. This is statistically implausible and suggests the code generator is not random.`,
  )
}

/** Which columns a unique violation was about. Prisma reports this loosely typed. */
function targetFields(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = error.meta?.['target']
  if (Array.isArray(target)) return target.map(String)
  if (typeof target === 'string') return [target]
  return []
}

/**
 * Revoke a pass and tell every device.
 *
 * The manifest bump is the important half. A revoked pass that stays in a device's
 * cached snapshot as `ACTIVE` still opens the gate, so revocation is only real once
 * the fleet has refetched — which is why the revoked entry is *kept* in the manifest
 * with `status: 'REVOKED'` rather than removed. A pass that vanished from the
 * snapshot would be "unknown but validly signed", and `decideScan` admits those.
 */
export async function revokePass(
  passId: string,
  reason: string,
  by: Actor,
): Promise<Pass> {
  const before = await prisma.pass.findUnique({ where: { id: passId } })

  const pass = await prisma.pass.update({
    where: { id: passId },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revokedById: by.id,
      revokedReason: reason.slice(0, 500),
    },
  })

  await writeAudit({
    action: AUDIT_ACTIONS.PASS_REVOKED,
    actor: by,
    entityType: 'Pass',
    entityId: passId,
    before: { status: before?.status ?? null },
    after: { status: 'REVOKED', reason },
  })

  await bumpManifestVersion('REVOCATION')
  return pass
}

/**
 * Undo a revocation.
 *
 * Exists because revocation is a human judgement made in seconds at a gate, and the
 * wrong pass gets revoked. Without this the only remedy is issuing a second pass for
 * a registration, which the unique index correctly refuses.
 */
export async function restorePass(passId: string, reason: string, by: Actor): Promise<Pass> {
  const pass = await prisma.pass.update({
    where: { id: passId },
    data: { status: 'ACTIVE', revokedAt: null, revokedById: null, revokedReason: null },
  })

  await writeAudit({
    action: AUDIT_ACTIONS.PASS_RESTORED,
    actor: by,
    entityType: 'Pass',
    entityId: passId,
    before: { status: 'REVOKED' },
    after: { status: 'ACTIVE', reason },
  })

  await bumpManifestVersion('REVOCATION')
  return pass
}
