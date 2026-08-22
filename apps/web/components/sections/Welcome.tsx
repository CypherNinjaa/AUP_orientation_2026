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
            You have already done the hard part. You got in. The only thing left is to walk in on the
            first morning, and we have built three days to make that easy.
          </p>

          <p data-reveal className="mt-7">
            <HandNote tilt={-3} className="text-[1.875rem] text-white sm:text-[2.25rem]">
              Come as you are — we&rsquo;ll take it from there.
            </HandNote>
          </p>

          <p data-reveal className="mt-6 text-sm font-semibold tracking-wide text-white/75">
            — The Orientation Team, {EVENT.institution}
          </p>

          <div data-reveal className="mt-10">
            <LinkButton href="/register" variant="onNavy" size="lg" arrow>
              Get your pass
            </LinkButton>
          </div>
        </div>
      </Reveal>
    </div>
  )
}
