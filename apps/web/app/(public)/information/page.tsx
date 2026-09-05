import type { Metadata } from 'next'
import Link from 'next/link'
import { CtaBand } from '@/components/sections/CtaBand'
import { Reveal } from '@/components/motion/Reveal'
import { PageHeader } from '@/components/site/PageHeader'
import { LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Container, HandNote, IconChip, Section, SectionHeading } from '@/components/ui/atoms'
import {
  ARRIVAL_TILES,
  AT_THE_GATE,
  BRING,
  EVENT,
  GETTING_HERE,
  IF_IT_GOES_WRONG,
  PRACTICALS,
} from '@/lib/event'

export const metadata: Metadata = {
  title: 'Information',
  description:
    'What to bring, how to get to Bailey Road, what happens at Gate 1, and the practical answers — food, dress, accessibility, weather.',
}

const JUMP = [
  { href: '#arrive', label: 'The four facts' },
  { href: '#bring', label: 'What to bring' },
  { href: '#getting-here', label: 'Getting here' },
  { href: '#gate', label: 'At the gate' },
  { href: '#practicals', label: 'Food, dress, access' },
] as const

export default function InformationPage() {
  return (
    <>
      <PageHeader
        crumb="Information"
        eyebrow="Before you come"
        title={
          <>
            The <span className="grad-text">practical</span> half
          </>
        }
        lede="Where to be, what to carry, what happens at the gate, and what to do if something goes wrong. No surprises on the morning."
        aside={
          <nav
            aria-label="On this page"
            className="bg-card ring-rule/30 shadow-card rounded-3xl px-7 py-7 ring-1"
          >
            <p className="text-label text-ink-faint mb-4 uppercase">On this page</p>
            <ul className="divide-rule/40 divide-y">
              {JUMP.map((j) => (
                <li key={j.href}>
                  <Link
                    href={j.href}
                    className="text-navy hover:text-violet-deep group flex items-center justify-between gap-4 py-3 font-bold transition-colors"
                  >
                    {j.label}
                    <span className="text-rule group-hover:text-violet transition-colors">
                      <Icon name="chevronRight" size={16} strokeWidth={2.2} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        }
      />

      {/* ---- the four facts ---------------------------------------------- */}
      <Section id="arrive" className="pb-0 md:pb-0">
        <Container>
          <Reveal stagger={0.06}>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {ARRIVAL_TILES.map((t) => (
                <li
                  key={t.label}
                  data-reveal
                  className="bg-card ring-rule/25 shadow-soft rounded-2xl p-6 ring-1"
                >
                  <IconChip name={t.icon} tint="violet" size={42} />
                  <p className="text-label text-ink-faint mt-5 uppercase">{t.label}</p>
                  <p className="text-navy mt-1 text-[1.0625rem] leading-snug font-bold">{t.value}</p>
                  <p className="text-ink-soft mt-1.5 text-sm leading-relaxed">{t.note}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </Section>

      {/* ---- what to bring ----------------------------------------------- */}
      <Section id="bring">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <Reveal>
              <SectionHeading
                eyebrow="What to bring"
                title="Six things in your bag"
                lede="Everything else you need on the day is handed to you at the foyer desk."
                align="left"
              />
              <p data-reveal className="mt-8">
                <HandNote tilt={-3} className="text-violet-deep text-[1.75rem]">
                  Pack it the night before.
                </HandNote>
              </p>
            </Reveal>

            <Reveal stagger={0.06}>
              <ul
                data-reveal
                className="bg-card ring-rule/25 shadow-card divide-rule/40 divide-y rounded-3xl px-7 py-3 ring-1"
              >
                {BRING.map((b) => (
                  <li key={b.label} className="flex items-start gap-4 py-4">
                    <span className="bg-leaf-tint text-leaf mt-0.5 grid size-7 shrink-0 place-items-center rounded-full">
                      <Icon name="check" size={15} strokeWidth={2.6} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-navy font-bold">{b.label}</p>
                      <p className="text-ink-soft text-[0.9375rem]">{b.note}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* ---- getting here ------------------------------------------------ */}
      <Section id="getting-here" className="bg-card border-rule/40 border-y">
        <Container>
          <Reveal stagger={0.06}>
            <SectionHeading
              eyebrow="Getting here"
              title="Every arrival on 14 September is through Gate 1"
              lede={`${EVENT.venue.name}, ${EVENT.venue.street}, ${EVENT.venue.city}.`}
              align="left"
              className="mb-12 max-w-3xl"
            />

            <ul className="grid gap-6 sm:grid-cols-2">
              {GETTING_HERE.map((g) => (
                <li key={g.title} data-reveal className="flex gap-5">
                  <IconChip name={g.icon} tint="flame" size={48} />
                  <div className="min-w-0">
                    <h3 className="text-[1.0625rem] font-bold">{g.title}</h3>
                    <p className="text-ink-soft mt-1.5 text-[0.9375rem] leading-relaxed">{g.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div data-reveal className="mt-11">
              <LinkButton
                href={EVENT.venue.mapsUrl}
                variant="secondary"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="pin" size={18} />
                Open the map pin
              </LinkButton>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* ---- at the gate ------------------------------------------------- */}
      <Section id="gate">
        <Container>
          <Reveal stagger={0.06}>
            <SectionHeading
              eyebrow="At the gate"
              title="Three steps, about a minute"
              align="left"
              className="mb-12 max-w-3xl"
            />

            {/* Numbered here because it genuinely is a sequence — you cannot
                collect a kit before you have been verified. */}
            <ol className="grid gap-6 md:grid-cols-3">
              {AT_THE_GATE.map((s, i) => (
                <li
                  key={s.step}
                  data-reveal
                  className="bg-card ring-rule/25 shadow-soft relative rounded-2xl p-7 ring-1"
                >
                  <span
                    aria-hidden
                    className="grad-text tnum block text-[2.5rem] leading-none font-extrabold"
                  >
                    {i + 1}
                  </span>
                  <h3 className="text-navy mt-3 text-[1.0625rem] font-bold">{s.step}</h3>
                  <p className="text-ink-soft mt-2 text-[0.9375rem] leading-relaxed">{s.body}</p>
                </li>
              ))}
            </ol>

            <div
              data-reveal
              className="bg-navy relative mt-8 overflow-hidden rounded-3xl px-7 py-8 md:px-10 md:py-9"
            >
              <div aria-hidden className="bg-flame/12 pointer-events-none absolute -top-24 -right-16 size-72 rounded-full blur-3xl" />
              <div className="relative">
                <h3 className="text-headline text-white">If something goes wrong</h3>
                <p className="text-sky/80 mt-2 max-w-2xl">
                  All three of these are planned for. None of them will keep you outside.
                </p>
                <ul className="mt-8 grid gap-7 md:grid-cols-3">
                  {IF_IT_GOES_WRONG.map((w) => (
                    <li key={w.title}>
                      <span className="text-flame-mid mb-3 block">
                        <Icon name={w.icon} size={22} />
                      </span>
                      <h4 className="font-bold text-white">{w.title}</h4>
                      <p className="text-sky/75 mt-1.5 text-[0.9375rem] leading-relaxed">{w.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* ---- practicals -------------------------------------------------- */}
      <Section id="practicals" className="bg-card border-rule/40 border-y">
        <Container>
          <Reveal stagger={0.05}>
            <SectionHeading
              eyebrow="The practical answers"
              title="Food, dress, weather, access, and being photographed"
              className="mb-14"
            />

            <ul className="grid gap-x-10 gap-y-9 md:grid-cols-2 lg:grid-cols-3">
              {PRACTICALS.map((p) => (
                <li key={p.title} data-reveal>
                  <IconChip name={p.icon} tint="sky" size={46} />
                  <h3 className="mt-4 text-[1.0625rem] font-bold">{p.title}</h3>
                  <p className="text-ink-soft mt-1.5 text-[0.9375rem] leading-relaxed">{p.body}</p>
                </li>
              ))}
            </ul>

            <p data-reveal className="text-ink-soft mt-14 text-center">
              Still not answered?{' '}
              <Link href="/#faq" className="text-violet-deep font-bold hover:underline">
                Read the FAQ
              </Link>{' '}
              or{' '}
              <Link href="/contact" className="text-violet-deep font-bold hover:underline">
                ask a person
              </Link>
              .
            </p>
          </Reveal>
        </Container>
      </Section>

      <CtaBand
        icon="flag"
        title="One thing left to do"
        body="Register, and your pass — plus your guest's place — is on the gate list before you travel."
      />
    </>
  )
}
