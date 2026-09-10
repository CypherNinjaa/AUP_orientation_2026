/**
 * The environment, validated once at import time.
 *
 * Every other server module reads `env` from here rather than `process.env`, for
 * two reasons. The first is types: `process.env.DATABASE_URL` is
 * `string | undefined` forever, so every use site either asserts or guards, and
 * one missed guard is a runtime `undefined` in a connection string. The second is
 * failure timing. A missing `PASS_PRIVATE_KEY` should stop the process at boot
 * with the variable's name in the message, not surface as an unsigned pass three
 * hours into the event.
 *
 * ## What is required and what is not
 *
 * Required means "the app cannot serve a request without it". Optional means "one
 * feature degrades and says so". `CLERK_WEBHOOK_SECRET` is the interesting case:
 * without it the app runs fine and students can register, but the Clerk webhook
 * route returns 503 rather than accepting unverified payloads. That is a
 * deliberate choice — a webhook endpoint that skips signature verification when
 * its secret is absent is an unauthenticated write endpoint.
 *
 * ## This file is server-only
 *
 * It reads secrets. `import 'server-only'` makes an accidental import from a
 * client component a build error rather than a leaked API secret in a JS bundle.
 * The one public value the browser needs (`NEXT_PUBLIC_SITE_URL`) is inlined by
 * Next at build time from `process.env` directly, so nothing here has to be
 * reachable from the client to make that work.
 */
import 'server-only'

import { z } from 'zod'

/**
 * A base64-encoded PEM, as `scripts/generate-keys.ts` prints it.
 *
 * PEM is multi-line and every deployment UI mangles newlines differently — some
 * strip them, some escape them as literal `\n`, Railway's does neither
 * consistently. Base64 of the whole PEM is one line with no quoting problem.
 */
const base64Pem = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => {
      const decoded = Buffer.from(value, 'base64').toString('utf8')
      return decoded.includes('-----BEGIN') && decoded.includes('-----END')
    },
    { error: 'Expected base64 of a PEM block. Run `npm run keys:generate`.' },
  )

