import Image from 'next/image'
import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'
import { DEVELOPER } from '@/lib/developer'
import { Icon } from '@/components/ui/Icon'

/**
 * The identity card floating beside the hero portrait.
 *
 * Every string it renders is a bracketed placeholder from lib/developer.ts, and
 * it renders them literally on purpose — a card that says "[Developer Name]" is
 * obviously unfinished, where an invented name would not be.
 */
export function DeveloperProfileCard({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('bg-card ring-rule/30 shadow-lift rounded-2xl p-4 ring-1', className)}
      {...rest}
    >
      <div className="flex items-center gap-3">
        <span className="ring-violet-tint relative size-11 shrink-0 overflow-hidden rounded-full ring-2">
          <Image
            src={DEVELOPER.portrait}
            alt=""
            fill
            sizes="44px"
            className="object-cover"
          />
        </span>
        <span className="min-w-0">
          <span className="text-navy block truncate text-sm font-bold">{DEVELOPER.name}</span>
          <span className="text-berry-deep block truncate text-xs font-semibold">
            {DEVELOPER.role}
          </span>
        </span>
      </div>

      <dl className="border-rule/40 text-ink-soft mt-3.5 space-y-2 border-t pt-3 text-xs">
        <div className="flex items-center gap-2">
          <dt className="sr-only">Specialisation</dt>
          <Icon name="spark" size={14} className="text-violet shrink-0" />
          <dd className="truncate">{DEVELOPER.specialisation}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="sr-only">Location</dt>
          <Icon name="pin" size={14} className="text-coral shrink-0" />
          <dd className="truncate">{DEVELOPER.location}</dd>
        </div>
      </dl>
    </div>
  )
}
