'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'
import { TERMINAL, TERMINAL_STATUS } from '@/lib/developer'

/**
 * The terminal over the hero portrait.
 *
 * The typing animation clips each row with `clip-path` instead of adding
 * characters one at a time, so every row occupies its final width from the first
 * frame and the card never resizes mid-animation. Without JS the rows are simply
 * there; with reduced motion the clip is removed before it is ever seen.
 */
export function TerminalCard({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  const scope = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const rows = gsap.utils.toArray<HTMLElement>('[data-type]')
      if (rows.length === 0) return

      const mm = gsap.matchMedia()

      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set(rows, { clipPath: 'none' })
      })

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.set(rows, { clipPath: 'inset(0 100% 0 0)' })
        const tl = gsap.timeline({
          scrollTrigger: { trigger: scope.current, start: 'top 92%', once: true },
        })
        rows.forEach((row) => {
          const chars = (row.textContent ?? '').length
          tl.to(row, {
            clipPath: 'inset(0 0% 0 0)',
            duration: Math.min(0.9, Math.max(0.22, chars * 0.028)),
            ease: `steps(${Math.max(4, Math.min(chars, 30))})`,
          }).to({}, { duration: 0.1 })
        })
      })

      return () => mm.revert()
    },
    { scope },
  )

  return (
    <div
      ref={scope}
      /* `leading-[1.5]`: the body default of 1.6 over eight rows made the card
         tall enough to cover half the hero portrait, and a terminal sets tighter
         than prose anyway. */
      className={cn(
        'code-panel shadow-glass rounded-2xl p-4 text-[0.8125rem] leading-[1.5]',
        className,
      )}
      {...rest}
    >
      {/* Window chrome. Decorative — it is a picture of a terminal, not one. */}
      <div className="border-code-line/70 mb-3 flex items-center gap-2 border-b pb-2.5">
        <span className="bg-coral size-2.5 rounded-full" />
        <span className="bg-syn-num size-2.5 rounded-full" />
        <span className="bg-syn-str size-2.5 rounded-full" />
        <span className="text-code-faint ml-1.5 truncate text-[0.6875rem] tracking-wide">
          developer@orientation
        </span>
      </div>

      <div className="space-y-2">
        {TERMINAL.map((row) => (
          <div key={row.cmd} className="space-y-0.5">
            <p data-type className="whitespace-nowrap">
              <span className="text-syn-str">$</span>{' '}
              <span className="text-code-ink">{row.cmd}</span>
            </p>
            <p data-type className="text-syn-punct whitespace-nowrap">
              {row.out}
            </p>
          </div>
        ))}

        <div className="space-y-0.5">
          <p data-type className="whitespace-nowrap">
            <span className="text-syn-str">$</span> <span className="text-code-ink">status</span>
          </p>
          <p data-type className="text-syn-str flex items-center gap-1.5 tracking-wide">
            <span className="bg-syn-str size-1.5 shrink-0 rounded-full" />
            <span className="truncate text-[0.6875rem] font-semibold uppercase">
              {TERMINAL_STATUS}
            </span>
            <span className="bg-syn-str/80 inline-block h-3 w-1.5 animate-pulse" />
          </p>
        </div>
      </div>
    </div>
  )
}