/** 32 bytes as base64 or hex — the same shapes `parseSecretsKey` accepts. */
const secretsKey = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => {
      if (/^[0-9a-fA-F]{64}$/.test(value)) return true
      return Buffer.from(value, 'base64').length === 32
    },
    { error: 'SECRETS_KEY must decode to 32 bytes. Run `npm run keys:generate`.' },
  )

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().trim().startsWith('postgres', {
    error: 'DATABASE_URL must be a postgres:// or postgresql:// URL.',
  }),
  REDIS_URL: z.string().trim().startsWith('redis', {
    error: 'REDIS_URL must be a redis:// or rediss:// URL.',
  }),

  PASS_PRIVATE_KEY: base64Pem,
  PASS_PUBLIC_KEY: base64Pem,
  SECRETS_KEY: secretsKey,

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().trim().min(1),
  CLERK_SECRET_KEY: z.string().trim().min(1),
  /**
   * Absent in local development until the operator creates the endpoint in the
   * Clerk dashboard. Empty string is normalised to undefined so a blank line in
   * `.env` behaves the same as no line at all — otherwise `svix` would be handed
   * `''` and report a confusing signature failure instead of "not configured".
   */
  CLERK_WEBHOOK_SECRET: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === '' ? undefined : value)),

  CLOUDINARY_CLOUD_NAME: z.string().trim().min(1),
  CLOUDINARY_API_KEY: z.string().trim().min(1),
  CLOUDINARY_API_SECRET: z.string().trim().min(1),

  /**
   * The canonical origin, used for absolute links in PDFs and QR payloads.
   *
   * No trailing slash: it is concatenated with paths that start with one, and
   * `https://x//pass` is a 404 on some hosts and a redirect on others.
   */
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .trim()
    .url({ error: 'NEXT_PUBLIC_SITE_URL must be an absolute URL.' })
    .transform((value) => value.replace(/\/+$/, '')),

  /**
   * Optional operator bootstrap. Set it, sign in, and hit
   * `POST /api/admin/bootstrap` with it once to grant yourself ADMIN — then
   * remove it. Without it there is a chicken-and-egg problem: the admin console
   * is the only way to grant roles and it requires a role to open.
   */
  ADMIN_BOOTSTRAP_KEY: z
    .string()
    .trim()
    .min(24, { error: 'ADMIN_BOOTSTRAP_KEY should be long enough not to be guessed.' })
    .optional()
    .transform((value) => (value === '' ? undefined : value)),

  /**
   * Comma-separated list of trusted administrator email addresses.
   * Anyone signing in with these emails is guaranteed ADMIN access.
   */
  ADMIN_EMAILS: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === '' ? undefined : value)),

  /**
   * Bearer token for the scheduled jobs at `/api/cron/*` — currently the DPDP
   * selfie retention sweep and WhatsApp summary bulletin.
   *
   * Optional so a local checkout runs without it, but the route refuses every
   * unauthenticated call when it is unset rather than falling open: an unprotected
   * endpoint that deletes student selfies is worse than a retention sweep that has
   * to be triggered from the admin console by hand.
   */
  CRON_SECRET: z
    .string()
    .trim()
    .min(24, { error: 'CRON_SECRET should be long enough not to be guessed.' })
    .optional()
    .transform((value) => (value === '' ? undefined : value)),

  /**
   * Base URL of the self-hosted OpenWA API gateway (e.g. http://openwa.railway.internal:2785
   * or http://localhost:2785).
   */
  OPENWA_BASE_URL: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === '' ? undefined : value?.replace(/\/+$/, ''))),

  /**
   * OpenWA Admin or Operator API Key (passed via `X-API-Key`).
   */
  OPENWA_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === '' ? undefined : value)),

  /**
   * Active OpenWA session identifier (UUID) linked to the WhatsApp Business account.
   */
  OPENWA_SESSION_ID: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === '' ? undefined : value)),

  /**
   * HMAC secret for verifying incoming OpenWA webhooks (min 16 chars).
   */
  OPENWA_WEBHOOK_SECRET: z
    .string()
    .trim()
    .min(16, { error: 'OPENWA_WEBHOOK_SECRET must be at least 16 characters.' })
    .optional()
    .transform((value) => (value === '' ? undefined : value)),

  /**
   * Comma-separated list of authorized administrator WhatsApp numbers in international format
   * (e.g. '919876543210,919123456789').
   */
  WHATSAPP_ADMIN_NUMBERS: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
})

export type Env = z.infer<typeof schema>

function load(): Env {
  const parsed = schema.safeParse(process.env)
  if (parsed.success) return parsed.data

  // Printed as a list of variable names, never values. A crash log is somewhere
  // an operator pastes into a chat window, so a "wrong value" message that echoes
  // the wrong value has just published a credential.
  const lines = parsed.error.issues.map((issue) => {
    const name = issue.path.join('.') || '(root)'
    return `  ${name}: ${issue.message}`
  })

  throw new Error(
    [
      `Environment is not usable. ${String(lines.length)} problem(s):`,
      ...lines,
      '',
      'Copy .env.example to .env and fill it in. `npm run keys:generate` prints the',
      'three values that cannot be typed by hand.',
    ].join('\n'),
  )
}

export const env: Env = load()

export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'

/**
 * Whether the Clerk webhook route can verify a signature.
 *
 * A named helper rather than an inline truthiness check, so the route reads as
 * "if not configured, 503" instead of leaving a reader to work out what a missing
 * secret is supposed to mean.
 */
export const isClerkWebhookConfigured = env.CLERK_WEBHOOK_SECRET !== undefined

/**
 * Whether OpenWA WhatsApp gateway messaging is fully configured.
 */
export const isOpenWAConfigured =
  env.OPENWA_BASE_URL !== undefined &&
  env.OPENWA_API_KEY !== undefined &&
  env.OPENWA_SESSION_ID !== undefined
