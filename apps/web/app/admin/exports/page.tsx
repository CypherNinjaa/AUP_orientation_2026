import type { Metadata } from 'next'

import { ExportsConsole } from '@/components/admin/ExportsConsole'

export const metadata: Metadata = { title: 'Exports' }

/**
 * `/admin/exports` — a dataset, a format, and a download.
 *
 * A shell: the ADMIN gate and the single `RealtimeProvider` live in the layout.
 */
export default function AdminExportsPage() {
  return <ExportsConsole />
}
