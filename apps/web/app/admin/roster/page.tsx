import type { Metadata } from 'next'

import { RosterConsole } from '@/components/admin/RosterConsole'

export const metadata: Metadata = { title: 'Roster' }

/**
 * `/admin/roster` — upload, preview, and commit the admissions workbook.
 *
 * A shell: the ADMIN gate and the single `RealtimeProvider` live in the layout.
 */
export default function AdminRosterPage() {
  return <RosterConsole />
}
