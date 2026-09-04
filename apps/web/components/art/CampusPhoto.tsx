import Image from 'next/image'

/**
 * The campus, photographed — the homepage hero.
 *
 * This replaces `CampusMorning`, a hand-drawn stand-in written when no
 * photography existed, whose own note said to swap it for an `<Image>` in the
 * same frame once Communications supplied one. They have: the glass tower with
 * the AMITY UNIVERSITY sign, seen down the tree-lined walk that leads to it.
 *
 * The photograph is cool — blue glass, green trees, overcast sky — and the rest
 * of the page is warm cream and navy. Dropped in untreated it reads as a
 * screenshot pasted onto the design. So two things sit on top of it: a warm wash
 * from the upper right, where the hero's ambient blobs already are, and a cream
 * veil on the left, where the frame's `feather-l` dissolves the edge into the
 * paper. Both are quiet; the building is still the subject.
 *
 * `className` carries the frame's sizing (square on a phone, full height on a
 * wide screen), so this component is a drop-in for the illustration it replaced.
 */
export function CampusPhoto({ className }: { className?: string }) {
  return (
    <div className={`relative isolate overflow-hidden ${className ?? ''}`}>
      <Image
        src="/brand/campus-hero.jpg"
        alt="The Amity University Patna campus: a blue glass academic tower with the university's name above the entrance, at the end of a tree-lined walk."
        fill
        // The LCP element on the homepage. Without `priority` it waits behind the
        // font and the GSAP bundle.
        priority
        sizes="(min-width: 1024px) 53vw, 100vw"
        // Slightly right of centre: the frame is square and the source is 16:9, so
        // a third of the width is cropped. Centring it clips the entrance sign.
        className="object-cover object-[58%_center]"
      />

      {/* Warm light from the upper right, picking up the flame and violet blobs
          behind the copy. Screen rather than overlay: it lifts the sky without
          muddying the glass. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-screen"
        style={{
          background:
            'radial-gradient(120% 90% at 88% 6%, rgba(255,138,0,0.30), rgba(116,89,247,0.14) 45%, transparent 72%)',
        }}
      />

      {/* Cream veil on the left, so the feathered edge fades into paper rather
          than into a hard photographic border. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, rgba(253,250,244,0.92), rgba(253,250,244,0.28) 26%, transparent 52%)',
        }}
      />
    </div>
  )
}
