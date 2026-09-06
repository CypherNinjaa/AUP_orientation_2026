'use client'

/**
 * Registrations — Operational directory & full administrative control console.
 *
 * Provides real-time searching, filtering, and instant inline inspection:
 * clicking any row smoothly expands an inline drawer directly beneath the row
 * (zero popup modals), giving full access to student data, official photos, 1-click
 * approve/reject, decision undo, QR validity lifespan extension/reduction, user bans,
 * and gate arrival controls.
 */

import React, { useCallback, useDeferredValue, useState } from 'react'

import {
  type RegistrationRow,
  type RegistrationStatus,
} from '@orientation/contracts'

import { OpsSelect } from '@/components/admin/controls'
import { RegistrationInlineDetail } from '@/components/admin/RegistrationInlineDetail'
import { usePaged } from '@/components/admin/usePaged'
import { Icon } from '@/components/ui/Icon'
import {
  DataTable,
  EmptyState,
  ErrorNote,
  LiveRegion,
  OpsButton,
  OpsField,
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
  fetchRegistrations,
  fetchStats,
  stamp,
} from '@/lib/admin'
import { cn } from '@/lib/cn'
import { useRealtime } from '@/lib/client/RealtimeProvider'
import { useResource } from '@/lib/client/useResource'

type StatusFilter = RegistrationStatus | ''
type Sort = 'submittedAt' | 'name'
type Order = 'asc' | 'desc'

const STATUS_LABEL: Record<RegistrationStatus, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REVISION_REQUESTED: 'Revision requested',
  REJECTED: 'Rejected',
}

const STATUS_SIGNAL: Record<RegistrationStatus, Signal> = {
  DRAFT: 'idle',
  PENDING_REVIEW: 'warn',
  APPROVED: 'go',
  REVISION_REQUESTED: 'info',
  REJECTED: 'stop',
}

