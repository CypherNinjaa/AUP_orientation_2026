import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { prisma } from '@orientation/db'

import { CtaBand } from '@/components/sections/CtaBand'
import { Reveal } from '@/components/motion/Reveal'
import { StudentPortal } from '@/components/pass/StudentPortal'
import { PageHeader } from '@/components/site/PageHeader'
import { LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Container, IconChip, Section, SectionHeading } from '@/components/ui/atoms'
import { EVENT, GUEST_ALLOWANCE } from '@/lib/event'
import { getActor } from '@/lib/server/auth'

export const metadata: Metadata = {
  title: 'Your pass',
  description: `Your entry pass for ${EVENT.programme} ${EVENT.year} — how it scans, what it covers, and what a volunteer can see on it.`,
}

/**
 * `/pass` — the student portal, and the explanation for anyone who has not
 * registered yet.
 *
 * ## Two audiences, one URL
 *
 * The middleware requires a signed-in user here, so there is no anonymous case. What
 * is left is a student who has registered — who wants their codes, their status and
 * the announcements — and a student who has signed in but not registered, who wants
 * to know what the pass *is* before spending three minutes on a form.
 *
 * The second one is not redirected into the wizard. A person who deliberately clicked
 * "Your pass" to read about it, and instead landed on step one of a form asking for
 * their form number, has been hijacked. They get the explainer and a button.
 *
 * ## Why the branch is a server query and not a client fetch
 *
 * Deciding on the client means every student downloads the marketing copy and the
 * portal, and watches a skeleton decide which one they are. The branch is one indexed
 * lookup on `userId`, so the right page is the first paint.
 */
export const dynamic = 'force-dynamic'

/** Why three codes rather than one. Each fails differently. */
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

