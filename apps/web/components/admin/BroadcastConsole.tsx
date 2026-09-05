'use client'

/**
 * Broadcast — one line to every screen that has the app open.
 *
 * Reads `/api/admin/broadcast` (a bare array, newest first) and re-reads it on a
 * `broadcast` event, the same look-again rule the rest of the console follows: the
 * event is a nudge, the endpoint is the authority. The layout owns the single
 * `RealtimeProvider`, so this only subscribes.
 *
 * The one branch that matters here is EMERGENCY. An emergency alert takes over every
 * connected screen, so it cannot go out on the same click as an info notice — it
 * routes through a confirmation the operator has to read, and only that path sends
 * `confirmEmergency: true`. Everything else posts on submit.
 */

import { type FormEvent, useCallback, useState } from 'react'

import type { BroadcastRequest, BroadcastView } from '@orientation/contracts'

import { OpsModal, OpsSelect } from '@/components/admin/controls'
import { type IconName } from '@/components/ui/Icon'
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
import { fetchBroadcasts, localInputToIso, retractBroadcast, sendBroadcast, stamp } from '@/lib/admin'
import { fieldError } from '@/lib/api'
import { useRealtime } from '@/lib/client/RealtimeProvider'
import { useMutation, useResource } from '@/lib/client/useResource'
import { cn } from '@/lib/cn'

type Priority = BroadcastView['priority']
type Audience = BroadcastView['audience']

const PRIORITY_SIGNAL: Record<Priority, Signal> = {
  INFO: 'info',
  WARNING: 'warn',
  EMERGENCY: 'stop',
}

const PRIORITY_ICON: Record<Priority, IconName> = {
  INFO: 'mail',
  WARNING: 'alert',
  EMERGENCY: 'bolt',
}

const AUDIENCE_LABEL: Record<Audience, string> = {
  ALL: 'Everyone',
  STUDENTS: 'Students',
  VOLUNTEERS: 'Volunteers',
}

const TITLE_MAX = 120
const BODY_MAX = 600

/** The one thing that decides whether "Retract" shows: is this message live right now? */
function liveness(b: BroadcastView): { label: string; signal: Signal; icon: IconName } {
  if (b.publishedAt === null) return { label: 'Not sent', signal: 'idle', icon: 'clock' }
  if (b.expiresAt !== null && new Date(b.expiresAt).getTime() <= Date.now()) {
    return { label: 'Expired', signal: 'idle', icon: 'clock' }
  }
  return { label: 'Live', signal: 'go', icon: 'play' }
}

