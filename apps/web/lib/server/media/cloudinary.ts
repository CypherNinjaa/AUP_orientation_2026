/**
 * Cloudinary: selfie upload, time-bounded delivery, deletion.
 *
 * ## Why there is a credential *chain* and not a credential
 *
 * The primary account's credentials come from the environment. When its free tier
 * fills up mid-event — which is the scenario the admin panel exists for — an admin
 * adds a second account's keys from the settings screen and uploads continue
 * without a redeploy. So every operation resolves an ordered list of accounts and
 * walks it: env first, then active `CloudinaryConfig` rows by ascending priority.
 *
 * The API secret of a database-held account is stored encrypted (AES-256-GCM under
 * `SECRETS_KEY`) and decrypted here, in memory, for the duration of one call.
 *
 * ## Credentials are passed per call, never assigned to the global config
 *
 * `cloudinary.config({...})` mutates a module-level singleton. With two accounts
 * and concurrent requests that is a race that signs a request to account A with
 * account B's secret — an authentication failure that appears at random under load
 * and never in testing. Every call here passes `cloud_name`/`api_key`/`api_secret`
 * in its own options object instead.
 *
 * ## Delivery is `type: 'authenticated'`
 *
 * There is no public URL for a selfie, by design (D14). Reads go through
 * `downloadUrl()`, which mints a URL carrying an `expires_at` that Cloudinary
 * itself enforces. That is why `Registration` stores a public id and a version
 * rather than a URL: a URL would be a durable, unguessable-but-permanent handle to
 * a student's face, and there would be no way to withdraw it.
 *
 * ## EXIF
 *
 * The upload carries an *incoming* transformation, so what Cloudinary stores as the
 * original is already a re-encode at a bounded size. A re-encode does not carry the
 * source file's EXIF block forward, which is what removes the GPS coordinates a
 * phone camera writes into a selfie. `image_metadata` is left at its default of
 * false and `keep_iptc` is never set.
 */
import 'server-only'

import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary'

import { prisma } from '@orientation/db'
import { decryptSecret, parseSecretsKey } from '@orientation/core/crypto/secrets'

import { env } from '../env'
import { cacheGet, cacheSet } from '../redis'

/** One usable set of credentials. */
export interface CloudinaryAccount {
  /** The `CloudinaryConfig.id`, or null for the environment credentials. */
  id: string | null
  label: string
  cloudName: string
  apiKey: string
  apiSecret: string
  priority: number
}

export interface UploadedSelfie {
  publicId: string
  version: string
  bytes: number
  width: number
  height: number
  format: string
  /** Which account it landed in — needed to sign a read for it later. */
  cloudName: string
  accountId: string | null
  accountLabel: string
}

export class CloudinaryUnavailableError extends Error {
  /** Every account that was tried, and why each one failed. For the log only. */
  readonly attempts: { label: string; reason: string }[]

  constructor(attempts: { label: string; reason: string }[]) {
    super('No Cloudinary account could accept the upload.')
    this.name = 'CloudinaryUnavailableError'
    this.attempts = attempts
  }
}

/** Where selfies live. One folder, so a retention sweep has one place to look. */
const SELFIE_FOLDER = 'orientation2026/selfies'

/**
 * The transformation applied on the way in.
 *
 * `crop: 'limit'` never upscales, so a low-resolution phone selfie is stored as it
 * came rather than being interpolated into something that looks sharper than it is.
 * 1000px on the long edge is comfortably more than a volunteer needs to match a
 * face on a phone screen and roughly a fifth of the bytes of a modern camera's
 * output.
 *
 * `effect: 'improve:30'` is a mild auto-levels pass — registration selfies are
 * taken indoors, often backlit, and a face in shadow is the actual failure mode at
 * the gate. The strength is capped at 30 deliberately: the image's job is
 * identification, and a stronger correction starts shifting skin tone and
 * contrast in ways that make a human comparison harder, not easier.
 */
const INCOMING_TRANSFORMATION = [
  { width: 1000, height: 1000, crop: 'limit' },
  { effect: 'improve:30' },
  { quality: 'auto:good' },
  { fetch_format: 'jpg' },
]

