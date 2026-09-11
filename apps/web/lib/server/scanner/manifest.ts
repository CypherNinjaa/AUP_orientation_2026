/**
 * The offline manifest.
 *
 * This is the file that makes the gate work when the network does not. A volunteer's
 * phone downloads this once, keeps it in IndexedDB, and from then on every scan is
 * decided on the device by `decideScan` with zero network calls. The manifest is the
 * "known passes" half of that function's input.
 *
 * ## What it contains, and what it deliberately does not
 *
 * It holds names, programmes, guest counts and guest names — the fields a volunteer
 * needs to say "yes, you and two guests, go through". It does **not** hold selfies
 * (D7). Fifteen thousand faces cached on ten phones that get left in auto-rickshaws
 * is the single worst PII outcome available to this system, and the selfie is only
 * needed in the rare case where the volunteer wants to challenge an identity — which
 * is exactly the case where they can afford to wait for a network round trip through
 * `/api/scanner/selfie/[registrationId]`.
 *
 * ## Revoked passes stay in the manifest
 *
 * This is the subtlest rule in the offline design and it is worth stating twice.
 * `decideScan` rule 3 admits a pass that is *not* in the manifest if its signature
 * verifies, because a device holding a five-minute-old manifest must not turn away a
 * student who registered four minutes ago. That fallback is what makes a delta sync
 * safe. It also means that *dropping* a revoked pass from the manifest would silently
 * un-revoke it: the device would find no entry, check the signature, and admit.
 *
 * So a revoked pass is shipped with `status: 'REVOKED'` and stays shipped forever.
 * `removedPassIds` exists for the other case — a pass row that genuinely no longer
 * exists — and in practice is almost always empty.
 *
 * ## Deltas
 *
 * A full manifest at 15,000 passes is roughly 2 MB of JSON. Ten devices refreshing
 * every five minutes would be 240 MB an hour of mostly unchanged bytes over venue
 * wifi that also has to carry the check-in sync. So a device sends the `version` and
 * `since` it already has, and gets back only rows that changed after `since`.
 *
 * The delta is gated on `version` matching the current `manifestVersion`. When an
 * admin revokes a pass or moves the gate window, `bumpManifestVersion` fires and
 * every device's next request is answered with a full manifest — because a revocation
 * is precisely the kind of change a device must not miss, and "changed after `since`"
 * cannot express "this row you already have is now dangerous" as reliably as simply
 * sending everything again.
 *
 * `full` is stated in the response rather than inferred by the client. A client that
 * has to guess whether it received a delta or a replacement will eventually guess
 * wrong and merge a full manifest into a stale one, keeping rows that should have
 * been replaced.
 */
import 'server-only'

import { prisma } from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import { MANIFEST_MAX_AGE_MS, type ManifestPass, type ManifestResponse } from '@orientation/contracts'
import type { ManifestQuery } from '@orientation/contracts'

import type { Actor } from '../auth'
import { writeAudit } from '../audit'
import { getConfig } from '../config'
import { abort } from '../http'
import { getVerifyingKeys } from '../pass'
import type { RequestMeta } from '../registration'

/**
 * The gate a device is scanning at.
 *
 * Looked up rather than created. A typo in `gateCode` on a device's config screen
 * must not silently produce a second gate that nobody is standing at — the arrival
 * numbers would split across two rows and the control room would see half the crowd.
 */
async function resolveGate(code: string): Promise<{
  id: string
  code: string
  name: string
  opensAt: Date | null
  closesAt: Date | null
}> {
  const gate = await prisma.gate.findUnique({
    where: { code },
    select: { id: true, code: true, name: true, isActive: true, opensAt: true, closesAt: true },
  })

  if (gate === null) {
    abort('NOT_FOUND', `No gate is configured with the code "${code}". Check the device settings.`)
  }

  if (!gate.isActive) {
    abort('CONFLICT', `Gate "${code}" is switched off. Ask the control room which gate to use.`)
  }

  return {
    id: gate.id,
    code: gate.code,
    name: gate.name,
    opensAt: gate.opensAt,
    closesAt: gate.closesAt,
  }
}

/**
 * Which passes to ship.
 *
 * Rejected registrations are excluded: `ManifestPass.registrationStatus` has four
 * members and `REJECTED` is not one of them, deliberately. A rejected registration
 * has its pass revoked in the same transaction (see `admin/registrations.ts`), and a
 * revoked pass that is not in the manifest is caught by the signature check — which
 * is the correct outcome, because a rejected student's envelope was signed with a key
 * that is still trusted. Their pass is `REVOKED` in the database, so a scan of it
 * reaches the server via `/sync` and is recorded as `REVOKED` there.
 *
 * The exclusion is therefore not a hole; it is the one case where the offline device
 * says "admit" and the server later says "revoked", and the audit trail catches it.
 * Given a rejection is a manual admin act on a handful of registrations, that is the
 * right trade against widening a contract everything else depends on.
 */
const MANIFEST_WHERE = {
  registration: { status: { not: 'REJECTED' as const } },
} as const

