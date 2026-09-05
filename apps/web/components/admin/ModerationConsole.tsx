'use client'

/**
 * Moderation — the queue of student selfies waiting on a human.
 *
 * ## This screen looks at faces, so it is careful about them
 *
 * Fetching a page writes one `selfie.viewed` audit entry per card — looking at a
 * queue of students' faces is precisely the access the DPDP trail exists to record.
 * That has two consequences the design follows:
 *
 * 1. **No realtime.** Every other console re-reads on an event; this one must not,
 *    because a background refresh would log a fresh batch of face-views nobody asked
 *    for. Rows change only on a deliberate Refresh or filter change.
 * 2. **A decision patches the row in place** rather than refetching the queue — the
 *    resolved card stays, greyed, showing what happened, and the remaining faces are
 *    not re-fetched (and so not re-viewed) until the moderator asks.
 *
 * The `selfieUrl` is a ~60-second signed URL — never persisted, never cached. The
 * `<img>` sends `referrerPolicy="no-referrer"` so the signed URL never leaks in a
 * `Referer` header, and is not `next/image` (which would proxy and cache it).
 */

import { useCallback, useState } from 'react'

import {
  RETAKE_REASONS,
  type ModerationItem,
  type RegistrationStatus,
  type ReviewRequest,
  type ReviewResponse,
  type RetakeReasonCode,
} from '@orientation/contracts'

import { OpsModal, OpsSelect } from '@/components/admin/controls'
import { usePaged } from '@/components/admin/usePaged'
import { Icon } from '@/components/ui/Icon'
import {
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
  opsControl,
} from '@/components/ui/ops'
import { ago, fetchModeration, reviewRegistration, stamp } from '@/lib/admin'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useMutation } from '@/lib/client/useResource'

type Filter = 'pending' | 'flagged' | 'all'
type Decision = ReviewRequest['decision']

const STATUS_LABEL: Record<RegistrationStatus, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending',
  APPROVED: 'Approved',
  REVISION_REQUESTED: 'Revision sent',
  REJECTED: 'Rejected',
}

const STATUS_SIGNAL: Record<RegistrationStatus, Signal> = {
  DRAFT: 'idle',
  PENDING_REVIEW: 'warn',
  APPROVED: 'go',
  REVISION_REQUESTED: 'info',
  REJECTED: 'stop',
}

const DECISIONS: { value: Decision; label: string; verb: string }[] = [
  { value: 'APPROVE', label: 'Approve', verb: 'Approve & issue pass' },
  { value: 'REQUEST_REVISION', label: 'Ask for a retake', verb: 'Request revision' },
  { value: 'REJECT', label: 'Reject', verb: 'Reject registration' },
]

