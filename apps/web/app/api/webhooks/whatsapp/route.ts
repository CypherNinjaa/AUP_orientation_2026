/**
 * POST /api/webhooks/whatsapp — OpenWA Inbound WhatsApp Webhook Receiver.
 *
 * Excluded from Clerk middleware via the existing `/api/((?!webhooks).*)` pattern.
 * Verifies authenticity via HMAC-SHA256 signature in `X-OpenWA-Signature`.
 * Deduplicates events via `X-OpenWA-Idempotency-Key`.
 * Authorizes senders against `WHATSAPP_ADMIN_NUMBERS`.
 */
import { env } from '@/lib/server/env'
import { ok } from '@/lib/server/http'
import { isAuthorizedAdmin, normalizePhoneNumber } from '@/lib/server/whatsapp/auth'
import { whatsappClient } from '@/lib/server/whatsapp/client'
import { handleWhatsAppCommand } from '@/lib/server/whatsapp/commands'
import type { OpenWAWebhookPayload } from '@/lib/server/whatsapp/types'
import { claimEventIdempotency, verifyOpenWASignature } from '@/lib/server/whatsapp/verifier'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()
  const signature = request.headers.get('x-openwa-signature')

  // 1. Authenticate via HMAC-SHA256 signature if secret is configured
  if (env.OPENWA_WEBHOOK_SECRET) {
    const isValid = verifyOpenWASignature(rawBody, signature)
    if (!isValid) {
      console.warn('[webhook:whatsapp] Rejected request with invalid HMAC signature')
      return new Response('Invalid signature', { status: 401 })
    }
  }

  // 2. Parse payload
  let payload: OpenWAWebhookPayload
  try {
    payload = JSON.parse(rawBody) as OpenWAWebhookPayload
  } catch (err) {
    console.error('[webhook:whatsapp] Failed to parse JSON body:', err)
    return new Response('Invalid JSON', { status: 400 })
  }

  // 3. Deduplicate events using OpenWA idempotency key
  const idempotencyKey =
    request.headers.get('x-openwa-idempotency-key') ??
    payload.idempotencyKey ??
    payload.data?.id

  if (idempotencyKey) {
    const isFresh = await claimEventIdempotency(idempotencyKey)
    if (!isFresh) {
      return ok({ received: true, duplicate: true })
    }
  }

  // 4. Handle only inbound messages
  if (payload.event !== 'message.received') {
    return ok({ received: true, event: payload.event })
  }

  const message = payload.data
  if (!message || message.fromMe) {
    // Ignore messages sent by the bot itself
    return ok({ received: true, ignored: 'fromMe' })
  }

  const rawSender = message.from ?? message.chatId
  const normalizedSender = normalizePhoneNumber(rawSender)

  // 5. Authorize sender — only registered admins are answered
  if (!isAuthorizedAdmin(normalizedSender)) {
    // Silently ignore messages from non-admin contacts so normal WhatsApp Business chats are never disturbed
    return ok({ received: true, ignored: 'unauthorized_sender' })
  }

  const text = message.body?.trim()
  if (!text) {
    return ok({ received: true, ignored: 'empty_body' })
  }

  // 6. Execute command and generate reply
  try {
    const replyText = await handleWhatsAppCommand(text)
    if (replyText) {
      await whatsappClient.sendTextMessage(normalizedSender, replyText)
    }
    return ok({ received: true, handled: true })
  } catch (error) {
    console.error(`[webhook:whatsapp] Error processing command "${text}":`, error)
    await whatsappClient.sendTextMessage(
      normalizedSender,
      '⚠️ *An error occurred while processing your request.* Please try again in a few moments.',
    )
    return ok({ received: true, error: 'command_failed' })
  }
}
