import Image from 'next/image'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'

/**
 * Amity University Patna lock-up: the official crest beside the campus wordmark.
 *
 * The crest is the supplied artwork, unaltered and unrecoloured — it carries its
 * own 2px white keyline, which is what lets the same file sit on the header's
 * clear background and on the navy footer without a plate behind it. `tone` only
 * switches the wordmark's colours.
 *
 * The crest also contains "AMITY UNIVERSITY" in its top band, which is why the
 * wordmark is not a duplication: at 40px tall that text is around 3px and reads
 * as texture, so the line beside it is the only legible one.
 *
 * Derived at 170x200 from `design/source-images/amity-small-logo.png` by
 * `scripts/build-assets.mjs`.
 */
export function BrandMark({
  className,
  tone = 'navy',
}: {
  className?: string
  tone?: 'navy' | 'white'
}) {
  const onWhite = tone === 'white'

  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <Image
        src={asset('/brand/amity-shield.png')}
        width={170}
        height={200}
        alt=""
        priority
        className="h-10 w-auto shrink-0"
      />

      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'text-[0.9375rem] font-extrabold tracking-tight',
            onWhite ? 'text-white' : 'text-navy',
          )}
        >
          AMITY UNIVERSITY
        </span>
        <span
          className={cn(
            'text-[0.8125rem] font-bold tracking-[0.26em]',
            onWhite ? 'text-flame-mid' : 'text-flame',
          )}
        >
          PATNA
        </span>
      </span>
    </span>
  )
}
