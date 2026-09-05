import type { Metadata } from 'next'

import { MissionControl } from '@/components/admin/MissionControl'

export const metadata: Metadata = { title: 'Mission control' }

/**
 * `/admin` — the console's front page.
 *
 * A shell, like every page under this route: the ADMIN gate and the one
 * `RealtimeProvider` live in the layout, so all this does is name the screen for the
 * tab title and hand off to the client component that reads `/api/admin/stats`.
 */
export default function AdminHomePage() {
  return <MissionControl />
}
