'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import type { ComponentPropsWithoutRef } from 'react'
import { useRef } from 'react'

/**
 * Reveals every `[data-reveal]` descendant as it enters the viewport, in a
 * single staggered batch per Reveal boundary.
 *
 * Why a wrapper rather than one hook per element: a section reads as one
 * gesture, not fifteen. Wrap the section, mark the parts, get one cascade.
 *
 * The hidden state lives in CSS behind `.js [data-reveal]`, so if this bundle
 * never arrives the content is visible anyway.
 */
export function Reveal({
  stagger = 0.07,
  y = 24,
  start = 'top 82%',
  ...rest
}: {
  stagger?: number
  y?: number
  start?: string
} & ComponentPropsWithoutRef<'div'>) {
  const scope = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const targets = gsap.utils.toArray<HTMLElement>('[data-reveal]')
      if (targets.length === 0) return

      const mm = gsap.matchMedia()

      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set(targets, { opacity: 1, y: 0, clearProps: 'opacity,transform' })
      })

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          targets,
          { opacity: 0, y },
          {
            opacity: 1,
            y: 0,
            duration: 0.85,
            ease: 'expo.out',
            stagger,
            clearProps: 'transform',
            scrollTrigger: { trigger: scope.current, start, once: true },
          },
        )
      })

      return () => mm.revert()
    },
    { scope, dependencies: [stagger, y, start] },
  )

  return <div ref={scope} {...rest} />
}
