'use client'

/**
 * Registrations — the operational directory: find anyone, see where they stand,
 * and act on their pass.
 *
 * This is not the moderation queue (that screen shows faces and lives at
 * `/admin/moderation`). This table never loads a selfie, so it costs no
 * `selfie.viewed` audit entry to page through — an admin can search all 15,000 rows
 * freely. What it does own is the pass lifecycle and manual arrivals.
 *
 * ## Two filters that can only ever be "on", never "off"
 *
 * `noFace` and `checkedIn` are coerced booleans on the server (`z.coerce.boolean()`),
 * so `false` on the wire reads back as `true` — the string "false" is truthy. The only
 * safe values to send are `true` and absent. So both are modelled as toggles that add
 * a constraint when on and send nothing when off. There is deliberately no "not checked
 * in" filter: the contract cannot express it without reading as its opposite.
 *
 * ## Reverse check-in is offered only for arrivals recorded here
 *
 * Reversing a check-in needs the `CheckIn` row's id (`confirmCheckInId`), and the list
 * read-model carries `checkedInAt` but not that id. So a scanner's or a pre-existing
 * check-in cannot be reversed from this screen — only one an admin recorded in this
 * session, whose id we kept from the response. This is a real limit of the read model,
 * not an oversight; a general reversal needs the id in `RegistrationRow`.
 */

import { useCallback, useDeferredValue, useState } from 'react'

import {
  RETAKE_REASONS,
  type ManualCheckInRequest,
  type RegistrationRow,
  type RegistrationStatus,
  type RestorePassRequest,
  type ReviewRequest,
  type ReviewResponse,
  type RetakeReasonCode,
  type RevokePassRequest,
  type ReverseCheckInRequest,
} from '@orientation/contracts'

import { OpsModal, OpsSelect } from '@/components/admin/controls'
import { usePaged } from '@/components/admin/usePaged'
import { Icon } from '@/components/ui/Icon'
import {
  DataTable,
  EmptyState,
  ErrorNote,
  FactList,
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
  type ManualCheckInResult,
  type PassCodeResult,
  type ReverseCheckInResult,
  ago,
  fetchRegistrations,
  fetchStats,
  manualCheckIn,
  restorePass,
  reverseCheckIn,
  reviewRegistration,
  revokePass,
  stamp,
} from '@/lib/admin'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useRealtime } from '@/lib/client/RealtimeProvider'
import { useMutation, useResource } from '@/lib/client/useResource'

type StatusFilter = RegistrationStatus | ''
type Sort = 'submittedAt' | 'name'
type Order = 'asc' | 'desc'
type Mode = 'overview' | 'review' | 'checkin' | 'revoke' | 'restore' | 'reverse'
type Decision = ReviewRequest['decision']

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

const DECISION_VERB: Record<Decision, string> = {
  APPROVE: 'Approve & issue pass',
  REQUEST_REVISION: 'Request revision',
  REJECT: 'Reject registration',
}

