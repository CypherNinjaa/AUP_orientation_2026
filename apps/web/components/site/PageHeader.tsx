import Link from 'next/link'
import type { ReactNode } from 'react'
import { Reveal } from '@/components/motion/Reveal'
import { Icon } from '@/components/ui/Icon'
import { Container, Eyebrow, HandNote } from '@/components/ui/atoms'
import { cn } from '@/lib/cn'

/**
 * The band every subpage opens with.
 *
 * Deliberately *not* a second hero: the home page owns the big drawn campus and
 * the countdown, and repeating that at the top of six more pages would flatten
 * the difference between "the front door" and "a room inside". This is quieter —
 * a breadcrumb, a large title, one line of handwriting, and an optional aside.
 *
 * It also clears the fixed 5rem header, which every page below it relies on.
 */
export function PageHeader({
  eyebrow,
  title,
  note,
  lede,
  crumb,
  aside,
  children,
}: {
  eyebrow: ReactNode
  title: ReactNode
  /** Handwritten line under the title. One short phrase, or leave it out. */
  note?: string
  lede?: ReactNode
  /** Current page name for the breadcrumb. */
  crumb: string
  /** Card, art or fact panel on the right at `lg`. */
  aside?: ReactNode
  /** Buttons or extras below the lede. */
  children?: ReactNode
}) {
  return (
    <header className="border-rule/40 relative overflow-hidden border-b pt-28 pb-14 md:pt-32 md:pb-20">
      <div aria-hidden className="wash pointer-events-none absolute -top-40 -right-24 size-[34rem] opacity-70" />
      <div aria-hidden className="dots pointer-events-none absolute inset-0 opacity-[0.05]" />

      <Container className="relative">
        <Reveal
          stagger={0.08}
          className={cn(
            'grid items-center gap-12',
            // Ternary rather than `aside && …`: ReactNode includes 0 and 0n,
            // which are falsy but are not valid class values.
            aside ? 'lg:grid-cols-[1.1fr_0.9fr] lg:gap-16' : null,
          )}
        >
          <div>
            <nav data-reveal aria-label="Breadcrumb" className="mb-7">
              <ol className="text-ink-faint flex items-center gap-1.5 text-[0.8125rem] font-semibold">
                <li>
                  <Link href="/" className="hover:text-violet-deep transition-colors">
                    Home
                  </Link>
                </li>
                <li aria-hidden className="text-rule">
                  <Icon name="chevronRight" size={14} strokeWidth={2.2} />
                </li>
                <li className="text-navy" aria-current="page">
                  {crumb}
                </li>
              </ol>
            </nav>

            <Eyebrow data-reveal className="mb-4">
              {eyebrow}
            </Eyebrow>

            <h1 data-reveal className="text-display max-w-[18ch] text-balance">
              {title}
            </h1>

            {note ? (
              <p data-reveal className="mt-3">
                <HandNote tilt={-3} className="text-violet-deep text-[1.625rem] sm:text-[2rem]">
                  {note}
                </HandNote>
              </p>
            ) : null}

            {lede ? (
              <p data-reveal className="text-lede text-ink-soft mt-6 max-w-2xl">
                {lede}
              </p>
            ) : null}

            {children ? (
              <div data-reveal className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                {children}
              </div>
            ) : null}
          </div>

          {aside ? <div data-reveal>{aside}</div> : null}
        </Reveal>
      </Container>
    </header>
  )
}
