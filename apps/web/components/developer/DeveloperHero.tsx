import Image from 'next/image'
import { Container } from '@/components/ui/atoms'
import { Reveal } from '@/components/motion/Reveal'
import { DEVELOPER, SOCIALS } from '@/lib/developer'
import { DevEyebrow } from './DevHeading'
import { TechMark } from './TechMark'
import { CodeCard } from './CodeCard'
import { DeveloperProfileCard } from './DeveloperProfileCard'
import { TerminalCard } from './TerminalCard'

/**
 * The hero.
 *
 * On a wide screen the three cards float over the artwork, as in the design. On
 * anything narrower they are not shrunk or dropped — they become a normal
 * stacked group underneath it, which is the only honest way to show three
 * information-carrying cards on a 375px screen.
 */
export function DeveloperHero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-16 md:pt-32 md:pb-24">
      {/* Ambient page wash. Decorative, sits behind everything. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="wash-dev absolute -top-40 -right-24 h-[34rem] w-[34rem] opacity-40" />
        <div className="dots absolute inset-x-0 top-24 h-64 opacity-[0.45]" />
      </div>

      <Container>
        {/* The art column is the wider of the two: it carries the artwork and
            three cards ringing it, and at an even split the cards covered most
            of the picture. */}
        <Reveal className="grid items-center gap-14 lg:grid-cols-[1fr_1.18fr] lg:gap-10">
          {/* ---- copy ------------------------------------------------------ */}
          <div>
            <DevEyebrow data-reveal align="left">
              Meet the developer
            </DevEyebrow>

            <h1 data-reveal className="text-dev-display mt-5">
              The mind behind
              <br />
              <span className="grad-dev-text">Orientation 2026</span>
            </h1>

            <p data-reveal className="text-lede text-ink-soft mt-6 max-w-lg">
              Designing experiences. Writing code. Solving problems.
              <br className="hidden sm:inline" /> Building {DEVELOPER.project} with passion and
              purpose.
            </p>

            <ul data-reveal className="mt-8 flex flex-wrap gap-3">
              {SOCIALS.map((social) => (
                <li key={social.key}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="bg-card ring-rule/50 shadow-soft hover:ring-berry/60 hover:shadow-card group inline-flex items-center gap-2.5 rounded-full py-2.5 pr-4 pl-3 text-sm font-semibold ring-1 transition-all duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5"
                  >
                    <TechMark name={social.key} size={18} />
                    <span className="text-navy">{social.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* ---- art & showcase ------------------------------------------- */}
          <div className="relative lg:py-12">
            {/* Ambient back-glow matching the photo's warm aesthetic */}
            <div
              aria-hidden
              className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-tr from-violet-600/25 via-berry/20 to-flame/30 blur-2xl opacity-70 -z-10"
            />

            {/* Framed showcase portrait */}
            <div className="relative mx-auto w-full max-w-[26rem] lg:max-w-[28.5rem] overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-white/25 bg-navy/90 group">
              <Image
                src={DEVELOPER.heroArt}
                width={DEVELOPER.heroArtSize.width}
                height={DEVELOPER.heroArtSize.height}
                alt={`${DEVELOPER.fullName} — ${DEVELOPER.role}`}
                priority
                className="h-auto w-full object-cover transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.02]"
              />

              {/* Status badge over the photo */}
              <div className="absolute top-4 left-4 inline-flex items-center gap-2 rounded-full bg-navy/70 backdrop-blur-md px-3.5 py-1.5 text-xs font-semibold text-white/95 border border-white/20 shadow-lg">
                <span className="size-2 rounded-full bg-leaf animate-pulse" />
                <span>Lead Architect & Full Stack</span>
              </div>
            </div>

            {/* Floating interactive cards positioned harmoniously around the portrait */}
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-0 lg:block">
              <CodeCard
                data-reveal
                className="lg:absolute lg:-top-5 lg:-right-6 lg:z-20 lg:w-[15rem] shadow-glass"
              />
              <DeveloperProfileCard
                data-reveal
                className="lg:absolute lg:top-[44%] lg:-right-10 lg:z-20 lg:w-[15.5rem] shadow-glass"
              />
              <TerminalCard
                data-reveal
                className="sm:col-span-2 sm:mx-auto sm:max-w-md lg:absolute lg:-bottom-6 lg:-left-8 lg:z-20 lg:w-[18.5rem] lg:max-w-none shadow-glass"
              />
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
