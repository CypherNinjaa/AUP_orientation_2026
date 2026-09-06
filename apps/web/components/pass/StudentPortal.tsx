'use client'

import { useCallback } from 'react'
import Link from 'next/link'

import type { MeResponse, RegistrationStatus } from '@orientation/contracts'

import { DigitalPass } from '@/components/pass/DigitalPass'
import { EventFeed } from '@/components/pass/EventFeed'
import { RetakeSelfie } from '@/components/pass/RetakeSelfie'
import { StatusTracker } from '@/components/pass/StatusTracker'
import { Button, LinkButton } from '@/components/ui/Button'
import { Container, Section } from '@/components/ui/atoms'
import { Icon } from '@/components/ui/Icon'
import type { ApiResult } from '@/lib/api'
import { RealtimeProvider, useRealtime } from '@/lib/client/RealtimeProvider'
import { useResource } from '@/lib/client/useResource'
import { ARRIVAL_TILES, EVENT } from '@/lib/event'
import { fetchMe, fetchPass, type PassRenderResponse } from '@/lib/pass'

/**
 * The student portal.
 *
 * One page that answers one question — *am I in, and what do I do next?* — and
 * answers it differently four times depending on where the registration stands. The
 * shape of the answer is the same each time: the thing to act on at the top, the
 * explanation under it, the announcements last.
 *
 * ## Two reads, not one
 *
 * `/api/registration/me` is cheap and is re-read on every live event. `/api/pass` is
 * not — it renders a QR and a Code128 — so it is fetched once, only when `me` says
 * there is a pass to draw. Merging them would mean re-encoding two symbologies every
 * time a broadcast went out to 15,000 students.
 *
 * ## The event only says "look again"
 *
 * `registration.status` carries a status field and this component ignores it,
 * calling `refresh()` instead. A payload that arrived out of order, or after a
 * moderator had changed their mind twice, would otherwise be written straight onto
 * the screen as fact. The endpoint is the authority; the event is a nudge.
 */
export function StudentPortal() {
  // The provider owns the page's one SSE connection; `PortalBody` and the feed inside
  // it both subscribe. A component cannot consume a context it renders itself, which
  // is the only reason this is two functions rather than one.
  return (
    <RealtimeProvider>
      <PortalBody />
    </RealtimeProvider>
  )
}

