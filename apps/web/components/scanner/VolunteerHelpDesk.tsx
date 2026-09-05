'use client'

import { useState } from 'react'
import Link from 'next/link'

import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import type { ScannerSearchResult } from '@/app/api/scanner/search/route'

interface VolunteerHelpDeskProps {
  onAdmitCode: (code10: string) => void
  online: boolean
}

export function VolunteerHelpDesk({ onAdmitCode, online }: VolunteerHelpDeskProps) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [results, setResults] = useState<ScannerSearchResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length < 2) return

    setLoading(true)
    setError(null)
    setSearched(true)

    try {
      const res = await fetch(`/api/scanner/search?q=${encodeURIComponent(trimmed)}`)
      if (!res.ok) {
        throw new Error('Search failed. Check network connection.')
      }
      const data = (await res.json()) as { results: ScannerSearchResult[] }
      setResults(data.results ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search error occurred')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Search Header Bar */}
      <div className="bg-white border border-slate-200/90 shadow-xs rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-violet/10 text-violet border border-violet/20">
              <Icon name="search" size={17} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold text-navy">Student Lookup & Roster Help Desk</h2>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wider border',
                    online ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200',
                  )}
                >
                  {online ? 'Live Database' : 'Offline Mode'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Search by Form No, Student Name, Roll No, Phone, or 10-Digit Pass Code
              </p>
            </div>
          </div>
          <Link
            href="/register"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-paper-tint px-3 py-1.5 text-xs font-bold text-navy transition-colors hover:border-violet hover:text-violet shadow-xs"
          >
            <Icon name="external" size={13} />
            <span>Walk-In Form</span>
          </Link>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2.5 mt-3.5">
          <div className="relative flex-1">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter Form Number (e.g. 20261001), Student Name, or 10-Digit Code…"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-navy placeholder:text-slate-400 focus:border-violet focus:ring-2 focus:ring-violet/20 focus:outline-none transition-all shadow-xs"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setResults([])
                  setSearched(false)
                }}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-navy"
                aria-label="Clear search"
              >
                <Icon name="close" size={15} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="inline-flex items-center gap-1.5 rounded-xl bg-navy hover:bg-navy-soft text-white font-bold text-sm px-5 py-2.5 shadow-xs transition-all disabled:opacity-40"
          >
            <Icon name="search" size={16} />
            <span>{loading ? 'Searching…' : 'Find Student'}</span>
          </button>
        </form>
      </div>

      {/* Results Area */}
      <div className="flex flex-1 flex-col gap-3">
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-xs">
            <div className="flex items-center gap-2 font-bold">
              <Icon name="alert" size={16} className="text-rose-600" />
              <span>Search failed</span>
            </div>
            <p className="mt-1 text-xs text-rose-700">{error}</p>
          </div>
        )}

        {searched && !loading && results.length === 0 && !error && (
          <div className="bg-white border border-slate-200/90 shadow-xs flex flex-col items-center justify-center rounded-2xl py-12 px-6 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-paper-tint border border-slate-200 text-slate-400">
              <Icon name="search" size={24} />
            </span>
            <p className="mt-3.5 text-base font-extrabold text-navy">No matching student found</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500 leading-relaxed">
              Verify the student&apos;s name or admission form number. If the student has not yet registered for orientation, open the walk-in registration portal.
            </p>
            <div className="mt-4">
              <Link
                href="/register"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-violet hover:bg-violet-deep text-white px-4 py-2 text-xs font-bold shadow-xs transition-all"
              >
                <Icon name="id" size={14} />
                <span>Open Walk-In Registration</span>
              </Link>
            </div>
          </div>
        )}

        {results.map((student) => {
          const isCheckedIn = student.pass?.checkedInAt !== null
          const isApproved = student.status === 'APPROVED'

          return (
            <div
              key={student.registrationId}
              className="bg-white border border-slate-200/90 shadow-xs flex flex-col gap-3 rounded-2xl p-4 sm:p-5 hover:border-slate-300 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3.5 min-w-0">
                  {/* Selfie or Initials Fallback */}
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-paper-tint shadow-xs">
                    <StudentHelpDeskAvatar name={student.name} url={student.selfieUrl} />
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3 className="text-base font-extrabold text-navy">{student.name}</h3>
                      <span className="font-mono text-xs font-bold text-slate-500 bg-paper-tint px-2 py-0.5 rounded border border-slate-200/60">
                        Form #{student.formNumber}
                      </span>
                    </div>

                    <p className="truncate text-xs font-semibold text-slate-600 mt-0.5">
                      {student.program}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {/* Approval Status Badge */}
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 font-bold tracking-wider uppercase text-[0.6875rem] border',
                          isApproved
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200',
                        )}
                      >
                        {student.status}
                      </span>

                      {/* Check-in Status */}
                      {isCheckedIn ? (
                        <span className="rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 font-semibold text-rose-700 text-[0.6875rem]">
                          Checked in at{' '}
                          {new Date(student.pass?.checkedInAt ?? '').toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      ) : (
                        <span className="rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 font-semibold text-sky-700 text-[0.6875rem]">
                          Not admitted yet
                        </span>
                      )}

                      {/* Companion count */}
                      {student.companions.length > 0 && (
                        <span className="flex items-center gap-1 text-slate-600 text-[0.6875rem] font-medium bg-paper-tint px-2 py-0.5 rounded border border-slate-200/60">
                          <Icon name="people" size={13} className="text-slate-400" />
                          <span>
                            +{student.companions.length} companion
                            {student.companions.length > 1 ? 's' : ''} (
                            {student.companions.map((c) => c.name).join(', ')})
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Admission Button */}
                {student.pass?.code10 && !isCheckedIn && isApproved && (
                  <button
                    type="button"
                    onClick={() => onAdmitCode(student.pass!.code10)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 shadow-xs transition-all shrink-0"
                  >
                    <Icon name="check" size={15} />
                    <span>Admit Now</span>
                  </button>
                )}
              </div>

              {/* Pass Code Bar */}
              {student.pass?.code10 && (
                <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                  <span className="font-mono font-medium">
                    Pass Code: <strong className="text-navy font-bold">{student.pass.code10}</strong>
                  </span>
                  <span>Ref: {student.reference}</span>
                </div>
              )}
            </div>
          )
        })}

        {!searched && (
          <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-4 sm:p-5 text-slate-700 text-xs leading-relaxed shadow-xs">
            <h4 className="font-extrabold text-navy mb-2 flex items-center gap-2">
              <Icon name="shield" size={16} className="text-violet" />
              <span>Gate Help Desk Protocol</span>
            </h4>
            <ul className="list-disc list-inside space-y-1.5 text-slate-600">
              <li>Use this tool when a student has a dead phone, cracked screen, or cannot locate their pass QR.</li>
              <li>Search by their <strong>Admission Form Number</strong> (from admission offer) or Student Name.</li>
              <li>Verify student identity by comparing the uploaded photo against the student standing before you.</li>
              <li>Tap &ldquo;Admit Now&rdquo; to execute an authoritative gate check-in directly without camera scanning.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function StudentHelpDeskAvatar({ name, url }: { name: string; url: string | null }) {
  const [error, setError] = useState(false)
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const initials = (
    parts.length === 0
      ? 'ST'
      : parts.length === 1
        ? (parts[0]?.slice(0, 2) ?? 'ST')
        : `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`
  ).toUpperCase()

  if (!url || error) {
    return (
      <div className="grid size-full place-items-center bg-navy text-amber-300 font-mono font-bold text-sm">
        {initials}
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      onError={() => setError(true)}
      className="size-full object-cover"
    />
  )
}
