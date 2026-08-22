import { cn } from '@/lib/cn'

/**
 * Amity University Patna lock-up: navy shield carrying the flame, with the
 * wordmark set in the site's own display face.
 *
 * ⚠️ The shield here is a placeholder drawn to the proportions of the official
 * mark. Replace it with the vector supplied by the Communications office before
 * launch — drop the file at `public/brand/amity-patna.svg` and swap the <svg>
 * below for an <Image>. Do not redraw the crest by hand for production.
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
      <svg viewBox="0 0 40 44" className="h-10 w-9 shrink-0" aria-hidden="true">
        <path
          d="M20 1.6 2.6 7.3v14.4C2.6 31.6 9.7 39.4 20 42.4c10.3-3 17.4-10.8 17.4-20.7V7.3Z"
          fill={onWhite ? '#ffffff' : '#001b44'}
        />
        <path
          d="M20 5.4 6.2 9.9v11.8c0 8 5.6 14.4 13.8 17 8.2-2.6 13.8-9 13.8-17V9.9Z"
          fill="none"
          stroke={onWhite ? '#001b44' : '#ffb77f'}
          strokeWidth="1.1"
          opacity={onWhite ? 0.35 : 0.5}
        />
        {/* the flame */}
        <path
          d="M20 12.2c-3.9 4.6-5.8 8.1-5.8 11.2a5.8 5.8 0 0 0 11.6 0c0-3.1-1.9-6.6-5.8-11.2Z"
          fill="#ff8a00"
        />
        <path
          d="M20 17.8c-1.9 2.5-2.9 4.4-2.9 6a2.9 2.9 0 0 0 5.8 0c0-1.6-1-3.5-2.9-6Z"
          fill={onWhite ? '#001b44' : '#001b44'}
          opacity="0.55"
        />
        <path
          d="M12.4 31.2h15.2"
          stroke={onWhite ? '#001b44' : '#ffb77f'}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.7"
        />
      </svg>

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
