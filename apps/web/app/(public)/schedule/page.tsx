import type { Metadata } from 'next'
import { Reveal } from '@/components/motion/Reveal'
import { PageHeader } from '@/components/site/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { Container, IconChip, Section } from '@/components/ui/atoms'
import { EVENT, SCHEDULE_NOTES } from '@/lib/event'

export const metadata: Metadata = {
  title: 'Orientation Schedule & Reporting Time 2026',
  description: `Official schedule and reporting details for Amity University Patna Orientation Programme 2026. Reporting at 2:00 PM Sharp on ${EVENT.dateRange} at ${EVENT.venue.name}, ${EVENT.venue.street}.`,
  alternates: {
    canonical: '/schedule',
  },
  openGraph: {
    title: 'Orientation Schedule & Reporting Time 2026 | Amity University Patna',
    description: `Official schedule and reporting details for Amity University Patna Orientation Programme 2026. Reporting at 2:00 PM Sharp on ${EVENT.dateRange} at ${EVENT.venue.name}, ${EVENT.venue.street}.`,
    url: '/schedule',
  },
}

export default function SchedulePage() {
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    'Amity University Patna — Orientation Programme 2026',
  )}&dates=20260912T083000Z/20260912T120000Z&details=${encodeURIComponent(
    'Orientation starts at 2:00 PM Sharp (Reporting time: 2:00 PM) at Gyan Bhawan, Gandhi Maidan. Followed by the induction ceremony and Hi-Tea.',
  )}&location=${encodeURIComponent('Gyan Bhawan, Samrat Ashok Convention Centre, Gandhi Maidan, Patna')}`

  return (
    <>
      <PageHeader
        crumb="Schedule"
        eyebrow={`${EVENT.institution} · ${EVENT.year}`}
        title="Schedule & Reporting"
        note="12 September · Starts 2:00 PM Sharp"
        lede={`Orientation begins at 2:00 PM Sharp (Reporting time) at ${EVENT.venue.name}, ${EVENT.venue.street}. Followed by the induction ceremony and Hi-Tea.`}
        aside={
          <dl className="bg-card ring-rule/30 shadow-card divide-rule/40 divide-y rounded-3xl px-7 py-2 ring-1">
            {[
              { icon: 'calendar' as const, label: 'Date', value: EVENT.dateRange },
              { icon: 'clock' as const, label: 'Timings', value: 'Starts 2:00 PM Sharp (Reporting: 2:00 PM)' },
              { icon: 'pin' as const, label: 'Venue', value: `${EVENT.venue.name}, ${EVENT.venue.street}` },
              { icon: 'utensils' as const, label: 'Refreshment', value: 'Hi-Tea' },
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
            {/* ---- programme flow (no artificial time intervals) ---------- */}
            <Reveal>
              <div
                data-reveal
                className="bg-card ring-rule/25 shadow-card rounded-3xl p-6 ring-1 sm:p-9"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/50 pb-5">
                  <div>
                    <span className="text-flame text-label uppercase font-bold tracking-wider">
                      Orientation Day
                    </span>
                    <h2 className="text-headline text-navy mt-1">Programme Flow</h2>
                  </div>
                  <span className="grad-pair shadow-card inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white sm:text-sm">
                    <span>Starts 2:00 PM Sharp</span>
                    <span className="text-white/75 font-semibold">· Saturday, 12 Sep</span>
                  </span>
                </div>

                <p className="text-ink-soft mt-5 text-[0.9375rem] leading-relaxed">
                  Orientation begins at 2:00 PM Sharp. Please ensure you report by 2:00 PM at Gyan Bhawan with your digital pass for smooth entry.
                </p>

                <div className="mt-8 space-y-4">
                  <div className="bg-paper ring-rule/30 flex items-start gap-4 rounded-2xl p-5 ring-1">
                    <span className="bg-sky text-navy mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl font-bold">
                      1
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <h3 className="text-navy text-[1.0625rem] font-bold">
                          Reporting &amp; Entry Verification
                        </h3>
                        <span className="text-flame text-xs font-bold">2:00 PM Sharp</span>
                      </div>
                      <p className="text-ink-faint text-xs font-semibold uppercase mt-0.5">
                        Gyan Bhawan · Main Entrance Lobby
                      </p>
                      <p className="text-ink-soft text-[0.875rem] mt-2 leading-relaxed">
                        Arrive by 2:00 PM Sharp. Show your digital pass on your phone or downloaded PDF to volunteers for instant check-in.
                      </p>
                    </div>
                  </div>

                  <div className="bg-paper ring-rule/30 flex items-start gap-4 rounded-2xl p-5 ring-1">
                    <span className="bg-flame-tint text-flame mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl font-bold">
                      2
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-navy text-[1.0625rem] font-bold">
                        Orientation &amp; Induction Ceremony
                      </h3>
                      <p className="text-ink-faint text-xs font-semibold uppercase mt-0.5">
                        Main Auditorium, Gyan Bhawan
                      </p>
                      <p className="text-ink-soft text-[0.875rem] mt-2 leading-relaxed">
                        Inaugural lamp lighting, welcome address by leadership, introduction of department heads and faculty coordinators, and academic overview.
                      </p>
                    </div>
                  </div>

                  <div className="bg-paper ring-rule/30 flex items-start gap-4 rounded-2xl p-5 ring-1">
                    <span className="bg-violet-tint text-violet-deep mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl font-bold">
                      3
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-navy text-[1.0625rem] font-bold">
                        Department Interactions &amp; Hi-Tea
                      </h3>
                      <p className="text-ink-faint text-xs font-semibold uppercase mt-0.5">
                        Convention Hall, Gyan Bhawan
                      </p>
                      <p className="text-ink-soft text-[0.875rem] mt-2 leading-relaxed">
                        Connect with your department professors, senior student coordinators, and batchmates over Hi-Tea.
                      </p>
                    </div>
                  </div>
                </div>
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
                className="grad-pair shadow-card relative overflow-hidden rounded-2xl p-7"
              >
                <span aria-hidden className="bg-navy/25 absolute inset-0" />
                <div className="relative">
                  <h2 className="text-[1.0625rem] font-bold text-white">Put it in your calendar</h2>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-white/90">
                    Orientation Programme · Saturday, 12 September 2026 at 2:00 PM Sharp.
                  </p>
                  <div className="mt-5">
                    <a
                      href={gcalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white text-navy shadow-button hover:bg-paper focus-visible:outline-white inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-[0.9375rem] font-bold transition-all duration-200 sm:w-auto"
                    >
                      <Icon name="calendar" size={17} />
                      Add to Google Calendar
                    </a>
                  </div>
                </div>
              </section>
            </Reveal>
          </div>
        </Container>
      </Section>
    </>
  )
}
