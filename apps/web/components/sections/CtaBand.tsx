import { Reveal } from '@/components/motion/Reveal'
import { LinkButton } from '@/components/ui/Button'
import type { IconName } from '@/components/ui/Icon'
import { IconChip, type Tint } from '@/components/ui/atoms'

/**
 * The closing ask, used at the foot of every subpage.
 *
 * The copy is a prop rather than a constant: a page about what to bring should
 * close differently from a page about why the programme is three days long, and
 * the same sentence repeated six times is how a site starts to feel generated.
 *
 * White rather than the home page's gradient card — it sits directly above the
 * navy footer, and two saturated slabs in a row bury each other.
 */
export function CtaBand({
  icon = 'flag',
  tint = 'violet',
  title,
  body,
  cta = 'Register now',
  href = '/register',
}: {
  icon?: IconName
  tint?: Tint
  title: string
  body: string
  cta?: string
  href?: string
}) {
  return (
    <div className="px-6 pt-4 pb-20 md:pb-28">
      <Reveal
        stagger={0.06}
        className="bg-card ring-rule/30 shadow-card relative mx-auto flex w-full max-w-[var(--container-page)] flex-col gap-7 overflow-hidden rounded-3xl px-7 py-8 ring-1 md:flex-row md:items-center md:gap-9 md:px-11 md:py-10"
      >
        {/* Brand colour as an edge, not a fill. */}
        <span aria-hidden className="grad-pair absolute inset-y-0 left-0 w-1.5" />

        <IconChip data-reveal name={icon} tint={tint} size={56} className="shrink-0" />

        <div data-reveal className="flex-1">
          <h2 className="text-headline">{title}</h2>
          <p className="text-ink-soft mt-2 max-w-xl text-[0.9375rem] leading-relaxed">{body}</p>
        </div>

        <div data-reveal className="shrink-0">
          <LinkButton href={href} size="lg" arrow>
            {cta}
          </LinkButton>
        </div>
      </Reveal>
    </div>
  )
}