export default async function PassPage() {
  const actor = await getActor()

  if (actor === null) {
    // Reachable despite the middleware: a valid Clerk session whose local `User`
    // row has been deactivated. Sign-in is where that gets explained.
    redirect('/sign-in?redirect_url=%2Fpass')
  }

  const registration = await prisma.registration.findUnique({
    where: { userId: actor.id },
    // Only what the branch and the greeting need. Everything else the portal shows
    // comes from `/api/registration/me`, which is the endpoint that re-reads on every
    // live event — duplicating those fields here would put a stale copy on the first
    // paint and a fresh one a moment later.
    select: { name: true },
  })

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
          lede="Everything a volunteer needs is on this page. Screenshot it, print it, or keep this tab — none of it needs a signal at the gate."
        />
        <StudentPortal />
      </>
    )
  }

  /* ---- signed in, not registered ------------------------------------------- */

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
        lede="It arrives the moment you finish registering, works on a screen or on paper, and does not need a signal at the gate — yours or ours."
        aside={
          /* The empty state. Dashed, unmistakably a frame rather than a pass. */
          <div className="border-rule/80 bg-paper-tint/60 rounded-3xl border-2 border-dashed p-7 text-center sm:p-9">
            <span className="bg-card ring-rule/40 text-ink-faint shadow-soft mx-auto grid size-14 place-items-center rounded-2xl ring-1">
              <Icon name="id" size={26} />
            </span>
            <h2 className="text-navy mt-5 text-[1.0625rem] font-bold">Your pass appears here</h2>
            <p className="text-ink-soft mx-auto mt-2 max-w-xs text-[0.9375rem] leading-relaxed">
              Register once — about three minutes — and it is on this page from then on, with a
              button to download it as a PDF.
            </p>
            <div className="mt-6">
              <LinkButton href="/register" arrow>
                Register now
              </LinkButton>
            </div>
            <p className="text-ink-faint mt-5 text-[0.8125rem]">
              You are signed in, so it will remember you.
            </p>
          </div>
        }
      />

      {/* ---- the three codes ---------------------------------------------- */}
      <Section id="codes">
        <Container>
          <Reveal stagger={0.07}>
            <SectionHeading
              eyebrow="How it scans"
              title="Three codes, because one is a single point of failure"
              lede="Fifteen thousand people arrive on 14 September. Every one of them gets in even if the network is down, the light is bad, or their screen is broken."
              align="left"
              className="mb-14 max-w-3xl"
            />

            <ul className="grid gap-6 md:grid-cols-3">
              {CODES.map((c) => (
                <li
                  key={c.title}
                  data-reveal
                  className="bg-card ring-rule/25 shadow-soft flex flex-col rounded-3xl p-7 ring-1"
                >
                  <IconChip name={c.icon} tint={c.tint} size={52} />
                  <h3 className="text-[1.0625rem] font-bold mt-6">{c.title}</h3>
                  <p className="text-ink-soft mt-2 text-[0.9375rem] leading-relaxed">{c.body}</p>
                </li>
              ))}
            </ul>

            <p data-reveal className="text-ink-soft mt-10 max-w-2xl leading-relaxed">
              Print it if you would rather not rely on a phone —{' '}
              <Link
                href="/information#gate"
                className="text-violet-deep font-bold underline decoration-1 underline-offset-4"
              >
                a printed pass clears the gate exactly like the screen
              </Link>
              . Lose it entirely and it is regenerated from your record; there is nothing to keep
              safe.
            </p>
          </Reveal>
        </Container>
      </Section>

      {/* ---- what the volunteer sees -------------------------------------- */}
      <Section id="seen" className="bg-card border-rule/40 border-y">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <Reveal>
              <SectionHeading
                eyebrow="Who sees what"
                title="What the person scanning you can see"
                lede="A fair question, and the answer is deliberately short. The volunteer at the gate is a student two years ahead of you, not an administrator."
                align="left"
              />
              <p data-reveal className="text-ink-soft mt-7 leading-relaxed">
                All of it is set out in full in the{' '}
                <Link
                  href="/privacy"
                  className="text-violet-deep font-bold underline decoration-1 underline-offset-4"
                >
                  privacy policy
                </Link>
                , including the fact that your photograph is deleted 30 days after orientation day.
              </p>
            </Reveal>

            <Reveal stagger={0.06} className="flex flex-col gap-4">
              <div
                data-reveal
                className="ring-leaf/25 bg-leaf-tint/40 rounded-2xl p-6 ring-1 sm:p-7"
              >
                <h3 className="text-navy flex items-center gap-2.5 text-[1.0625rem] font-bold">
                  <span className="bg-leaf-tint text-leaf grid size-7 shrink-0 place-items-center rounded-full">
                    <Icon name="check" size={15} strokeWidth={2.6} />
                  </span>
                  They see
                </h3>
                <ul className="text-ink-soft mt-4 space-y-2 text-[0.9375rem]">
                  {[
                    'Your name and your programme',
                    'Your photograph, on their screen, for the few seconds it takes',
                    'Whether this pass has already been used to enter',
                    'Whether a guest is coming with you',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2.5">
                      <span className="bg-leaf mt-2 size-1.5 shrink-0 rounded-full" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              <div data-reveal className="ring-rule/40 bg-paper-tint/70 rounded-2xl p-6 ring-1 sm:p-7">
                <h3 className="text-navy flex items-center gap-2.5 text-[1.0625rem] font-bold">
                  <span className="bg-danger-tint text-danger grid size-7 shrink-0 place-items-center rounded-full">
                    <Icon name="close" size={15} strokeWidth={2.6} />
                  </span>
                  They do not see
                </h3>
                <ul className="text-ink-soft mt-4 space-y-2 text-[0.9375rem]">
                  {[
                    'Your phone number, email or address',
                    'Your marks, your fees or anything from your application',
                    'Any part of your record beyond the four lines above',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2.5">
                      <span className="bg-rule mt-2 size-1.5 shrink-0 rounded-full" />
                      {t}
                    </li>
                  ))}
                </ul>
                <p className="text-ink-faint mt-5 text-[0.8125rem] leading-relaxed">
                  Your photograph is never saved onto a volunteer&rsquo;s device, and every time it
                  is opened that is written to a log.
                </p>
              </div>
            </Reveal>
          </div>
        </Container>
      </Section>

      <CtaBand
        icon="id"
        title="No pass yet?"
        body={`Registering takes about two minutes. Your pass covers orientation day (${EVENT.dateRange}) and brings ${GUEST_ALLOWANCE} with you.`}
      />
    </>
  )
}

/** The name a person answers to, for the header. Falls back to the whole thing. */
function firstName(full: string): string {
  const first = full.trim().split(/\s+/)[0]
  return first !== undefined && first.length > 0 ? `for ${first}` : 'ready to scan'
}
