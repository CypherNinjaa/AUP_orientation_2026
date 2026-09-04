/**
 * Spare Cloudinary accounts.
 *
 * The primary account's keys live in the environment. This is the overflow list: when
 * the free tier fills up mid-event an admin adds another account's keys here and
 * uploads continue without a redeploy, because `resolveAccounts` in
 * `lib/server/media/cloudinary.ts` walks env-first-then-these-by-priority on every
 * upload.
 *
 * ## The secret goes in and never comes out
 *
 * `apiSecret` is encrypted with AES-256-GCM under `SECRETS_KEY` on the way in and is
 * never selected back — not by this module, not by the API, not by the UI. Three
 * things enforce that and all three are needed:
 *
 *   1. `CloudinaryConfigView` has no field for it, so there is nowhere to put it.
 *   2. Every `select` here is explicit and omits `apiSecretCipher`.
 *   3. `apiKeyMasked` ships four digits, because the full key identifies the account
 *      to anyone who gets the response.
 *
 * An admin who loses a secret adds a new account. That is the correct recovery: the
 * alternative is an endpoint that returns credentials, and there is no version of
 * that which is safe to have.
 *
 * ## Credentials are verified before they are stored
 *
 * `api.ping` runs first. Storing an unverified key means finding out it is wrong at
 * the exact moment the primary account fills up, which is the worst possible moment
 * to discover a typo.
 */
import 'server-only'

import { Prisma, prisma } from '@orientation/db'
import { decryptSecret, encryptSecret, parseSecretsKey } from '@orientation/core/crypto/secrets'
import { AUDIT_ACTIONS } from '@orientation/core/audit'
import type {
  CloudinaryAddRequest,
  CloudinaryConfigView,
  CloudinaryPrimaryView,
  CloudinaryUpdateRequest,
} from '@orientation/contracts'

import type { Actor } from '../auth'
import { writeAudit } from '../audit'
import { env } from '../env'
import { abort } from '../http'
import { fetchUsage, testCredentials } from '../media/cloudinary'
import { cacheGet, cacheSet } from '../redis'
import type { RequestMeta } from '../registration'

/**
 * How long a usage figure is reused.
 *
 * Cloudinary rate-limits the admin API (500 calls an hour on the free tier), and the
 * settings screen is a page an admin refreshes while watching a number climb. Five
 * minutes turns a refresh loop into one call and is well inside the resolution
 * anybody needs for "is this account nearly full".
 */
const USAGE_TTL_SECONDS = 5 * 60

/** Last four digits. Enough to tell two accounts apart, not enough to be a key. */
function maskKey(apiKey: string): string {
  return apiKey.length <= 4 ? '••••' : `••••${apiKey.slice(-4)}`
}

const VIEW_SELECT = {
  id: true,
  label: true,
  cloudName: true,
  apiKey: true,
  priority: true,
  isActive: true,
  storageUsedBytes: true,
  storageLimitBytes: true,
  uploadCount: true,
  usageCheckedAt: true,
  lastErrorAt: true,
  lastError: true,
  createdAt: true,
  createdBy: { select: { name: true, email: true } },
  // `apiSecretCipher` is deliberately absent. Adding it here is the one edit that
  // would put an encrypted secret into a response body.
} satisfies Prisma.CloudinaryConfigSelect

type ConfigRecord = Prisma.CloudinaryConfigGetPayload<{ select: typeof VIEW_SELECT }>

