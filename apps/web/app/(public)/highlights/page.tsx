import type { Metadata } from 'next'
import { CtaBand } from '@/components/sections/CtaBand'
import { PhotoStack } from '@/components/art/PhotoStack'
import { Reveal } from '@/components/motion/Reveal'
import { PageHeader } from '@/components/site/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { QuoteCard } from '@/components/ui/QuoteCard'
import { ACCENT, Container, IconChip, Section, SectionHeading } from '@/components/ui/atoms'
import { BEYOND, EVENT, HIGHLIGHTS, HIGHLIGHT_STATS } from '@/lib/event'

export const metadata: Metadata = {
  title: 'Highlights',
  description:
    'The lamp lighting, the clubs fair, the campus walk, the cultural evening and the senior mentors — the five things people remember from orientation.',
}

export default function HighlightsPage() {
  const [feature, ...rest] = HIGHLIGHTS

  return (
    <>
      <PageHeader
        crumb="Highlights"
        eyebrow={`${EVENT.programme} · ${EVENT.year}`}
        title={
          <>
            What you will <span className="grad-text">remember</span>
          </>
        }
        note="long after the timetable is gone"
        lede="Five moments across the three days. None of them are the parts you would guess from a schedule."
        aside={<PhotoStack className="mx-auto max-w-md lg:max-w-none" />}
      />

      {/* ---- the stat strip ---------------------------------------------- */}
      <div className="px-6">
        <Reveal
          stagger={0.06}
          className="bg-card ring-rule/25 shadow-card mx-auto grid w-full max-w-[var(--container-page)] grid-cols-2 gap-y-8 rounded-3xl px-7 py-9 ring-1 sm:grid-cols-3 md:px-10 lg:grid-cols-5"
        >
          {HIGHLIGHT_STATS.map((s) => (
            <div key={s.label} data-reveal className="px-1">
              <span className="text-violet-deep mb-3 block">
                <Icon name={s.icon} size={22} />
              </span>
              <p className="tnum text-navy text-[2.125rem] leading-none font-extrabold tracking-tight">
                {s.value}
              </p>
              <p className="text-ink-soft mt-1.5 text-[0.8125rem] leading-snug font-semibold">
                {s.label}
              </p>
            </div>
          ))}
        </Reveal>
      </div>

      {/* ---- the five moments -------------------------------------------- */}
      <Section id="moments">
        <Container>
          <Reveal stagger={0.07}>
            <SectionHeading
              eyebrow="What makes it special"
              title="Five moments, in the order the days give them to you"
              align="left"
              className="mb-12 max-w-3xl"
            />

            <ul className="grid gap-6 lg:grid-cols-2">
              {feature ? (
                <li
                  data-reveal
                  className="bg-card ring-rule/25 shadow-card relative overflow-hidden rounded-3xl p-8 ring-1 md:p-11 lg:col-span-2"
                >
                  <div aria-hidden className="wash pointer-events-none absolute -top-28 -right-20 size-[24rem] opacity-60" />
                  <div className="relative grid gap-8 md:grid-cols-[auto_1fr] md:gap-10">
                    <IconChip name={feature.icon} tint={feature.tint} size={72} />
                    <div>
                      <p className="text-label text-flame uppercase">{feature.kicker}</p>
                      <h3 className="text-title mt-2 max-w-[24ch]">{feature.title}</h3>
                      <p className="text-lede text-navy mt-5 max-w-2xl font-semibold">{feature.body}</p>
                      <p className="text-ink-soft mt-4 max-w-2xl leading-relaxed">{feature.more}</p>
                    </div>
                  </div>
                  <span aria-hidden className={`absolute inset-x-0 bottom-0 h-1.5 ${ACCENT[feature.tint]}`} />
                </li>
              ) : null}

              {rest.map((h) => (
                <li
                  key={h.title}
                  data-reveal
                  className="bg-card ring-rule/25 shadow-soft relative overflow-hidden rounded-3xl p-8 ring-1"
                >
                  <IconChip name={h.icon} tint={h.tint} size={56} />
                  <p className="text-label text-flame mt-6 uppercase">{h.kicker}</p>
                  <h3 className="text-headline mt-1.5">{h.title}</h3>
                  <p className="text-navy mt-4 font-semibold">{h.body}</p>
                  <p className="text-ink-soft mt-3 text-[0.9375rem] leading-relaxed">{h.more}</p>
                  <span aria-hidden className={`absolute inset-x-0 bottom-0 h-1.5 ${ACCENT[h.tint]}`} />
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </Section>

      {/* ---- the smaller things ------------------------------------------ */}
      <Section id="beyond" className="bg-card border-rule/40 border-y">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <Reveal>
              <SectionHeading
                eyebrow="And then the rest of it"
                title="Nobody plans these. Everybody remembers them."
                lede="Four things that are on no schedule and in no brochure."
                align="left"
              />
              <div data-reveal className="mt-10 hidden lg:block">
                <QuoteCard
                  quote="You will forget which hall the induction was in. You will not forget who you sat next to."
                  note="Make it unforgettable!"
                />
              </div>
            </Reveal>

            <Reveal stagger={0.07}>
              <ul className="divide-rule/50 border-rule/50 divide-y border-y">
                {BEYOND.map((b) => (
                  <li key={b.title} data-reveal className="flex gap-5 py-7">
                    <span aria-hidden className="grad-pair mt-2.5 h-px w-8 shrink-0 rounded-full" />
                    <div className="min-w-0">
                      <h3 className="text-subhead">{b.title}</h3>
                      <p className="text-ink-soft mt-1.5 leading-relaxed">{b.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </Container>
      </Section>

      <CtaBand
        icon="heart"
        tint="flame"
        title="Be in the room for it"
        body={`${EVENT.dateRange}. Register once and your pass covers all three days, plus one guest.`}
      />
    </>
  )
}
