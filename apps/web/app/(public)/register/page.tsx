import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@orientation/db'

import { RegisterWizard } from '@/components/register/RegisterWizard'
import { Reveal } from '@/components/motion/Reveal'
import { PageHeader } from '@/components/site/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { Container, IconChip, Section, SectionHeading } from '@/components/ui/atoms'
import { EVENT } from '@/lib/event'
import { getActor } from '@/lib/server/auth'
import { getStudentSession } from '@/lib/server/student-session'
import {
  type RegistrationWindow,
  getConfig,
  registrationClosedMessage,
  registrationWindow,
} from '@/lib/server/config'

export const metadata: Metadata = {
  title: 'Register',
  description: `Register for ${EVENT.programme} ${EVENT.year} — four short steps, one pass for orientation day, and seats on it for the family coming with you.`,
}

export default async function RegisterPage() {
  const session = await getStudentSession()
  const actor = session ? null : await getActor()

  const [existing, config] = await Promise.all([
    session
      ? prisma.registration.findUnique({
          where: { id: session.registrationId },
          select: { id: true, status: true },
        })
      : actor
        ? prisma.registration.findUnique({
            where: { userId: actor.id },
            select: { id: true, status: true },
          })
        : null,
    getConfig(),
  ])

  if (existing) redirect('/pass')

  const gate = registrationWindow(config)

  return (
    <>
      <PageHeader
        crumb="Register"
        eyebrow="Registration"
        title={
          <>
            Get your <span className="grad-text">name</span> on the list
          </>
        }
        note="one pass for orientation day"
        lede={`Four short steps and you are done. One pass covers orientation day (${EVENT.dateRange} · 2:00 PM Sharp at ${EVENT.venue.name}, ${EVENT.venue.street}), admitting ${config.maxCompanions === 1 ? 'somebody' : `up to ${String(config.maxCompanions)} people`} in with you.`}
      >
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-ink-soft flex items-center gap-1.5">
            <span className="bg-leaf-tint text-leaf grid size-5 place-items-center rounded-full">
              <Icon name="check" size={12} strokeWidth={2.8} />
            </span>
            No physical documents required
          </span>
          <span className="text-ink-soft flex items-center gap-1.5">
            <span className="bg-leaf-tint text-leaf grid size-5 place-items-center rounded-full">
              <Icon name="check" size={12} strokeWidth={2.8} />
            </span>
            Takes under 2 minutes
          </span>
          <Link
            href="/pass#recover"
            className="text-violet-deep hover:text-violet inline-flex items-center gap-1 font-bold transition-colors"
          >
            <Icon name="search" size={14} />
            Already registered? Find pass &rarr;
          </Link>
        </div>
      </PageHeader>

      {/* ---- the form ------------------------------------------------------ */}
      <Section id="form-section" className="py-12 md:py-16">
        <Container>
          {/* The camera and the four screens both need JavaScript, so there is no
              honest progressive-enhancement story here — only an honest fallback.
              Two ways to reach a human, no apology, no "please enable". */}
          <noscript>
            <div className="bg-card ring-rule/40 mx-auto max-w-2xl rounded-3xl p-7 ring-1">
              <h2 className="text-headline">This form needs JavaScript</h2>
              <p className="text-ink-soft mt-3 leading-relaxed">
                It takes a photo with your camera, which cannot be done without it. Turn it on for
                this page and the form appears, or register with us directly:
              </p>
              <ul className="text-navy mt-5 space-y-2 font-semibold">
                <li>
                  <a href={`tel:${EVENT.helpline.replace(/\s/g, '')}`}>{EVENT.helpline}</a>
                </li>
                <li>
                  <a href={`mailto:${EVENT.email}`}>{EVENT.email}</a>
                </li>
              </ul>
            </div>
          </noscript>

          {gate.open ? (
            <RegisterWizard
              consentVersion={config.consentVersion}
              maxCompanions={config.maxCompanions}
              retentionDays={config.selfieRetentionDays}
            />
          ) : (
            <Closed gate={gate} />
          )}
        </Container>
      </Section>

      {/* ---- around the edges --------------------------------------------- */}
      <Section id="good-to-know" className="bg-card border-rule/40 border-y">
        <Container>
          <Reveal stagger={0.07}>
            <SectionHeading
              eyebrow={gate.open ? 'Before you start' : 'While it is still shut'}
              title="Three things worth knowing"
              className="mb-12"
            />

            <ul className="grid gap-6 md:grid-cols-3">
              {goodToKnow(config.registrationClosesAt).map((g) => (
                <li key={g.title} data-reveal className="bg-paper ring-rule/40 rounded-3xl p-7 ring-1">
                  <IconChip name={g.icon} tint="violet" size={44} />
                  <h3 className="text-subhead mt-5">{g.title}</h3>
                  <p className="text-ink-soft mt-2.5 text-[0.9375rem] leading-relaxed">{g.body}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </Section>
    </>
  )
}

/**
 * What stands in for the wizard when the gate is shut.
 *
 * The sentence is `registrationClosedMessage`, the same one the lookup endpoint
 * returns, so a student who reads this and a student who somehow reaches the API
 * are told the same thing. The heading differs by reason because "opens on the
 * 8th" and "has closed" are not the same news.
 */
function Closed({ gate }: { gate: Extract<RegistrationWindow, { open: false }> }) {
  const shut = gate.reason === 'CLOSED_FOR_GOOD'

  return (
    <div className="bg-card ring-rule/25 shadow-card mx-auto w-full max-w-2xl rounded-3xl p-7 text-center ring-1 sm:p-11">
      <span className="bg-violet-tint text-violet-deep mx-auto grid size-16 place-items-center rounded-full">
        <Icon name={shut ? 'headset' : 'clock'} size={28} />
      </span>

      <h2 className="text-title mt-7">{shut ? 'Registration has closed' : 'Not open yet'}</h2>

      <p className="text-ink-soft mx-auto mt-4 max-w-[44ch] text-[0.9375rem] leading-relaxed sm:text-base">
        {registrationClosedMessage(gate)}
      </p>

      <p className="text-ink-faint border-rule/50 mx-auto mt-8 max-w-[46ch] border-t pt-6 text-[0.875rem] leading-relaxed">
        {shut ? (
          <>
            The desk in the Gate 1 foyer opens with the gates and runs the same four steps with you —
            bring your application form number. Ring{' '}
            <a href={`tel:${EVENT.helpline.replace(/\s/g, '')}`} className="text-violet-deep font-semibold">
              {EVENT.helpline}
            </a>{' '}
            if you would rather sort it out beforehand.
          </>
        ) : (
          <>
            This address does not change when it opens, so a bookmark is safe. Everyone holding an
            offer of admission is emailed the day it goes live — or ring{' '}
            <a href={`tel:${EVENT.helpline.replace(/\s/g, '')}`} className="text-violet-deep font-semibold">
              {EVENT.helpline}
            </a>{' '}
            and ask.
          </>
        )}
      </p>
    </div>
  )
}

/**
 * Facts that belong near the form but not inside it.
 *
 * The closing date is read off the config rather than written into the copy, which
 * is why this is a function. An operator who moves the date moves this sentence
 * with it; an operator who has not set one gets a sentence that does not pretend
 * to know.
 */
function goodToKnow(closesAt: number | null): readonly {
  readonly icon: 'clock' | 'calendar' | 'headset'
  readonly title: string
  readonly body: string
}[] {
  const when = closesAt
    ? new Date(closesAt).toLocaleString('en-IN', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      })
    : null

  return [
    {
      icon: 'clock',
      title: 'Stopping halfway is fine',
      body: 'Everything except the photo is saved as you type — on this device and to your account. Start on a laptop, finish on your phone, and it will all still be there.',
    },
    {
      icon: 'calendar',
      title: when ? 'It closes before the day' : 'There will be a closing date',
      body: when
        ? `Registration shuts at ${when}. After that the help desk registers you in person on the morning — slower, but nobody is turned away for missing a deadline.`
        : 'Once it is set you will see it here, and everyone with an offer of admission is emailed. Miss it and the help desk registers you in person on the morning; nobody is turned away.',
    },
    {
      icon: 'headset',
      title: 'Somebody will do it with you',
      body: `If a camera or a form gets in the way, ring ${EVENT.helpline} or come to the desk in the Gate 1 foyer. It is the same four steps, with a volunteer alongside.`,
    },
  ]
}
