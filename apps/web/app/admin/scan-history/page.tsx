import type { Metadata } from 'next'

import { ScanHistoryConsole } from '@/components/admin/ScanHistoryConsole'

export const metadata: Metadata = { title: 'Scan History' }

/**
 * `/admin/scan-history` — live gate admission and scan event ledger.
 *
 * A shell: the ADMIN gate and the single `RealtimeProvider` live in the layout.
 */
export default function AdminScanHistoryPage() {
  return <ScanHistoryConsole />
}