export function RegistrationsConsole() {
  // Filters
  const [q, setQ] = useState('')
  const dq = useDeferredValue(q)
  const [status, setStatus] = useState<StatusFilter>('')
  const [program, setProgram] = useState('')
  const [noFace, setNoFace] = useState(false)
  const [checkedIn, setCheckedIn] = useState(false)
  const [sort, setSort] = useState<Sort>('submittedAt')
  const [order, setOrder] = useState<Order>('desc')

  // Expanded row id for the inline drawer (zero modals)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const stats = useResource(
    useCallback((signal: AbortSignal) => fetchStats(false, signal), []),
    [],
  )

  const trimmed = dq.trim()
  const fetchPage = useCallback(
    (cursor: string | undefined, signal: AbortSignal) =>
      fetchRegistrations(
        {
          limit: 50,
          cursor,
          status: status !== '' ? status : undefined,
          q: trimmed.length >= 2 ? trimmed : undefined,
          program: program !== '' ? program : undefined,
          noFace: noFace ? true : undefined,
          checkedIn: checkedIn ? true : undefined,
          sort,
          order,
        },
        signal,
      ),
    [status, trimmed, program, noFace, checkedIn, sort, order],
  )
  const regs = usePaged<RegistrationRow>(fetchPage, [status, trimmed, program, noFace, checkedIn, sort, order])

  const refresh = regs.refresh

  // Real-time synchronization (smooth background updates without table flicker)
  useRealtime({
    'registration.created': () => refresh({ silent: true }),
    'registration.reviewed': () => refresh({ silent: true }),
    'checkin.recorded': () => refresh({ silent: true }),
  })

  function patchRow(id: string, next: (row: RegistrationRow) => RegistrationRow) {
    regs.patch((row) => row.id === id, next)
  }

  function toggleExpand(id: string) {
    setExpandedId((curr) => (curr === id ? null : id))
  }

  return (
    <div className="flex flex-col gap-6">
      <OpsHeading
        eyebrow="Directory · passes & arrivals"
        title="Registrations"
        lede="Find anyone by name, form number, reference or pass code. Click any row to expand full administrative powers."
        action={
          <OpsButton size="sm" variant="outline" icon="search" onClick={refresh} disabled={regs.loading}>
            {regs.loading ? 'Loading…' : 'Refresh'}
          </OpsButton>
        }
      />

      <Panel title="Find" icon="search">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr]">
            <OpsField label="Search" htmlFor="rg-q" hint="Name, form number, reference or pass code.">
              <input
                id="rg-q"
                className={opsControl}
                value={q}
                onChange={(event) => {
                  setQ(event.target.value)
                }}
                placeholder="Type at least two characters"
                autoComplete="off"
              />
            </OpsField>
            <OpsField label="Status" htmlFor="rg-status">
              <OpsSelect
                id="rg-status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as StatusFilter)
                }}
              >
                <option value="">Any status</option>
                {(Object.keys(STATUS_LABEL) as RegistrationStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </OpsSelect>
            </OpsField>
            <OpsField label="Programme" htmlFor="rg-program">
              <OpsSelect
                id="rg-program"
                value={program}
                onChange={(event) => {
                  setProgram(event.target.value)
                }}
                disabled={stats.loading}
              >
                <option value="">Any programme</option>
                {(stats.data?.byProgram ?? []).map((p) => (
                  <option key={p.program} value={p.program}>
                    {p.program}
                  </option>
                ))}
              </OpsSelect>
            </OpsField>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip
                active={noFace}
                onClick={() => {
                  setNoFace(!noFace)
                }}
                icon="alert"
              >
                No face detected
              </FilterChip>
              <FilterChip
                active={checkedIn}
                onClick={() => {
                  setCheckedIn(!checkedIn)
                }}
                icon="check"
              >
                Checked in
              </FilterChip>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-ops-faint uppercase tracking-wider font-semibold">Sort</span>
              <OpsSelect
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as Sort)
                }}
                className="w-36"
              >
                <option value="submittedAt">Submitted</option>
                <option value="name">Name</option>
              </OpsSelect>
              <OpsButton
                size="sm"
                variant="outline"
                onClick={() => {
                  setOrder(order === 'asc' ? 'desc' : 'asc')
                }}
              >
                {order === 'asc' ? 'Oldest' : 'Newest'}
              </OpsButton>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Results" hint={regs.loading ? 'Searching…' : 'Newest first unless re-sorted'}>
        {regs.loading ? (
          <div className="p-5">
            <Skeleton rows={6} />
          </div>
        ) : regs.items.length === 0 ? (
          regs.error !== null ? (
            <div className="p-5">
              <ErrorNote error={regs.error} onRetry={refresh} />
            </div>
          ) : (
            <EmptyState icon="search" title="No matches">
              Nothing matches these filters. Clear the search or widen the status.
            </EmptyState>
          )
        ) : (
          <>
            <DataTable
              head={
                <>
                  <Th>Student</Th>
                  <Th>Programme</Th>
                  <Th>Status</Th>
                  <Th>Pass</Th>
                  <Th>Check-in</Th>
                  <Th align="right">Manage</Th>
                </>
              }
            >
              {regs.items.map((row) => {
                const isExpanded = expandedId === row.id
                return (
                  <React.Fragment key={row.id}>
                    <tr
                      onClick={() => toggleExpand(row.id)}
                      className={cn(
                        'cursor-pointer transition-colors',
                        isExpanded
                          ? 'bg-ops-raise/70 border-l-4 border-l-info'
                          : 'hover:bg-ops-raise/40',
                      )}
                    >
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Icon
                            name={isExpanded ? 'chevronDown' : 'chevronRight'}
                            size={14}
                            className={cn(
                              'transition-transform',
                              isExpanded ? 'text-info' : 'text-ops-faint',
                            )}
                          />
                          <div>
                            <span className="text-ops-ink block font-semibold">{row.name}</span>
                            <span className="text-ops-faint block font-mono text-xs">
                              {row.reference} · {row.formNumber}
                            </span>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <span className="text-ops-soft text-xs">{row.program}</span>
                      </Td>
                      <Td>
                        <SignalBadge signal={STATUS_SIGNAL[row.status]}>
                          {STATUS_LABEL[row.status]}
                        </SignalBadge>
                      </Td>
                      <Td>
                        {row.passStatus === null ? (
                          <span className="text-ops-faint text-xs">—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <SignalBadge signal={row.passStatus === 'ACTIVE' ? 'go' : 'stop'}>
                              {row.passStatus === 'ACTIVE' ? 'Active' : 'Revoked'}
                            </SignalBadge>
                            {row.passCode10 !== null ? (
                              <code className="text-ops-faint text-[11px] font-mono">
                                {row.passCode10}
                              </code>
                            ) : null}
                          </div>
                        )}
                      </Td>
                      <Td>
                        {row.checkedInAt !== null ? (
                          <span className="text-ops-soft text-xs" title={stamp(row.checkedInAt)}>
                            {ago(row.checkedInAt)}
                          </span>
                        ) : (
                          <span className="text-ops-faint text-xs">—</span>
                        )}
                      </Td>
                      <Td align="right">
                        <OpsButton
                          size="sm"
                          variant={isExpanded ? 'primary' : 'outline'}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleExpand(row.id)
                          }}
                        >
                          {isExpanded ? 'Collapse' : 'Inspect'}
                        </OpsButton>
                      </Td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${row.id}-expanded`} className="bg-ops-surface/80">
                        <td colSpan={6} className="p-0">
                          <RegistrationInlineDetail
                            row={row}
                            onUpdate={patchRow}
                            onClose={() => setExpandedId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </DataTable>
            {regs.error !== null ? (
              <div className="p-5 pt-4">
                <ErrorNote error={regs.error} />
              </div>
            ) : null}
            {regs.hasMore ? (
              <div className="border-ops-line/70 flex justify-center border-t p-4">
                <OpsButton variant="outline" onClick={regs.loadMore} disabled={regs.loadingMore}>
                  {regs.loadingMore ? 'Loading…' : 'Load more'}
                </OpsButton>
              </div>
            ) : null}
          </>
        )}
      </Panel>

      <LiveRegion>{regs.loading ? 'Updating directory…' : null}</LiveRegion>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function FilterChip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: 'alert' | 'check'
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors',
        active ? 'bg-sky text-navy ring-sky' : 'bg-ops text-ops-soft ring-ops-line hover:text-ops-ink',
      )}
    >
      <Icon name={icon} size={13} />
      {children}
    </button>
  )
}
