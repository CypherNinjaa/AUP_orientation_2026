import Image from 'next/image'
import { cn } from '@/lib/cn'

/**
 * Amity University Patna official lock-up.
 *
 * Uses the authentic university mark from `aup.jpeg` rendered with a transparent background.
 * For dark surfaces (tone="white"), the white-wordmark asset is used so text is crisp and legible.
 */
export function BrandMark({
  className,
  tone = 'navy',
}: {
  className?: string
  tone?: 'navy' | 'white'
  showText?: boolean
}) {
  const isWhite = tone === 'white'

  return (
    <span className={cn('inline-flex items-center shrink-0', className)}>
      <Image
        src={isWhite ? '/brand/amity-aup-logo-white.webp' : '/brand/amity-aup-logo.webp'}
        width={1280}
        height={444}
        alt="Amity University Patna"
        priority
        className="h-9 sm:h-10 md:h-11 w-auto max-w-[170px] sm:max-w-[200px] md:max-w-[240px] object-contain transition-transform duration-300 group-hover:scale-[1.02]"
      />
    </span>
  )
}