function reasonLabel(code: RetakeReasonCode): string {
  const words = code.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function RegistrationsConsole() {
  // Filters.
  const [q, setQ] = useState('')
  const dq = useDeferredValue(q)
  const [status, setStatus] = useState<StatusFilter>('')
  const [program, setProgram] = useState('')
  const [noFace, setNoFace] = useState(false)
  const [checkedIn, setCheckedIn] = useState(false)
  const [sort, setSort] = useState<Sort>('submittedAt')
  const [order, setOrder] = useState<Order>('desc')

  // The programme dropdown is sourced from the stats breakdown, because the server
  // matches `program` exactly — a free-text box would need the 200-char string typed
  // verbatim. Loaded once; the list of programmes does not move during an event.
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
          // On → constrain; off → send nothing. Never `false` (see the header note).
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
  // Nudges that change the list. `stats.tick` is deliberately excluded — it fires every
  // few seconds, and reloading page one on each tick would yank an operator mid-read.
  useRealtime({
    'registration.created': () => refresh(),
    'registration.reviewed': () => refresh(),
    'checkin.recorded': () => refresh(),
  })

  // The row whose actions modal is open, and which action within it.
  const [active, setActive] = useState<RegistrationRow | null>(null)
  const [mode, setMode] = useState<Mode>('overview')
  const [notice, setNotice] = useState<string | null>(null)

  // Check-in ids for arrivals recorded in this session, so Reverse can be offered.
  const [sessionCheckIns, setSessionCheckIns] = useState<Record<string, string>>({})

  // Action sub-forms.
  const [decision, setDecision] = useState<Decision>('APPROVE')
  const [reasonCode, setReasonCode] = useState<RetakeReasonCode | ''>('')
  const [reviewNote, setReviewNote] = useState('')
  const [gateCode, setGateCode] = useState('MAIN')
  const [guests, setGuests] = useState(0)
  const [checkinNote, setCheckinNote] = useState('')
  const [revokeReason, setRevokeReason] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [restoreReason, setRestoreReason] = useState('')
  const [reverseReason, setReverseReason] = useState('')

  // Mutations. Each wraps the two-arg lib call so it fits `useMutation`'s single arg.
  const review = useMutation<{ id: string; body: ReviewRequest }, ReviewResponse>(
    useCallback(({ id, body }: { id: string; body: ReviewRequest }) => reviewRegistration(id, body), []),
  )
  const checkin = useMutation<{ id: string; body: ManualCheckInRequest }, ManualCheckInResult>(
    useCallback(({ id, body }: { id: string; body: ManualCheckInRequest }) => manualCheckIn(id, body), []),
  )
  const revoke = useMutation<{ id: string; body: RevokePassRequest }, PassCodeResult>(
    useCallback(({ id, body }: { id: string; body: RevokePassRequest }) => revokePass(id, body), []),
  )
  const restore = useMutation<{ id: string; body: RestorePassRequest }, PassCodeResult>(
    useCallback(({ id, body }: { id: string; body: RestorePassRequest }) => restorePass(id, body), []),
  )
  const reverse = useMutation<{ id: string; body: ReverseCheckInRequest }, ReverseCheckInResult>(
    useCallback(({ id, body }: { id: string; body: ReverseCheckInRequest }) => reverseCheckIn(id, body), []),
  )

  function open(row: RegistrationRow) {
    setActive(row)
    setMode('overview')
  }

  function goMode(next: Mode) {
    if (active === null) return
    if (next === 'review') {
      review.reset()
      setDecision('APPROVE')
      setReasonCode('')
      setReviewNote('')
    } else if (next === 'checkin') {
      checkin.reset()
      setGateCode('MAIN')
      setGuests(Math.min(active.guestCount, 2))
      setCheckinNote('')
    } else if (next === 'revoke') {
      revoke.reset()
      setRevokeReason('')
      setConfirmCode('')
    } else if (next === 'restore') {
      restore.reset()
      setRestoreReason('')
    } else if (next === 'reverse') {
      reverse.reset()
      setReverseReason('')
    }
    setMode(next)
  }

  function patchRow(id: string, next: (row: RegistrationRow) => RegistrationRow) {
    regs.patch((row) => row.id === id, next)
  }

  async function submitReview() {
    if (active === null) return
    let body: ReviewRequest
    if (decision === 'APPROVE') {
      body = { decision, note: reviewNote.trim() !== '' ? reviewNote.trim() : undefined }
    } else if (decision === 'REQUEST_REVISION') {
      body = {
        decision,
        reasonCode: reasonCode !== '' ? reasonCode : undefined,
        note: reviewNote.trim() !== '' ? reviewNote.trim() : undefined,
      }
    } else {
      body = { decision, note: reviewNote.trim() }
    }
    const id = active.id
    const result = await review.run({ id, body })
    if (result.ok) {
      const { status: newStatus, passCode10 } = result.data
      patchRow(id, (row) => ({
        ...row,
        status: newStatus,
        passCode10: passCode10 ?? row.passCode10,
        passStatus: passCode10 !== null ? 'ACTIVE' : row.passStatus,
      }))
      setNotice(`${active.name} — ${STATUS_LABEL[newStatus].toLowerCase()}.`)
      setActive(null)
    }
  }

  async function submitCheckin() {
    if (active === null) return
    const id = active.id
    const result = await checkin.run({
      id,
      body: { gateCode: gateCode.trim() || 'MAIN', guestsAdmitted: guests, note: checkinNote.trim() || undefined },
    })
    if (result.ok) {
      const recordedAt = result.data.recordedAt
      const checkInId = result.data.checkInId
      patchRow(id, (row) => ({ ...row, checkedInAt: recordedAt }))
      setSessionCheckIns((prev) => ({ ...prev, [id]: checkInId }))
      setNotice(`${active.name} checked in at ${gateCode.trim() || 'MAIN'}.`)
      setActive(null)
    }
  }

  async function submitRevoke() {
    if (active === null) return
    const id = active.id
    const result = await revoke.run({ id, body: { reason: revokeReason.trim(), confirmCode10: confirmCode.trim() } })
    if (result.ok) {
      patchRow(id, (row) => ({ ...row, passStatus: 'REVOKED' }))
      setNotice(`${active.name}'s pass revoked.`)
      setActive(null)
    }
  }

  async function submitRestore() {
    if (active === null) return
    const id = active.id
    const result = await restore.run({ id, body: { reason: restoreReason.trim() } })
    if (result.ok) {
      patchRow(id, (row) => ({ ...row, passStatus: 'ACTIVE' }))
      setNotice(`${active.name}'s pass restored.`)
      setActive(null)
    }
  }

  async function submitReverse() {
    if (active === null) return
    const id = active.id
    const checkInId = sessionCheckIns[id]
    if (checkInId === undefined) return
    const result = await reverse.run({ id, body: { reason: reverseReason.trim(), confirmCheckInId: checkInId } })
    if (result.ok) {
      patchRow(id, (row) => ({ ...row, checkedInAt: null }))
      setSessionCheckIns((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setNotice(`${active.name}'s check-in reversed.`)
      setActive(null)
    }
  }

  const activeError =
    mode === 'review'
      ? review.error
      : mode === 'checkin'
        ? checkin.error
        : mode === 'revoke'
          ? revoke.error
          : mode === 'restore'
            ? restore.error
            : mode === 'reverse'
              ? reverse.error
              : null
  const activeBanner = activeError !== null && activeError.fields === undefined ? activeError : null

  return (
    <div className="flex flex-col gap-6">
      <OpsHeading
        eyebrow="Directory · passes & arrivals"
        title="Registrations"
        lede="Find anyone by name, form number, reference or pass code. Manage their pass and record arrivals by hand."
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

          <div className="flex flex-wrap items-center gap-3">
            <FilterChip active={noFace} onClick={() => { setNoFace((v) => !v) }} icon="alert">
              No face detected
            </FilterChip>
            <FilterChip active={checkedIn} onClick={() => { setCheckedIn((v) => !v) }} icon="check">
              Checked in
            </FilterChip>
            <div className="ml-auto flex items-center gap-2">
              <label htmlFor="rg-sort" className="text-ops-faint text-xs font-semibold tracking-wide uppercase">
                Sort
              </label>
              <div className="w-40">
                <OpsSelect
                  id="rg-sort"
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value as Sort)
                  }}
                >
                  <option value="submittedAt">Submitted</option>
                  <option value="name">Name</option>
                </OpsSelect>
              </div>
              <OpsButton
                size="sm"
                variant="outline"
                onClick={() => {
                  setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
                }}
              >
                {order === 'desc' ? 'Newest' : 'Oldest'}
              </OpsButton>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Results" hint="Newest first unless re-sorted" icon="people" flush>
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
              {regs.items.map((row) => (
                <tr key={row.id} className="hover:bg-ops-raise/40">
                  <Td>
                    <span className="text-ops-ink block font-semibold">{row.name}</span>
                    <span className="text-ops-faint block text-xs">
                      {row.reference} · {row.formNumber}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-ops-soft text-xs">{row.program}</span>
                  </Td>
                  <Td>
                    <SignalBadge signal={STATUS_SIGNAL[row.status]}>{STATUS_LABEL[row.status]}</SignalBadge>
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
                          <code className="text-ops-faint text-[11px]">{row.passCode10}</code>
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
                      variant="outline"
                      onClick={() => {
                        open(row)
                      }}
                    >
                      Manage
                    </OpsButton>
                  </Td>
                </tr>
              ))}
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

      <OpsModal
        open={active !== null}
        onClose={() => {
          setActive(null)
        }}
        title={active !== null ? active.name : 'Registration'}
        hint={active !== null ? `${active.reference} · ${active.program}` : undefined}
        icon="id"
        tone={mode === 'revoke' || mode === 'reverse' || (mode === 'review' && decision === 'REJECT') ? 'danger' : 'neutral'}
        footer={active !== null ? modalFooter() : undefined}
      >
        {active !== null ? modalBody(active) : null}
      </OpsModal>

      <LiveRegion>{notice}</LiveRegion>
    </div>
  )

  /* ---- modal render helpers (closures over state; kept here for locality) ---- */

  function modalBody(row: RegistrationRow) {
    if (mode === 'overview') {
      const canReview = row.status === 'PENDING_REVIEW'
      const canCheckIn = row.passStatus === 'ACTIVE' && row.checkedInAt === null
      const canReverse = row.checkedInAt !== null && sessionCheckIns[row.id] !== undefined
      const canRevoke = row.passStatus === 'ACTIVE'
      const canRestore = row.passStatus === 'REVOKED'
      return (
        <div className="flex flex-col gap-5">
          <FactList
            facts={[
              { label: 'Status', value: STATUS_LABEL[row.status] },
              { label: 'Programme', value: row.program },
              { label: 'Form number', value: row.formNumber },
              { label: 'Contact', value: row.contactNo },
              { label: 'Guests', value: row.guestCount, numeric: true },
              {
                label: 'Selfie',
                value: row.hasSelfie ? (row.faceDetected === false ? 'On file · no face' : 'On file') : 'None',
              },
              {
                label: 'Pass',
                value:
                  row.passStatus === null
                    ? 'Not issued'
                    : `${row.passCode10 ?? '—'} · ${row.passStatus === 'ACTIVE' ? 'Active' : 'Revoked'}`,
              },
              { label: 'Checked in', value: row.checkedInAt !== null ? stamp(row.checkedInAt) : 'No' },
              { label: 'Submitted', value: stamp(row.submittedAt) },
              ...(row.reviewNote !== null ? [{ label: 'Review note', value: row.reviewNote }] : []),
            ]}
          />

          <div className="flex flex-wrap gap-2">
            {canReview ? (
              <OpsButton size="sm" variant="primary" icon="shield" onClick={() => { goMode('review') }}>
                Review
              </OpsButton>
            ) : null}
            {canCheckIn ? (
              <OpsButton size="sm" variant="outline" icon="check" onClick={() => { goMode('checkin') }}>
                Manual check-in
              </OpsButton>
            ) : null}
            {canReverse ? (
              <OpsButton size="sm" variant="danger" onClick={() => { goMode('reverse') }}>
                Reverse check-in
              </OpsButton>
            ) : null}
            {canRevoke ? (
              <OpsButton size="sm" variant="danger" onClick={() => { goMode('revoke') }}>
                Revoke pass
              </OpsButton>
            ) : null}
            {canRestore ? (
              <OpsButton size="sm" variant="outline" onClick={() => { goMode('restore') }}>
                Restore pass
              </OpsButton>
            ) : null}
          </div>

          {row.checkedInAt !== null && sessionCheckIns[row.id] === undefined ? (
            <p className="text-ops-faint text-xs">
              This arrival was recorded by a scanner or before this session, so it cannot be reversed here.
            </p>
          ) : null}
        </div>
      )
    }

    if (mode === 'review') {
      return (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            {(['APPROVE', 'REQUEST_REVISION', 'REJECT'] as Decision[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDecision(d)
                }}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-semibold ring-1 transition-colors',
                  decision === d ? 'bg-sky text-navy ring-sky' : 'bg-ops text-ops-soft ring-ops-line hover:text-ops-ink',
                )}
              >
                {d === 'APPROVE' ? 'Approve' : d === 'REQUEST_REVISION' ? 'Retake' : 'Reject'}
              </button>
            ))}
          </div>
          {decision === 'REQUEST_REVISION' ? (
            <>
              <OpsField label="Reason" htmlFor="rg-reason" hint="Shown to the student, word for word.">
                <OpsSelect
                  id="rg-reason"
                  value={reasonCode}
                  onChange={(event) => {
                    setReasonCode(event.target.value as RetakeReasonCode | '')
                  }}
                >
                  <option value="">Free text only</option>
                  {(Object.keys(RETAKE_REASONS) as RetakeReasonCode[]).map((code) => (
                    <option key={code} value={code}>
                      {reasonLabel(code)}
                    </option>
                  ))}
                </OpsSelect>
              </OpsField>
              {reasonCode !== '' ? (
                <p className="text-ops-soft bg-ops ring-ops-line rounded-md px-3.5 py-2.5 text-sm ring-1">
                  {RETAKE_REASONS[reasonCode]}
                </p>
              ) : null}
            </>
          ) : null}
          <OpsField
            label={decision === 'REJECT' ? 'Reason (required)' : 'Note'}
            htmlFor="rg-review-note"
            hint={
              decision === 'APPROVE'
                ? 'Optional. Internal — the student does not see it.'
                : decision === 'REQUEST_REVISION'
                  ? 'Optional detail added to the reason.'
                  : 'Recorded and shown as the reason.'
            }
            error={fieldError(review.error, 'note')}
          >
            <textarea
              id="rg-review-note"
              className={cn(opsControl, 'min-h-24 resize-y')}
              value={reviewNote}
              onChange={(event) => {
                setReviewNote(event.target.value)
              }}
              maxLength={500}
            />
          </OpsField>
          {activeBanner !== null ? <ErrorNote error={activeBanner} /> : null}
        </div>
      )
    }

    if (mode === 'checkin') {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-ops-soft text-sm">Record an arrival by hand. Same rules as a gate scan — a duplicate fails.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <OpsField label="Gate" htmlFor="rg-gate" error={fieldError(checkin.error, 'gateCode')}>
              <input
                id="rg-gate"
                className={opsControl}
                value={gateCode}
                onChange={(event) => {
                  setGateCode(event.target.value)
                }}
                autoComplete="off"
              />
            </OpsField>
            <OpsField label="Guests admitted" htmlFor="rg-guests" error={fieldError(checkin.error, 'guestsAdmitted')}>
              <input
                id="rg-guests"
                type="number"
                min={0}
                max={2}
                className={opsControl}
                value={guests}
                onChange={(event) => {
                  const n = Number.parseInt(event.target.value, 10)
                  setGuests(Number.isNaN(n) ? 0 : Math.max(0, Math.min(2, n)))
                }}
              />
            </OpsField>
          </div>
          <OpsField label="Note" htmlFor="rg-checkin-note" hint="Optional." error={fieldError(checkin.error, 'note')}>
            <input
              id="rg-checkin-note"
              className={opsControl}
              value={checkinNote}
              onChange={(event) => {
                setCheckinNote(event.target.value)
              }}
            />
          </OpsField>
          {activeBanner !== null ? <ErrorNote error={activeBanner} /> : null}
        </div>
      )
    }

    if (mode === 'revoke') {
      const codeMatches = active !== null && active.passCode10 !== null && confirmCode.trim() === active.passCode10
      return (
        <div className="flex flex-col gap-4">
          <p className="text-ops-soft text-sm">
            Revoking blocks this pass at the gate. Type the pass code back to confirm you have the right person.
          </p>
          <OpsField label="Reason" htmlFor="rg-revoke-reason" error={fieldError(revoke.error, 'reason')}>
            <input
              id="rg-revoke-reason"
              className={opsControl}
              value={revokeReason}
              onChange={(event) => {
                setRevokeReason(event.target.value)
              }}
              placeholder="Why this pass is being revoked"
            />
          </OpsField>
          <OpsField
            label="Confirm pass code"
            htmlFor="rg-confirm-code"
            error={fieldError(revoke.error, 'confirmCode10')}
            hint={active?.passCode10 !== null ? `Type ${active?.passCode10}` : undefined}
          >
            <input
              id="rg-confirm-code"
              className={opsControl}
              value={confirmCode}
              onChange={(event) => {
                setConfirmCode(event.target.value)
              }}
              autoComplete="off"
              spellCheck={false}
            />
          </OpsField>
          {confirmCode.trim() !== '' && !codeMatches ? (
            <p className="text-warn text-xs">That code does not match this registration&apos;s pass.</p>
          ) : null}
          {activeBanner !== null ? <ErrorNote error={activeBanner} /> : null}
        </div>
      )
    }

    if (mode === 'restore') {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-ops-soft text-sm">Restoring lets this pass through the gate again.</p>
          <OpsField label="Reason" htmlFor="rg-restore-reason" error={fieldError(restore.error, 'reason')}>
            <input
              id="rg-restore-reason"
              className={opsControl}
              value={restoreReason}
              onChange={(event) => {
                setRestoreReason(event.target.value)
              }}
              placeholder="Why this pass is being restored"
            />
          </OpsField>
          {activeBanner !== null ? <ErrorNote error={activeBanner} /> : null}
        </div>
      )
    }

    // reverse
    return (
      <div className="flex flex-col gap-4">
        <p className="text-ops-soft text-sm">
          This removes the check-in so the student can enter again. The reversal is recorded in the audit log.
        </p>
        <OpsField label="Reason" htmlFor="rg-reverse-reason" error={fieldError(reverse.error, 'reason')}>
          <input
            id="rg-reverse-reason"
            className={opsControl}
            value={reverseReason}
            onChange={(event) => {
              setReverseReason(event.target.value)
            }}
            placeholder="Why this check-in is being reversed"
          />
        </OpsField>
        {activeBanner !== null ? <ErrorNote error={activeBanner} /> : null}
      </div>
    )
  }

  function modalFooter() {
    if (mode === 'overview') {
      return (
        <div className="flex justify-end">
          <OpsButton variant="ghost" onClick={() => { setActive(null) }}>
            Close
          </OpsButton>
        </div>
      )
    }

    const back = (
      <OpsButton variant="ghost" onClick={() => { setMode('overview') }}>
        Back
      </OpsButton>
    )

    if (mode === 'review') {
      const ready =
        decision === 'APPROVE'
          ? true
          : decision === 'REQUEST_REVISION'
            ? reasonCode !== '' || reviewNote.trim() !== ''
            : reviewNote.trim() !== ''
      return (
        <div className="flex justify-between gap-3">
          {back}
          <OpsButton
            variant={decision === 'REJECT' ? 'danger' : 'primary'}
            onClick={() => { void submitReview() }}
            disabled={!ready || review.pending}
            data-autofocus
          >
            {review.pending ? 'Saving…' : DECISION_VERB[decision]}
          </OpsButton>
        </div>
      )
    }

    if (mode === 'checkin') {
      return (
        <div className="flex justify-between gap-3">
          {back}
          <OpsButton variant="primary" icon="check" onClick={() => { void submitCheckin() }} disabled={checkin.pending} data-autofocus>
            {checkin.pending ? 'Recording…' : 'Record check-in'}
          </OpsButton>
        </div>
      )
    }

    if (mode === 'revoke') {
      const codeMatches = active !== null && active.passCode10 !== null && confirmCode.trim() === active.passCode10
      return (
        <div className="flex justify-between gap-3">
          {back}
          <OpsButton
            variant="danger"
            onClick={() => { void submitRevoke() }}
            disabled={revokeReason.trim() === '' || !codeMatches || revoke.pending}
            data-autofocus
          >
            {revoke.pending ? 'Revoking…' : 'Revoke pass'}
          </OpsButton>
        </div>
      )
    }

    if (mode === 'restore') {
      return (
        <div className="flex justify-between gap-3">
          {back}
          <OpsButton variant="primary" onClick={() => { void submitRestore() }} disabled={restoreReason.trim() === '' || restore.pending} data-autofocus>
            {restore.pending ? 'Restoring…' : 'Restore pass'}
          </OpsButton>
        </div>
      )
    }

    // reverse
    return (
      <div className="flex justify-between gap-3">
        {back}
        <OpsButton variant="danger" onClick={() => { void submitReverse() }} disabled={reverseReason.trim() === '' || reverse.pending} data-autofocus>
          {reverse.pending ? 'Reversing…' : 'Reverse check-in'}
        </OpsButton>
      </div>
    )
  }
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
