import type { Metadata } from 'next'

import { ModerationConsole } from '@/components/admin/ModerationConsole'

export const metadata: Metadata = { title: 'Moderation' }

/**
 * `/admin/moderation` — the selfie review queue.
 *
 * A shell: the ADMIN gate and the single `RealtimeProvider` live in the layout.
 */
export default function AdminModerationPage() {
  return <ModerationConsole />
}
