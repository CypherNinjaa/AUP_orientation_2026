/**
 * POST /api/webhooks/clerk — keep the local `User` table in step with Clerk.
 *
 * ## Why this exists when `syncUser` already creates rows
 *
 * `syncUser` runs on a request *from* the user, so it covers everything that
 * happens while they are using the site. It cannot cover what happens when they are
 * not: an admin deleting an account in the Clerk dashboard, a student changing their
 * email address in a different tab, an account being banned. Without this webhook
 * those changes land in the local table on the user's *next* visit, which for a
 * deleted account is never.
 *
 * ## The signature check is the authentication
 *
 * This is the one route the middleware deliberately excludes, because Clerk posts
 * here with no session. `svix` verifies an HMAC over the raw body against
 * `CLERK_WEBHOOK_SECRET`, so the body must be read as text and **not** parsed first
 * — `JSON.parse` followed by `JSON.stringify` produces different bytes and the
 * signature fails for no visible reason.
 *
 * ## Deletion is a deactivation
 *
 * `user.deleted` sets `isActive = false` rather than deleting the row.
 * `CheckIn.scannedById` and `Registration.reviewedById` are `onDelete: Restrict`,
 * so a hard delete of a volunteer who scanned anybody would fail — and *should*
 * fail: the gate's history has to keep pointing at something. `syncUser` refuses to
 * return an inactive row, so the account cannot be used, which is what deletion
 * means operationally.
 */
import { Webhook } from 'svix'

import { prisma } from '@orientation/db'

import { env, isClerkWebhookConfigured } from '@/lib/server/env'
import { fail, handle, noContent } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

/** The subset of Clerk's payload this app reads. */
interface ClerkUserData {
  id?: string
  email_addresses?: { id: string; email_address: string }[]
  primary_email_address_id?: string | null
  first_name?: string | null
  last_name?: string | null
  banned?: boolean
  locked?: boolean
}

interface ClerkEvent {
  type: string
  data: ClerkUserData
}

function primaryEmail(data: ClerkUserData): string | null {
  const addresses = data.email_addresses ?? []
  const primary = addresses.find((entry) => entry.id === data.primary_email_address_id)
  return (primary ?? addresses[0])?.email_address ?? null
}

function displayName(data: ClerkUserData): string | null {
  return [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || null
}

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    if (!isClerkWebhookConfigured) {
      // A 503 rather than a 500: Clerk retries a 5xx with backoff, so once the
      // secret is configured the events that arrived meanwhile are redelivered.
      console.error('[clerk-webhook] CLERK_WEBHOOK_SECRET is not set; event dropped')
      return fail('SERVICE_UNAVAILABLE', 'Webhooks are not configured.')
    }

    const raw = await request.text()

    let event: ClerkEvent
    try {
      const wh = new Webhook(env.CLERK_WEBHOOK_SECRET as string)
      event = wh.verify(raw, {
        'svix-id': request.headers.get('svix-id') ?? '',
        'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
        'svix-signature': request.headers.get('svix-signature') ?? '',
      }) as unknown as ClerkEvent
    } catch {
      // Deliberately terse. A caller who cannot sign a request does not get told
      // which header was wrong.
      return fail('FORBIDDEN', 'Invalid signature.')
    }

    const data = event?.data
    if (!data || !data.id) return noContent()

    const clerkUserId = data.id

    switch (event.type) {
      case 'user.created':
      case 'user.updated': {
        const email = primaryEmail(data)
        const name = displayName(data)
        // A Clerk-side ban or lock deactivates the local row too. The role is
        // *not* touched: Postgres is the authority for it (see `lib/server/auth.ts`)
        // and a webhook that reset it would let a Clerk metadata edit grant or
        // remove admin.
        const isActive = data.banned !== true && data.locked !== true

        await prisma.user.upsert({
          where: { clerkUserId },
          update: { email, name, isActive },
          create: { clerkUserId, email, name, isActive, role: 'STUDENT' },
        })
        break
      }

      case 'user.deleted': {
        // `updateMany` rather than `update`: a delete for an account that never
        // reached this app is normal, and `update` on a missing row throws.
        await prisma.user.updateMany({
          where: { clerkUserId },
          data: { isActive: false },
        })
        break
      }

      default:
        // Everything else — sessions, organisations, emails — is Clerk's business.
        // Acknowledged so Clerk stops retrying.
        break
    }

    return noContent()
  })
}
