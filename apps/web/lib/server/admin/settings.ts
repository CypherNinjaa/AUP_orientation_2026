/**
 * System settings and gate windows.
 *
 * ## Which changes reach a scanner
 *
 * A device caches the manifest and decides verdicts from it with no network. So a
 * setting that changes a *verdict* has to bump `manifestVersion`, and a setting that
 * only changes the website does not:
 *
 *   - Gate open/close times change `OUT_OF_WINDOW`. Bump.
 *   - `registrationOpen`, `autoApprove`, `maxCompanions`, retention, the SSE
 *     threshold: none of them are readable by `decideScan`. No bump.
 *
 * Bumping unnecessarily is not harmless — every device re-downloads the full
 * manifest at once, which at ten devices and 15,000 passes is the largest
 * simultaneous read the system ever does.
 *
 * ## Consent version is not editable here
 *
 * `settingsUpdateRequest` has no `consentVersion` field, and this module does not add
 * one. Changing it would silently invalidate every consent already recorded, and the
 * submit endpoint would start refusing wizards that were loaded a minute earlier. A
 * new consent version is a code change with new wording, not a text box.
 */
import 'server-only'

import { prisma } from '@orientation/db'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import { scannerChannel } from '@orientation/core/realtime'
import type {
  GateUpdateRequest,
  GateView,
  SettingsResponse,
  SettingsUpdateRequest,
} from '@orientation/contracts'

import type { Actor } from '../auth'
import { writeAudit } from '../audit'
import { getConfigRow, updateConfig } from '../config'
import { abort } from '../http'
import { publish } from '../redis'
import type { RequestMeta } from '../registration'

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

interface ConfigRowShape {
  registrationOpen: boolean
  registrationOpensAt: Date | null
  registrationClosesAt: Date | null
  autoApprove: boolean
  consentVersion: string
  selfieRetentionDays: number
  maxCompanions: number
  manifestVersion: number
  sseDegradeThreshold: number
  updatedAt: Date
  updatedById: string | null
}

async function toResponse(row: ConfigRowShape): Promise<SettingsResponse> {
  const updatedBy =
    row.updatedById === null
      ? null
      : await prisma.user.findUnique({
          where: { id: row.updatedById },
          select: { name: true, email: true },
        })

  return {
    registrationOpen: row.registrationOpen,
    registrationOpensAt: row.registrationOpensAt?.toISOString() ?? null,
    registrationClosesAt: row.registrationClosesAt?.toISOString() ?? null,
    autoApprove: row.autoApprove,
    consentVersion: row.consentVersion,
    selfieRetentionDays: row.selfieRetentionDays,
    maxCompanions: row.maxCompanions,
    manifestVersion: row.manifestVersion,
    sseDegradeThreshold: row.sseDegradeThreshold,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: updatedBy?.name ?? updatedBy?.email ?? null,
  }
}

export async function readSettings(): Promise<SettingsResponse> {
  return toResponse(await getConfigRow())
}

