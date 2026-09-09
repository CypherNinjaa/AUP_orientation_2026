import type { Metadata } from 'next'

import { prisma } from '@orientation/db'

import { StudentPortal } from '@/components/pass/StudentPortal'
import { PassUnauthenticatedView } from '@/components/pass/PassUnauthenticatedView'
import { PageHeader } from '@/components/site/PageHeader'
import { EVENT } from '@/lib/event'
import { getActor } from '@/lib/server/auth'
import { getStudentSession } from '@/lib/server/student-session'

export const metadata: Metadata = {
  title: 'Student Entry Pass & QR Code',
  description: `Access and download your digital entry pass and QR code for ${EVENT.institution} ${EVENT.programme} ${EVENT.year}.`,
  alternates: {
    canonical: '/pass',
  },
  openGraph: {
    title: 'Student Entry Pass & QR Code | Amity University Patna',
    description: `Access and download your digital entry pass and QR code for ${EVENT.institution} ${EVENT.programme} ${EVENT.year}.`,
    url: '/pass',
  },
}

export const dynamic = 'force-dynamic'

export default async function PassPage() {
  const session = await getStudentSession()
  const actor = session ? null : await getActor()

  const registration = session
    ? await prisma.registration.findUnique({
        where: { id: session.registrationId },
        select: { name: true },
      })
    : actor
      ? await prisma.registration.findUnique({
          where: { userId: actor.id },
          select: { name: true },
        })
      : null

  if (registration !== null) {
    return (
      <>
        <PageHeader
          crumb="Your pass"
          eyebrow="Entry pass"
          title={
            <>
              Your <span className="grad-text">pass</span>
            </>
          }
          note={firstName(registration.name)}
          lede="Everything a volunteer needs is on this page. Screenshot it, download it, or keep this tab — none of it needs a signal at the gate."
        />
        <StudentPortal />
      </>
    )
  }

  return <PassUnauthenticatedView />
}

/** The name a person answers to, for the header. Falls back to the whole thing. */
function firstName(full: string): string {
  const first = full.trim().split(/\s+/)[0]
  return first !== undefined && first.length > 0 ? `for ${first}` : 'ready to scan'
}
