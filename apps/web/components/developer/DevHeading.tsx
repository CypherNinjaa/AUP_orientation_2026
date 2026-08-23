import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { Reveal } from '@/components/motion/Reveal'
import { cn } from '@/lib/cn'

/* ============================================================================
   Headings for /developer.

   A local copy rather than a prop on ui/atoms' Eyebrow: that one hardcodes the
   flame pair, and adding a tone switch to it would mean touching a component
   every other page on the site already renders. This page is the exception, so
   the exception lives here.
   ========================================================================== */

export function DevEyebrow({
  children,
  align = 'center',
  tone = 'ink',
  className,
  ...rest
}: {
  children: ReactNode
  align?: 'center' | 'left'
  tone?: 'ink' | 'white'
} & ComponentPropsWithoutRef<'p'>) {
  const rule = tone === 'white' ? 'bg-coral-tint/70' : 'bg-berry/50'
  return (
    <p
      className={cn(
        'text-label flex items-center gap-2.5 uppercase',
        tone === 'white' ? 'text-coral-tint' : 'text-berry-deep',
        align === 'center' && 'justify-center',
        className,
      )}
      {...rest}
    >
      <span className={cn('h-px w-7', rule)} />
      {children}
      {align === 'center' ? <span className={cn('h-px w-7', rule)} /> : null}
    </p>
  )
}

export function DevHeading({
  eyebrow,
  title,
  lede,
  align = 'center',
  tone = 'ink',
  className,
  titleClassName,
  children,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  lede?: ReactNode
  align?: 'center' | 'left'
  tone?: 'ink' | 'white'
  className?: string
  /**
   * Overrides the type size of the `h2`. `text-title` assumes the heading has a
   * page-wide column; a heading in a narrow grid column needs a smaller step or
   * its line breaks stop matching the design.
   */
  titleClassName?: string
  /** Buttons or extras below the lede. */
  children?: ReactNode
}) {
  const centered = align === 'center'
  return (
    /* Its own Reveal boundary. `Reveal` scopes the `[data-reveal]` query to its
       own subtree, so a heading dropped straight into a <Section> would mark
       three elements that nothing ever animates — and the CSS gate leaves those
       at opacity 0 forever. Owning the boundary here means a caller cannot
       forget it. The one place a heading already sits inside a Reveal
       (ArchitectureSection) uses per-column boundaries instead, so these never
       nest. */
    <Reveal
      className={cn(
        'flex flex-col gap-4',
        centered ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      {eyebrow ? (
        <DevEyebrow data-reveal align={align} tone={tone}>
          {eyebrow}
        </DevEyebrow>
      ) : null}
      <h2
        data-reveal
        className={cn(
          'text-title',
          tone === 'white' && 'text-white',
          centered && 'max-w-3xl',
          titleClassName,
        )}
      >
        {title}
      </h2>
      {lede ? (
        <p
          data-reveal
          className={cn(
            'text-lede max-w-2xl',
            /* Not `text-sky/85`: this tone sits on the CTA's pink gradient as
               well as the navy stat band, and a pale blue at 85% over pink is
               about 2.3:1. White at 90% clears on both grounds. */
            tone === 'white' ? 'text-white/90' : 'text-ink-soft',
          )}
        >
          {lede}
        </p>
      ) : null}
      {children ? <div data-reveal className="mt-2">{children}</div> : null}
    </Reveal>
  )
}
