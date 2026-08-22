'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { type ReactNode, useRef } from 'react'

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText)

/**
 * Registers plugins once, and keeps ScrollTrigger honest about a layout that
 * shifts after fonts land. Everything else animates locally in its own
 * component so a section can be moved or deleted without breaking the page.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      // Display type is 84px at desktop; a late font swap moves every trigger
      // below the fold. Recompute once the real faces are in.
      void document.fonts?.ready.then(() => ScrollTrigger.refresh())
    },
    { scope: root },
  )

  return <div ref={root}>{children}</div>
}
