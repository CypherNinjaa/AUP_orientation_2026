import 'server-only'

import crypto from 'node:crypto'

import { env } from '../env'
import { redis } from '../redis'

/**
 * Verifies the HMAC-SHA256 signature sent by OpenWA in the `X-OpenWA-Signature` header.
 * OpenWA format: "sha256=<hex_digest>"
 */
export function verifyOpenWASignature(
  rawBody: string | Buffer,
  signatureHeader: string | null,
): boolean {
  const secret = env.OPENWA_WEBHOOK_SECRET
  if (!secret) {
    // If webhook secret is not set, reject in production for security
    return false
  }

  if (!signatureHeader) {
    return false
  }

  // OpenWA sends sha256=<hex>
  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  const expectedSignature = `sha256=${expectedHash}`

  const sigBuffer = Buffer.from(signatureHeader)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (sigBuffer.length !== expectedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer)
}

/**
 * Checks and marks an idempotency key to prevent double execution of retried webhook deliveries.
 * Returns true if the key was fresh (and is now marked), false if it was already processed.
 */
export async function claimEventIdempotency(
  idempotencyKey?: string,
  ttlSeconds = 3600,
): Promise<boolean> {
  if (!idempotencyKey) {
    // No idempotency key provided, proceed normally
    return true
  }

  const key = `wa:idempotency:${idempotencyKey}`
  try {
    const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX')
    return result === 'OK'
  } catch (error) {
    console.error('[whatsapp:verifier] Redis idempotency check failed, allowing execution:', error)
    return true
  }
}
