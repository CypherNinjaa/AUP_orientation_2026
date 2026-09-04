/**
 * The `SystemConfig` singleton, cached in Redis.
 *
 * Read on nearly every request — is registration open, does a submission
 * auto-approve, which consent version is current, what is the manifest version —
 * so a database round trip per read would be one query per page view for a row
 * that changes a handful of times in the project's life.
 *
 * ## Why the TTL is 30 seconds and not 30 minutes
 *
 * The cache is invalidated explicitly on write, so the TTL only matters when
 * invalidation fails — a Redis blip between the `DEL` and the next read, or a
 * second app process whose `DEL` never happened because the write went through a
 * different one. Thirty seconds bounds that: the worst case for "admin closes
 * registration" is half a minute of late submissions, which is recoverable.
 * Thirty minutes would not be.
 *
 * ## The row is created if it is missing
 *
 * `id` is fixed to `singleton` with a check constraint. A fresh database has no
 * row at all, and every endpoint would then fail on a null config — so the read
 * upserts. That makes `getConfig()` safe to call as the very first query against
 * an empty database, which is what the seed script and the first-boot admin
 * screen both need.
 */
import 'server-only'

import { prisma, type SystemConfig } from '@orientation/db'
import { scannerChannel } from '@orientation/core/realtime'

import { cacheDel, cacheGet, cacheSet, publish } from './redis'

const CACHE_KEY = 'config:system'
const CACHE_TTL_SECONDS = 30

export const SINGLETON_ID = 'singleton'

/**
 * The cached shape.
 *
 * Dates are epoch ms, not `Date`. JSON has no date type, so a `Date` round-tripped
 * through Redis comes back as a string and `config.registrationClosesAt.getTime()`
 * throws — at runtime, in production, on a comparison that type-checked fine.
 * Numbers cannot do that.
 */
export interface AppConfig {
  registrationOpen: boolean
  registrationOpensAt: number | null
  registrationClosesAt: number | null
  autoApprove: boolean
  consentVersion: string
  selfieRetentionDays: number
  maxCompanions: number
  manifestVersion: number
  sseDegradeThreshold: number
  updatedAt: number
}

function toAppConfig(row: SystemConfig): AppConfig {
  return {
    registrationOpen: row.registrationOpen,
    registrationOpensAt: row.registrationOpensAt?.getTime() ?? null,
    registrationClosesAt: row.registrationClosesAt?.getTime() ?? null,
    autoApprove: row.autoApprove,
    consentVersion: row.consentVersion,
    selfieRetentionDays: row.selfieRetentionDays,
    maxCompanions: row.maxCompanions,
    manifestVersion: row.manifestVersion,
    sseDegradeThreshold: row.sseDegradeThreshold,
    updatedAt: row.updatedAt.getTime(),
  }
}

/** Read the config, from cache when possible. */
export async function getConfig(): Promise<AppConfig> {
  const cached = await cacheGet<AppConfig>(CACHE_KEY)
  if (cached) return cached

  const row = await prisma.systemConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  })

  const config = toAppConfig(row)
  await cacheSet(CACHE_KEY, config, CACHE_TTL_SECONDS)
  return config
}

/** The database row, uncached. For the admin settings screen, which shows `updatedBy`. */
export async function getConfigRow(): Promise<SystemConfig> {
  return prisma.systemConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  })
}

/**
 * Write the config and drop the cache.
 *
 * `bumpManifest` exists because several settings changes have to reach volunteer
 * devices — a gate window moving, a config change that affects verdicts. Bumping
 * `manifestVersion` invalidates every cached snapshot, and the pub/sub message
 * tells online devices to refetch now rather than at their next poll.
 */
export async function updateConfig(
  data: Partial<{
    registrationOpen: boolean
    registrationOpensAt: Date | null
    registrationClosesAt: Date | null
    autoApprove: boolean
    consentVersion: string
    selfieRetentionDays: number
    maxCompanions: number
    sseDegradeThreshold: number
  }>,
  updatedById: string,
  options?: { bumpManifest?: boolean },
): Promise<SystemConfig> {
  const row = await prisma.systemConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {
      ...data,
      updatedById,
      ...(options?.bumpManifest ? { manifestVersion: { increment: 1 } } : {}),
    },
    create: { id: SINGLETON_ID, ...data, updatedById },
  })

  await cacheDel(CACHE_KEY)

  if (options?.bumpManifest) {
    publish(scannerChannel(), { type: 'manifest.stale', reason: 'CONFIG', at: Date.now() })
  }

  return row
}

/**
 * Invalidate every device's cached manifest.
 *
 * Called when a pass is revoked or restored, and when a batch of registrations is
 * approved. Separate from `updateConfig` because the common caller is not changing
 * a setting at all — it revoked one pass and needs the fleet to know.
 */
export async function bumpManifestVersion(
  reason: 'REVOCATION' | 'NEW_PASSES' | 'CONFIG',
): Promise<number> {
  const row = await prisma.systemConfig.upsert({
    where: { id: SINGLETON_ID },
    update: { manifestVersion: { increment: 1 } },
    create: { id: SINGLETON_ID, manifestVersion: 2 },
  })

  await cacheDel(CACHE_KEY)
  publish(scannerChannel(), { type: 'manifest.stale', reason, at: Date.now() })
  return row.manifestVersion
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived questions
// ─────────────────────────────────────────────────────────────────────────────

export type RegistrationWindow =
  | { open: true }
  | { open: false; reason: 'CLOSED' | 'NOT_YET_OPEN' | 'CLOSED_FOR_GOOD'; opensAt: number | null }

/**
 * Whether a student may submit right now, and if not, why.
 *
 * Three distinct closed states because they are three different sentences to show
 * a fresher. "Registration opens on the 8th" is useful; "registration is closed"
 * when it has not opened yet is misleading, and the difference is one a student
 * will otherwise ask the help desk about.
 *
 * The manual switch wins over the schedule in one direction only: `registrationOpen
 * = false` closes it regardless of dates, because that is the emergency stop. With
 * the switch on, the dates still apply — otherwise setting a future opening date
 * would have no effect until someone remembered to flip the boolean too.
 */
export function registrationWindow(config: AppConfig, now = Date.now()): RegistrationWindow {
  if (!config.registrationOpen) {
    return { open: false, reason: 'CLOSED', opensAt: config.registrationOpensAt }
  }
  if (config.registrationOpensAt !== null && now < config.registrationOpensAt) {
    return { open: false, reason: 'NOT_YET_OPEN', opensAt: config.registrationOpensAt }
  }
  if (config.registrationClosesAt !== null && now > config.registrationClosesAt) {
    return { open: false, reason: 'CLOSED_FOR_GOOD', opensAt: null }
  }
  return { open: true }
}

/** The message a student sees when the window is shut. */
export function registrationClosedMessage(window: Extract<RegistrationWindow, { open: false }>): string {
  switch (window.reason) {
    case 'NOT_YET_OPEN': {
      const when = window.opensAt
        ? new Date(window.opensAt).toLocaleString('en-IN', {
            dateStyle: 'long',
            timeStyle: 'short',
            timeZone: 'Asia/Kolkata',
          })
        : 'shortly'
      return `Registration opens ${when}.`
    }
    case 'CLOSED_FOR_GOOD':
      return 'Registration has closed. Visit the help desk on the day and a volunteer will register you.'
    case 'CLOSED':
      return 'Registration is not open yet. Check back soon.'
  }
}
