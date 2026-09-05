import type { Metadata } from 'next'

import { AuditConsole } from '@/components/admin/AuditConsole'

export const metadata: Metadata = { title: 'Audit log' }

/**
 * `/admin/audit` — the append-only record of who did what.
 *
 * A shell: the ADMIN gate and the single `RealtimeProvider` live in the layout.
 */
export default function AdminAuditPage() {
  return <AuditConsole />
}