/** "NO_FACE" → "No face" — a short handle for the dropdown; the full text shows below. */
function reasonLabel(code: RetakeReasonCode): string {
  const words = code.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function faceBadge(faceDetected: boolean | null) {
  if (faceDetected === true) return { signal: 'go' as Signal, label: 'Face found', icon: 'check' as const }
  if (faceDetected === false) return { signal: 'stop' as Signal, label: 'No face', icon: 'alert' as const }
  return { signal: 'idle' as Signal, label: 'Face unchecked', icon: 'clock' as const }
}

export function ModerationConsole() {
  const [filter, setFilter] = useState<Filter>('pending')
  const [selected, setSelected] = useState<ModerationItem | null>(null)
  const [decision, setDecision] = useState<Decision>('APPROVE')
  const [reasonCode, setReasonCode] = useState<RetakeReasonCode | ''>('')
  const [note, setNote] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const fetchPage = useCallback(
    (cursor: string | undefined, signal: AbortSignal) =>
      fetchModeration({ limit: 24, cursor, filter }, signal),
    [filter],
  )
  const queue = usePaged<ModerationItem>(fetchPage, [filter])

  const review = useMutation<{ id: string; body: ReviewRequest }, ReviewResponse>(
    useCallback(({ id, body }: { id: string; body: ReviewRequest }) => reviewRegistration(id, body), []),
  )

  function openReview(item: ModerationItem) {
    review.reset()
    setDecision('APPROVE')
    setReasonCode('')
    setNote('')
    setSelected(item)
  }

  const ready =
    decision === 'APPROVE'
      ? true
      : decision === 'REQUEST_REVISION'
        ? reasonCode !== '' || note.trim() !== ''
        : note.trim() !== ''

  async function submit() {
    if (selected === null || !ready) return
    let body: ReviewRequest
    if (decision === 'APPROVE') {
      body = { decision, note: note.trim() !== '' ? note.trim() : undefined }
    } else if (decision === 'REQUEST_REVISION') {
      body = {
        decision,
        reasonCode: reasonCode !== '' ? reasonCode : undefined,
        note: note.trim() !== '' ? note.trim() : undefined,
      }
    } else {
      body = { decision, note: note.trim() }
    }
    const result = await review.run({ id: selected.registrationId, body })
    if (result.ok) {
      const id = selected.registrationId
      const status = result.data.status
      queue.patch(
        (row) => row.registrationId === id,
        (row) => ({ ...row, status }),
      )
      setNotice(`${selected.name} — ${STATUS_LABEL[status].toLowerCase()}.`)
      setSelected(null)
    }
  }

  const reviewBanner = review.error !== null && review.error.fields === undefined ? review.error : null

  return (
    <div className="flex flex-col gap-6">
      <OpsHeading
        eyebrow="Faces · every view is audited"
        title="Moderation"
        lede="Selfies waiting on a human. Approve to issue the pass, ask for a retake with a reason the student can act on, or reject."
        action={
          <OpsButton size="sm" variant="outline" icon="search" onClick={queue.refresh} disabled={queue.loading}>
            {queue.loading ? 'Loading…' : 'Refresh'}
          </OpsButton>
        }
      />

      <Panel title="Queue" hint="Newest first · flagged surfaces no-face and name mismatches" icon="camera" flush>
        <div className="border-ops-line/70 flex items-center gap-3 border-b px-5 py-3">
          <label htmlFor="mod-filter" className="text-ops-faint text-xs font-semibold tracking-wide uppercase">
            Show
          </label>
          <div className="w-48">
            <OpsSelect
              id="mod-filter"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as Filter)
              }}
            >
              <option value="pending">Pending review</option>
              <option value="flagged">Flagged first</option>
              <option value="all">Everything</option>
            </OpsSelect>
          </div>
        </div>

        {queue.loading ? (
          <div className="p-5">
            <Skeleton rows={6} />
          </div>
        ) : queue.items.length === 0 ? (
          queue.error !== null ? (
            <div className="p-5">
              <ErrorNote error={queue.error} onRetry={queue.refresh} />
            </div>
          ) : (
            <EmptyState icon="check" title="Queue clear">
              Nothing is waiting on review for this filter.
            </EmptyState>
          )
        ) : (
          <div className="p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {queue.items.map((item) => {
                const face = faceBadge(item.faceDetected)
                const resolved = item.status !== 'PENDING_REVIEW'
                const divergent = item.rosterName !== item.name
                return (
                  <article
                    key={item.registrationId}
                    className={cn(
                      'ring-ops-line bg-ops-raise/30 flex flex-col overflow-hidden rounded-lg ring-1 transition-opacity',
                      resolved && 'opacity-60',
                    )}
                  >
                    {item.selfieUrl !== null ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed 60s URL; next/image would proxy & cache a face
                      <img
                        src={item.selfieUrl}
                        alt={`Selfie submitted by ${item.name}`}
                        className="aspect-[3/4] w-full bg-black/40 object-cover"
                        referrerPolicy="no-referrer"
                        draggable={false}
                      />
                    ) : (
                      <div className="text-ops-faint flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 bg-black/40">
                        <Icon name="camera" size={28} />
                        <span className="text-xs">No photo</span>
                      </div>
                    )}
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-ops-ink truncate font-semibold">{item.name}</p>
                          <p className="text-ops-faint truncate text-xs">
                            {item.reference} · {item.program}
                          </p>
                        </div>
                        <SignalBadge signal={STATUS_SIGNAL[item.status]}>{STATUS_LABEL[item.status]}</SignalBadge>
                      </div>

                      {divergent ? (
                        <div className="bg-warn/8 ring-warn/30 rounded-md px-3 py-2 ring-1">
                          <p className="text-warn text-[11px] font-semibold tracking-wide uppercase">Name mismatch</p>
                          <p className="text-ops-soft text-xs">
                            Roster: <span className="text-ops-ink">{item.rosterName}</span>
                          </p>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <SignalBadge signal={face.signal} icon={face.icon}>
                          {face.label}
                        </SignalBadge>
                        {item.guestCount > 0 ? (
                          <SignalBadge signal="info" icon="people">
                            {item.guestCount} guest{item.guestCount === 1 ? '' : 's'}
                          </SignalBadge>
                        ) : null}
                      </div>

                      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                        <span className="text-ops-faint text-xs" title={stamp(item.submittedAt)}>
                          {ago(item.submittedAt)}
                        </span>
                        <OpsButton
                          size="sm"
                          variant={resolved ? 'ghost' : 'primary'}
                          icon={resolved ? undefined : 'shield'}
                          onClick={() => {
                            openReview(item)
                          }}
                          disabled={resolved}
                        >
                          {resolved ? 'Reviewed' : 'Review'}
                        </OpsButton>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            {queue.error !== null ? <ErrorNote className="mt-4" error={queue.error} /> : null}
            {queue.hasMore ? (
              <div className="mt-5 flex justify-center">
                <OpsButton variant="outline" onClick={queue.loadMore} disabled={queue.loadingMore}>
                  {queue.loadingMore ? 'Loading…' : 'Load more'}
                </OpsButton>
              </div>
            ) : null}
          </div>
        )}
      </Panel>

      <OpsModal
        open={selected !== null}
        onClose={() => {
          setSelected(null)
        }}
        title={selected !== null ? `Review · ${selected.name}` : 'Review'}
        hint={selected !== null ? `${selected.reference} · ${selected.program}` : undefined}
        icon="shield"
        tone={decision === 'REJECT' ? 'danger' : 'neutral'}
        footer={
          <div className="flex justify-end gap-3">
            <OpsButton
              variant="ghost"
              onClick={() => {
                setSelected(null)
              }}
            >
              Cancel
            </OpsButton>
            <OpsButton
              variant={decision === 'REJECT' ? 'danger' : 'primary'}
              onClick={() => {
                void submit()
              }}
              disabled={!ready || review.pending}
              data-autofocus
            >
              {review.pending ? 'Saving…' : (DECISIONS.find((d) => d.value === decision)?.verb ?? 'Save')}
            </OpsButton>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            {DECISIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => {
                  setDecision(d.value)
                }}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-semibold ring-1 transition-colors',
                  decision === d.value
                    ? 'bg-sky text-navy ring-sky'
                    : 'bg-ops text-ops-soft ring-ops-line hover:text-ops-ink',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>

          {decision === 'REQUEST_REVISION' ? (
            <>
              <OpsField label="Reason" htmlFor="mod-reason" hint="Shown to the student, word for word.">
                <OpsSelect
                  id="mod-reason"
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
            htmlFor="mod-note"
            hint={
              decision === 'APPROVE'
                ? 'Optional. Kept internal — the student does not see it.'
                : decision === 'REQUEST_REVISION'
                  ? 'Optional extra detail, added to the reason above.'
                  : 'Recorded and shown as the reason this was rejected.'
            }
            error={fieldError(review.error, 'note')}
          >
            <textarea
              id="mod-note"
              className={cn(opsControl, 'min-h-24 resize-y')}
              value={note}
              onChange={(event) => {
                setNote(event.target.value)
              }}
              maxLength={500}
              placeholder={decision === 'REJECT' ? 'Why this registration cannot proceed' : 'Add a note'}
            />
          </OpsField>

          {reviewBanner !== null ? <ErrorNote error={reviewBanner} /> : null}
        </div>
      </OpsModal>

      <LiveRegion>{notice}</LiveRegion>
    </div>
  )
}
