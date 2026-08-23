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

          {/* ---- art ------------------------------------------------------- */}
          <div className="relative lg:py-14">
            {/* No frame, no ring, no offset panels.
                The supplied artwork is a transparent cut-out: the subject
                already sits on their own gradient blob, with a `</>` chip, a
                paper plane and a dot grid arranged around them. A rounded
                white frame over that would crop the paper plane and the dots
                off the composition and cut a hard edge through the blob, and
                the two offset panels that used to sit behind the picture were
                there to seat an opaque rectangle — there is no rectangle now.
                So the artwork is placed rather than framed, and the only
                decoration left is the section wash above, which it sits in. */}
            <div className="relative mx-auto w-full max-w-[27rem] lg:max-w-[34rem]">
              <Image
                src={DEVELOPER.heroArt}
                width={DEVELOPER.heroArtSize.width}
                height={DEVELOPER.heroArtSize.height}
                alt=""
                priority
                className="h-auto w-full"
              />
            </div>

            {/* Static below lg, floated at lg. The wrapper is not a positioned
                ancestor, so the absolute children resolve against the art box.
                Each card is pushed outward past the column edge so it clips one
                corner of the artwork rather than sitting on top of it — the
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
                /* Capped and centred rather than stretched across both columns:
                   the terminal is a fixed eight-row block about 235px wide, so a
                   full-width card just adds empty dark space to its right. */
                className="sm:col-span-2 sm:mx-auto sm:max-w-md lg:absolute lg:bottom-1 lg:-left-5 lg:z-10 lg:w-[16.5rem] lg:max-w-none"
              />
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
