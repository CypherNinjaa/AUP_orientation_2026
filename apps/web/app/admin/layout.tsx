import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { AdminNav } from '@/components/admin/AdminNav'
import { RealtimeProvider } from '@/lib/client/RealtimeProvider'
import { getActor, hasRole } from '@/lib/server/auth'

/**
 * The admin command centre's shell.
 *
 * Three of these overrides are the volunteer scanner's, for the volunteer scanner's
 * reasons — the ops ground is near-black, so the installed status bar and the form
 * controls have to be told they are in the dark, and ten-digit codes are read off
 * this screen too, so the mono face is loaded on the subtree. `min-h-dvh` over
 * `min-h-screen` for the same iOS toolbar reason. What the scanner does not have and
 * this does:
 *
 * 1. **A server-side ADMIN gate.** `middleware.ts` already rewrites `/admin(.*)` for
 *    anyone below ADMIN, but it reads the role from the Clerk session token, which is
 *    a cache. This reads it from Postgres, which is authoritative — a moderator whose
 *    grant was revoked a minute ago still holds a token that says otherwise, and the
 *    console is not where a lagging cache should be trusted. The check is cheap and it
 *    runs before a single admin byte is rendered.
 * 2. **One `RealtimeProvider` for the whole subtree.** Mission control, the queues and
 *    the nav's own status dot all want the live stream; left to themselves that is a
 *    dozen `EventSource`s per operator. The provider owns the single connection and
 *    every `useRealtime` on every admin page subscribes to it.
 *
 * The gate lives here rather than in nine `page.tsx` files because a layout is the one
 * place that wraps all of them, and the pages are shells — the authority on every read
 * and write is the API route, which re-checks ADMIN against Postgres per request. A
 * revoked admin who kept a stale tab open sees the chrome and gets an empty screen: no
 * data loads and no mutation lands.
 */
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-var',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Command centre',
    template: '%s · Command centre',
  },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#070c17',
  colorScheme: 'dark',
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await getActor()

  if (actor === null) redirect('/sign-in?redirect_url=%2Fadmin')
  if (!hasRole(actor.role, 'ADMIN')) redirect('/not-authorised')

  return (
    <div className={`${mono.variable} bg-ops text-ops-ink min-h-dvh`}>
      <RealtimeProvider>
        <AdminNav operator={actor.name ?? actor.email ?? 'Admin'} />
        <main id="main" className="mx-auto w-full max-w-[80rem] px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </RealtimeProvider>
    </div>
  )
}
