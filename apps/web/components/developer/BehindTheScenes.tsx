'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Container, Section } from '@/components/ui/atoms'
import { LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { GALLERY } from '@/lib/developer'
import { DevHeading } from './DevHeading'

/**
 * The photo strip.
 *
 * A native horizontal scroller with snap points, not a JS carousel: swiping,
 * trackpads, shift-scroll, keyboard and the arrow buttons all work, and the five
 * frames are in the document whether or not any script runs. The buttons only
 * nudge `scrollLeft`.
 *
 * Each frame owns its 4:3 ratio and the image is object-cover inside it, so the
 * strip holds its shape whatever the source photographs are. The files are
 * derived from `design/source-images/` by `scripts/build-assets.mjs`.
 */
export function BehindTheScenes() {
  const track = useRef<HTMLUListElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const sync = useCallback(() => {
    const el = track.current
    if (el === null) return
    setAtStart(el.scrollLeft <= 4)
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 4)
  }, [])

  useEffect(() => {
    sync()
  }, [sync])

  function nudge(direction: -1 | 1) {
    const el = track.current
    if (el === null) return
    const first = el.firstElementChild
    const step = first === null ? el.clientWidth * 0.8 : first.getBoundingClientRect().width + 16
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: step * direction, behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <Section>
      <Container>
        <DevHeading
          eyebrow="Behind the scenes"
          title={
            <>
              Snapshots from the Journey <span aria-hidden>📸</span>
            </>
          }
          lede="Moments captured while building Orientation 2026."
        >
          <LinkButton href="/highlights" variant="secondary" arrow>
            View More Photos
          </LinkButton>
        </DevHeading>
      </Container>

      {/* Full-bleed track so the strip runs to the edge of the viewport, with the
          container's own gutter recreated as scroll padding. */}
      <div className="relative mt-14">
        <button
          type="button"
          onClick={() => {
            nudge(-1)
          }}
          disabled={atStart}
          aria-label="Previous photos"
          className="bg-card/90 text-navy ring-rule/50 shadow-lift hover:ring-berry/60 absolute top-1/2 left-2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full ring-1 backdrop-blur transition-all duration-300 disabled:pointer-events-none disabled:opacity-0 md:left-4"
        >
          <Icon name="chevronLeft" size={20} />
        </button>
        <button
          type="button"
          onClick={() => {
            nudge(1)
          }}
          disabled={atEnd}
          aria-label="More photos"
          className="bg-card/90 text-navy ring-rule/50 shadow-lift hover:ring-berry/60 absolute top-1/2 right-2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full ring-1 backdrop-blur transition-all duration-300 disabled:pointer-events-none disabled:opacity-0 md:right-4"
        >
          <Icon name="chevronRight" size={20} />
        </button>

        <ul
          ref={track}
          onScroll={sync}
          tabIndex={0}
          aria-label="Photos from the build"
          /* `scroll-pl-6` is what makes the `px-6` gutter survive snapping.
             Without it the browser snaps the first frame's edge flush to the
             scrollport on load, which both swallows the left gutter — the strip
             stops lining up with the heading above it — and parks `scrollLeft`
             at 24, so `atStart` never reads true and the back arrow shows with
             nothing behind it. */
          className="scrollbar-none flex snap-x snap-mandatory scroll-pl-6 gap-4 overflow-x-auto scroll-smooth px-6 pb-2 motion-reduce:scroll-auto"
        >
          {GALLERY.map((shot, i) => (
            <li
              key={shot.src}
              className="group w-[78%] shrink-0 snap-start sm:w-[46%] lg:w-[31%] xl:w-[23%]"
            >
              <figure className="ring-rule/25 shadow-soft group-hover:shadow-lift relative aspect-4/3 overflow-hidden rounded-2xl ring-1 transition-shadow duration-400">
                <Image
                  src={shot.src}
                  /* Describes the photograph, which the hover caption does not:
                     the caption is a title for the moment, this is the picture. */
                  alt={shot.alt}
                  fill
                  sizes="(min-width: 1280px) 23vw, (min-width: 1024px) 31vw, (min-width: 640px) 46vw, 78vw"
                  loading={i < 2 ? 'eager' : 'lazy'}
                  className="object-cover transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-105"
                />
                <figcaption className="from-navy/85 absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-4 text-sm font-semibold text-white opacity-0 transition-opacity duration-400 group-hover:opacity-100 group-focus-within:opacity-100">
                  {shot.caption}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
