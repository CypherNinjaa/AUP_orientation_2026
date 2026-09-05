import type { Metadata } from 'next'

import { SettingsConsole } from '@/components/admin/SettingsConsole'

export const metadata: Metadata = { title: 'Settings' }

/**
 * `/admin/settings` — event policy, gates, and storage credentials.
 *
 * A shell: the ADMIN gate and the single `RealtimeProvider` live in the layout.
 */
export default function AdminSettingsPage() {
  return <SettingsConsole />
}
