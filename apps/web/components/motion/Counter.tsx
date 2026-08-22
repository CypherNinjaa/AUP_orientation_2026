'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useRef } from 'react'
import { cn } from '@/lib/cn'

gsap.registerPlugin(useGSAP, ScrollTrigger)

/**
 * Counts up to `value` when scrolled into view.
 *
 * Renders the final number in the server HTML and only then winds it back to
 * zero on the client, so the figure is correct with JavaScript disabled.
 */
export function Counter({
  value,
  suffix = '',
  className,
}: {
  value: number
  suffix?: string
  className?: string
}) {
  const el = useRef<HTMLSpanElement>(null)

  useGSAP(
    () => {
      const node = el.current
      if (!node) return

      const mm = gsap.matchMedia()

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const proxy = { n: 0 }
        node.textContent = `0${suffix}`

        gsap.to(proxy, {
          n: value,
          duration: 1.7,
          ease: 'power2.out',
          onUpdate: () => {
            node.textContent = `${Math.round(proxy.n).toLocaleString('en-IN')}${suffix}`
          },
          scrollTrigger: { trigger: node, start: 'top 92%', once: true },
        })
      })

      return () => mm.revert()
    },
    { dependencies: [value, suffix] },
  )

  return (
    <span ref={el} className={cn('tnum', className)}>
      {value.toLocaleString('en-IN')}
      {suffix}
    </span>
  )
}
