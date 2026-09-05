'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { useRef } from 'react'
import { CampusPhoto } from '@/components/art/CampusPhoto'
import { Countdown } from '@/components/motion/Countdown'
import { LinkButton } from '@/components/ui/Button'
import { Container, HandNote, IconChip, type Tint } from '@/components/ui/atoms'
import { EVENT } from '@/lib/event'
import { useUserStatus } from '@/lib/client/UserStatusProvider'

gsap.registerPlugin(useGSAP, SplitText)

const FACTS: { icon: 'calendar' | 'pin' | 'people'; tint: Tint; head: string; sub: string }[] = [
  { icon: 'calendar', tint: 'violet', head: EVENT.dateRange, sub: EVENT.timeNote },
  { icon: 'pin', tint: 'flame', head: EVENT.venue.name, sub: EVENT.venue.street },
  { icon: 'people', tint: 'sky', head: EVENT.audience.headline, sub: EVENT.audience.detail },
]

export function Hero() {
  const scope = useRef<HTMLDivElement>(null)
  const { isSignedIn, isRegistered } = useUserStatus()

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

          // `from` would animate to the element's *current* opacity, which the
          // CSS reveal gate has already set to 0 — so every one of these is a
          // `fromTo` with an explicit end value.
          tl.fromTo(
            '[data-hero-eyebrow]',
            { opacity: 0, y: 14 },
            { opacity: 1, y: 0, duration: 0.7 },
            0.05,
          )
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
    <section
      ref={scope}
      className="relative isolate overflow-hidden pt-28 pb-16 md:pt-32 lg:min-h-[38rem] lg:pt-36 lg:pb-20"
    >
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

      {/* ---- copy ---------------------------------------------------------- */}
      <Container className="relative z-10">
        <div className="lg:max-w-[47%]">
          <p
            data-hero
            data-hero-eyebrow
            className="text-headline mb-3 font-bold tracking-tight uppercase"
          >
            <span className="grad-text">Deeksharambh</span>
          </p>

          {/* The `lg:` size cap is load-bearing, not a tweak. `--text-display`
              reaches its 5.25rem ceiling at a 1000px viewport, but at `lg` this
              column narrows to 47% — so between 1024px and ~1290px the word
              ORIENTATION is wider than the box that holds it. SplitText's line
              mask is `overflow: clip`, so the overflow is not a ragged edge, it
              is a missing N. Capping at 6.5vw keeps the word at ~93% of the
              column all the way up, then hands back to the ceiling. */}
          <h1
            data-hero
            data-hero-title
            className="text-display uppercase lg:text-[min(4.5rem,5.5vw)]"
          >
            Student Orientation
            <br />
            Programme <span className="grad-text">2026</span>
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
            When you arrive you will not know where the library is, or anyone&rsquo;s name.
            By the end of the day you will know both. That is what orientation is for.
          </p>

          {/* Flat, not boxed: these are three facts, not three products. */}
          <ul
            data-hero-facts
            className="mt-8 flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:gap-x-8"
          >
            {FACTS.map((f) => (
              <li key={f.head} data-hero className="flex items-center gap-3">
                <IconChip name={f.icon} tint={f.tint} size={42} />
                <span>
                  <span className="text-navy block text-[0.9375rem] leading-tight font-bold">
                    {f.head}
                  </span>
                  <span className="text-ink-faint block text-[0.8125rem] leading-snug">{f.sub}</span>
                </span>
              </li>
            ))}
          </ul>

          <div data-hero data-hero-cta className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            {isRegistered ? (
              <LinkButton href="/pass" size="lg" arrow className="w-full sm:w-auto">
                View your pass
              </LinkButton>
            ) : isSignedIn ? (
              <LinkButton href="/register" size="lg" arrow className="w-full sm:w-auto">
                Complete registration
              </LinkButton>
            ) : (
              <LinkButton href="/register" size="lg" arrow className="w-full sm:w-auto">
                Register now
              </LinkButton>
            )}
            <LinkButton
              href="/schedule"
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto"
            >
              See the schedule
            </LinkButton>
          </div>
        </div>
      </Container>

      {/* ---- art ----------------------------------------------------------
          On a phone this is a rounded picture below the copy. On a wide screen
          it becomes the right half of the page, running to the very edge with
          its left side dissolved into the paper — the campus is the background
          you are standing in, not a thumbnail of it. */}
      <div className="relative mt-14 px-6 sm:mt-16 lg:absolute lg:inset-y-0 lg:right-0 lg:z-0 lg:mt-0 lg:w-[53%] lg:px-0">
        <div
          data-hero
          data-hero-art
          className="relative mx-auto w-full max-w-xl lg:h-full lg:max-w-none"
        >
          <div
            aria-hidden
            className="wash absolute -inset-8 -z-10 opacity-70 lg:hidden"
            style={{ maskImage: 'radial-gradient(70% 70% at 50% 45%, black, transparent)' }}
          />
          <div className="h-full overflow-hidden max-lg:rounded-3xl lg:feather-l">
            <div className="h-full lg:feather-b">
              <CampusPhoto className="aspect-square w-full lg:h-full lg:aspect-auto" />
            </div>
          </div>
        </div>

        {/* Overlapping the art is a wide-screen move only. On a phone the
            timer sits below the picture rather than on top of the building. */}
        <Countdown
          target={EVENT.startsAt}
          data-hero
          data-hero-timer
          className="relative z-20 mx-auto mt-6 w-[min(100%,26rem)] lg:absolute lg:right-8 lg:bottom-14 lg:mx-0 lg:mt-0 lg:w-[21rem]"
        />
      </div>
    </section>
  )
}
