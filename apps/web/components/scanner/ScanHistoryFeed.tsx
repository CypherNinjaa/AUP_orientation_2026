'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'

export interface ScanHistoryItem {
  id: string
  clientEventId: string
  raw: string
  code: string | null
  method: string
  badge: string
  tone: 'ok' | 'warn' | 'bad'
  admitted: boolean
  name: string | null
  program: string | null
  guests: number
  maxGuests?: number
  timestamp: number
  overridden: boolean
}

interface ScanHistoryFeedProps {
  items: ScanHistoryItem[]
  onAdjustGuests?: (clientEventId: string, nextGuests: number) => void
  onClear?: () => void
}

export function ScanHistoryFeed({ items, onClear }: ScanHistoryFeedProps) {
  const [filter, setFilter] = useState<'all' | 'admitted' | 'refused'>('all')

  const filtered = items.filter((item) => {
    if (filter === 'admitted') return item.admitted
    if (filter === 'refused') return !item.admitted
    return true
  })

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* Header with filter tabs */}
      <div className="bg-white border border-slate-200/90 shadow-xs flex items-center justify-between gap-2 rounded-2xl p-3 sm:p-3.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-bold transition-all',
              filter === 'all'
                ? 'bg-navy text-white shadow-xs'
                : 'text-slate-500 hover:text-navy hover:bg-paper-tint',
            )}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('admitted')}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-bold transition-all border',
              filter === 'admitted'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200/70 hover:bg-emerald-100/60',
            )}
          >
            Admitted ({items.filter((i) => i.admitted).length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('refused')}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-bold transition-all border',
              filter === 'refused'
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                : 'bg-rose-50 text-rose-700 border-rose-200/70 hover:bg-rose-100/60',
            )}
          >
            Refused ({items.filter((i) => !i.admitted).length})
          </button>
        </div>

        {items.length > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-rose-600 px-2 py-1 rounded-lg transition-colors"
          >
            <Icon name="close" size={12} />
            <span>Clear Log</span>
          </button>
        )}
      </div>

      {/* Scans List */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200/90 shadow-xs flex flex-1 flex-col items-center justify-center rounded-2xl p-8 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-paper-tint border border-slate-200 text-slate-400">
            <Icon name="clock" size={22} />
          </span>
          <p className="mt-3 text-sm font-extrabold text-navy">No scan records match</p>
          <p className="mt-1 max-w-xs text-xs text-slate-500 leading-relaxed">
            {items.length === 0
              ? 'Scans completed at this station during your shift will appear here in chronological order.'
              : 'Try selecting a different filter above.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => {
            const timeStr = new Date(item.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })

            return (
              <div
                key={item.id}
                className={cn(
                  'bg-white border border-slate-200/90 shadow-xs flex items-center justify-between gap-3 rounded-2xl p-3.5 hover:border-slate-300 transition-all',
                  item.tone === 'ok' && 'border-l-4 border-l-emerald-500',
                  item.tone === 'bad' && 'border-l-4 border-l-rose-500',
                  item.tone === 'warn' && 'border-l-4 border-l-amber-500',
                )}
              >
                {/* Left details */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-extrabold text-navy">
                      {item.name || 'Unknown student'}
                    </span>
                    <span className="font-mono text-xs text-slate-400">
                      {item.code || item.raw.slice(0, 12)}
                    </span>
                  </div>

                  {item.program && (
                    <p className="truncate text-xs font-semibold text-slate-600">{item.program}</p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    {/* Badge */}
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wider border',
                        item.tone === 'ok' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        item.tone === 'bad' && 'bg-rose-50 text-rose-700 border-rose-200',
                        item.tone === 'warn' && 'bg-amber-50 text-amber-800 border-amber-200',
                      )}
                    >
                      {item.badge}
                    </span>

                    <span className="text-slate-400 text-xs">{timeStr}</span>
                    <span className="text-slate-400 font-mono uppercase text-[0.6875rem]">
                      via {item.method}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