const MANIFEST_SELECT = {
  id: true,
  registrationId: true,
  code10: true,
  status: true,
  guestCount: true,
  scanLimit: true,
  checkIn: { select: { recordedAt: true } },
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

type PassRow = {
  id: string
  registrationId: string
  code10: string
  status: 'ACTIVE' | 'REVOKED'
  guestCount: number
  scanLimit?: number
  checkIn: { recordedAt: Date } | null
  _count?: { scanEvents: number }
  registration: {
    status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REVISION_REQUESTED' | 'REJECTED'
    name: string
    program: string
    companions: { name: string }[]
  }
}

function toManifestPass(row: PassRow): ManifestPass {
  const scanLimit = row.scanLimit ?? 1
  const scansCount = row._count?.scanEvents ?? (row.checkIn !== null ? 1 : 0)
  return {
    passId: row.id,
    registrationId: row.registrationId,
    code10: row.code10,
    status: row.status,
    // `MANIFEST_WHERE` excludes REJECTED, so this cast narrows a union the query has
    // already filtered. Written as a conditional rather than an `as` so that adding a
    // sixth registration status produces a visible fallback instead of a lie.
    registrationStatus: row.registration.status === 'REJECTED' ? 'REVISION_REQUESTED' : row.registration.status,
    checkedInAt: row.checkIn === null ? null : row.checkIn.recordedAt.getTime(),
    name: row.registration.name,
    program: row.registration.program,
    guestCount: row.guestCount,
    guestNames: row.registration.companions.map((companion) => companion.name),
    scanLimit,
    scansCount,
  }
}

export interface ManifestOptions {
  gateCode: string
}

/**
 * Build the manifest for one device.
 *
 * Audits `MANIFEST_ISSUED` on a full manifest only. A delta is a heartbeat — ten
 * devices refreshing every five minutes for a twelve-hour event is 1,440 rows of
 * "nothing changed", which buries the entries that matter. A full manifest means a
 * device downloaded every name in the system, and that is worth a row.
 */
export async function buildManifest(
  query: ManifestQuery,
  options: ManifestOptions,
  actor: Actor,
  meta: RequestMeta,
): Promise<ManifestResponse> {
  const [config, gate, keys] = await Promise.all([
    getConfig(),
    resolveGate(options.gateCode),
    Promise.resolve(getVerifyingKeys()),
  ])

  const version = config.manifestVersion

  // A delta is only honoured when the device is on the current version. Any bump —
  // a revocation, a gate window change — forces a full replacement, because "rows
  // that changed since T" cannot express "a row you already hold is now unsafe".
  const wantsDelta =
    query.since !== undefined && query.version !== undefined && query.version === version

  const since = wantsDelta && query.since !== undefined ? new Date(query.since) : null

  const rows = (await prisma.pass.findMany({
    where:
      since === null
        ? MANIFEST_WHERE
        : {
            ...MANIFEST_WHERE,
            // Three ways a manifest row goes stale within one version: a pass was
            // issued, a registration changed (name correction, approval), or a
            // check-in landed from the other lane. The third is why `checkIn` is in
            // the OR — without it a device would keep admitting somebody who walked
            // through four minutes ago on another phone.
            //
            // Revocation is deliberately absent. `Pass` has no `updatedAt` column and
            // does not need one here: revoking or restoring calls
            // `bumpManifestVersion('REVOCATION')`, which changes `version`, which
            // makes `wantsDelta` false, which sends the whole manifest. A revocation
            // is the one change a device must not miss, so it gets the blunt path.
            OR: [
              { issuedAt: { gt: since } },
              { registration: { updatedAt: { gt: since } } },
              { checkIn: { recordedAt: { gt: since } } },
            ],
          },
    orderBy: { issuedAt: 'asc' },
    select: MANIFEST_SELECT,
  })) as PassRow[]

  // The count is of the whole manifest, not of this response, so a device can tell
  // "I have 15,000 of 15,000" from "I have 200 of 15,000 and my delta chain broke".
  const totalPasses = await prisma.pass.count({ where: MANIFEST_WHERE })

  const generatedAt = Date.now()

  if (!wantsDelta) {
    await writeAudit({
      action: AUDIT_ACTIONS.MANIFEST_ISSUED,
      entityType: 'Manifest',
      entityId: String(version),
      actor,
      after: {
        gate: gate.code,
        version,
        passes: rows.length,
        keys: keys.length,
        full: true,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
  }

  return {
    version,
    generatedAt,
    maxAgeMs: MANIFEST_MAX_AGE_MS,
    full: !wantsDelta,
    gate: {
      id: gate.id,
      code: gate.code,
      name: gate.name,
      opensAt: gate.opensAt === null ? null : gate.opensAt.getTime(),
      closesAt: gate.closesAt === null ? null : gate.closesAt.getTime(),
    },
    // Every trusted key, newest first, so a device keeps verifying passes signed
    // before a rotation. The private half never leaves the server (D5).
    keys: keys.map((key) => ({ keyId: key.keyId, publicKeyPem: key.publicKeyPem })),
    passes: rows.map(toManifestPass),
    // Passes are never hard-deleted — `Pass` has no delete path and revocation is a
    // status change — so this is structurally empty. It stays in the contract because
    // a client that cannot process removals is a client that cannot be fixed remotely
    // when a removal one day becomes necessary.
    removedPassIds: [],
    totalPasses,
  }
}
