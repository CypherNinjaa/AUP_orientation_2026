'use client'

/**
 * RegistrationInlineDetail — comprehensive inline drawer for admin inspection & full control.
 *
 * Expands directly beneath any row in the registrations table (zero popups / modals).
 * Provides photo inspection, 1-click accept/reject, decision undo, QR life extension/reduction,
 * user account ban/unban with Clerk synchronization, and gate arrival overrides.
 */

import { useCallback, useState } from 'react'

import {
  RETAKE_REASONS,
  type RegistrationDetailView,
  type RegistrationRow,
  type RegistrationStatus,
  type RetakeReasonCode,
} from '@orientation/contracts'

import { OpsSelect } from '@/components/admin/controls'
import { useMutation, useResource } from '@/lib/client/useResource'
import { Icon } from '@/components/ui/Icon'
import {
  ErrorNote,
  OpsButton,
  OpsField,
  SignalBadge,
  Skeleton,
  opsControl,
  type Signal,
} from '@/components/ui/ops'
import {
  adjustQrLife,
  ago,
  fetchRegistrationDetail,
  manualCheckIn,
  restorePass,
  reverseCheckIn,
  reviewRegistration,
  revokePass,
  setUserStatus,
  stamp,
  undoReview,
} from '@/lib/admin'
import { cn } from '@/lib/cn'

const STATUS_SIGNAL: Record<RegistrationStatus, Signal> = {
  DRAFT: 'idle',
  PENDING_REVIEW: 'warn',
  APPROVED: 'go',
  REVISION_REQUESTED: 'info',
  REJECTED: 'stop',
}

const STATUS_LABEL: Record<RegistrationStatus, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REVISION_REQUESTED: 'Revision requested',
  REJECTED: 'Rejected',
}

interface Props {
  row: RegistrationRow
  onUpdate: (id: string, patch: (prev: RegistrationRow) => RegistrationRow) => void
  onClose: () => void
}

