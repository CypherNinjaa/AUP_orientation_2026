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
 * On a wide screen the three cards float over the portrait, as in the design. On
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
        {/* The art column is the wider of the two: it carries a 4:5 portrait and
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

          {/* ---- art ------------------------------------------------------- */}
          <div className="relative lg:py-14">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-4 -top-6 -bottom-6 -z-10"
            >
              {/* The blob the portrait sits on, plus two offset frames behind it
                  so the picture reads as the top layer of a stack. The filled
                  one is faint on purpose: at any real weight it competes with
                  the portrait instead of seating it. */}
              <div className="wash-dev absolute inset-0 rounded-[45%]" />
              <div className="grad-dev absolute inset-x-14 top-10 bottom-10 rotate-[7deg] rounded-[2.5rem] opacity-[0.14]" />
              <div className="ring-berry/25 absolute inset-x-16 top-14 bottom-14 -rotate-3 rounded-[2.25rem] ring-1" />
            </div>

            <div className="relative mx-auto w-[78%] max-w-[20rem] lg:max-w-[23.5rem]">
              {/* The frame owns the ratio, the image is object-cover inside it:
                  dropping in a real photograph of any size moves nothing. The
                  ring is opaque white — over the wash a translucent one takes
                  the violet underneath and the portrait loses its edge. */}
              <div className="shadow-glass relative aspect-4/5 overflow-hidden rounded-[2.25rem] ring-8 ring-white">
                <Image
                  src={DEVELOPER.portrait}
                  alt=""
                  fill
                  priority
                  sizes="(min-width: 1024px) 22rem, 78vw"
                  className="object-cover"
                />
              </div>
              {/* Glow along the bottom edge, so the portrait is lit by the wash. */}
              <div
                aria-hidden
                className="grad-dev absolute -bottom-3 left-1/2 h-8 w-3/4 -translate-x-1/2 rounded-full opacity-45 blur-xl"
              />
            </div>

            {/* Static below lg, floated at lg. The wrapper is not a positioned
                ancestor, so the absolute children resolve against the art box.
                Each card is pushed outward past the column edge so it clips one
                corner of the portrait rather than sitting on top of it — the
                picture is the subject here, the cards are annotations on it. */}
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-0 lg:block">
              <CodeCard
                data-reveal
                className="lg:absolute lg:top-1 lg:-right-2 lg:z-10 lg:w-[14.5rem]"
              />
              <DeveloperProfileCard
                data-reveal
                className="lg:absolute lg:top-[48%] lg:-right-4 lg:z-10 lg:w-[13.5rem]"
              />
              <TerminalCard
                data-reveal
                className="sm:col-span-2 lg:absolute lg:bottom-1 lg:-left-5 lg:z-10 lg:w-[16.5rem]"
              />
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
