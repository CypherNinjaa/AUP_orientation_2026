import type { Metadata } from 'next'

import { StaffConsole } from '@/components/admin/StaffConsole'

export const metadata: Metadata = { title: 'Team & Volunteers' }

/**
 * `/admin/team` — who can scan a gate and who can open this console.
 */
export default function AdminTeamPage() {
  return <StaffConsole />
}
