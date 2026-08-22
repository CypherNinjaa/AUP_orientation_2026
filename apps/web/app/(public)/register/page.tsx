import type { Metadata } from 'next'
import { RegisterWizard } from '@/components/register/RegisterWizard'
import { CtaBand } from '@/components/sections/CtaBand'
import { Reveal } from '@/components/motion/Reveal'
import { PageHeader } from '@/components/site/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { Container, IconChip, Section, SectionHeading } from '@/components/ui/atoms'
import { EVENT, REGISTER_STEPS } from '@/lib/event'

export const metadata: Metadata = {
  title: 'Register',
  description: `Register for ${EVENT.programme} ${EVENT.year} — four short steps, one pass covering all three days, and one guest if you are bringing someone.`,
}

/** Facts that belong near the form but not inside it. */
const GOOD_TO_KNOW = [
  {
    icon: 'clock',
    title: 'It opens closer to the date',
    body: 'This address does not change when it does, so bookmarking the page is safe. Everyone holding an offer of admission is emailed the day it goes live.',
  },
  {
    icon: 'calendar',
    title: 'It closes a week before',
    body: 'After that the help desk registers you in person on the morning — slower, but nobody is turned away for missing a deadline.', // unconfirmed
  },
  {
    icon: 'headset',
    title: 'Somebody will do it with you',
    body: `If a camera or a form gets in the way, ring ${EVENT.helpline} or come to the desk in the Gate 1 foyer. It is the same four steps, with a volunteer alongside.`,
  },
] as const

export default function RegisterPage() {
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
        lede={`Four short steps and you are done. One pass covers ${EVENT.dateRange}, and it brings one guest with you.`}
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

          <RegisterWizard />
        </Container>
      </Section>

      {/* ---- around the edges --------------------------------------------- */}
      <Section id="good-to-know" className="bg-card border-rule/40 border-y">
        <Container>
          <Reveal stagger={0.07}>
            <SectionHeading
              eyebrow="While it is still shut"
              title="Three things worth knowing"
              className="mb-12"
            />

            <ul className="grid gap-6 md:grid-cols-3">
              {GOOD_TO_KNOW.map((g) => (
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