/** The same, minus the enhancement. See the retry in `uploadSelfie`. */
const INCOMING_TRANSFORMATION_PLAIN = [
  { width: 1000, height: 1000, crop: 'limit' },
  { quality: 'auto:good' },
  { fetch_format: 'jpg' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Resolving credentials
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How long a database account stays benched after a failure.
 *
 * A wrong API key fails on every single registration otherwise, adding a network
 * round trip and a Cloudinary error to each one. Ten minutes is long enough that a
 * broken account stops costing anything and short enough that a transient outage
 * heals without an admin touching the settings screen.
 */
const ERROR_BACKOFF_MS = 10 * 60 * 1_000

/** Redis key marking the env account as quota-exhausted. It has no row to flag. */
const ENV_EXHAUSTED_KEY = 'cloudinary:env-exhausted'
const ENV_EXHAUSTED_TTL_SECONDS = 15 * 60

function envAccount(): CloudinaryAccount {
  return {
    id: null,
    label: 'primary (env)',
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
    priority: 0,
  }
}

/**
 * The ordered list of accounts to try.
 *
 * A row whose stored secret will not decrypt is skipped rather than thrown on: it
 * means `SECRETS_KEY` was rotated after the row was written, and the correct
 * behaviour is to fall through to an account that does work rather than to fail
 * every registration until an admin notices.
 */
async function resolveAccounts(): Promise<CloudinaryAccount[]> {
  const accounts: CloudinaryAccount[] = []

  const envExhausted = await cacheGet<boolean>(ENV_EXHAUSTED_KEY)
  if (!envExhausted) accounts.push(envAccount())

  const rows = await prisma.cloudinaryConfig.findMany({
    where: { isActive: true },
    orderBy: { priority: 'asc' },
  })

  const cutoff = new Date(Date.now() - ERROR_BACKOFF_MS)
  const key = parseSecretsKey(env.SECRETS_KEY)

  for (const row of rows) {
    if (row.lastErrorAt && row.lastErrorAt > cutoff) continue

    let apiSecret: string
    try {
      apiSecret = decryptSecret(row.apiSecretCipher, key)
    } catch (error) {
      console.error(`[cloudinary] cannot decrypt secret for "${row.label}"`, error)
      continue
    }

    accounts.push({
      id: row.id,
      label: row.label,
      cloudName: row.cloudName,
      apiKey: row.apiKey,
      apiSecret,
      priority: row.priority,
    })
  }

  // If the env account was benched but nothing else is usable, try it anyway. A
  // quota guess that turns out to be wrong must not be the reason a student cannot
  // register.
  if (accounts.length === 0) accounts.push(envAccount())

  return accounts
}

/**
 * Look up the credentials for an account by cloud name.
 *
 * Reads use this rather than the chain: a selfie lives in exactly one account, and
 * signing a read with a different account's secret produces a 401 from Cloudinary,
 * not a fallback.
 */
async function accountFor(cloudName: string): Promise<CloudinaryAccount | undefined> {
  if (cloudName === env.CLOUDINARY_CLOUD_NAME) return envAccount()

  const row = await prisma.cloudinaryConfig.findFirst({ where: { cloudName } })
  if (!row) return undefined

  try {
    return {
      id: row.id,
      label: row.label,
      cloudName: row.cloudName,
      apiKey: row.apiKey,
      apiSecret: decryptSecret(row.apiSecretCipher, parseSecretsKey(env.SECRETS_KEY)),
      priority: row.priority,
    }
  } catch (error) {
    console.error(`[cloudinary] cannot decrypt secret for "${row.label}"`, error)
    return undefined
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Signals that an account is out of room rather than misconfigured.
 *
 * Cloudinary answers a quota breach with HTTP 420 on the free tier and with a 400
 * carrying one of these phrases on others. Distinguishing the two matters: a full
 * account should fall through to the next one and be reported to the admin as
 * "add capacity", while a bad key should be reported as "fix this key".
 */
function isQuotaError(error: unknown): boolean {
  const candidate = error as { http_code?: number; message?: string } | undefined
  if (candidate?.http_code === 420) return true

  const message = (candidate?.message ?? '').toLowerCase()
  return (
    message.includes('quota') ||
    message.includes('storage limit') ||
    message.includes('plan limit') ||
    message.includes('usage limit') ||
    message.includes('credits exceeded')
  )
}

/** A transformation the plan will not run. Retried once without the enhancement. */
function isTransformationError(error: unknown): boolean {
  const message = ((error as { message?: string } | undefined)?.message ?? '').toLowerCase()
  return message.includes('transformation') || message.includes('effect')
}

function uploadOptions(
  account: CloudinaryAccount,
  registrationRef: string,
  transformation: unknown[],
): UploadApiOptions {
  return {
    cloud_name: account.cloudName,
    api_key: account.apiKey,
    api_secret: account.apiSecret,

    folder: SELFIE_FOLDER,
    // Derived from the reference rather than random, so the same student retaking a
    // selfie overwrites their own image instead of accumulating one per attempt.
    public_id: `selfie-${registrationRef.toLowerCase()}`,
    overwrite: true,
    invalidate: true,

    resource_type: 'image',
    /**
     * No public URL exists for this asset. Together with `access_mode: 'authenticated'`
     * this is what makes a leaked public id worthless on its own.
     */
    type: 'authenticated',
    access_mode: 'authenticated',

    // An *incoming* transformation: what is stored is the result, not the upload.
    transformation,
    format: 'jpg',

    // Do not ask Cloudinary to hand back EXIF. Nothing here wants it, and a
    // response containing GPS coordinates is a response that can end up in a log.
    exif: false,
    image_metadata: false,

    // A tag makes the retention sweep and a manual audit in the Cloudinary console
    // possible without a database.
    tags: ['orientation2026', 'selfie'],
    context: { app: 'orientation2026' },
  }
}

/**
 * Upload one selfie, trying each account in turn.
 *
 * Throws `CloudinaryUnavailableError` only when *every* account failed. The caller
 * turns that into a 503 telling the student to try again, because it genuinely is
 * temporary from their side.
 */
export async function uploadSelfie(
  dataUrl: string,
  registrationRef: string,
): Promise<UploadedSelfie> {
  const accounts = await resolveAccounts()
  const attempts: { label: string; reason: string }[] = []

  for (const account of accounts) {
    for (const transformation of [INCOMING_TRANSFORMATION, INCOMING_TRANSFORMATION_PLAIN]) {
      try {
        const result: UploadApiResponse = await cloudinary.uploader.upload(
          dataUrl,
          uploadOptions(account, registrationRef, transformation),
        )

        await recordUpload(account, result.bytes)

        return {
          publicId: result.public_id,
          version: String(result.version),
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          format: result.format,
          cloudName: account.cloudName,
          accountId: account.id,
          accountLabel: account.label,
        }
      } catch (error) {
        const reason = (error as { message?: string } | undefined)?.message ?? 'unknown error'

        // Only the enhancement is worth a second attempt. Anything else would just
        // be the same failure twice.
        if (transformation === INCOMING_TRANSFORMATION && isTransformationError(error)) {
          console.warn(`[cloudinary] "${account.label}" rejected the enhancement, retrying plain`)
          continue
        }

        attempts.push({ label: account.label, reason })
        await recordFailure(account, reason, isQuotaError(error))
        break
      }
    }
  }

  // Logged here rather than left to the caller: the reasons name accounts and are
  // operational detail, and none of it belongs in a response body.
  console.error('[cloudinary] every account failed', attempts)
  throw new CloudinaryUnavailableError(attempts)
}

/** Usage counters, best effort. A failed counter update must not fail an upload. */
async function recordUpload(account: CloudinaryAccount, bytes: number): Promise<void> {
  if (account.id === null) return

  try {
    await prisma.cloudinaryConfig.update({
      where: { id: account.id },
      data: {
        storageUsedBytes: { increment: BigInt(bytes) },
        uploadCount: { increment: 1 },
        lastErrorAt: null,
        lastError: null,
      },
    })
  } catch (error) {
    console.error('[cloudinary] could not record usage', error)
  }
}

/**
 * Bench a failing account.
 *
 * A quota failure also flips `isActive` off, because it will not resolve on its own
 * and leaving it on means the admin sees a working account that quietly never gets
 * used. A bad key stays active with a timestamp, so it recovers by itself if the
 * cause was transient.
 */
async function recordFailure(
  account: CloudinaryAccount,
  reason: string,
  quota: boolean,
): Promise<void> {
  if (account.id === null) {
    if (quota) await cacheSet(ENV_EXHAUSTED_KEY, true, ENV_EXHAUSTED_TTL_SECONDS)
    return
  }

  try {
    await prisma.cloudinaryConfig.update({
      where: { id: account.id },
      data: {
        lastErrorAt: new Date(),
        lastError: reason.slice(0, 500),
        ...(quota ? { isActive: false } : {}),
      },
    })
  } catch (error) {
    console.error('[cloudinary] could not record failure', error)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Delivery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A URL for one selfie that Cloudinary itself refuses to serve after `ttlSeconds`.
 *
 * Built by hand rather than through `cloudinary.utils.private_download_url` because
 * that helper reads the *global* config for the cloud name, and this app has more
 * than one account. `api_sign_request` takes the secret as an argument, so the
 * signature can be computed for a specific account without touching global state.
 *
 * The `/download` endpoint answers with `Content-Disposition: attachment`. That
 * only affects a top-level navigation — an `<img src>` renders it — so the same URL
 * works for the moderation grid and for a volunteer tapping "show face".
 *
 * Two minutes rather than sixty seconds: the value the client is handed is our own
 * signed path (see `selfie-url.ts`), which expires in sixty; this is the redirect
 * target, and it needs to outlive the redirect plus a slow 3G image fetch at a gate.
 */
export async function downloadUrl(
  publicId: string,
  cloudName: string,
  ttlSeconds = 120,
): Promise<string | null> {
  const account = await accountFor(cloudName)
  if (!account) {
    console.error(`[cloudinary] no credentials for cloud "${cloudName}"`)
    return null
  }

  const params: Record<string, string | number> = {
    public_id: publicId,
    format: 'jpg',
    type: 'authenticated',
    resource_type: 'image',
    timestamp: Math.floor(Date.now() / 1_000),
    expires_at: Math.floor(Date.now() / 1_000) + ttlSeconds,
  }

  const signature = cloudinary.utils.api_sign_request(params, account.apiSecret)

  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    api_key: account.apiKey,
    signature,
  })

  return `https://api.cloudinary.com/v1_1/${account.cloudName}/image/download?${query.toString()}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Deletion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-call credentials, in the SDK's snake_case.
 *
 * The SDK prefers these over the global config on every call. The admin API's
 * option type has an index signature so they pass through cleanly; `destroy`'s does
 * not, which is why that one call site narrows the object afterwards.
 */
interface AccountCredentials {
  cloud_name: string
  api_key: string
  api_secret: string
}

function credentials(account: {
  cloudName: string
  apiKey: string
  apiSecret: string
}): AccountCredentials {
  return {
    cloud_name: account.cloudName,
    api_key: account.apiKey,
    api_secret: account.apiSecret,
  }
}

/**
 * Outcome of a deletion attempt.
 *
 * Three values rather than a boolean, because the caller does something different
 * with each. `deleted` and `absent` both mean "the image is not stored any more",
 * which is the state retention cares about, so both let the sweep clear the row's
 * pointer. `failed` means we do not know, and a sweep that cleared the pointer on
 * a `failed` would orphan the asset: still in Cloudinary, no longer referenced by
 * anything, and therefore undeletable. That is the one outcome DPDP cannot
 * tolerate, so it is worth a distinct value rather than a comment.
 */
export type DestroyOutcome = 'deleted' | 'absent' | 'failed'

/**
 * Delete one selfie. Used by the retention sweep and by an admin purging a record.
 */
export async function destroySelfie(
  publicId: string,
  cloudName: string,
): Promise<DestroyOutcome> {
  const account = await accountFor(cloudName)
  if (!account) {
    // No credentials for that cloud — most likely a secondary account whose row was
    // deleted, or a `SECRETS_KEY` rotation. Not `absent`: the asset is probably
    // still there and we have simply lost the ability to reach it, which somebody
    // has to fix by hand.
    console.error(`[cloudinary] no credentials for cloud "${cloudName}", cannot destroy ${publicId}`)
    return 'failed'
  }

  try {
    const result = (await cloudinary.uploader.destroy(publicId, {
      ...credentials(account),
      type: 'authenticated',
      resource_type: 'image',
      invalidate: true,
    } as { type: 'authenticated'; resource_type: 'image'; invalidate: boolean })) as {
      result?: string
    }

    if (result.result === 'ok') return 'deleted'
    // Cloudinary's own wording for an asset that is not there. Anything else is a
    // response we do not recognise, and an unrecognised answer is not a deletion.
    if (result.result === 'not found') return 'absent'

    console.error(`[cloudinary] destroy returned "${String(result.result)}" for ${publicId}`)
    return 'failed'
  } catch (error) {
    console.error(`[cloudinary] destroy failed for ${publicId}`, error)
    return 'failed'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin support
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check a set of credentials before they are saved.
 *
 * `api.ping` is the cheapest authenticated call Cloudinary has. Saving an unverified
 * key means discovering it is wrong at the moment the primary account fills up,
 * which is the worst possible moment.
 */
export async function testCredentials(account: {
  cloudName: string
  apiKey: string
  apiSecret: string
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await cloudinary.api.ping(credentials(account))
    return { ok: true }
  } catch (error) {
    const message = (error as { message?: string } | undefined)?.message ?? 'Could not reach Cloudinary.'
    // The message comes from Cloudinary and describes the key the admin just typed,
    // so it is safe to show them — but it is truncated, because an error body can
    // be long and this lands in a form field.
    return { ok: false, reason: message.slice(0, 200) }
  }
}

/**
 * Live usage for one account, for the settings screen.
 *
 * Cloudinary's own numbers rather than the counter this app keeps: the counter only
 * knows about uploads this app made, and the plan limit is what actually matters
 * when deciding whether to add capacity.
 */
export async function fetchUsage(account: {
  cloudName: string
  apiKey: string
  apiSecret: string
}): Promise<{ usedBytes: number; limitBytes: number | null } | null> {
  try {
    const usage = (await cloudinary.api.usage(credentials(account))) as {
      storage?: { usage?: number; limit?: number }
    }

    return {
      usedBytes: usage.storage?.usage ?? 0,
      limitBytes: usage.storage?.limit ?? null,
    }
  } catch (error) {
    console.error('[cloudinary] usage lookup failed', error)
    return null
  }
}

/** The primary account's cloud name, for storing alongside a new upload. */
export function primaryCloudName(): string {
  return env.CLOUDINARY_CLOUD_NAME
}
