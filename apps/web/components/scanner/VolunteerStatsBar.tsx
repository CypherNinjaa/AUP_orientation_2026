'use client'

import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'

interface VolunteerStatsBarProps {
  tally: { admitted: number; refused: number }
  guestsTotal: number
  passCount: number
  queuedCount: number
  online: boolean
  className?: string
}

export function VolunteerStatsBar({
  tally,
  guestsTotal,
  passCount,
  queuedCount,
  online,
  className,
}: VolunteerStatsBarProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3',
        className,
      )}
    >
      {/* 1. Admitted */}
      <div className="bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between rounded-2xl p-3.5 hover:border-emerald-300 transition-colors">
        <div className="flex items-center justify-between text-[0.6875rem] font-bold text-slate-500">
          <span className="uppercase tracking-wider">Admitted</span>
          <span className="grid size-6 place-items-center rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200/60">
            <Icon name="check" size={13} />
          </span>
        </div>
        <div className="mt-2.5 flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-black text-navy">{tally.admitted}</span>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/50">
            +{guestsTotal} guests
          </span>
        </div>
      </div>

      {/* 2. Refused / Flags */}
      <div className="bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between rounded-2xl p-3.5 hover:border-rose-300 transition-colors">
        <div className="flex items-center justify-between text-[0.6875rem] font-bold text-slate-500">
          <span className="uppercase tracking-wider">Refused / Dupes</span>
          <span className="grid size-6 place-items-center rounded-md bg-rose-50 text-rose-600 border border-rose-200/60">
            <Icon name="alert" size={13} />
          </span>
        </div>
        <div className="mt-2.5 flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-black text-navy">{tally.refused}</span>
          <span className="text-xs text-slate-500 font-medium">
            flagged passes
          </span>
        </div>
      </div>

      {/* 3. Offline Manifest Passes */}
      <div className="bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between rounded-2xl p-3.5 hover:border-sky-300 transition-colors">
        <div className="flex items-center justify-between text-[0.6875rem] font-bold text-slate-500">
          <span className="uppercase tracking-wider">Cached Roster</span>
          <span className="grid size-6 place-items-center rounded-md bg-sky-50 text-sky-600 border border-sky-200/60">
            <Icon name="database" size={13} />
          </span>
        </div>
        <div className="mt-2.5 flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-black text-navy">{passCount}</span>
          <span className="text-xs text-slate-500 font-medium">offline ready</span>
        </div>
      </div>

      {/* 4. Sync Outbox */}
      <div className="bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between rounded-2xl p-3.5 hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-[0.6875rem] font-bold text-slate-500">
          <span className="uppercase tracking-wider">Sync Engine</span>
          <span
            className={cn(
              'grid size-6 place-items-center rounded-md border',
              online
                ? queuedCount > 0
                  ? 'bg-amber-50 text-amber-600 border-amber-200/60'
                  : 'bg-emerald-50 text-emerald-600 border-emerald-200/60'
                : 'bg-rose-50 text-rose-600 border-rose-200/60',
            )}
          >
            <Icon name="cloud" size={13} />
          </span>
        </div>
        <div className="mt-2.5 flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-black text-navy">
            {queuedCount === 0 ? 'Clear' : queuedCount}
          </span>
          <span className="text-xs text-slate-500 font-medium">
            {queuedCount === 0 ? 'all synced' : 'queued scans'}
          </span>
        </div>
      </div>
    </div>
  )
}
