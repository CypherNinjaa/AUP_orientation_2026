'use client'

/**
 * Scan History Console — real-time live gate admission and scan event ledger.
 *
 * Backs the Admin "Scan History" tab. Streams incoming scans in real time without
 * page refresh (via SSE `RealtimeProvider` and silent background polling).
 *
 * Features:
 *  - Real-time live data load (without refresh, like socket)
 *  - Search by student (name, code, email, phone) or volunteer (name, email)
 *  - Filter by outcome, scan method, gate
 *  - Live feed control (pause / resume stream)
 *  - Volunteer inspection drawer (name, email, role, login/last-seen history, scan metrics)
 *  - Student timeline inspection drawer (all scans across gates, companions, program)
 *  - CSV export
 */

import { useCallback, useEffect, useState } from 'react'

import type {
  Role,
  ScanHistoryEntryView,
  ScanMethod,
  ScanOutcome,
  VolunteerActivityView,
} from '@orientation/contracts'

import { OpsModal, OpsSelect } from '@/components/admin/controls'
import { usePaged } from '@/components/admin/usePaged'
import { Icon, type IconName } from '@/components/ui/Icon'
import {
  DataTable,
  EmptyState,
  ErrorNote,
  LiveRegion,
  OpsButton,
  OpsHeading,
  Panel,
  type Signal,
  SignalBadge,
  Skeleton,
  Td,
  Th,
  opsControl,
} from '@/components/ui/ops'
import {
  ago,
  count,
  fetchScanHistory,
  fetchStudentScanHistory,
  fetchVolunteerActivity,
  stamp,
} from '@/lib/admin'
import { cn } from '@/lib/cn'
import { useRealtime } from '@/lib/client/RealtimeProvider'

const OUTCOME_LABEL: Record<ScanOutcome, string> = {
  ADMITTED: 'Admitted',
  DUPLICATE: 'Duplicate',
  INVALID: 'Invalid',
  REVOKED: 'Revoked',
  NOT_APPROVED: 'Not Approved',
  OUT_OF_WINDOW: 'Out of Window',
  STALE_MANIFEST: 'Stale Manifest',
  NOT_FOUND: 'Not Found',
}

const OUTCOME_SIGNAL: Record<ScanOutcome, Signal> = {
  ADMITTED: 'go',
  DUPLICATE: 'warn',
  INVALID: 'stop',
  REVOKED: 'stop',
  NOT_APPROVED: 'warn',
  OUT_OF_WINDOW: 'warn',
  STALE_MANIFEST: 'warn',
  NOT_FOUND: 'stop',
}

const OUTCOME_ICON: Record<ScanOutcome, IconName> = {
  ADMITTED: 'check',
  DUPLICATE: 'alert',
  INVALID: 'close',
  REVOKED: 'shield',
  NOT_APPROVED: 'alert',
  OUT_OF_WINDOW: 'clock',
  STALE_MANIFEST: 'compass',
  NOT_FOUND: 'search',
}

const METHOD_LABEL: Record<ScanMethod, string> = {
  QR: 'QR Code',
  BARCODE: 'Barcode',
  MANUAL_CODE: 'Keypad',
}

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  VOLUNTEER: 'Volunteer',
  STUDENT: 'Student',
}