function PortalBody() {
  const me = useResource<MeResponse>(useCallback((signal: AbortSignal) => fetchMe(signal), []), [])

  const registration = me.data?.registration ?? null
  const hasPass = me.data?.pass != null

  // Conditional fetch without an `enabled` flag: the fetcher's identity changes
  // when `hasPass` does, which is what makes `useResource` run again. Before there
  // is a pass it resolves to `null` rather than calling an endpoint that would
  // correctly answer 404 and paint an error a student has done nothing to cause.
  const pass = useResource<PassRenderResponse | null>(
    useCallback(
      (signal: AbortSignal): Promise<ApiResult<PassRenderResponse | null>> =>
        hasPass ? fetchPass(signal) : Promise.resolve({ ok: true, data: null }),
      [hasPass],
    ),
    [],
  )

  useRealtime({
    'registration.status': () => {
      me.refresh()
      pass.refresh()
    },
  })

  const reload = useCallback(() => {
    me.refresh()
    pass.refresh()
  }, [me, pass])

  /* ---- first load ---------------------------------------------------------- */

  if (me.loading) {
    return (
      <Section>
        <Container>
          <Loading />
        </Container>
      </Section>
    )
  }

  if (me.data === null) {
    return (
      <Section>
        <Container>
          <Broken message={me.error?.message ?? 'Something went wrong loading your details.'} onRetry={reload} />
        </Container>
      </Section>
    )
  }

  /* ---- signed in, never registered ---------------------------------------- */

  if (registration === null) {
    return (
      <Section>
        <Container>
          <div className="bg-card ring-rule/60 shadow-card mx-auto max-w-[36rem] rounded-3xl p-8 text-center ring-1">
            <span className="bg-violet-tint text-violet-deep mx-auto grid size-12 place-items-center rounded-full">
              <Icon name="id" size={22} />
            </span>
            <h2 className="text-navy mt-5 text-[1.375rem] font-extrabold tracking-[-0.02em]">
              You have not registered yet
            </h2>
            <p className="text-ink-soft mt-2.5 leading-relaxed">
              It takes about three minutes: your form number, who is coming with you, and a photo
              taken on the spot.
            </p>
            <LinkButton href="/register" variant="primary" size="lg" arrow className="mt-6">
              Register now
            </LinkButton>
          </div>
        </Container>
      </Section>
    )
  }

  /* ---- registered --------------------------------------------------------- */

  const passData = pass.data ?? null
  const retake =
    registration.status === 'REVISION_REQUESTED' ? <RetakeSelfie onDone={reload} /> : undefined

  return (
    <Section>
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:gap-12">
          {/* Left: the pass if there is one, the line to it if there is not. */}
          <div className="flex min-w-0 flex-col gap-10">
            {passData !== null ? (
              <DigitalPass data={passData} />
            ) : (
              <PassPending
                status={registration.status}
                message={pass.error?.message ?? null}
                loading={pass.loading || pass.refreshing}
              />
            )}

            <div className="bg-card ring-rule/60 rounded-3xl p-6 ring-1 sm:p-8">
              <h2 className="text-navy text-[1.125rem] font-bold">Where things stand</h2>
              <p className="text-ink-faint mt-1 mb-6 text-[0.8125rem] font-semibold">
                Reference <span className="tnum text-navy">{registration.reference}</span> · submitted{' '}
                {submitted(registration.submittedAt)}
              </p>
              <StatusTracker
                status={registration.status}
                reviewNote={registration.reviewNote}
                revisionCount={registration.revisionCount}
                checkedInAt={me.data.pass?.checkedInAt ?? null}
                action={retake}
              />
            </div>
          </div>

          {/* Right: announcements, then the four things people actually ask. */}
          <div className="flex min-w-0 flex-col gap-10">
            <EventFeed />
            <OnTheDay />
            <Help />
          </div>
        </div>
      </Container>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Approved, or waiting, but no pass to draw yet.
 *
 * `/api/pass` refuses with `NOT_FOUND` in two situations that are not errors — before
 * approval, and while a selfie is on hold — and the messages it returns are written
 * to be read by the student, so they are shown verbatim rather than replaced with
 * something friendlier and vaguer.
 */
function PassPending({
  status,
  message,
  loading,
}: {
  status: RegistrationStatus
  message: string | null
  loading: boolean
}) {
  const refused = status === 'REJECTED'

  return (
    <div className="bg-card ring-rule/60 shadow-card rounded-3xl p-7 sm:p-9">
      <div className="flex items-start gap-4">
        <span
          className={
            refused
              ? 'bg-danger-tint text-danger grid size-11 shrink-0 place-items-center rounded-full'
              : 'bg-violet-tint text-violet-deep grid size-11 shrink-0 place-items-center rounded-full'
          }
        >
          <Icon name={refused ? 'alert' : 'clock'} size={21} />
        </span>
        <div className="min-w-0">
          <h2 className="text-navy text-[1.25rem] font-extrabold tracking-[-0.02em]">
            {refused ? 'No pass on this registration' : 'Your pass is not ready yet'}
          </h2>
          <p className="text-ink-soft mt-2.5 leading-relaxed">
            {loading
              ? 'Checking…'
              : (message ??
                'It appears here the moment your registration is approved. Nothing else is needed from you.')}
          </p>
          <p className="text-ink-faint mt-4 text-[0.8125rem] leading-relaxed">
            You do not need to keep this page open — it updates by itself, and you can come back to
            it any time from the link in the header.
          </p>
        </div>
      </div>
    </div>
  )
}

/** The four facts, lifted from the same list the public arrival page shows. */
function OnTheDay() {
  return (
    <div className="bg-paper-tint ring-rule/50 rounded-3xl p-6 ring-1">
      <h2 className="text-navy text-[1.125rem] font-bold">On the day</h2>
      <dl className="mt-4 flex flex-col gap-4">
        {ARRIVAL_TILES.map((tile) => (
          <div key={tile.label} className="flex items-start gap-3">
            <span className="bg-card text-violet-deep ring-rule/60 grid size-9 shrink-0 place-items-center rounded-full ring-1">
              <Icon name={tile.icon} size={16} />
            </span>
            <div className="min-w-0">
              <dt className="text-ink-faint text-[0.75rem] font-bold tracking-[0.08em] uppercase">
                {tile.label}
              </dt>
              <dd className="text-navy leading-snug font-semibold">{tile.value}</dd>
              <dd className="text-ink-faint mt-0.5 text-[0.8125rem] leading-snug">{tile.note}</dd>
            </div>
          </div>
        ))}
      </dl>
      <Link
        href="/information#gate"
        className="text-violet-deep mt-5 inline-flex items-center gap-1.5 text-[0.875rem] font-bold"
      >
        What happens at the gate
        <Icon name="chevronRight" size={15} />
      </Link>
    </div>
  )
}

function Help() {
  return (
    <div className="bg-navy relative overflow-hidden rounded-3xl p-6">
      <div aria-hidden className="wash pointer-events-none absolute -right-14 -bottom-20 size-64 opacity-30" />
      <div className="relative">
        <h2 className="text-[1.125rem] font-bold text-white">Something wrong?</h2>
        <p className="text-sky/85 mt-2 text-[0.9375rem] leading-relaxed">
          A name spelled wrong, a guest to change, a pass that will not load. Any of it can be fixed
          — before the day, or at the desk in the Gate 1 foyer on the morning.
        </p>
        <div className="mt-5 flex flex-col gap-2.5">
          <a
            href={`mailto:${EVENT.email}`}
            className="text-white hover:text-sky flex items-center gap-2.5 text-[0.9375rem] font-semibold break-all transition-colors"
          >
            <Icon name="mail" size={16} className="text-flame-mid shrink-0" />
            {EVENT.email}
          </a>
          <div className="text-sky/85 flex items-center gap-2.5 text-xs">
            <Icon name="pin" size={15} className="text-flame-mid shrink-0" />
            <span>Gate 1 Help Desk, Orientation Morning</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Loading() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:gap-12">
      <div className="flex flex-col gap-6">
        <div className="bg-card ring-rule/60 h-80 animate-pulse rounded-3xl ring-1" />
        <div className="bg-card ring-rule/60 h-56 animate-pulse rounded-3xl ring-1" />
      </div>
      <div className="bg-paper-tint ring-rule/50 h-64 animate-pulse rounded-3xl ring-1" />
      <span className="sr-only" role="status">
        Loading your registration
      </span>
    </div>
  )
}

function Broken({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-card ring-danger/30 shadow-card mx-auto max-w-[36rem] rounded-3xl p-8 text-center ring-1">
      <span className="bg-danger-tint text-danger mx-auto grid size-12 place-items-center rounded-full">
        <Icon name="alert" size={22} />
      </span>
      <h2 className="text-navy mt-5 text-[1.25rem] font-extrabold">That did not load</h2>
      <p className="text-ink-soft mt-2.5 leading-relaxed">{message}</p>
      <Button type="button" variant="secondary" size="md" onClick={onRetry} className="mt-6">
        Try again
      </Button>
      <p className="text-ink-faint mt-5 text-[0.8125rem] leading-relaxed">
        Still nothing? Your pass exists regardless of this page — write to{' '}
        <a href={`mailto:${EVENT.email}`} className="text-violet-deep font-bold underline decoration-1 underline-offset-4">
          {EVENT.email}
        </a>{' '}
        or visit the Gate 1 help desk on orientation morning.
      </p>
    </div>
  )
}

/** "3 September" — the day, not the minute. Nobody needs the seconds they hit send. */
function submitted(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'recently'
  return at.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  })
}
