import type { Metadata } from 'next'
import { CtaBand } from '@/components/sections/CtaBand'
import { Reveal } from '@/components/motion/Reveal'
import { PageHeader } from '@/components/site/PageHeader'
import { LinkButton } from '@/components/ui/Button'
import { QuoteCard } from '@/components/ui/QuoteCard'
import {
  Container,
  HandNote,
  IconChip,
  Section,
  SectionHeading,
} from '@/components/ui/atoms'
import { ABOUT_EXPECT, EVENT, SESSION_COUNT, WHO_RUNS_IT, WHY_THREE_DAYS } from '@/lib/event'

export const metadata: Metadata = {
  title: 'About the Orientation Programme 2026',
  description:
    'Learn about Amity University Patna Orientation Programme 2026, session structures, faculty interactions, campus culture, and what to expect on orientation day.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About Orientation Programme 2026 | Amity University Patna',
    description:
      'Learn about Amity University Patna Orientation Programme 2026, session structures, faculty interactions, campus culture, and what to expect on orientation day.',
    url: '/about',
  },
}

/** Morning violet, afternoon flame, evening navy — the three phases of orientation day. */
const DAY_ACCENT = ['bg-violet', 'bg-flame-bright', 'bg-navy-line'] as const

export default function AboutPage() {
  return (
    <>
      <PageHeader
        crumb="About"
        eyebrow="About orientation"
        title={
          <>
            The start of something <span className="grad-text">bigger</span> than a timetable
          </>
        }
        lede={`${EVENT.programme} ${EVENT.year} is ${SESSION_COUNT} structured sessions on 12 September, built around one idea: nobody should have to work out how university functions while it is already counting.`}
        aside={
          <QuoteCard
            quote="Orientation is not just an event you attend. It is day one of your four years."
            note="Let's begin together!"
          />
        }
      >
        <LinkButton href="/schedule" variant="secondary" arrow>
          See the full schedule
        </LinkButton>
      </PageHeader>

      {/* ---- orientation day structured --------------------------------- */}
      <Section id="the-day-structured">
        <Container>
          <Reveal stagger={0.07}>
            <SectionHeading
              eyebrow="Orientation Day"
              title="A structured journey from afternoon to evening"
              lede="Designed so you leave knowing your faculty, campus layout, degree rules, and fellow classmates."
              align="left"
              className="mb-14 max-w-3xl"
            />

            <ol className="divide-rule/50 border-rule/50 divide-y border-t">
              {WHY_THREE_DAYS.map((d, i) => (
                <li
                  key={d.theme}
                  data-reveal
                  className="grid gap-6 py-10 lg:grid-cols-[15rem_1fr] lg:gap-14"
                >
                  <div>
                    <p className="text-label text-ink-faint uppercase">{d.label}</p>
                    {/* The theme word is the anchor: three words, in order,
                        that describe what the day is for. */}
                    <p className="grad-text mt-1 text-[2.5rem] leading-none font-extrabold tracking-tight">
                      {d.theme}
                    </p>
                    <span
                      aria-hidden
                      className={`mt-4 block h-1 w-14 rounded-full ${DAY_ACCENT[i] ?? 'bg-violet'}`}
                    />
                  </div>

                  <div>
                    <h3 className="text-subhead max-w-2xl text-balance">{d.title}</h3>
                    <p className="text-ink-soft mt-4 max-w-2xl leading-relaxed">{d.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </Container>
      </Section>

      {/* ---- what to expect --------------------------------------------- */}
      <Section id="what-to-expect" className="bg-card border-rule/40 border-y">
        <Container>
          <Reveal stagger={0.05}>
            <SectionHeading
              eyebrow="What to expect"
              title="Eight things that will have happened by the time you head home"
              className="mb-14"
            />

            <ul className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
              {ABOUT_EXPECT.map((e) => (
                <li key={e.title} data-reveal className="flex gap-4">
                  <IconChip name={e.icon} tint="violet" size={44} />
                  <div className="min-w-0">
                    <h3 className="text-[1.0625rem] leading-snug font-bold">{e.title}</h3>
                    <p className="text-ink-soft mt-1 text-[0.9375rem] leading-relaxed">{e.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </Section>

      {/* ---- who runs it ------------------------------------------------ */}
      <Section id="who">
        <Container>
          <Reveal stagger={0.08}>
            <SectionHeading
              eyebrow="Who you will be dealing with"
              title="Three groups of people, all of whom expect to be asked things"
              align="left"
              className="mb-12 max-w-3xl"
            />

            <ul className="grid gap-6 md:grid-cols-3">
              {WHO_RUNS_IT.map((w) => (
                <li
                  key={w.title}
                  data-reveal
                  className="bg-card ring-rule/25 shadow-soft rounded-2xl p-7 ring-1"
                >
                  <IconChip name={w.icon} tint="violet" size={44} className="mb-5" />
                  <h3 className="text-[1.0625rem] font-bold">{w.title}</h3>
                  <p className="text-ink-soft mt-2 text-[0.9375rem] leading-relaxed">{w.body}</p>
                </li>
              ))}
            </ul>

            <p data-reveal className="mt-10">
              <HandNote tilt={-3} className="text-violet-deep text-[1.75rem]">
                Everyone here was new once.
              </HandNote>
            </p>
          </Reveal>
        </Container>
      </Section>

      <CtaBand
        icon="cap"
        title="One day to prepare, four years to thrive"
        body={`${EVENT.dateRange}. Registering takes a few minutes and puts your name on the gate list.`}
      />
    </>
  )
}
