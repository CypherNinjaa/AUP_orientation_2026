import type { Metadata } from 'next'

import { RegistrationsConsole } from '@/components/admin/RegistrationsConsole'

export const metadata: Metadata = { title: 'Registrations' }

/**
 * `/admin/registrations` — the operational directory of every submission.
 *
 * A shell: the ADMIN gate and the single `RealtimeProvider` live in the layout.
 */
export default function AdminRegistrationsPage() {
  return <RegistrationsConsole />
}
