import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon, type IconName } from './Icon'

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export function Container({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('mx-auto w-full max-w-[var(--container-page)] px-6', className)} {...rest} />
}

export function Section({ className, ...rest }: ComponentPropsWithoutRef<'section'>) {
  return <section className={cn('relative py-20 md:py-28', className)} {...rest} />
}

/* -------------------------------------------------------------------------- */
/* Pastel icon chip                                                           */
/* -------------------------------------------------------------------------- */

export type Tint = 'violet' | 'flame' | 'sky'

const CHIP: Record<Tint, string> = {
  violet: 'bg-violet-tint text-violet-deep',
  flame: 'bg-flame-tint text-flame',
  sky: 'bg-sky text-navy',
}

/** Accent line used along the bottom edge of feature cards. */
export const ACCENT: Record<Tint, string> = {
  violet: 'bg-violet',
  flame: 'bg-flame-bright',
  sky: 'bg-navy-line',
}

/**
 * A tinted square holding one icon. Every icon-in-a-tint on the site should come
 * from here rather than being hand-rolled, so the shape is decided once.
 *
 * On the radius: `rounded-2xl` is 32px in this project (the scale in globals.css
 * is shifted up so cards can be generous), and CSS clamps a radius to half the
 * shorter side. So at every size used here except 72 the chip renders as a
 * circle, and swapping `rounded-2xl` for `xl` or `lg` changes nothing you can
 * see. Change the number, not the class, if you want a visible squircle.
 */
export function IconChip({
  name,
  tint = 'violet',
  size = 48,
  className,
  ...rest
}: {
  name: IconName
  tint?: Tint
  size?: number
  className?: string
} & Omit<ComponentPropsWithoutRef<'span'>, 'className' | 'style'>) {
  return (
    <span
      className={cn('inline-grid shrink-0 place-items-center rounded-2xl', CHIP[tint], className)}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon name={name} size={Math.round(size * 0.5)} />
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Eyebrow                                                                    */
/* -------------------------------------------------------------------------- */

export function Eyebrow({
  children,
  sparks = false,
  className,
  ...rest
}: { children: ReactNode; sparks?: boolean } & ComponentPropsWithoutRef<'p'>) {
  return (
    <p
      className={cn(
        'flex items-center gap-2.5 text-label text-flame uppercase',
        sparks && 'justify-center',
        className,
      )}
      {...rest}
    >
      {sparks ? <span className="spark size-3" /> : <span className="h-px w-7 bg-flame-mid" />}
      {children}
      {sparks ? <span className="spark size-3" /> : null}
    </p>
  )
}

/* -------------------------------------------------------------------------- */
/* The signature: handwriting in the margin                                   */
/* -------------------------------------------------------------------------- */

export function HandNote({
  children,
  tilt = -4,
  underline = false,
  className,
  ...rest
}: {
  children: ReactNode
  /** Degrees of rotation. Small values only — this is a note, not a sticker. */
  tilt?: number
  underline?: boolean
  className?: string
} & Omit<ComponentPropsWithoutRef<'span'>, 'className'>) {
  return (
    <span
      // A rotated inline-block keeps its upright layout box, so the tilted
      // glyphs overhang it. The tiny inline margin stops a mid-sentence note
      // from colliding with the word after it.
      className={cn('hand mx-[0.14em] inline-block', underline && 'swoosh', className)}
      style={{ rotate: `${tilt}deg` }}
      {...rest}
    >
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Section heading                                                            */
/* -------------------------------------------------------------------------- */

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = 'center',
  tone = 'navy',
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  lede?: ReactNode
  align?: 'center' | 'left'
  tone?: 'navy' | 'white'
  className?: string
}) {
  const centered = align === 'center'
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        centered ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      {eyebrow ? (
        <Eyebrow sparks={centered} data-reveal className={tone === 'white' ? 'text-flame-mid' : undefined}>
          {eyebrow}
        </Eyebrow>
      ) : null}
      <h2
        data-reveal
        className={cn('text-title', tone === 'white' && 'text-white', centered && 'max-w-3xl')}
      >
        {title}
      </h2>
      {lede ? (
        <p
          data-reveal
          className={cn(
            'text-lede max-w-2xl',
            tone === 'white' ? 'text-sky/85' : 'text-ink-soft',
          )}
        >
          {lede}
        </p>
      ) : null}
    </div>
  )
}
