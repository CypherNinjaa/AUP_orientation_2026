import type { Metadata } from 'next'

import { StaffConsole } from '@/components/admin/StaffConsole'

export const metadata: Metadata = { title: 'Staff' }

/**
 * `/admin/staff` — who can scan a gate and who can open this console.
 *
 * A shell: the ADMIN gate and the single `RealtimeProvider` live in the layout.
 */
export default function AdminStaffPage() {
  return <StaffConsole />
}
