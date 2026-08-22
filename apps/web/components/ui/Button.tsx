import Link from 'next/link'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

type Variant = 'primary' | 'secondary' | 'navy' | 'onNavy' | 'quiet'
type Size = 'sm' | 'md' | 'lg'

const BASE =
  'group relative inline-flex items-center justify-center gap-2.5 rounded-full font-semibold ' +
  'whitespace-nowrap transition-[transform,box-shadow,background-color,color] duration-300 ' +
  'ease-[var(--ease-out-soft)] disabled:pointer-events-none disabled:opacity-50'

const VARIANTS: Record<Variant, string> = {
  primary: 'grad-pair text-white shadow-card hover:-translate-y-0.5 hover:shadow-lift',
  secondary:
    'bg-card text-navy ring-1 ring-rule/70 shadow-soft hover:-translate-y-0.5 hover:ring-violet/60 hover:shadow-card',
  navy: 'bg-navy text-white hover:-translate-y-0.5 hover:bg-navy-soft hover:shadow-lift',
  onNavy: 'bg-white text-navy hover:-translate-y-0.5 hover:shadow-lift',
  quiet: 'text-navy hover:text-violet-deep',
}

const SIZES: Record<Size, string> = {
  sm: 'h-10 px-4 text-sm',
  md: 'min-h-12 px-6 text-[0.9375rem]',
  lg: 'min-h-14 px-8 text-base',
}

interface Shared {
  variant?: Variant
  size?: Size
  /** Trailing arrow that slides on hover. Use for forward navigation only. */
  arrow?: boolean
  children: ReactNode
}

function inner(children: ReactNode, arrow: boolean | undefined) {
  return (
    <>
      {children}
      {arrow ? (
        <Icon
          name="arrowRight"
          size={18}
          className="transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-1"
        />
      ) : null}
    </>
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  arrow,
  className,
  children,
  ...rest
}: Shared & ComponentPropsWithoutRef<'button'>) {
  return (
    <button className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...rest}>
      {inner(children, arrow)}
    </button>
  )
}

export function LinkButton({
  variant = 'primary',
  size = 'md',
  arrow,
  className,
  children,
  href,
  ...rest
}: Shared & ComponentPropsWithoutRef<typeof Link>) {
  return (
    <Link href={href} className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...rest}>
      {inner(children, arrow)}
    </Link>
  )
}
