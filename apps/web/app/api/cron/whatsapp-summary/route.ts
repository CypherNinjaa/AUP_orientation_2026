/**
 * POST /api/cron/whatsapp-summary — Scheduled Orientation Executive Summary Broadcast.
 *
 * Can be triggered on a schedule (Railway Cron, GitHub Actions, or external pinger)
 * using `Authorization: Bearer $CRON_SECRET`, or manually by an authenticated ADMIN.
 * Broadcasts the live executive briefing to all numbers in `WHATSAPP_ADMIN_NUMBERS`.
 */
import { secretEquals } from '@orientation/core/crypto/secrets'

import { getActor } from '@/lib/server/auth'
import { env, isOpenWAConfigured } from '@/lib/server/env'
import { abort, handle, ok } from '@/lib/server/http'
import { getAuthorizedAdminNumbers } from '@/lib/server/whatsapp/auth'
import { whatsappClient } from '@/lib/server/whatsapp/client'
import { handleReportCommand } from '@/lib/server/whatsapp/commands'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1] ?? null
}

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const token = bearer(request)
    const scheduled =
      token !== null && env.CRON_SECRET !== undefined && secretEquals(token, env.CRON_SECRET)

    const actor = scheduled ? null : await getActor()

    if (!scheduled && actor?.role !== 'ADMIN') {
      abort('FORBIDDEN', 'Not available.')
    }

    if (!isOpenWAConfigured) {
      return ok({
        ran: false as const,
        reason: 'OpenWA is not fully configured (missing OPENWA_BASE_URL, API_KEY, or SESSION_ID).',
      })
    }

    const recipients = getAuthorizedAdminNumbers()
    if (recipients.length === 0) {
      return ok({
        ran: false as const,
        reason: 'No admin phone numbers configured in WHATSAPP_ADMIN_NUMBERS.',
      })
    }

    // Generate executive briefing bulletin
    const reportText = await handleReportCommand()

    // Broadcast to all configured admin recipients
    const result = await whatsappClient.broadcastTextMessage(recipients, reportText)

    return ok({
      ran: true as const,
      recipientsCount: recipients.length,
      sentCount: result.sent,
      failedCount: result.failed,
      timestamp: new Date().toISOString(),
    })
  })
}

// Allow GET for simple web cron triggers if bearer token is provided
export async function GET(request: Request): Promise<Response> {
  return POST(request)
}
