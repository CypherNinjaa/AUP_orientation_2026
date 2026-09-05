import type { Metadata } from 'next'

import { BroadcastConsole } from '@/components/admin/BroadcastConsole'

export const metadata: Metadata = { title: 'Broadcast' }

/**
 * `/admin/broadcast` — one line to every connected screen.
 *
 * A shell, like every page under this route: the ADMIN gate and the single
 * `RealtimeProvider` live in the layout, so this only names the tab and hands off to
 * the client console.
 */
export default function AdminBroadcastPage() {
  return <BroadcastConsole />
}
