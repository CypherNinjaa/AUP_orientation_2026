import { Reveal } from '@/components/motion/Reveal'
import { LinkButton } from '@/components/ui/Button'
import { HandNote } from '@/components/ui/atoms'
import { EVENT } from '@/lib/event'

/**
 * The one direct address on the page.
 *
 * Deliberately *not* a testimonial: we are not going to attribute invented
 * sentences to invented students on a real university site. This is the
 * orientation team speaking in its own voice, which is both honest and does the
 * emotional work a fake quote was going to do.
 */
export function Welcome() {
  return (
    <div className="px-6 pb-8 md:pb-16">
      <Reveal
        stagger={0.09}
        className="grad-pair relative mx-auto w-full max-w-[var(--container-page)] overflow-hidden rounded-3xl px-8 py-14 md:px-16 md:py-20"
      >
        {/* Navy scrim. The flame end of `grad-pair` is #ca6c00, and pure white
            on it is only 3.7:1 — fine for the 26px headline, a fail for the
            14px signature. Deepening the whole card toward the shield navy
            fixes the contrast and stops the gradient reading as a wrapper. */}
        <div aria-hidden className="bg-navy/25 pointer-events-none absolute inset-0" />
        {/* soft light to keep the gradient from reading as flat vinyl */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-24 size-[28rem] rounded-full bg-white/18 blur-3xl"
        />
        <div aria-hidden className="dots pointer-events-none absolute inset-0 opacity-[0.07]" />

        <div className="relative mx-auto max-w-3xl text-center">
          <p data-reveal className="text-white/80 text-label uppercase">
            A note before you arrive
          </p>

          <p
            data-reveal
            className="mt-6 text-[1.625rem] leading-[1.35] font-extrabold tracking-tight text-white sm:text-[2.125rem]"
          >
            You have already done the hard part. You got in. The only thing left is to walk in at
            2:00 PM Sharp on 14 September, and we have built orientation day to make that easy.
          </p>

          <p data-reveal className="mt-7">
            <HandNote tilt={-3} className="text-[1.875rem] text-white sm:text-[2.25rem]">
              Come as you are — we&rsquo;ll take it from there.
            </HandNote>
          </p>

          <p data-reveal className="mt-6 text-sm font-semibold tracking-wide text-white/90">
            — The Orientation Team, {EVENT.institution}
          </p>

          <div data-reveal className="mt-10">
            {/* Not "get your pass". This is the closing emotional beat, and the
                pass is the receipt, not the reason. */}
            <LinkButton href="/register" variant="onNavy" size="lg" arrow>
              Save your place
            </LinkButton>
          </div>
        </div>
      </Reveal>
    </div>
  )
}