export function ScanHistoryConsole() {
  const [q, setQ] = useState('')
  const [outcome, setOutcome] = useState<ScanOutcome | ''>('')
  const [method, setMethod] = useState<ScanMethod | ''>('')
  const [isPaused, setIsPaused] = useState(false)
  const [liveEventsCount, setLiveEventsCount] = useState(0)
  const [lastLiveAt, setLastLiveAt] = useState<Date | null>(null)

  // Modals for deep dive inspection
  const [selectedStudentPassId, setSelectedStudentPassId] = useState<string | null>(null)
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(null)

  // Student drilldown data
  const [studentScans, setStudentScans] = useState<ScanHistoryEntryView[] | null>(null)
  const [studentLoading, setStudentLoading] = useState(false)

  // Volunteer drilldown data
  const [volunteerActivity, setVolunteerActivity] = useState<VolunteerActivityView | null>(null)
  const [volunteerLoading, setVolunteerLoading] = useState(false)

  const fetchPage = useCallback(
    (cursor: string | undefined, signal: AbortSignal) =>
      fetchScanHistory(
        {
          limit: 50,
          cursor,
          q: q.trim() !== '' ? q.trim() : undefined,
          outcome: outcome !== '' ? outcome : undefined,
          method: method !== '' ? method : undefined,
        },
        signal,
      ),
    [q, outcome, method],
  )

  const paged = usePaged<ScanHistoryEntryView>(fetchPage, [q, outcome, method])

  // Live real-time stream subscription
  useRealtime({
    'scanner.synced': () => {
      setLiveEventsCount((prev) => prev + 1)
      setLastLiveAt(new Date())
      if (!isPaused && !selectedStudentPassId && !selectedVolunteerId) {
        paged.refresh({ silent: true })
      }
    },
    'checkin.recorded': () => {
      setLiveEventsCount((prev) => prev + 1)
      setLastLiveAt(new Date())
      if (!isPaused && !selectedStudentPassId && !selectedVolunteerId) {
        paged.refresh({ silent: true })
      }
    },
  })

  // Resilient fallback polling every 5s if active and not paused
  useEffect(() => {
    if (isPaused || selectedStudentPassId || selectedVolunteerId) return
    const timer = setInterval(() => {
      paged.refresh({ silent: true })
    }, 5000)
    return () => clearInterval(timer)
  }, [isPaused, selectedStudentPassId, selectedVolunteerId, paged])

  // Load student timeline when selected
  useEffect(() => {
    if (!selectedStudentPassId) {
      setStudentScans(null)
      return
    }
    let active = true
    setStudentLoading(true)
    void fetchStudentScanHistory(selectedStudentPassId).then((res) => {
      if (active) {
        if (res.ok) setStudentScans(res.data)
        setStudentLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [selectedStudentPassId])

  // Load volunteer activity when selected
  useEffect(() => {
    if (!selectedVolunteerId) {
      setVolunteerActivity(null)
      return
    }
    let active = true
    setVolunteerLoading(true)
    void fetchVolunteerActivity(selectedVolunteerId).then((res) => {
      if (active) {
        if (res.ok) setVolunteerActivity(res.data)
        setVolunteerLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [selectedVolunteerId])

  // Calculate live stats summary from current page
  const stats = {
    totalScans: paged.items.length,
    admitted: paged.items.filter((i) => i.outcome === 'ADMITTED').length,
    duplicate: paged.items.filter((i) => i.outcome === 'DUPLICATE').length,
    refused: paged.items.filter((i) =>
      ['REVOKED', 'NOT_APPROVED', 'INVALID', 'NOT_FOUND', 'OUT_OF_WINDOW'].includes(i.outcome),
    ).length,
    volunteers: new Set(
      paged.items.map((i) => i.volunteer?.id).filter((id): id is string => Boolean(id)),
    ).size,
  }

  // Export current table view to CSV
  function exportCsv() {
    if (paged.items.length === 0) return
    const headers = [
      'Scanned At',
      'Recorded At',
      'Outcome',
      'Reason',
      'Method',
      'Student Name',
      'Pass Code',
      'Programme',
      'Student Email',
      'Contact No',
      'Volunteer Name',
      'Volunteer Email',
      'Volunteer Role',
      'Gate Code',
      'Gate Name',
      'Offline',
      'Overridden',
    ]

    const rows = paged.items.map((item) => [
      item.scannedAt,
      item.recordedAt,
      item.outcome,
      item.reason ?? '',
      item.method,
      item.student?.name ?? '',
      item.student?.code10 ?? '',
      item.student?.program ?? '',
      item.student?.email ?? '',
      item.student?.contactNo ?? '',
      item.volunteer?.name ?? 'System',
      item.volunteer?.email ?? '',
      item.volunteer?.role ?? '',
      item.gate?.code ?? '',
      item.gate?.name ?? '',
      item.wasOffline ? 'Yes' : 'No',
      item.overridden ? 'Yes' : 'No',
    ])

    const csvContent = [headers, ...rows]
      .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `scan_history_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="flex flex-col gap-6">
      <LiveRegion>
        {liveEventsCount > 0 ? `${liveEventsCount} new gate scans synced.` : null}
      </LiveRegion>

      {/* Header with Live Status & Controls */}
      <OpsHeading
        eyebrow="Gate Admissions · Real-Time Stream"
        title="Scan History"
        lede="Live gate scan audit trail. Displays which volunteer scanned each student, exact verification outcome, pass details, and volunteer activity history."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Live streaming status pill */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all shadow-2xs',
                isPaused
                  ? 'bg-ops-raise border-ops-line text-ops-soft'
                  : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400',
              )}
            >
              <span className="relative flex h-2 w-2">
                {!isPaused && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={cn(
                    'relative inline-flex rounded-full h-2 w-2',
                    isPaused ? 'bg-amber-400' : 'bg-emerald-500',
                  )}
                />
              </span>
              <span>
                {isPaused
                  ? 'Stream Paused'
                  : lastLiveAt
                    ? `Live · synced ${ago(lastLiveAt.toISOString())}`
                    : 'Live Stream Active'}
              </span>
            </div>

            {/* Pause / Resume button */}
            <OpsButton
              size="sm"
              variant="outline"
              icon={isPaused ? 'check' : 'clock'}
              onClick={() => setIsPaused((prev) => !prev)}
            >
              {isPaused ? 'Resume Feed' : 'Pause Feed'}
            </OpsButton>

            {/* Refresh button */}
            <OpsButton
              size="sm"
              variant="outline"
              icon="search"
              onClick={() => paged.refresh()}
              disabled={paged.loading}
            >
              {paged.loading ? 'Syncing…' : 'Refresh'}
            </OpsButton>

            {/* CSV Export */}
            <OpsButton
              size="sm"
              variant="outline"
              icon="download"
              onClick={exportCsv}
              disabled={paged.items.length === 0}
            >
              Export CSV
            </OpsButton>
          </div>
        }
      />

      {/* Metric summary counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="bg-ops-panel ring-ops-line/70 rounded-xl p-4 ring-1 flex flex-col gap-1">
          <span className="text-ops-faint text-[0.6875rem] font-bold tracking-wider uppercase">
            Total Scans
          </span>
          <span className="text-ops-ink font-mono text-2xl font-black">
            {count(stats.totalScans)}
          </span>
          <span className="text-ops-soft text-xs">Recent window</span>
        </div>

        <div className="bg-ops-panel ring-ops-line/70 rounded-xl p-4 ring-1 flex flex-col gap-1">
          <span className="text-ops-faint text-[0.6875rem] font-bold tracking-wider uppercase">
            Admitted
          </span>
          <span className="text-go font-mono text-2xl font-black">{count(stats.admitted)}</span>
          <span className="text-ops-soft text-xs">Entry permitted</span>
        </div>

        <div className="bg-ops-panel ring-ops-line/70 rounded-xl p-4 ring-1 flex flex-col gap-1">
          <span className="text-ops-faint text-[0.6875rem] font-bold tracking-wider uppercase">
            Duplicates
          </span>
          <span className="text-warn font-mono text-2xl font-black">
            {count(stats.duplicate)}
          </span>
          <span className="text-ops-soft text-xs">Already checked in</span>
        </div>

        <div className="bg-ops-panel ring-ops-line/70 rounded-xl p-4 ring-1 flex flex-col gap-1">
          <span className="text-ops-faint text-[0.6875rem] font-bold tracking-wider uppercase">
            Flagged / Out of Win
          </span>
          <span className="text-stop font-mono text-2xl font-black">{count(stats.refused)}</span>
          <span className="text-ops-soft text-xs">Blocked or out of window</span>
        </div>

        <div className="bg-ops-panel ring-ops-line/70 rounded-xl p-4 ring-1 flex flex-col gap-1">
          <span className="text-ops-faint text-[0.6875rem] font-bold tracking-wider uppercase">
            Active Volunteers
          </span>
          <span className="text-sky font-mono text-2xl font-black">
            {count(stats.volunteers)}
          </span>
          <span className="text-ops-soft text-xs">Volunteers scanning</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-ops-panel border-ops-line rounded-xl border p-4 shadow-sm flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-12 items-center">
          {/* Global search */}
          <div className="sm:col-span-6 relative">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search student name, pass code (10-digit), roll no, email, or volunteer name/email…"
              className={cn(opsControl, 'pl-9')}
            />
            <Icon
              name="search"
              size={15}
              className="text-ops-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
            />
          </div>

          {/* Outcome Filter */}
          <div className="sm:col-span-3">
            <OpsSelect
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as ScanOutcome | '')}
              aria-label="Filter by verdict outcome"
            >
              <option value="">All Outcomes</option>
              <option value="ADMITTED">Admitted Only</option>
              <option value="DUPLICATE">Duplicates Only</option>
              <option value="INVALID">Invalid</option>
              <option value="REVOKED">Revoked</option>
              <option value="NOT_APPROVED">Not Approved</option>
              <option value="OUT_OF_WINDOW">Out of Window</option>
            </OpsSelect>
          </div>

          {/* Method Filter */}
          <div className="sm:col-span-3">
            <OpsSelect
              value={method}
              onChange={(e) => setMethod(e.target.value as ScanMethod | '')}
              aria-label="Filter by scan method"
            >
              <option value="">All Methods (QR / Barcode / Keypad)</option>
              <option value="QR">QR Code</option>
              <option value="BARCODE">Barcode</option>
              <option value="MANUAL_CODE">Manual Keypad</option>
            </OpsSelect>
          </div>
        </div>

        {(q !== '' || outcome !== '' || method !== '') && (
          <div className="flex items-center justify-between pt-1 text-xs">
            <span className="text-ops-faint">
              Active filters:{' '}
              {[
                q ? `Search "${q}"` : null,
                outcome ? `Outcome: ${outcome}` : null,
                method ? `Method: ${method}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <button
              type="button"
              onClick={() => {
                setQ('')
                setOutcome('')
                setMethod('')
              }}
              className="text-sky hover:underline font-bold"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Main Scan History Table */}
      <Panel
        title="Live Gate Activity Feed"
        hint="Ordered newest first. Real-time live feed updates automatically."
        icon="clock"
        flush
      >
        {paged.loading && paged.items.length === 0 ? (
          <div className="p-5">
            <Skeleton rows={8} />
          </div>
        ) : paged.error !== null ? (
          <div className="p-5">
            <ErrorNote error={paged.error} onRetry={() => paged.refresh()} />
          </div>
        ) : paged.items.length === 0 ? (
          <EmptyState icon="qr" title="No scans recorded">
            {q !== '' || outcome !== '' || method !== ''
              ? 'No scans match the current filters. Try loosening your search criteria.'
              : 'As soon as volunteers scan passes at the gates, they will appear here live in real-time.'}
          </EmptyState>
        ) : (
          <>
            <DataTable
              head={
                <>
                  <Th className="w-36">Time / Method</Th>
                  <Th>Student Information</Th>
                  <Th>Scanned By (Volunteer)</Th>
                  <Th>Gate & Lane</Th>
                  <Th>Verdict & Outcome</Th>
                  <Th className="text-right">Action</Th>
                </>
              }
            >
              {paged.items.map((scan) => {
                const student = scan.student
                const volunteer = scan.volunteer
                const gate = scan.gate

                return (
                  <tr key={scan.id} className="hover:bg-ops-panel/50 transition-colors">
                    {/* Time and Method */}
                    <Td>
                      <div className="flex flex-col gap-0.5">
                        <span
                          className="text-ops-ink font-mono text-xs font-bold"
                          title={stamp(scan.scannedAt)}
                        >
                          {ago(scan.scannedAt)}
                        </span>
                        <span className="text-ops-faint text-[0.6875rem]">
                          {stamp(scan.scannedAt).split(',')[1]?.trim() ?? ''}
                        </span>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="bg-ops-raise border border-ops-line text-ops-soft px-1.5 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase">
                            {METHOD_LABEL[scan.method]}
                          </span>
                          {scan.wasOffline && (
                            <span
                              className="bg-amber-500/10 border border-amber-500/30 text-amber-400 px-1 py-0.5 rounded text-[0.625rem] font-bold"
                              title="Saved offline and synced to server"
                            >
                              Offline
                            </span>
                          )}
                        </div>
                      </div>
                    </Td>

                    {/* Student Info */}
                    <Td>
                      {student ? (
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => setSelectedStudentPassId(student.passId)}
                            className="text-left font-bold text-sm text-ops-ink hover:text-sky transition-colors flex items-center gap-1.5 group"
                          >
                            <span className="group-hover:underline">{student.name}</span>
                            <Icon
                              name="arrowRight"
                              size={12}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          </button>
                          <span className="text-ops-soft text-xs truncate max-w-xs font-medium">
                            {student.program}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5 text-[0.6875rem]">
                            <span className="font-mono text-ops-faint bg-ops-raise px-1.5 py-0.5 rounded border border-ops-line">
                              {student.code10}
                            </span>
                            {student.guestCount > 0 && (
                              <span className="text-go font-semibold">
                                +{student.guestCount} guest{student.guestCount > 1 ? 's' : ''}
                              </span>
                            )}
                            {student.email && (
                              <span className="text-ops-faint truncate max-w-[140px]">
                                {student.email}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-ops-soft text-xs font-mono font-bold">
                            Raw: {scan.rawCode || 'Unknown code'}
                          </span>
                          <span className="text-ops-faint text-[0.6875rem]">
                            No matched student pass in database
                          </span>
                        </div>
                      )}
                    </Td>

                    {/* Volunteer Info */}
                    <Td>
                      {volunteer ? (
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => setSelectedVolunteerId(volunteer.id)}
                            className="text-left font-bold text-xs text-ops-ink hover:text-sky transition-colors flex items-center gap-1.5 group"
                          >
                            <span className="group-hover:underline">
                              {volunteer.name ?? 'Volunteer'}
                            </span>
                            <Icon
                              name="arrowRight"
                              size={11}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          </button>
                          <span className="text-ops-faint text-[0.6875rem] font-mono">
                            {volunteer.email ?? 'No email on record'}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className={cn(
                                'text-[0.625rem] font-bold px-1.5 py-0.5 rounded uppercase border',
                                volunteer.role === 'ADMIN'
                                  ? 'bg-sky/15 text-sky border-sky/30'
                                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                              )}
                            >
                              {ROLE_LABEL[volunteer.role]}
                            </span>
                            {volunteer.lastSeenAt && (
                              <span
                                className="text-ops-faint text-[0.6875rem]"
                                title={`Last active: ${stamp(volunteer.lastSeenAt)}`}
                              >
                                Seen {ago(volunteer.lastSeenAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-ops-faint text-xs font-mono">System / Console</span>
                      )}
                    </Td>

                    {/* Gate & Lane */}
                    <Td>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-ops-ink font-semibold text-xs">
                          {gate?.name ?? 'Main Gate'}
                        </span>
                        <span className="text-ops-faint font-mono text-[0.6875rem]">
                          Gate: {gate?.code ?? 'MAIN'}
                        </span>
                        {scan.deviceId && (
                          <span className="text-ops-faint font-mono text-[0.625rem] truncate max-w-[120px]">
                            Dev: {scan.deviceId}
                          </span>
                        )}
                      </div>
                    </Td>

                    {/* Verdict & Outcome */}
                    <Td>
                      <div className="flex flex-col gap-1 items-start">
                        <SignalBadge
                          signal={OUTCOME_SIGNAL[scan.outcome]}
                          icon={OUTCOME_ICON[scan.outcome]}
                        >
                          {OUTCOME_LABEL[scan.outcome]}
                        </SignalBadge>
                        {scan.reason && (
                          <span className="text-ops-faint text-[0.6875rem] max-w-xs font-medium">
                            {scan.reason.replace(/_/g, ' ')}
                          </span>
                        )}
                        {scan.overridden && (
                          <span className="bg-amber-400/20 text-amber-300 text-[0.625rem] font-bold px-1 rounded">
                            Supervisor Override
                          </span>
                        )}
                      </div>
                    </Td>

                    {/* Actions */}
                    <Td className="text-right">
                      {student && (
                        <OpsButton
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedStudentPassId(student.passId)}
                        >
                          Timeline
                        </OpsButton>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </DataTable>

            {/* Load More Pagination */}
            {paged.hasMore && (
              <div className="p-4 border-t border-ops-line flex justify-center">
                <OpsButton
                  variant="outline"
                  size="sm"
                  onClick={paged.loadMore}
                  disabled={paged.loadingMore}
                >
                  {paged.loadingMore ? 'Loading more scans…' : 'Load More Scans'}
                </OpsButton>
              </div>
            )}
          </>
        )}
      </Panel>

      {/* ====================================================================== */}
      {/* Student Timeline Inspection Modal                                       */}
      {/* ====================================================================== */}
      <OpsModal
        open={selectedStudentPassId !== null}
        onClose={() => setSelectedStudentPassId(null)}
        title={
          studentScans?.[0]?.student?.name
            ? `Scan Timeline: ${studentScans[0].student.name}`
            : 'Student Scan Timeline'
        }
        hint="Every gate scan attempt recorded for this student pass"
        icon="qr"
      >
        {studentLoading ? (
          <div className="py-6">
            <Skeleton rows={4} />
          </div>
        ) : studentScans && studentScans.length > 0 ? (
          <div className="flex flex-col gap-5">
            {/* Student metadata header card */}
            {studentScans[0]?.student && (
              <div className="bg-ops-panel border border-ops-line rounded-xl p-4 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-base font-bold text-ops-ink">
                    {studentScans[0].student.name}
                  </span>
                  <span className="bg-ops-raise border border-ops-line font-mono text-xs px-2 py-0.5 rounded text-ops-soft font-bold">
                    Pass: {studentScans[0].student.code10}
                  </span>
                </div>
                <p className="text-xs text-ops-soft">{studentScans[0].student.program}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-ops-line text-xs">
                  <div>
                    <span className="text-ops-faint block text-[0.6875rem]">Roll/Form No</span>
                    <span className="text-ops-ink font-mono font-medium">
                      {studentScans[0].student.formNumber ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-ops-faint block text-[0.6875rem]">Email</span>
                    <span className="text-ops-ink truncate block">
                      {studentScans[0].student.email ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-ops-faint block text-[0.6875rem]">Phone</span>
                    <span className="text-ops-ink font-mono">
                      {studentScans[0].student.contactNo ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-ops-faint block text-[0.6875rem]">Companions</span>
                    <span className="text-ops-ink font-bold">
                      {studentScans[0].student.guestCount} guest
                      {studentScans[0].student.guestCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div>
                    <span className="text-ops-faint block text-[0.6875rem]">QR Life / Allowance</span>
                    <span className="text-ops-ink font-bold">
                      {studentScans[0].student.scanLimit} scans max
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Chronological Timeline */}
            <div className="flex flex-col gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-ops-soft">
                Chronological Scan Attempts ({studentScans.length})
              </span>
              <div className="border border-ops-line rounded-xl overflow-hidden divide-y divide-ops-line bg-ops-panel/40">
                {studentScans.map((attempt, idx) => (
                  <div key={attempt.id} className="p-3.5 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="size-6 rounded-full bg-ops-raise border border-ops-line text-ops-ink font-bold font-mono text-xs grid place-items-center shrink-0 mt-0.5">
                        {studentScans.length - idx}
                      </span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-ops-ink">
                            {attempt.gate?.name ?? 'Gate Scan'} ({attempt.gate?.code ?? 'MAIN'})
                          </span>
                          <span className="text-ops-faint font-mono text-[0.6875rem]">
                            via {METHOD_LABEL[attempt.method]}
                          </span>
                        </div>
                        <p className="text-xs text-ops-soft">
                          Scanned by{' '}
                          <span className="font-bold text-ops-ink">
                            {attempt.volunteer?.name ?? 'System'}
                          </span>{' '}
                          ({attempt.volunteer?.email ?? 'no email'})
                        </p>
                        <span className="text-[0.6875rem] text-ops-faint font-mono mt-0.5">
                          {stamp(attempt.scannedAt)} ({ago(attempt.scannedAt)})
                        </span>
                      </div>
                    </div>
                    <SignalBadge
                      signal={OUTCOME_SIGNAL[attempt.outcome]}
                      icon={OUTCOME_ICON[attempt.outcome]}
                    >
                      {OUTCOME_LABEL[attempt.outcome]}
                    </SignalBadge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState icon="qr" title="No scan history found for this pass" />
        )}
      </OpsModal>

      {/* ====================================================================== */}
      {/* Volunteer Profile & Login History Modal                                 */}
      {/* ====================================================================== */}
      <OpsModal
        open={selectedVolunteerId !== null}
        onClose={() => setSelectedVolunteerId(null)}
        title={
          volunteerActivity?.name
            ? `Volunteer Activity: ${volunteerActivity.name}`
            : 'Volunteer Activity & Login History'
        }
        hint="Profile, authentication activity, gate operation metrics, and scan ledger"
        icon="headset"
      >
        {volunteerLoading ? (
          <div className="py-6">
            <Skeleton rows={5} />
          </div>
        ) : volunteerActivity ? (
          <div className="flex flex-col gap-5">
            {/* Volunteer identity and login status card */}
            <div className="bg-ops-panel border border-ops-line rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-base font-bold text-ops-ink block">
                    {volunteerActivity.name ?? 'Unnamed Member'}
                  </span>
                  <span className="text-xs text-ops-soft font-mono">
                    {volunteerActivity.email ?? 'No email'}
                  </span>
                </div>
                <span
                  className={cn(
                    'text-xs font-bold px-2 py-0.5 rounded border uppercase',
                    volunteerActivity.role === 'ADMIN'
                      ? 'bg-sky/15 text-sky border-sky/30'
                      : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                  )}
                >
                  {ROLE_LABEL[volunteerActivity.role]}
                </span>
              </div>

              {/* Login & Activity Status */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-ops-line text-xs">
                <div>
                  <span className="text-ops-faint block text-[0.6875rem]">Account Status</span>
                  <span
                    className={cn(
                      'font-bold',
                      volunteerActivity.isActive ? 'text-go' : 'text-stop',
                    )}
                  >
                    {volunteerActivity.isActive ? 'Active' : 'Deactivated'}
                  </span>
                </div>
                <div>
                  <span className="text-ops-faint block text-[0.6875rem]">Last Active / Login</span>
                  <span
                    className="text-ops-ink font-medium"
                    title={
                      volunteerActivity.lastSeenAt ? stamp(volunteerActivity.lastSeenAt) : undefined
                    }
                  >
                    {volunteerActivity.lastSeenAt ? ago(volunteerActivity.lastSeenAt) : 'Never'}
                  </span>
                </div>
                <div>
                  <span className="text-ops-faint block text-[0.6875rem]">Total Scans Done</span>
                  <span className="text-ops-ink font-mono font-bold text-sm">
                    {count(volunteerActivity.stats.totalScans)}
                  </span>
                </div>
                <div>
                  <span className="text-ops-faint block text-[0.6875rem]">Member Since</span>
                  <span className="text-ops-ink font-mono">
                    {new Date(volunteerActivity.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Performance Stats Breakdown */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-ops-raise/50 border border-ops-line p-3 rounded-xl">
                <span className="text-ops-faint block text-[0.6875rem]">Admitted</span>
                <span className="text-go font-mono text-lg font-black">
                  {count(volunteerActivity.stats.admittedCount)}
                </span>
              </div>
              <div className="bg-ops-raise/50 border border-ops-line p-3 rounded-xl">
                <span className="text-ops-faint block text-[0.6875rem]">Duplicates Caught</span>
                <span className="text-warn font-mono text-lg font-black">
                  {count(volunteerActivity.stats.duplicateCount)}
                </span>
              </div>
              <div className="bg-ops-raise/50 border border-ops-line p-3 rounded-xl">
                <span className="text-ops-faint block text-[0.6875rem]">Blocked / Refused</span>
                <span className="text-stop font-mono text-lg font-black">
                  {count(volunteerActivity.stats.refusedCount)}
                </span>
              </div>
            </div>

            {/* Gates operated */}
            {volunteerActivity.stats.gatesOperated.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-ops-soft">
                  Gates Operated
                </span>
                <div className="flex flex-wrap gap-2">
                  {volunteerActivity.stats.gatesOperated.map((g) => (
                    <span
                      key={g.code}
                      className="bg-ops-panel border border-ops-line px-2.5 py-1 rounded-lg text-xs font-medium text-ops-ink flex items-center gap-1.5"
                    >
                      <span className="font-bold">{g.name}</span>
                      <span className="text-ops-faint font-mono text-[0.6875rem]">
                        ({count(g.count)} scans)
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Audit Log Actions */}
            {volunteerActivity.recentAuditLogs.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-ops-soft">
                  Recent Actions & Sync Log
                </span>
                <div className="border border-ops-line rounded-xl overflow-hidden divide-y divide-ops-line bg-ops-panel/40 text-xs">
                  {volunteerActivity.recentAuditLogs.map((log) => (
                    <div key={log.id} className="p-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-ops-ink">{log.action}</span>
                        <span className="text-ops-faint text-[0.6875rem] block font-mono">
                          {stamp(log.createdAt)} ({ago(log.createdAt)})
                        </span>
                      </div>
                      <span className="text-ops-soft text-[0.6875rem] font-mono shrink-0">
                        {log.entityType}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon="headset" title="No volunteer details available" />
        )}
      </OpsModal>
    </div>
  )
}