export function BroadcastConsole() {
  const feed = useResource<BroadcastView[]>(
    useCallback((signal: AbortSignal) => fetchBroadcasts(signal), []),
    [],
  )
  const refresh = feed.refresh
  useRealtime({ broadcast: () => refresh() })

  const compose = useMutation<BroadcastRequest, BroadcastView>(sendBroadcast)
  const retract = useMutation<string, BroadcastView>(retractBroadcast)

  const [priority, setPriority] = useState<Priority>('INFO')
  const [audience, setAudience] = useState<Audience>('ALL')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [retractingId, setRetractingId] = useState<string | null>(null)

  const ready = title.trim() !== '' && message.trim() !== ''

  async function send(confirmEmergency: boolean) {
    setNotice(null)
    const result = await compose.run({
      priority,
      audience,
      title: title.trim(),
      body: message.trim(),
      expiresAt: localInputToIso(expiresAt),
      confirmEmergency,
    })
    if (result.ok) {
      setConfirmOpen(false)
      setTitle('')
      setMessage('')
      setExpiresAt('')
      setPriority('INFO')
      setAudience('ALL')
      setNotice(`Sent to ${AUDIENCE_LABEL[result.data.audience].toLowerCase()}: “${result.data.title}”.`)
      refresh()
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    if (priority === 'EMERGENCY') {
      setConfirmOpen(true)
      return
    }
    void send(false)
  }

  async function onRetract(id: string) {
    setNotice(null)
    setRetractingId(id)
    const result = await retract.run(id)
    setRetractingId(null)
    if (result.ok) {
      setNotice(`Pulled back: “${result.data.title}”.`)
      refresh()
    }
  }

  // Field-level messages render on their fields; only a general error goes to the banner.
  const composeBanner =
    compose.error !== null && compose.error.fields === undefined ? compose.error : null

  return (
    <div className="flex flex-col gap-6">
      <OpsHeading
        eyebrow="Live · every connected screen"
        title="Broadcast"
        lede="A line that lands on every student and volunteer with the app open — and waits for the ones who open it next."
        action={
          <OpsButton size="sm" variant="outline" onClick={refresh} disabled={feed.refreshing}>
            {feed.refreshing ? 'Syncing…' : 'Refresh'}
          </OpsButton>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Compose" hint="Published the moment you send. EMERGENCY interrupts every screen." icon="bolt">
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <OpsField label="Priority" htmlFor="bc-priority" hint="EMERGENCY needs a second confirmation.">
                <OpsSelect
                  id="bc-priority"
                  value={priority}
                  onChange={(event) => {
                    setPriority(event.target.value as Priority)
                  }}
                >
                  <option value="INFO">Info</option>
                  <option value="WARNING">Warning</option>
                  <option value="EMERGENCY">Emergency</option>
                </OpsSelect>
              </OpsField>
              <OpsField label="Audience" htmlFor="bc-audience">
                <OpsSelect
                  id="bc-audience"
                  value={audience}
                  onChange={(event) => {
                    setAudience(event.target.value as Audience)
                  }}
                >
                  <option value="ALL">Everyone</option>
                  <option value="STUDENTS">Students</option>
                  <option value="VOLUNTEERS">Volunteers</option>
                </OpsSelect>
              </OpsField>
            </div>

            <OpsField
              label="Title"
              htmlFor="bc-title"
              hint={`${String(title.length)} / ${String(TITLE_MAX)}`}
              error={fieldError(compose.error, 'title')}
            >
              <input
                id="bc-title"
                className={opsControl}
                value={title}
                maxLength={TITLE_MAX}
                onChange={(event) => {
                  setTitle(event.target.value)
                }}
                placeholder="Gate 2 is now open"
                autoComplete="off"
              />
            </OpsField>

            <OpsField
              label="Message"
              htmlFor="bc-body"
              hint={`${String(message.length)} / ${String(BODY_MAX)}`}
              error={fieldError(compose.error, 'body')}
            >
              <textarea
                id="bc-body"
                className={cn(opsControl, 'min-h-24 resize-y')}
                value={message}
                maxLength={BODY_MAX}
                onChange={(event) => {
                  setMessage(event.target.value)
                }}
                placeholder="Head to Gate 2 by the sports complex. Gate 1 is now closed."
              />
            </OpsField>

            <OpsField
              label="Expires"
              htmlFor="bc-expires"
              hint="Optional. Leave blank to show until you retract it."
              error={fieldError(compose.error, 'expiresAt')}
            >
              <input
                id="bc-expires"
                type="datetime-local"
                className={opsControl}
                value={expiresAt}
                onChange={(event) => {
                  setExpiresAt(event.target.value)
                }}
              />
            </OpsField>

            {composeBanner !== null ? <ErrorNote error={composeBanner} /> : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-ops-faint text-xs">
                {priority === 'EMERGENCY'
                  ? 'This will interrupt every open screen.'
                  : 'Goes out the moment you send.'}
              </p>
              <OpsButton
                type="submit"
                variant={priority === 'EMERGENCY' ? 'danger' : 'primary'}
                icon={priority === 'EMERGENCY' ? 'alert' : 'bolt'}
                disabled={!ready || compose.pending}
              >
                {compose.pending
                  ? 'Sending…'
                  : priority === 'EMERGENCY'
                    ? 'Review emergency alert'
                    : 'Send broadcast'}
              </OpsButton>
            </div>
          </form>
        </Panel>

        <Panel title="Recent broadcasts" hint="Newest first" icon="note" flush>
          {feed.loading ? (
            <div className="p-5">
              <Skeleton rows={4} className="h-16" />
            </div>
          ) : feed.data === null ? (
            feed.error !== null ? (
              <div className="p-5">
                <ErrorNote error={feed.error} onRetry={refresh} />
              </div>
            ) : null
          ) : feed.data.length === 0 ? (
            <EmptyState icon="bolt" title="Nothing sent yet">
              The messages you broadcast appear here, most recent at the top.
            </EmptyState>
          ) : (
            <ul className="divide-ops-line/45 divide-y">
              {retract.error !== null ? (
                <li className="p-5">
                  <ErrorNote error={retract.error} />
                </li>
              ) : null}
              {feed.data.map((b) => {
                const state = liveness(b)
                return (
                  <li key={b.id} className="flex flex-col gap-2 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <SignalBadge signal={PRIORITY_SIGNAL[b.priority]} icon={PRIORITY_ICON[b.priority]}>
                        {b.priority}
                      </SignalBadge>
                      <SignalBadge signal={state.signal} icon={state.icon}>
                        {state.label}
                      </SignalBadge>
                      <span className="text-ops-faint text-xs font-semibold">{AUDIENCE_LABEL[b.audience]}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-ops-ink text-sm font-bold">{b.title}</p>
                      <p className="text-ops-soft mt-0.5 text-sm break-words">{b.body}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-ops-faint text-xs">
                        Sent {stamp(b.publishedAt)}
                        {b.expiresAt !== null ? ` · expires ${stamp(b.expiresAt)}` : ''}
                      </p>
                      {state.label === 'Live' ? (
                        <OpsButton
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            void onRetract(b.id)
                          }}
                          disabled={retractingId === b.id}
                        >
                          {retractingId === b.id ? 'Retracting…' : 'Retract'}
                        </OpsButton>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      <OpsModal
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false)
        }}
        title="Send an emergency alert?"
        hint="This interrupts every screen that has the app open."
        icon="alert"
        tone="danger"
        footer={
          <>
            <OpsButton
              variant="ghost"
              onClick={() => {
                setConfirmOpen(false)
              }}
              disabled={compose.pending}
            >
              Cancel
            </OpsButton>
            <OpsButton
              variant="danger"
              icon="alert"
              onClick={() => {
                void send(true)
              }}
              disabled={compose.pending}
              data-autofocus
            >
              {compose.pending ? 'Sending…' : 'Send to everyone now'}
            </OpsButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-ops-soft text-sm">
            An <span className="text-stop font-semibold">EMERGENCY</span> broadcast to{' '}
            <span className="text-ops-ink font-semibold">{AUDIENCE_LABEL[audience].toLowerCase()}</span> takes over
            the screen for everyone connected. Use it for a safety instruction, not an update.
          </p>
          <div className="bg-ops ring-ops-line rounded-lg p-3 ring-1">
            <p className="text-ops-ink text-sm font-bold">{title.trim() === '' ? 'Untitled' : title.trim()}</p>
            <p className="text-ops-soft mt-1 text-sm break-words">
              {message.trim() === '' ? 'No message.' : message.trim()}
            </p>
          </div>
          {compose.error !== null ? <ErrorNote error={compose.error} /> : null}
        </div>
      </OpsModal>

      <LiveRegion>{notice}</LiveRegion>
    </div>
  )
}
