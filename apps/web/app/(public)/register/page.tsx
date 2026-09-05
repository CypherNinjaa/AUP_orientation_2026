import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { prisma } from '@orientation/db'

import { RegisterWizard } from '@/components/register/RegisterWizard'
import { CtaBand } from '@/components/sections/CtaBand'
import { Reveal } from '@/components/motion/Reveal'
import { PageHeader } from '@/components/site/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { Container, IconChip, Section, SectionHeading } from '@/components/ui/atoms'
import { EVENT, REGISTER_STEPS } from '@/lib/event'
import { getActor } from '@/lib/server/auth'
import {
  type RegistrationWindow,
  getConfig,
  registrationClosedMessage,
  registrationWindow,
} from '@/lib/server/config'

export const metadata: Metadata = {
  title: 'Register',
  description: `Register for ${EVENT.programme} ${EVENT.year} — four short steps, one pass covering all three days, and seats on it for the family coming with you.`,
}

/**
 * The registration page.
 *
 * A server component because three facts have to be true before a single control
 * is drawn, and none of them can be established in the browser:
 *
 *   1. Whether this student has already registered. If they have, the page they
 *      want is `/pass`, not a form that would refuse them at the last step.
 *   2. Whether the gate is open. Step 1 makes a live call to a gate-checked
 *      endpoint, so a shut gate means the wizard cannot get past its first
 *      screen — better to say so than to let somebody discover it.
 *   3. The consent version, the seat count and the retention period. All three are
 *      operator-set and all three appear in words the student reads; shipping a
 *      hard-coded copy of any of them is how the notice and the record diverge.
 *
 * The middleware guarantees a signed-in actor on this path, so `getActor()` is
 * only null for the deactivated-account case it also handles at `/dashboard`.
 */
export default async function RegisterPage() {
  const actor = await getActor()
  if (actor === null) redirect('/sign-in?redirect_url=%2Fregister')

  const [existing, config] = await Promise.all([
    // Deliberately just the id. This page never renders registration detail — it
    // hands over to `/pass`, which reads it properly.
    prisma.registration.findUnique({ where: { userId: actor.id }, select: { id: true } }),
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
        note="once, for all three days"
        lede={`Four short steps and you are done. One pass covers ${EVENT.dateRange}, and it brings ${config.maxCompanions === 1 ? 'somebody' : `up to ${String(config.maxCompanions)} people`} in with you.`}
        aside={
          <div className="bg-card ring-rule/25 shadow-card rounded-3xl p-7 ring-1 sm:p-8">
            <h2 className="text-label text-flame flex items-center gap-2.5 uppercase">
              <span className="bg-flame-mid h-px w-7" />
              Have this ready
            </h2>
            <ul className="divide-rule/40 mt-5 divide-y">
              {REGISTER_STEPS.map((s) => (
                <li key={s.title} className="flex items-start gap-3.5 py-3.5 first:pt-0 last:pb-0">
                  <span className="bg-leaf-tint text-leaf mt-0.5 grid size-6 shrink-0 place-items-center rounded-full">
                    <Icon name="check" size={13} strokeWidth={2.6} />
                  </span>
                  <span className="text-ink-soft text-[0.9375rem] leading-snug">{s.need}</span>
                </li>
              ))}
            </ul>
            <p className="text-ink-faint mt-5 text-[0.8125rem] leading-relaxed">
              Nothing else. No documents to scan, no fee, no printing.
            </p>
          </div>
        }
      />

      {/* ---- the form ------------------------------------------------------ */}
      <Section id="form-section">
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

      <CtaBand
        icon="note"
        tint="flame"
        title="While you wait"
        body="What to bring, how to reach Bailey Road, and what happens at Gate 1 on the morning of day one."
        cta="Practical information"
        href="/information"
      />
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
