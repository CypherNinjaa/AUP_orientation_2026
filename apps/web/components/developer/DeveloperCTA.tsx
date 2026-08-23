import { Container } from '@/components/ui/atoms'
import { Reveal } from '@/components/motion/Reveal'
import { LinkButton } from '@/components/ui/Button'
import { SOCIALS } from '@/lib/developer'
import { TechMark } from './TechMark'

/**
 * The closing band.
 *
 * "View My Work" points at the site itself, because on this page the work is
 * Orientation 2026. The GitHub button uses the placeholder profile URL from
 * lib/developer.ts and resolves nowhere until that is replaced.
 */

/** An unnamed figure. No face, no features — a shape, not a person. */
function Silhouette() {
  return (
    <svg
      viewBox="0 0 160 260"
      aria-hidden
      className="h-full w-auto fill-white/20"
      preserveAspectRatio="xMinYMax meet"
    >
      <circle cx="78" cy="42" r="30" />
      <path d="M78 80c34 0 58 22 62 54l8 126H8l8-126c4-32 28-54 62-54Z" />
      <path d="M18 150 0 210l10 4 20-56Z" />
      <path d="M138 150l18 60-10 4-20-56Z" />
    </svg>
  )
}

export function DeveloperCTA() {
  const github = SOCIALS.find((s) => s.key === 'github')

  return (
    <section className="grad-dev relative overflow-hidden py-20 md:py-24">
      {/* Decoration. Both layers are behind the copy and neither is read out. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute bottom-0 left-0 hidden h-[85%] md:block lg:h-[95%]">
          <Silhouette />
        </div>
        <span className="absolute top-8 right-6 font-mono text-[6rem] leading-none font-bold text-white/15 select-none md:text-[9rem] lg:right-16">
          {'</>'}
        </span>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.22),transparent_60%)]" />
      </div>

      <Container className="relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2
            data-reveal
            className="text-3xl leading-tight font-extrabold tracking-tight text-white sm:text-4xl md:text-[2.75rem]"
          >
            Thanks for being part of this incredible journey! <span aria-hidden>❤️</span>
          </h2>
          <p data-reveal className="mt-5 text-base text-white/90 sm:text-lg">
            Built with passion. Designed with purpose. Created for you.
          </p>
          <div
            data-reveal
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <LinkButton href="/" variant="navy" arrow>
              View My Work
            </LinkButton>
            {github === undefined ? null : (
              <LinkButton
                href={github.href}
                variant="onNavy"
                target="_blank"
                rel="noreferrer noopener"
              >
                <TechMark name="github" size={18} />
                GitHub
              </LinkButton>
            )}
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
