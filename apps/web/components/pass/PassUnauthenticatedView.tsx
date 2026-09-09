'use client'

import { useEffect, useState } from 'react'
import { StudentPortal } from '@/components/pass/StudentPortal'
import { FindPassCard } from '@/components/pass/FindPassCard'
import { PageHeader } from '@/components/site/PageHeader'
import { LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Container, IconChip, Section, SectionHeading } from '@/components/ui/atoms'
import { Reveal } from '@/components/motion/Reveal'
import { CtaBand } from '@/components/sections/CtaBand'
import { GUEST_ALLOWANCE } from '@/lib/event'
import { fetchMe } from '@/lib/pass'

const CODES = [
  {
    icon: 'qr' as const,
    tint: 'violet' as const,
    title: 'A QR code',
    body: 'The fast path. A volunteer points a phone at it and it is read in under a second, signed so it cannot be edited or invented.',
  },
  {
    icon: 'barcode' as const,
    tint: 'flame' as const,
    title: 'A barcode',
    body: 'For the handheld scanners at the desk. It reads a cracked screen and a creased printout better than a camera does.',
  },
  {
    icon: 'keypad' as const,
    tint: 'sky' as const,
    title: 'A 10-digit code',
    body: 'Typed by hand when nothing else will focus — dead battery, glare, dust on a lens. Printed on the pass as 123-456-7890.',
  },
]

export function PassUnauthenticatedView() {
  const [hasClientSession, setHasClientSession] = useState(false)

  useEffect(() => {
    async function checkLocalSession() {
      try {
        const token = localStorage.getItem('orientation2026:student:session')
        if (token) {
          const res = await fetchMe()
          if (res.ok && res.data.registration) {
            setHasClientSession(true)
            return
          }
        }
      } catch {
        // Fallback to unauthenticated view
      }
    }

    void checkLocalSession()
  }, [])

  if (hasClientSession) {
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
          note="Orientation 2026"
          lede="Everything a volunteer needs is on this page. Screenshot it, download it, or keep this tab — none of it needs a signal at the gate."
        />
        <StudentPortal />
      </>
    )
  }

  return (
    <>
      <PageHeader
        crumb="Your pass"
        eyebrow="Entry pass"
        title={
          <>
            One pass, <span className="grad-text">orientation day</span>
          </>
        }
        note={`and ${GUEST_ALLOWANCE}`}
        lede="It arrives the moment you finish registering, works on a screen or on paper, and does not need a signal at the gate."
        aside={
          <div className="border-rule/80 bg-paper-tint/60 rounded-3xl border-2 border-dashed p-7 text-center sm:p-9">
            <span className="bg-card ring-rule/40 text-ink-faint shadow-soft mx-auto grid size-14 place-items-center rounded-2xl ring-1">
              <Icon name="id" size={26} />
            </span>
            <h2 className="text-navy mt-5 text-[1.0625rem] font-bold">New fresher? Get your pass</h2>
            <p className="text-ink-soft mx-auto mt-2 max-w-xs text-[0.9375rem] leading-relaxed">
              Takes three minutes without any login or account creation.
            </p>
            <div className="mt-6">
              <LinkButton href="/register" arrow>
                Get your pass
              </LinkButton>
            </div>
          </div>
        }
      />

      <Section id="recover" className="pt-2">
        <Container>
          <div className="mx-auto max-w-xl">
            <FindPassCard />
          </div>
        </Container>
      </Section>

      <Section id="codes">
        <Container>
          <Reveal stagger={0.07}>
            <SectionHeading
              eyebrow="How it scans"
              title="Three codes, because one is a single point of failure"
              className="mb-12"
            />

            <ul className="grid gap-6 md:grid-cols-3">
              {CODES.map((c) => (
                <li key={c.title} data-reveal className="bg-paper ring-rule/40 rounded-3xl p-7 ring-1">
                  <IconChip name={c.icon} tint={c.tint} size={44} />
                  <h3 className="text-subhead mt-5">{c.title}</h3>
                  <p className="text-ink-soft mt-2.5 text-[0.9375rem] leading-relaxed">{c.body}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </Section>

      <CtaBand
        icon="spark"
        tint="violet"
        title="Ready to get yours?"
        body="One pass covers the whole day and admits the people coming with you. Takes about three minutes."
        cta="Register for your pass"
        href="/register"
      />
    </>
  )
}
