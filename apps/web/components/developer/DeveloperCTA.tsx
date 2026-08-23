import Image from 'next/image'
import { Container } from '@/components/ui/atoms'
import { Reveal } from '@/components/motion/Reveal'
import { LinkButton } from '@/components/ui/Button'
import { SOCIALS } from '@/lib/developer'
import { TechMark } from './TechMark'

/**
 * The closing band.
 *
 * "View My Work" points at the site itself, because on this page the work is
 * Orientation 2026. The GitHub button goes to the real profile.
 */
export function DeveloperCTA() {
  const github = SOCIALS.find((s) => s.key === 'github')

  return (
    <section className="grad-dev relative overflow-hidden py-20 md:py-24">
      {/* Decoration. Every layer is behind the copy and none is read out. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* The figure the drawn silhouette stood in for: a back view, no face,
            already cut out against transparency — so it needs no plate and no
            mask to sit on the gradient. Held at 55% because the copy above it is
            centred and on a 768px screen there is barely a gutter to clear; at
            full strength the hoodie reads as a second subject competing with the
            heading, and at the old 20% ghost the violet rim light disappears.
            Hidden below md, where there is no gutter at all. */}
        <div className="absolute bottom-0 left-0 hidden h-[85%] opacity-55 md:block lg:h-[95%]">
          <Image
            src="/assets/developer/cta-figure.webp"
            width={720}
            height={803}
            alt=""
            className="h-full w-auto"
          />
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