export function RegistrationInlineDetail({ row, onUpdate, onClose }: Props) {
  const [feedback, setFeedback] = useState<string | null>(null)
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [revisionMode, setRevisionMode] = useState(false)
  const [revisionReasonCode, setRevisionReasonCode] = useState<RetakeReasonCode | ''>('')
  const [revisionNote, setRevisionNote] = useState('')
  const [banConfirmOpen, setBanConfirmOpen] = useState(false)
  const [banReason, setBanReason] = useState('')
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false)
  const [revokeReason, setRevokeReason] = useState('')

  const fetchDetail = useCallback(
    (signal: AbortSignal) => fetchRegistrationDetail(row.id, signal),
    [row.id],
  )
  const resource = useResource<RegistrationDetailView>(fetchDetail, [row.id])
  const detail = resource.data

  const reviewM = useMutation(
    useCallback(
      ({ id, body }: { id: string; body: Parameters<typeof reviewRegistration>[1] }) =>
        reviewRegistration(id, body),
      [],
    ),
  )

  const undoM = useMutation(useCallback((id: string) => undoReview(id), []))
  const qrLifeM = useMutation(
    useCallback(
      ({ id, body }: { id: string; body: Parameters<typeof adjustQrLife>[1] }) =>
        adjustQrLife(id, body),
      [],
    ),
  )
  const userStatusM = useMutation(
    useCallback(
      ({ id, body }: { id: string; body: Parameters<typeof setUserStatus>[1] }) =>
        setUserStatus(id, body),
      [],
    ),
  )
  const revokeM = useMutation(
    useCallback(
      ({ id, body }: { id: string; body: Parameters<typeof revokePass>[1] }) =>
        revokePass(id, body),
      [],
    ),
  )
  const restoreM = useMutation(
    useCallback(
      ({ id, body }: { id: string; body: Parameters<typeof restorePass>[1] }) =>
        restorePass(id, body),
      [],
    ),
  )
  const checkInM = useMutation(
    useCallback(
      ({ id, body }: { id: string; body: Parameters<typeof manualCheckIn>[1] }) =>
        manualCheckIn(id, body),
      [],
    ),
  )
  const reverseCheckInM = useMutation(
    useCallback(
      ({ id, body }: { id: string; body: Parameters<typeof reverseCheckIn>[1] }) =>
        reverseCheckIn(id, body),
      [],
    ),
  )

  // 1-Click Approve (instant in-memory update)
  async function handleApprove() {
    const result = await reviewM.run({ id: row.id, body: { decision: 'APPROVE' } })
    if (result.ok) {
      const { status: newStatus, passCode10 } = result.data
      if (detail) {
        resource.set({
          ...detail,
          status: newStatus,
          pass: detail.pass
            ? { ...detail.pass, status: 'ACTIVE', code10: passCode10 ?? detail.pass.code10 }
            : {
                id: 'pass-' + detail.id,
                code10: passCode10 ?? 'NEWPASS',
                status: 'ACTIVE',
                guestCount: detail.companions.length,
                issuedAt: new Date().toISOString(),
                qrPayload: passCode10 ?? 'NEWPASS',
                notBefore: new Date().toISOString(),
                notAfter: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
                scanLimit: 1,
                scansUsed: 0,
                holdingScans: 1,
                checkIn: null,
              },
        })
      }
      onUpdate(row.id, (prev) => ({
        ...prev,
        status: newStatus,
        passCode10: passCode10 ?? prev.passCode10,
        passStatus: 'ACTIVE',
      }))
      setFeedback('Registration approved and pass activated.')
    }
  }

  // Submit Reject (instant in-memory update)
  async function handleReject() {
    if (!rejectReason.trim()) return
    const result = await reviewM.run({
      id: row.id,
      body: { decision: 'REJECT', note: rejectReason.trim() },
    })
    if (result.ok) {
      if (detail) {
        resource.set({
          ...detail,
          status: 'REJECTED',
          reviewNote: rejectReason.trim(),
          pass: detail.pass ? { ...detail.pass, status: 'REVOKED' } : null,
        })
      }
      onUpdate(row.id, (prev) => ({
        ...prev,
        status: 'REJECTED',
        passStatus: 'REVOKED',
      }))
      setRejectMode(false)
      setFeedback('Registration rejected.')
    }
  }

  // Submit Revision (instant in-memory update)
  async function handleRevision() {
    const code = revisionReasonCode === '' ? undefined : revisionReasonCode
    if (!code && !revisionNote.trim()) return
    const result = await reviewM.run({
      id: row.id,
      body: {
        decision: 'REQUEST_REVISION',
        reasonCode: code,
        note: revisionNote.trim() || undefined,
      },
    })
    if (result.ok) {
      if (detail) {
        resource.set({
          ...detail,
          status: 'REVISION_REQUESTED',
          revisionCount: detail.revisionCount + 1,
          reviewNote: revisionNote.trim() || null,
        })
      }
      onUpdate(row.id, (prev) => ({
        ...prev,
        status: 'REVISION_REQUESTED',
        revisionCount: prev.revisionCount + 1,
      }))
      setRevisionMode(false)
      setFeedback('Revision request dispatched to student.')
    }
  }

  // Undo Decision (reverts to PENDING_REVIEW instantly in memory)
  async function handleUndo() {
    const result = await undoM.run(row.id)
    if (result.ok) {
      if (detail) {
        resource.set({
          ...detail,
          status: 'PENDING_REVIEW',
          reviewNote: null,
          pass: detail.pass ? { ...detail.pass, status: 'REVOKED' } : null,
        })
      }
      onUpdate(row.id, (prev) => ({
        ...prev,
        status: 'PENDING_REVIEW',
        passStatus: prev.passStatus === 'ACTIVE' ? 'REVOKED' : prev.passStatus,
      }))
      setFeedback('Decision undone. Registration restored to pending review.')
    }
  }

  // QR Life adjustment: integer scan quota +1 or -1 (instant in-memory update)
  async function handleQrLifeStep(step: 1 | -1) {
    const result = await qrLifeM.run({ id: row.id, body: { deltaScans: step } })
    if (result.ok) {
      if (detail?.pass) {
        resource.set({
          ...detail,
          pass: {
            ...detail.pass,
            scanLimit: result.data.scanLimit,
            scansUsed: result.data.scansUsed,
            holdingScans: result.data.holdingScans,
            notAfter: result.data.notAfter ?? detail.pass.notAfter,
          },
        })
      }
      setFeedback(
        `QR life ${step > 0 ? 'increased' : 'decreased'} by 1 scan. Holding: ${result.data.holdingScans} scans.`,
      )
    }
  }

  // Ban or Unban User (instant in-memory update)
  async function handleToggleUserStatus(makeActive: boolean) {
    const result = await userStatusM.run({
      id: row.id,
      body: { isActive: makeActive, reason: banReason.trim() || undefined },
    })
    if (result.ok) {
      if (detail) {
        resource.set({
          ...detail,
          userIsActive: result.data.isActive,
          pass: !result.data.isActive && detail.pass
            ? { ...detail.pass, status: 'REVOKED' }
            : detail.pass,
        })
      }
      onUpdate(row.id, (prev) => ({
        ...prev,
        passStatus: !result.data.isActive && prev.passStatus === 'ACTIVE' ? 'REVOKED' : prev.passStatus,
      }))
      setBanConfirmOpen(false)
      setBanReason('')
      setFeedback(makeActive ? 'User account unbanned and restored.' : 'User account banned and pass revoked.')
    }
  }

  // Revoke Pass (instant in-memory update)
  async function handleRevokePass() {
    if (!revokeReason.trim() || !detail?.pass?.code10) return
    const result = await revokeM.run({
      id: row.id,
      body: { reason: revokeReason.trim(), confirmCode10: detail.pass.code10 },
    })
    if (result.ok) {
      if (detail?.pass) {
        resource.set({
          ...detail,
          pass: {
            ...detail.pass,
            status: 'REVOKED',
          },
        })
      }
      onUpdate(row.id, (prev) => ({ ...prev, passStatus: 'REVOKED' }))
      setRevokeConfirmOpen(false)
      setFeedback('Pass revoked.')
    }
  }

  // Restore Pass (instant in-memory update)
  async function handleRestorePass() {
    const result = await restoreM.run({
      id: row.id,
      body: { reason: 'Pass restored by administrator' },
    })
    if (result.ok) {
      if (detail?.pass) {
        resource.set({
          ...detail,
          pass: {
            ...detail.pass,
            status: 'ACTIVE',
          },
        })
      }
      onUpdate(row.id, (prev) => ({ ...prev, passStatus: 'ACTIVE' }))
      setFeedback('Pass restored to active state.')
    }
  }

  // Manual Check-in (instant in-memory update)
  async function handleManualCheckIn() {
    const result = await checkInM.run({
      id: row.id,
      body: { gateCode: 'MAIN', guestsAdmitted: Math.min(row.guestCount, 2) },
    })
    if (result.ok) {
      if (detail?.pass) {
        resource.set({
          ...detail,
          pass: {
            ...detail.pass,
            checkIn: {
              id: result.data.checkInId,
              gateCode: 'MAIN',
              gateName: 'Main Gate',
              recordedAt: result.data.recordedAt,
              guestsAdmitted: Math.min(row.guestCount, 2),
            },
          },
        })
      }
      onUpdate(row.id, (prev) => ({ ...prev, checkedInAt: result.data.recordedAt }))
      setFeedback('Manual check-in recorded at MAIN gate.')
    }
  }

  // Reverse Check-in (instant in-memory update)
  async function handleReverseCheckIn() {
    if (!detail?.pass?.checkIn?.id) return
    const result = await reverseCheckInM.run({
      id: row.id,
      body: {
        reason: 'Check-in reversed by administrator',
        confirmCheckInId: detail.pass.checkIn.id,
      },
    })
    if (result.ok) {
      if (detail?.pass) {
        resource.set({
          ...detail,
          pass: {
            ...detail.pass,
            checkIn: null,
          },
        })
      }
      onUpdate(row.id, (prev) => ({ ...prev, checkedInAt: null }))
      setFeedback('Check-in reversed.')
    }
  }

  const anyLoading =
    reviewM.pending ||
    undoM.pending ||
    qrLifeM.pending ||
    userStatusM.pending ||
    revokeM.pending ||
    restoreM.pending ||
    checkInM.pending ||
    reverseCheckInM.pending

  const activeError =
    reviewM.error ||
    undoM.error ||
    qrLifeM.error ||
    userStatusM.error ||
    revokeM.error ||
    restoreM.error ||
    checkInM.error ||
    reverseCheckInM.error

  return (
    <div className="border-t border-b border-ops-line/80 bg-ops-surface/95 px-6 py-6 text-sm text-ops-soft">
      {/* Toast Notification */}
      {feedback ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-go/40 bg-go/10 px-4 py-2.5 text-xs text-go">
          <span className="flex items-center gap-2 font-medium">
            <Icon name="check" size={15} />
            {feedback}
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-ops-faint hover:text-ops-ink"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      ) : null}

      {/* Action Error Banner */}
      {activeError ? (
        <div className="mb-4">
          <ErrorNote error={activeError} />
        </div>
      ) : null}

      {resource.loading ? (
        <div className="py-8">
          <Skeleton rows={4} />
        </div>
      ) : resource.error !== null ? (
        <div className="py-4">
          <ErrorNote error={resource.error} onRetry={resource.refresh} />
        </div>
      ) : detail !== null ? (
        <div className="flex flex-col gap-6">
          {/* Top Inspector Grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[180px_1fr_1.1fr] lg:grid-cols-[200px_1.2fr_1.1fr]">
            {/* Column 1: Photo & Biometrics */}
            <div className="flex flex-col gap-3">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-ops-line bg-ops shadow-inner">
                {detail.selfieUrl ? (
                  <img
                    src={detail.selfieUrl}
                    alt={detail.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ops-faint">
                    <Icon name="camera" size={32} />
                    <span className="text-[11px] font-medium">No photo uploaded</span>
                  </div>
                )}
                {detail.faceDetected !== null && (
                  <div className="absolute right-2 bottom-2">
                    <SignalBadge
                      signal={detail.faceDetected ? 'go' : 'warn'}
                      solid
                      className="text-[10px] shadow"
                    >
                      {detail.faceDetected ? 'Face OK' : 'No Face'}
                    </SignalBadge>
                  </div>
                )}
              </div>

              {/* Account Security Badge */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ops-faint">Account</span>
                  <SignalBadge signal={detail.userIsActive ? 'go' : 'stop'}>
                    {detail.userIsActive ? 'Active' : 'Banned'}
                  </SignalBadge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ops-faint">Status</span>
                  <SignalBadge signal={STATUS_SIGNAL[detail.status]}>
                    {STATUS_LABEL[detail.status]}
                  </SignalBadge>
                </div>
              </div>
            </div>

            {/* Column 2: Student & Companion Dossier */}
            <div className="flex flex-col gap-3 border-ops-line/60 md:border-r md:pr-6">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-ops-ink text-base font-bold tracking-tight">
                    {detail.name}
                  </h3>
                  <span className="text-ops-faint font-mono text-xs">
                    {detail.reference}
                  </span>
                </div>
                <p className="text-ops-soft mt-0.5 text-xs">
                  Form: <span className="font-mono text-ops-ink">{detail.formNumber}</span>
                  {detail.programLevel ? ` · ${detail.programLevel}` : ''}
                </p>
              </div>

              {/* Attribute Grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-ops-line/60 bg-ops-raise/30 p-3 text-xs">
                <div>
                  <span className="text-ops-faint block text-[11px]">Programme</span>
                  <span className="text-ops-ink font-medium">{detail.program}</span>
                </div>
                <div>
                  <span className="text-ops-faint block text-[11px]">Contact</span>
                  <span className="text-ops-ink font-mono">{detail.contactNo}</span>
                </div>
                <div>
                  <span className="text-ops-faint block text-[11px]">Email</span>
                  <span className="text-ops-ink truncate font-mono">
                    {detail.email || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-ops-faint block text-[11px]">Submitted</span>
                  <span className="text-ops-soft" title={stamp(detail.submittedAt)}>
                    {ago(detail.submittedAt)}
                  </span>
                </div>
              </div>

              {/* Companions Card */}
              <div className="flex flex-col gap-1.5">
                <span className="text-ops-faint text-xs font-semibold">
                  Accompanying Companions ({detail.companions.length})
                </span>
                {detail.companions.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {detail.companions.map((comp) => (
                      <div
                        key={comp.id}
                        className="flex items-center justify-between rounded-md border border-ops-line/60 bg-ops-raise/40 px-3 py-1.5 text-xs"
                      >
                        <span className="text-ops-ink font-medium">{comp.name}</span>
                        <span className="text-ops-faint uppercase text-[10px]">
                          {comp.relationship}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-ops-faint text-xs italic">
                    Solo registration (no guests registered).
                  </span>
                )}
              </div>

              {/* Review History Note */}
              {detail.reviewNote ? (
                <div className="rounded-lg border border-ops-line/60 bg-ops-raise/20 p-2.5 text-xs">
                  <span className="text-ops-faint block text-[11px]">Review Note:</span>
                  <p className="text-ops-ink mt-0.5">{detail.reviewNote}</p>
                  {detail.reviewedBy && (
                    <span className="text-ops-faint mt-1 block text-[10px]">
                      By {detail.reviewedBy}
                    </span>
                  )}
                </div>
              ) : null}
            </div>

            {/* Column 3: Pass & QR Life Controls */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="qr" size={18} className="text-ops-faint" />
                  <span className="text-ops-ink text-xs font-semibold uppercase tracking-wider">
                    Orientation Pass
                  </span>
                </div>
                {detail.pass ? (
                  <SignalBadge signal={detail.pass.status === 'ACTIVE' ? 'go' : 'stop'}>
                    {detail.pass.status === 'ACTIVE' ? 'Active' : 'Revoked'}
                  </SignalBadge>
                ) : (
                  <SignalBadge signal="idle">No Pass</SignalBadge>
                )}
              </div>

              {detail.pass ? (
                <div className="flex flex-col gap-3 rounded-xl border border-ops-line bg-ops-raise/40 p-4">
                  {/* Pass Credentials */}
                  <div className="flex items-baseline justify-between border-b border-ops-line/60 pb-2.5">
                    <div>
                      <span className="text-ops-faint block text-[11px]">Pass Code</span>
                      <code className="text-ops-ink font-mono text-sm font-bold">
                        {detail.pass.code10}
                      </code>
                    </div>
                    <div className="text-right">
                      <span className="text-ops-faint block text-[11px]">Arrival</span>
                      {detail.pass.checkIn ? (
                        <span className="text-go font-medium text-xs">
                          {detail.pass.checkIn.gateCode} · {ago(detail.pass.checkIn.recordedAt)}
                        </span>
                      ) : (
                        <span className="text-ops-faint text-xs">Not arrived</span>
                      )}
                    </div>
                  </div>

                  {/* QR Life: Integer Volunteer Scan Quota */}
                  {(() => {
                    const scanLimit = detail.pass.scanLimit ?? 1
                    const scansUsed = detail.pass.scansUsed ?? (detail.pass.checkIn ? 1 : 0)
                    const holdingScans = detail.pass.holdingScans ?? Math.max(0, scanLimit - scansUsed)

                    return (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-ops-faint text-xs font-medium">QR Life (Volunteer Scans)</span>
                          <span className="text-[11px] font-mono text-ops-soft font-semibold">
                            {holdingScans > 0 ? `${holdingScans} scan${holdingScans === 1 ? '' : 's'} remaining` : 'Exhausted (0 remaining)'}
                          </span>
                        </div>

                        <div className="rounded-lg border border-ops-line/70 bg-ops/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-ops-faint text-xs">Holding QR Life:</span>
                            <span
                              className={cn(
                                'rounded-md px-2 py-0.5 text-[11px] font-semibold font-mono tracking-tight',
                                holdingScans === 0
                                  ? 'bg-stop/15 text-stop ring-1 ring-stop/30'
                                  : holdingScans === 1
                                    ? 'bg-warn/15 text-warn ring-1 ring-warn/30'
                                    : 'bg-go/15 text-go ring-1 ring-go/30',
                              )}
                            >
                              {holdingScans > 0 ? `${holdingScans} Scans Holding` : 'EXHAUSTED (0)'}
                            </span>
                          </div>

                          <div className="mt-2.5 flex items-baseline justify-between text-xs">
                            <span className="text-ops-faint">Scanned by Volunteer:</span>
                            <span className="text-ops-ink font-mono font-medium">
                              {scansUsed} {scansUsed === 1 ? 'time' : 'times'}
                            </span>
                          </div>

                          <div className="mt-1.5 flex items-baseline justify-between text-xs">
                            <span className="text-ops-faint">Total Allowed Scans:</span>
                            <span className="text-ops-soft font-mono font-medium">
                              {scanLimit} {scanLimit === 1 ? 'scan' : 'scans'}
                            </span>
                          </div>
                        </div>

                        {/* Stepper Buttons: -1 Scan and +1 Scan */}
                        <div className="flex items-center gap-2 pt-1">
                          <OpsButton
                            size="sm"
                            variant="outline"
                            onClick={() => handleQrLifeStep(-1)}
                            disabled={anyLoading || scanLimit <= 0}
                            className="flex-1 text-xs"
                          >
                            -1 Scan
                          </OpsButton>
                          <OpsButton
                            size="sm"
                            variant="outline"
                            onClick={() => handleQrLifeStep(1)}
                            disabled={anyLoading}
                            className="flex-1 text-xs"
                          >
                            +1 Scan
                          </OpsButton>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-ops-line/80 bg-ops-raise/20 p-5 text-center text-xs text-ops-faint">
                  Approve this registration to issue an active pass and enable QR validity controls.
                </div>
              )}
            </div>
          </div>

          {/* Sub-form: Reject reason */}
          {rejectMode && (
            <div className="flex flex-col gap-3 rounded-xl border border-stop/40 bg-stop/5 p-4">
              <span className="text-stop text-xs font-semibold">
                Reject Registration — reason will be recorded and student notified
              </span>
              <OpsField label="Rejection Note" htmlFor={`reject-${detail.id}`}>
                <input
                  id={`reject-${detail.id}`}
                  className={opsControl}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why this registration is rejected..."
                />
              </OpsField>
              <div className="flex items-center gap-2">
                <OpsButton
                  size="sm"
                  variant="danger"
                  onClick={handleReject}
                  disabled={!rejectReason.trim() || anyLoading}
                >
                  Confirm Rejection
                </OpsButton>
                <OpsButton size="sm" variant="ghost" onClick={() => setRejectMode(false)}>
                  Cancel
                </OpsButton>
              </div>
            </div>
          )}

          {/* Sub-form: Revision request */}
          {revisionMode && (
            <div className="flex flex-col gap-3 rounded-xl border border-info/40 bg-info/5 p-4">
              <span className="text-info text-xs font-semibold">
                Request Photo / Registration Revision
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <OpsField label="Preset Reason" htmlFor={`rev-code-${detail.id}`}>
                  <OpsSelect
                    id={`rev-code-${detail.id}`}
                    value={revisionReasonCode}
                    onChange={(e) =>
                      setRevisionReasonCode(e.target.value as RetakeReasonCode | '')
                    }
                  >
                    <option value="">Choose reason preset...</option>
                    {(Object.keys(RETAKE_REASONS) as RetakeReasonCode[]).map((code) => (
                      <option key={code} value={code}>
                        {code.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </OpsSelect>
                </OpsField>
                <OpsField label="Additional Custom Note" htmlFor={`rev-note-${detail.id}`}>
                  <input
                    id={`rev-note-${detail.id}`}
                    className={opsControl}
                    value={revisionNote}
                    onChange={(e) => setRevisionNote(e.target.value)}
                    placeholder="Optional message to student..."
                  />
                </OpsField>
              </div>
              <div className="flex items-center gap-2">
                <OpsButton
                  size="sm"
                  variant="outline"
                  onClick={handleRevision}
                  disabled={(!revisionReasonCode && !revisionNote.trim()) || anyLoading}
                >
                  Send Revision Request
                </OpsButton>
                <OpsButton size="sm" variant="ghost" onClick={() => setRevisionMode(false)}>
                  Cancel
                </OpsButton>
              </div>
            </div>
          )}

          {/* Sub-form: Ban User Confirmation */}
          {banConfirmOpen && (
            <div className="flex flex-col gap-3 rounded-xl border border-stop/50 bg-stop/10 p-4">
              <div className="flex items-center gap-2 text-stop">
                <Icon name="shield" size={18} />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Ban Student User Account
                </span>
              </div>
              <p className="text-xs text-ops-ink">
                Banning this student will deactivate their account in PostgreSQL, terminate their
                active Clerk authentication session, and revoke any issued entry pass.
              </p>
              <OpsField label="Reason for Ban" htmlFor={`ban-reason-${detail.id}`}>
                <input
                  id={`ban-reason-${detail.id}`}
                  className={opsControl}
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="e.g. Identity discrepancy, disciplinary action..."
                />
              </OpsField>
              <div className="flex items-center gap-2">
                <OpsButton
                  size="sm"
                  variant="danger"
                  onClick={() => handleToggleUserStatus(false)}
                  disabled={anyLoading}
                >
                  Confirm Ban & Revoke Pass
                </OpsButton>
                <OpsButton size="sm" variant="ghost" onClick={() => setBanConfirmOpen(false)}>
                  Cancel
                </OpsButton>
              </div>
            </div>
          )}

          {/* Sub-form: Revoke Pass Confirmation */}
          {revokeConfirmOpen && (
            <div className="flex flex-col gap-3 rounded-xl border border-stop/40 bg-stop/5 p-4">
              <span className="text-stop text-xs font-semibold">
                Revoke Gate Pass ({detail.pass?.code10})
              </span>
              <OpsField label="Revocation Reason" htmlFor={`rev-pass-${detail.id}`}>
                <input
                  id={`rev-pass-${detail.id}`}
                  className={opsControl}
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Reason for revoking this pass..."
                />
              </OpsField>
              <div className="flex items-center gap-2">
                <OpsButton
                  size="sm"
                  variant="danger"
                  onClick={handleRevokePass}
                  disabled={!revokeReason.trim() || anyLoading}
                >
                  Confirm Revoke
                </OpsButton>
                <OpsButton size="sm" variant="ghost" onClick={() => setRevokeConfirmOpen(false)}>
                  Cancel
                </OpsButton>
              </div>
            </div>
          )}

          {/* Bottom Action Command Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ops-line/80 pt-4">
            {/* Left Group: Decisions & Undo */}
            <div className="flex flex-wrap items-center gap-2">
              {detail.status === 'PENDING_REVIEW' || detail.status === 'REVISION_REQUESTED' ? (
                <>
                  <OpsButton
                    size="sm"
                    variant="primary"
                    onClick={handleApprove}
                    disabled={anyLoading}
                    icon="check"
                  >
                    Approve & Issue Pass
                  </OpsButton>
                  <OpsButton
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRevisionMode(true)
                      setRejectMode(false)
                    }}
                    disabled={anyLoading}
                  >
                    Request Revision
                  </OpsButton>
                  <OpsButton
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setRejectMode(true)
                      setRevisionMode(false)
                    }}
                    disabled={anyLoading}
                    icon="close"
                  >
                    Reject
                  </OpsButton>
                </>
              ) : (
                <OpsButton
                  size="sm"
                  variant="outline"
                  onClick={handleUndo}
                  disabled={anyLoading}
                  icon="clock"
                >
                  Undo Decision (Reset to Pending)
                </OpsButton>
              )}
            </div>

            {/* Right Group: Security, Gate, Close */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Ban / Unban */}
              {detail.userIsActive ? (
                <OpsButton
                  size="sm"
                  variant="danger"
                  onClick={() => setBanConfirmOpen(true)}
                  disabled={anyLoading}
                  icon="shield"
                >
                  Ban User
                </OpsButton>
              ) : (
                <OpsButton
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggleUserStatus(true)}
                  disabled={anyLoading}
                  icon="shield"
                >
                  Unban User
                </OpsButton>
              )}

              {/* Pass Revoke / Restore */}
              {detail.pass?.status === 'ACTIVE' && (
                <OpsButton
                  size="sm"
                  variant="outline"
                  onClick={() => setRevokeConfirmOpen(true)}
                  disabled={anyLoading}
                >
                  Revoke Pass
                </OpsButton>
              )}
              {detail.pass?.status === 'REVOKED' && (
                <OpsButton
                  size="sm"
                  variant="outline"
                  onClick={handleRestorePass}
                  disabled={anyLoading}
                >
                  Restore Pass
                </OpsButton>
              )}

              {/* Gate Check-in / Reverse */}
              {detail.pass && detail.pass.status === 'ACTIVE' && !detail.pass.checkIn && (
                <OpsButton
                  size="sm"
                  variant="outline"
                  onClick={handleManualCheckIn}
                  disabled={anyLoading}
                >
                  Manual Check-in
                </OpsButton>
              )}
              {detail.pass?.checkIn && (
                <OpsButton
                  size="sm"
                  variant="outline"
                  onClick={handleReverseCheckIn}
                  disabled={anyLoading}
                >
                  Reverse Check-in
                </OpsButton>
              )}

              <OpsButton size="sm" variant="ghost" onClick={onClose}>
                Close
              </OpsButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
