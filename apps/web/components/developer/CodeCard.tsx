import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'
import { HERO_SNIPPET } from '@/lib/developer'
import { CodeBlock } from './CodeBlock'

/**
 * The small snippet card that floats over the hero art.
 *
 * White rather than dark: the terminal below it is the page's dark object, and
 * two dark cards on the same portrait read as one shape with a gap in it.
 */
export function CodeCard({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'bg-card ring-rule/30 shadow-lift rounded-2xl p-4 ring-1 backdrop-blur-sm',
        className,
      )}
      {...rest}
    >
      <div className="border-rule/40 mb-3 flex items-center gap-2 border-b pb-2.5">
        <span className="bg-violet/70 size-2 rounded-full" />
        <span className="bg-berry/70 size-2 rounded-full" />
        <span className="bg-coral/70 size-2 rounded-full" />
        <span className="text-ink-faint ml-auto font-mono text-[0.625rem] tracking-wide">
          build.js
        </span>
      </div>
      <CodeBlock code={HERO_SNIPPET} tone="light" className="font-mono text-[0.6875rem]" />
    </div>
  )
}