function toView(row: ConfigRecord): CloudinaryConfigView {
  return {
    id: row.id,
    label: row.label,
    cloudName: row.cloudName,
    apiKeyMasked: maskKey(row.apiKey),
    priority: row.priority,
    isActive: row.isActive,
    // `BigInt` as a decimal string. `JSON.stringify` throws on a BigInt, and a byte
    // count past 2^53 is not a realistic worry — the string is for consistency with
    // the column type rather than for range.
    storageUsedBytes: row.storageUsedBytes.toString(),
    storageLimitBytes: row.storageLimitBytes?.toString() ?? null,
    uploadCount: row.uploadCount,
    usageCheckedAt: row.usageCheckedAt?.toISOString() ?? null,
    lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdBy: row.createdBy?.name ?? row.createdBy?.email ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The environment account, shown alongside the spares as priority 0.
 *
 * `configured` is false when the env vars are placeholders. It is worth surfacing:
 * a deployment with no working primary account still accepts registrations right up
 * to the selfie step, and the settings screen is where that gets noticed.
 */
async function primaryView(): Promise<CloudinaryPrimaryView> {
  const cloudName = env.CLOUDINARY_CLOUD_NAME
  const apiKey = env.CLOUDINARY_API_KEY
  const configured = cloudName !== '' && apiKey !== '' && env.CLOUDINARY_API_SECRET !== ''

  if (!configured) {
    return {
      cloudName,
      apiKeyMasked: maskKey(apiKey),
      configured: false,
      storageUsedBytes: null,
      storageLimitBytes: null,
      usageCheckedAt: null,
    }
  }

  const cacheKey = `cloudinary:usage:env:${cloudName}`
  const cached = await cacheGet<{ used: string; limit: string | null; at: string }>(cacheKey)

  if (cached !== undefined) {
    return {
      cloudName,
      apiKeyMasked: maskKey(apiKey),
      configured: true,
      storageUsedBytes: cached.used,
      storageLimitBytes: cached.limit,
      usageCheckedAt: cached.at,
    }
  }

  const usage = await fetchUsage({
    cloudName,
    apiKey,
    apiSecret: env.CLOUDINARY_API_SECRET,
  })

  if (usage === null) {
    // Cloudinary did not answer. Reported as "configured but unknown" rather than as
    // an error: the account may well be working for uploads, and the usage API is
    // the first thing to be rate-limited.
    return {
      cloudName,
      apiKeyMasked: maskKey(apiKey),
      configured: true,
      storageUsedBytes: null,
      storageLimitBytes: null,
      usageCheckedAt: null,
    }
  }

  const snapshot = {
    used: String(usage.usedBytes),
    limit: usage.limitBytes === null ? null : String(usage.limitBytes),
    at: new Date().toISOString(),
  }
  await cacheSet(cacheKey, snapshot, USAGE_TTL_SECONDS)

  return {
    cloudName,
    apiKeyMasked: maskKey(apiKey),
    configured: true,
    storageUsedBytes: snapshot.used,
    storageLimitBytes: snapshot.limit,
    usageCheckedAt: snapshot.at,
  }
}

export async function listCloudinaryConfigs(): Promise<{
  primary: CloudinaryPrimaryView
  items: CloudinaryConfigView[]
}> {
  const [primary, rows] = await Promise.all([
    primaryView(),
    prisma.cloudinaryConfig.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      select: VIEW_SELECT,
    }),
  ])

  return { primary, items: rows.map(toView) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────────────────

export async function addCloudinaryConfig(
  input: CloudinaryAddRequest,
  actor: Actor,
  meta: RequestMeta,
): Promise<CloudinaryConfigView> {
  if (input.cloudName === env.CLOUDINARY_CLOUD_NAME) {
    abort(
      'CONFLICT',
      'That is the primary account, which is already configured from the environment.',
    )
  }

  const check = await testCredentials({
    cloudName: input.cloudName,
    apiKey: input.apiKey,
    apiSecret: input.apiSecret,
  })

  if (!check.ok) {
    abort('VALIDATION_FAILED', `Cloudinary rejected those credentials: ${check.reason}`, {
      fields: { apiSecret: 'Check the key and secret against the Cloudinary console.' },
    })
  }

  // Encrypted before the row is built, so there is no code path in which the
  // plaintext reaches a Prisma call.
  const cipher = encryptSecret(input.apiSecret, parseSecretsKey(env.SECRETS_KEY))

  // Usage is fetched now rather than lazily: the admin is adding this account
  // *because* they need room, and "how much room does it have" is the question they
  // are about to ask.
  const usage = await fetchUsage({
    cloudName: input.cloudName,
    apiKey: input.apiKey,
    apiSecret: input.apiSecret,
  })

  let row: ConfigRecord
  try {
    row = await prisma.cloudinaryConfig.create({
      data: {
        label: input.label,
        cloudName: input.cloudName,
        apiKey: input.apiKey,
        apiSecretCipher: cipher,
        priority: input.priority,
        createdById: actor.id,
        ...(input.storageLimitBytes === undefined || input.storageLimitBytes === null
          ? {}
          : { storageLimitBytes: BigInt(input.storageLimitBytes) }),
        ...(usage === null
          ? {}
          : {
              usageCheckedAt: new Date(),
              storageUsedBytes: BigInt(usage.usedBytes),
              ...(usage.limitBytes === null || input.storageLimitBytes !== undefined
                ? {}
                : { storageLimitBytes: BigInt(usage.limitBytes) }),
            }),
      },
      select: VIEW_SELECT,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      abort('CONFLICT', 'That cloud name and API key pair is already saved.')
    }
    throw error
  }

  await writeAudit({
    action: AUDIT_ACTIONS.CLOUDINARY_CONFIG_ADDED,
    entityType: 'CloudinaryConfig',
    entityId: row.id,
    actor,
    // The masked key, never the real one, and never the secret. `writeAudit` redacts
    // secret-shaped keys as a second line of defence, but not relying on that is why
    // this is written out field by field.
    after: {
      label: row.label,
      cloudName: row.cloudName,
      apiKeyMasked: maskKey(row.apiKey),
      priority: row.priority,
      verified: true,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return toView(row)
}

export async function updateCloudinaryConfig(
  id: string,
  input: CloudinaryUpdateRequest,
  actor: Actor,
  meta: RequestMeta,
): Promise<CloudinaryConfigView> {
  const before = await prisma.cloudinaryConfig.findUnique({
    where: { id },
    select: { id: true, label: true, isActive: true, priority: true },
  })

  if (before === null) abort('NOT_FOUND', 'No such Cloudinary account.')

  const row = await prisma.cloudinaryConfig.update({
    where: { id },
    data: {
      ...(input.label === undefined ? {} : { label: input.label }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.priority === undefined ? {} : { priority: input.priority }),
      ...(input.storageLimitBytes === undefined
        ? {}
        : {
            storageLimitBytes:
              input.storageLimitBytes === null ? null : BigInt(input.storageLimitBytes),
          }),
      // Clearing the error is what un-benches an account: `resolveAccounts` skips a
      // row whose `lastErrorAt` is within the backoff window, so a fixed account is
      // otherwise ignored for ten minutes after the admin fixes it.
      ...(input.clearError === true ? { lastErrorAt: null, lastError: null } : {}),
    },
    select: VIEW_SELECT,
  })

  // Activation and deactivation get their own audit actions. "Which account were we
  // uploading to at 11:40?" is a question with a real answer only if the transitions
  // are individually findable.
  const action =
    input.isActive === true && !before.isActive
      ? AUDIT_ACTIONS.CLOUDINARY_CONFIG_ACTIVATED
      : input.isActive === false && before.isActive
        ? AUDIT_ACTIONS.CLOUDINARY_CONFIG_DISABLED
        : AUDIT_ACTIONS.CONFIG_UPDATED

  await writeAudit({
    action,
    entityType: 'CloudinaryConfig',
    entityId: row.id,
    actor,
    before: { label: before.label, isActive: before.isActive, priority: before.priority },
    after: {
      label: row.label,
      isActive: row.isActive,
      priority: row.priority,
      errorCleared: input.clearError === true,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return toView(row)
}

/**
 * Refresh one account's usage from Cloudinary, ignoring the cache.
 *
 * Its own operation rather than a side effect of the list, because it costs a
 * rate-limited API call and the admin should be the one deciding to spend it.
 */
export async function refreshCloudinaryUsage(id: string): Promise<CloudinaryConfigView> {
  const row = await prisma.cloudinaryConfig.findUnique({
    where: { id },
    select: { id: true, label: true, cloudName: true, apiKey: true, apiSecretCipher: true },
  })

  if (row === null) abort('NOT_FOUND', 'No such Cloudinary account.')

  let apiSecret: string
  try {
    apiSecret = decryptSecret(row.apiSecretCipher, parseSecretsKey(env.SECRETS_KEY))
  } catch {
    // `SECRETS_KEY` has been rotated since this row was written. Said plainly,
    // because the remedy is specific: re-add the account.
    abort(
      'CONFLICT',
      `The stored secret for "${row.label}" cannot be decrypted with the current SECRETS_KEY. Re-add the account.`,
    )
  }

  const usage = await fetchUsage({ cloudName: row.cloudName, apiKey: row.apiKey, apiSecret })
  if (usage === null) {
    abort('SERVICE_UNAVAILABLE', 'Cloudinary did not answer. Try again in a moment.')
  }

  const updated = await prisma.cloudinaryConfig.update({
    where: { id },
    data: {
      storageUsedBytes: BigInt(usage.usedBytes),
      ...(usage.limitBytes === null ? {} : { storageLimitBytes: BigInt(usage.limitBytes) }),
      usageCheckedAt: new Date(),
    },
    select: VIEW_SELECT,
  })

  return toView(updated)
}
