import { HandNote } from '@/components/ui/atoms'
import { cn } from '@/lib/cn'

/**
 * A short line the university stands behind, set as a card.
 *
 * Not a testimonial. Every quote card on this site is the orientation office
 * speaking in its own voice — we are not attributing invented sentences to
 * invented students on a real institution's website.
 */
export function QuoteCard({
  quote,
  note,
  className,
}: {
  quote: string
  /** The handwritten line under it. */
  note: string
  className?: string
}) {
  return (
    <figure
      className={cn(
        'bg-card ring-rule/30 shadow-card relative rounded-3xl px-8 py-9 ring-1',
        className,
      )}
    >
      {/* A typographic quote mark rather than an icon: it is the one glyph that
          already means this, and at this size it works as the card's ornament. */}
      <span
        aria-hidden
        className="grad-text absolute top-3 left-7 font-extrabold leading-none select-none"
        style={{ fontSize: '5rem' }}
      >
        &ldquo;
      </span>

      <blockquote className="text-navy relative mt-7 text-[1.1875rem] leading-snug font-bold sm:text-[1.375rem]">
        {quote}
      </blockquote>

      <figcaption className="mt-4">
        <HandNote tilt={-4} className="text-flame text-[1.625rem]">
          {note}
        </HandNote>
      </figcaption>
    </figure>
  )
}
