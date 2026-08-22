import type { Metadata } from 'next'
import { CtaBand } from '@/components/sections/CtaBand'
import { ScheduleBoard } from '@/components/sections/ScheduleBoard'
import { Reveal } from '@/components/motion/Reveal'
import { PageHeader } from '@/components/site/PageHeader'
import { LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Container, IconChip, Section } from '@/components/ui/atoms'
import { DAYS, EVENT, SCHEDULE_NOTES, SESSION_COUNT } from '@/lib/event'

export const metadata: Metadata = {
  title: 'Schedule',
  description: `Hour by hour across all three days of ${EVENT.programme} ${EVENT.year} — ${SESSION_COUNT} sessions, with venues.`,
}

export default function SchedulePage() {
  return (
    <>
      <PageHeader
        crumb="Schedule"
        eyebrow={`${EVENT.institution} · ${EVENT.year}`}
        title="Schedule"
        note="hour by hour, all three days"
        lede={`Every session, with the room it happens in. ${SESSION_COUNT} in total across the three days — nothing here is optional, and nothing here runs twice.`}
        aside={
          <dl className="bg-card ring-rule/30 shadow-card divide-rule/40 divide-y rounded-3xl px-7 py-2 ring-1">
            {[
              { icon: 'calendar' as const, label: 'Dates', value: EVENT.dateRange },
              { icon: 'clock' as const, label: 'Timings', value: 'Day one from 08:30, then 09:00' },
              { icon: 'pin' as const, label: 'Venue', value: `${EVENT.venue.name} — Gate 1` },
              { icon: 'utensils' as const, label: 'Lunch', value: 'Provided, all three days' },
            ].map((r) => (
              <div key={r.label} className="flex items-start gap-4 py-5">
                <IconChip name={r.icon} tint="violet" size={36} />
                <div className="min-w-0">
                  <dt className="text-label text-ink-faint uppercase">{r.label}</dt>
                  <dd className="text-navy mt-0.5 font-bold">{r.value}</dd>
                </div>
              </div>
            ))}
          </dl>
        }
      />

      <Section id="board">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1.65fr_1fr] lg:gap-14">
            {/* ---- the board ---------------------------------------------- */}
            <Reveal>
              <div
                data-reveal
                className="bg-card ring-rule/25 shadow-card rounded-3xl p-6 ring-1 sm:p-9"
              >
                <ScheduleBoard days={DAYS} />
              </div>
            </Reveal>

            {/* ---- the rail ----------------------------------------------- */}
            <Reveal stagger={0.08} className="flex flex-col gap-6 lg:sticky lg:top-28 lg:self-start">
              <section
                data-reveal
                className="bg-card ring-rule/25 shadow-soft rounded-2xl p-7 ring-1"
              >
                <h2 className="text-navy flex items-center gap-2.5 text-[1.0625rem] font-bold">
                  <span className="text-flame bg-flame-tint grid size-8 place-items-center rounded-lg">
                    <Icon name="note" size={17} />
                  </span>
                  Before you come
                </h2>
                <ul className="mt-5 space-y-3.5">
                  {SCHEDULE_NOTES.map((n) => (
                    <li key={n} className="text-ink-soft flex gap-3 text-[0.9375rem] leading-relaxed">
                      <span aria-hidden className="bg-flame-bright mt-2 size-1.5 shrink-0 rounded-full" />
                      {n}
                    </li>
                  ))}
                </ul>
              </section>

              <section
                data-reveal
                className="bg-card ring-rule/25 shadow-soft rounded-2xl p-7 ring-1"
              >
                <h2 className="text-navy text-[1.0625rem] font-bold">The three days, counted</h2>
                <dl className="divide-rule/40 mt-4 divide-y">
                  {DAYS.map((d) => (
                    <div key={d.id} className="flex items-baseline justify-between gap-4 py-3">
                      <dt className="min-w-0">
                        <span className="text-navy font-bold">{d.label}</span>
                        <span className="text-ink-faint ml-2 text-sm font-semibold">{d.theme}</span>
                      </dt>
                      <dd className="tnum text-violet-deep shrink-0 text-lg font-extrabold">
                        {d.sessions.length}
                      </dd>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between gap-4 py-3">
                    <dt className="text-navy font-bold">Total sessions</dt>
                    <dd className="tnum grad-text shrink-0 text-2xl font-extrabold">{SESSION_COUNT}</dd>
                  </div>
                </dl>
              </section>

              <section
                data-reveal
                className="grad-pair shadow-card relative overflow-hidden rounded-2xl p-7"
              >
                {/* A scrim so 15px white body copy clears 4.5:1 over the flame
                    end of the gradient, where white alone is only ~3.7:1. */}
                <span aria-hidden className="bg-navy/25 absolute inset-0" />
                <div className="relative">
                  <h2 className="text-[1.0625rem] font-bold text-white">Put it in your calendar</h2>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-white/90">
                    Downloads all three days as one file. It opens in Google Calendar, Apple
                    Calendar and Outlook.
                  </p>
                  <div className="mt-5 flex flex-col gap-2.5 sm:flex-row lg:flex-col">
                    <LinkButton href="/calendar.ics" variant="onNavy" size="sm">
                      <Icon name="download" size={16} />
                      Add to calendar
                    </LinkButton>
                    <LinkButton href="/information" variant="quiet" size="sm" className="text-white">
                      What to bring
                    </LinkButton>
                  </div>
                </div>
              </section>
            </Reveal>
          </div>
        </Container>
      </Section>

      <CtaBand
        icon="calendar"
        tint="flame"
        title="Your name on the gate list"
        body="Registration closes a week before the programme starts. It takes a few minutes and you can come back to it."
      />
    </>
  )
}