export async function writeSettings(
  input: SettingsUpdateRequest,
  actor: Actor,
  meta: RequestMeta,
): Promise<SettingsResponse> {
  const before = await getConfigRow()

  const opensAt =
    input.registrationOpensAt === undefined
      ? undefined
      : input.registrationOpensAt === null
        ? null
        : new Date(input.registrationOpensAt)

  const closesAt =
    input.registrationClosesAt === undefined
      ? undefined
      : input.registrationClosesAt === null
        ? null
        : new Date(input.registrationClosesAt)

  // Checked here rather than in the schema because it is a relationship between two
  // fields, one of which may not be in this request — the stored value has to be
  // consulted. A window that closes before it opens closes registration for good,
  // which is a hard failure to diagnose from the student's side.
  const effectiveOpens = opensAt === undefined ? before.registrationOpensAt : opensAt
  const effectiveCloses = closesAt === undefined ? before.registrationClosesAt : closesAt
  if (effectiveOpens !== null && effectiveCloses !== null && effectiveCloses <= effectiveOpens) {
    abort('VALIDATION_FAILED', 'Registration cannot close before it opens.', {
      fields: { registrationClosesAt: 'This is on or before the opening time.' },
    })
  }

  const row = await updateConfig(
    {
      ...(input.registrationOpen === undefined ? {} : { registrationOpen: input.registrationOpen }),
      ...(opensAt === undefined ? {} : { registrationOpensAt: opensAt }),
      ...(closesAt === undefined ? {} : { registrationClosesAt: closesAt }),
      ...(input.autoApprove === undefined ? {} : { autoApprove: input.autoApprove }),
      ...(input.selfieRetentionDays === undefined
        ? {}
        : { selfieRetentionDays: input.selfieRetentionDays }),
      ...(input.maxCompanions === undefined ? {} : { maxCompanions: input.maxCompanions }),
      ...(input.sseDegradeThreshold === undefined
        ? {}
        : { sseDegradeThreshold: input.sseDegradeThreshold }),
    },
    actor.id,
    { bumpManifest: input.bumpManifestVersion === true },
  )

  await writeAudit({
    action: AUDIT_ACTIONS.CONFIG_UPDATED,
    entityType: 'SystemConfig',
    entityId: row.id,
    actor,
    // Only the fields this request named, and both sides of each. A diff of the
    // whole row would make every entry look like a total rewrite.
    before: diffOf(input, before),
    after: diffOf(input, row),
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  // The registration window is the one setting with a second, separate audit action:
  // it is the question the vice-chancellor's office asks ("why could students not
  // register on Tuesday?"), and finding it in a stream of generic config edits is
  // the difference between an answer and an afternoon.
  if (
    input.registrationOpen !== undefined ||
    input.registrationOpensAt !== undefined ||
    input.registrationClosesAt !== undefined
  ) {
    await writeAudit({
      action: AUDIT_ACTIONS.REGISTRATION_WINDOW_CHANGED,
      entityType: 'SystemConfig',
      entityId: row.id,
      actor,
      before: {
        open: before.registrationOpen,
        opensAt: before.registrationOpensAt?.toISOString() ?? null,
        closesAt: before.registrationClosesAt?.toISOString() ?? null,
      },
      after: {
        open: row.registrationOpen,
        opensAt: row.registrationOpensAt?.toISOString() ?? null,
        closesAt: row.registrationClosesAt?.toISOString() ?? null,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
  }

  return toResponse(row)
}

/**
 * The touched fields only, JSON-safe.
 *
 * `Date` is stringified so the audit entry round-trips through `jsonb` unchanged,
 * and unnamed fields are omitted so a one-field edit records a one-field diff.
 */
function diffOf(input: SettingsUpdateRequest, row: ConfigRowShape): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (input.registrationOpen !== undefined) out.registrationOpen = row.registrationOpen
  if (input.registrationOpensAt !== undefined) {
    out.registrationOpensAt = row.registrationOpensAt?.toISOString() ?? null
  }
  if (input.registrationClosesAt !== undefined) {
    out.registrationClosesAt = row.registrationClosesAt?.toISOString() ?? null
  }
  if (input.autoApprove !== undefined) out.autoApprove = row.autoApprove
  if (input.selfieRetentionDays !== undefined) out.selfieRetentionDays = row.selfieRetentionDays
  if (input.maxCompanions !== undefined) out.maxCompanions = row.maxCompanions
  if (input.sseDegradeThreshold !== undefined) out.sseDegradeThreshold = row.sseDegradeThreshold
  if (input.bumpManifestVersion === true) out.manifestVersion = row.manifestVersion
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Gates
// ─────────────────────────────────────────────────────────────────────────────

export async function listGates(): Promise<GateView[]> {
  const rows = await prisma.gate.findMany({
    orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
      opensAt: true,
      closesAt: true,
      _count: { select: { checkIns: true } },
    },
  })

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    opensAt: row.opensAt?.toISOString() ?? null,
    closesAt: row.closesAt?.toISOString() ?? null,
    checkInCount: row._count.checkIns,
  }))
}

/**
 * Create or update a gate by code.
 *
 * An upsert, because the console has one form for both and the code is the natural
 * key an operator thinks in ("MAIN", "GATE2"). Creating requires a name: a gate
 * called `GATE2` with no name is a row nobody can identify on a radio.
 *
 * A window change publishes to the scanner channel *and* bumps the manifest version.
 * Both are needed: the publish reaches devices that are online now, and the bump
 * reaches the ones that were in a dead spot when it went out.
 */
export async function upsertGate(
  input: GateUpdateRequest,
  actor: Actor,
  meta: RequestMeta,
): Promise<GateView> {
  const existing = await prisma.gate.findUnique({
    where: { code: input.code },
    select: { id: true, name: true, isActive: true, opensAt: true, closesAt: true },
  })

  if (existing === null && input.name === undefined) {
    abort('VALIDATION_FAILED', `Gate "${input.code}" is new. Give it a name.`, {
      fields: { name: 'Required for a new gate.' },
    })
  }

  const opensAt =
    input.opensAt === undefined ? undefined : input.opensAt === null ? null : new Date(input.opensAt)
  const closesAt =
    input.closesAt === undefined
      ? undefined
      : input.closesAt === null
        ? null
        : new Date(input.closesAt)

  const effectiveOpens = opensAt === undefined ? (existing?.opensAt ?? null) : opensAt
  const effectiveCloses = closesAt === undefined ? (existing?.closesAt ?? null) : closesAt
  if (effectiveOpens !== null && effectiveCloses !== null && effectiveCloses <= effectiveOpens) {
    abort('VALIDATION_FAILED', 'A gate cannot close before it opens.', {
      fields: { closesAt: 'This is on or before the opening time.' },
    })
  }

  const row = await prisma.gate.upsert({
    where: { code: input.code },
    update: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(opensAt === undefined ? {} : { opensAt }),
      ...(closesAt === undefined ? {} : { closesAt }),
    },
    create: {
      code: input.code,
      // Guarded above; the fallback keeps the type honest without a non-null assertion.
      name: input.name ?? input.code,
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(opensAt === undefined || opensAt === null ? {} : { opensAt }),
      ...(closesAt === undefined || closesAt === null ? {} : { closesAt }),
    },
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
      opensAt: true,
      closesAt: true,
      _count: { select: { checkIns: true } },
    },
  })

  const windowChanged = opensAt !== undefined || closesAt !== undefined

  await writeAudit({
    action: windowChanged ? AUDIT_ACTIONS.GATE_WINDOW_CHANGED : AUDIT_ACTIONS.CONFIG_UPDATED,
    entityType: 'Gate',
    entityId: row.id,
    actor,
    before:
      existing === null
        ? undefined
        : {
            name: existing.name,
            isActive: existing.isActive,
            opensAt: existing.opensAt?.toISOString() ?? null,
            closesAt: existing.closesAt?.toISOString() ?? null,
          },
    after: {
      code: row.code,
      name: row.name,
      isActive: row.isActive,
      opensAt: row.opensAt?.toISOString() ?? null,
      closesAt: row.closesAt?.toISOString() ?? null,
      created: existing === null,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  if (windowChanged) {
    publish(scannerChannel(), {
      type: 'gate.config',
      gateOpensAt: row.opensAt?.getTime() ?? null,
      gateClosesAt: row.closesAt?.getTime() ?? null,
      at: Date.now(),
    })
  }

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    opensAt: row.opensAt?.toISOString() ?? null,
    closesAt: row.closesAt?.toISOString() ?? null,
    checkInCount: row._count.checkIns,
  }
}
