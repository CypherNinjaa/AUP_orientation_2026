'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { useRef } from 'react'
import { CampusMorning } from '@/components/art/CampusMorning'
import { Countdown } from '@/components/motion/Countdown'
import { LinkButton } from '@/components/ui/Button'
import { Container, HandNote, IconChip, type Tint } from '@/components/ui/atoms'
import { EVENT } from '@/lib/event'

gsap.registerPlugin(useGSAP, SplitText)

const FACTS: { icon: 'calendar' | 'pin' | 'people'; tint: Tint; head: string; sub: string }[] = [
  { icon: 'calendar', tint: 'violet', head: EVENT.dateRange, sub: EVENT.timeNote },
  { icon: 'pin', tint: 'flame', head: EVENT.venue.name, sub: `${EVENT.venue.street}, ${EVENT.venue.city}` },
  { icon: 'people', tint: 'sky', head: EVENT.audience.headline, sub: EVENT.audience.detail },
]

export function Hero() {
  const scope = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()

      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set('[data-hero]', { opacity: 1, clearProps: 'all' })
      })

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Wait for the display face: splitting before it lands breaks lines in
        // the wrong places and the reveal masks the wrong rectangles.
        let split: SplitText | undefined
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, paused: true })

        void document.fonts.ready.then(() => {
          const headline = scope.current?.querySelector<HTMLElement>('[data-hero-title]')
          if (headline) {
            split = SplitText.create(headline, { type: 'lines', mask: 'lines' })
            gsap.set(headline, { opacity: 1 })
            tl.from(split.lines, { yPercent: 118, duration: 1.05, stagger: 0.1 }, 0)
          }

          tl.from('[data-hero-eyebrow]', { opacity: 0, y: 14, duration: 0.7 }, 0.05)
            .to('[data-hero-eyebrow]', { opacity: 1, duration: 0.01 }, 0.05)
            .fromTo(
              '[data-hero-note]',
              { opacity: 0, scale: 0.86, rotate: -14 },
              { opacity: 1, scale: 1, rotate: -6, duration: 0.8, ease: 'back.out(2)' },
              0.75,
            )
            .fromTo(
              ['[data-hero-lede]', '[data-hero-facts] > *', '[data-hero-cta]'],
              { opacity: 0, y: 20 },
              { opacity: 1, y: 0, duration: 0.75, stagger: 0.07 },
              0.5,
            )
            .fromTo(
              '[data-hero-art]',
              { opacity: 0, scale: 1.06, xPercent: 3 },
              { opacity: 1, scale: 1, xPercent: 0, duration: 1.4 },
              0.15,
            )
            .fromTo(
              '[data-hero-timer]',
              { opacity: 0, y: 26 },
              { opacity: 1, y: 0, duration: 0.8 },
              1.0,
            )

          tl.play()
        })

        return () => {
          tl.kill()
          split?.revert()
        }
      })

      return () => mm.revert()
    },
    { scope },
  )

  return (
    <div ref={scope} className="relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24">
      {/* ---- ambient decor ------------------------------------------------ */}
      <div
        aria-hidden
        className="dots pointer-events-none absolute top-40 -left-6 h-72 w-40 opacity-45 [mask-image:linear-gradient(to_right,black,transparent)]"
      />
      <div
        aria-hidden
        className="bg-violet-tint float-slow pointer-events-none absolute -top-16 right-1/4 size-96 rounded-full opacity-45 blur-3xl"
      />
      <div
        aria-hidden
        className="bg-flame-tint float-slow float-delay pointer-events-none absolute top-1/3 -right-24 size-80 rounded-full opacity-50 blur-3xl"
      />

      <Container className="relative grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        {/* ---- copy ------------------------------------------------------- */}
        <div>
          <p
            data-hero
            data-hero-eyebrow
            className="text-headline mb-3 font-bold tracking-tight uppercase"
          >
            <span className="text-violet">Your</span> <span className="text-navy">journey.</span>{' '}
            <span className="text-flame">Our</span> <span className="text-navy">community.</span>
          </p>

          <h1 data-hero data-hero-title className="text-display uppercase">
            Orientation
            <br />
            <span className="grad-text">2026</span>
          </h1>

          <p className="relative -mt-1 mb-7 h-12 md:h-14">
            <HandNote
              data-hero
              data-hero-note
              tilt={-6}
              underline
              className="text-flame absolute left-1 text-[2.25rem] md:text-[2.75rem]"
            >
              Let&rsquo;s begin together!
            </HandNote>
          </p>

          <p data-hero data-hero-lede className="text-lede text-ink-soft max-w-lg">
            On the first morning you will not know where the library is, or anyone&rsquo;s name.
            Three days later you will know both. That is what orientation is for.
          </p>

          <ul data-hero-facts className="mt-9 grid gap-3 sm:grid-cols-3">
            {FACTS.map((f) => (
              <li
                key={f.head}
                data-hero
                className="bg-card ring-rule/25 shadow-soft flex items-center gap-3.5 rounded-2xl p-4 ring-1"
              >
                <IconChip name={f.icon} tint={f.tint} size={44} />
                <span className="min-w-0">
                  <span className="text-navy block text-[0.9375rem] leading-tight font-bold">
                    {f.head}
                  </span>
                  <span className="text-ink-faint block text-[0.8125rem] leading-snug">{f.sub}</span>
                </span>
              </li>
            ))}
          </ul>

          <div data-hero data-hero-cta className="mt-9 flex flex-wrap items-center gap-3">
            <LinkButton href="/register" size="lg" arrow>
              Register now
            </LinkButton>
            <LinkButton href="/schedule" size="lg" variant="secondary">
              See the three days
            </LinkButton>
          </div>
        </div>

        {/* ---- art -------------------------------------------------------- */}
        <div className="relative">
          <div
            aria-hidden
            className="wash absolute -inset-6 -z-10 opacity-70 sm:-inset-10"
            style={{ maskImage: 'radial-gradient(70% 70% at 50% 45%, black, transparent)' }}
          />
          <div data-hero data-hero-art className="brush overflow-hidden">
            <CampusMorning className="aspect-4/3 w-full" />
          </div>

          <Countdown
            target={EVENT.startsAt}
            data-hero
            data-hero-timer
            className="relative z-10 mx-auto -mt-12 w-[min(100%,26rem)] sm:-mt-14 lg:absolute lg:right-0 lg:-bottom-8 lg:mx-0 lg:mt-0 lg:w-[22rem]"
          />
        </div>
      </Container>
    </div>
  )
}
