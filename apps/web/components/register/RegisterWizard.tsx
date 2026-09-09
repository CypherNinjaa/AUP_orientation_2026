'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

import type {
  ApiError,
  CompanionInput,
  CompanionRelationship,
  RecoverPassResponse,
  SubmitResponse,
} from '@orientation/contracts'

import { SelfieCapture, type Shot } from '@/components/register/SelfieCapture'
import { Stepper } from '@/components/register/Stepper'
import { HandNote } from '@/components/ui/atoms'
import { Button, LinkButton } from '@/components/ui/Button'
import { CheckBox, Field, SelectInput, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { apiPost, fieldError, isRetryable } from '@/lib/api'
import { cn } from '@/lib/cn'
import { COMPANION_RELATIONSHIPS, EVENT, REGISTER_STEPS } from '@/lib/event'
import {
  EMPTY_DRAFT,
  STEP_VALIDATORS,
  applyStudent,
  clearDraft,
  consentText,
  draftHasContent,
  dropDraft,
  firstErrorStep,
  lookupStudent,
  nextRelationship,
  pushDraft,
  realCompanions,
  relationshipAvailable,
  resumeDraft,
  saveDraft,
  spaceDigits,
  submitRegistration,
  tidy,
  type Errors,
  type RegisterDraft,
} from '@/lib/register'

/**
 * The registration wizard.
 *
 * Four screens rather than one long page, for one reason: the third screen needs
 * a camera and permission for it, and asking for that halfway down a scroll is
 * how you get a refusal.
 *
 * Nothing here carries `data-reveal`. Panels are swapped in and out, and a fresh
 * node inheriting the scroll-reveal gate would arrive invisible with no trigger
 * left to release it — the same trap the FAQ list sidesteps.
 *
 * ## Where the rules live
 *
 * Not in this file. Every message a student reads comes from `lib/register.ts`,
 * which validates with the same Zod schemas the route handlers use and keys the
 * result by the same field paths. A sentence read before pressing Continue is
 * byte-identical to the one the server would have sent back, so the two can never
 * disagree about what "a mobile number" means. This component owns the steps, the
 * focus order and the animation, and nothing else.
 *
 * ## Whether registration is open
 *
 * Also not here. `app/(public)/register/page.tsx` reads the window on the server
 * and renders a closed panel instead of this component, which is the only honest
 * option now that step 1 requires a live form-number lookup — an endpoint that
 * refuses with `REGISTRATION_CLOSED` when the window is shut. Walking somebody
 * through four steps that cannot be submitted is worse than saying so up front.
 */

const LAST = REGISTER_STEPS.length - 1

/** How long typing settles before the draft is pushed to the account row. */
const SAVE_DEBOUNCE_MS = 2000

/**
 * What the form-number lookup has told us, if anything.
 *
 * The student's name and programme are deliberately *not* in here — `applyStudent`
 * writes them into the draft, and holding a second copy beside it is how the
 * screen ends up showing one and submitting the other.
 *
 * `found.already` is `CLAIMED_BY_YOU`: this account holds the claim but has no
 * registration, which happens when a submit failed after the row was claimed. It
 * changes one sentence and nothing else, because the student's next move is the
 * same either way.
 */
type Claim =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'found'; already: boolean }
  | { kind: 'claimed' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string; retryable: boolean }

/** A typed `setDraft` for one field, shared with the panels below. */
type Setter = <K extends keyof RegisterDraft>(key: K, value: RegisterDraft[K]) => void

export function RegisterWizard({
  consentVersion,
  maxCompanions,
  retentionDays,
}: {
  /** Echoed back on submit. A mismatch is refused server-side, never coerced. */
  consentVersion: string
  maxCompanions: number
  retentionDays: number
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  /** Which way the next panel should slide in from. */
  const direction = useRef(1)
  /** False until the first deliberate move, so the page does not scroll on load. */
  const moved = useRef(false)

  const [step, setStep] = useState(0)
  const [furthest, setFurthest] = useState(0)
  const [draft, setDraft] = useState<RegisterDraft>(EMPTY_DRAFT)
  const [errors, setErrors] = useState<Errors>({})
  /** True once the resume attempt has finished, whether or not it found anything. */
  const [hydrated, setHydrated] = useState(false)
  const [restored, setRestored] = useState(false)
  const [claim, setClaim] = useState<Claim>({ kind: 'idle' })
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<ApiError | null>(null)
  const [done, setDone] = useState<SubmitResponse | null>(null)

  const consentWords = consentText(retentionDays)

  /* ---- resume ------------------------------------------------------------- */

  useEffect(() => {
    let alive = true
    void (async () => {
      const snapshot = await resumeDraft()
      if (!alive) return

      if (snapshot && draftHasContent(snapshot.draft)) {
        // The photo is never stored — not in `localStorage`, not in the draft row —
        // so a resumed student cannot land on the review step with a photo they
        // think they took. Clamping to the camera step puts them on the one thing
        // they genuinely have to do again.
        const at = Math.min(snapshot.step, 2)
        setDraft(snapshot.draft)
        setStep(at)
        setFurthest(at)
        setRestored(true)
        // A draft with a programme in it came from a lookup that succeeded, so
        // step 1 is answered. `already` stays false: asserting a claim we have not
        // re-verified would be a guess, and submit checks it properly anyway.
        if (tidy(snapshot.draft.name) && tidy(snapshot.draft.program)) {
          setClaim({ kind: 'found', already: false })
        }
      }
      setHydrated(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  /* ---- save --------------------------------------------------------------- */

  useEffect(() => {
    if (!hydrated || done) return

    if (!draftHasContent(draft)) {
      // Emptied by hand. Leaving the old copy behind would resurrect it on the
      // next visit, which reads as the form ignoring you.
      clearDraft()
      return
    }

    // The device copy is synchronous and cannot fail for network reasons, so it
    // is written on every keystroke. Only the account row is debounced.
    saveDraft(step, draft)
    const timer = window.setTimeout(() => void pushDraft(step, draft), SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [draft, step, hydrated, done])

  /* ---- movement ----------------------------------------------------------- */

  useEffect(() => {
    if (!moved.current) return
    rootRef.current?.scrollIntoView({ block: 'start' })
    // `preventScroll` because the line above already decided where to be.
    headingRef.current?.focus({ preventScroll: true })
  }, [step, done])

  useGSAP(
    () => {
      const panel = panelRef.current
      if (!panel) return
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          panel,
          { opacity: 0, x: direction.current * 18 },
          { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out', clearProps: 'transform' },
        )
      })
      return () => mm.revert()
    },
    { dependencies: [step], revertOnUpdate: true },
  )

  function go(to: number) {
    direction.current = to > step ? 1 : -1
    moved.current = true
    setErrors({})
    setFailure(null)
    setStep(to)
    setFurthest((f) => Math.max(f, to))
  }

  /**
   * Put the cursor on the first thing that needs fixing.
   *
   * Inside a frame, because the panel it is looking for may not have re-rendered
   * with its `aria-invalid` attributes yet.
   */
  function focusFirstProblem() {
    requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      if (first) {
        first.focus({ preventScroll: true })
        first.scrollIntoView({ block: 'center' })
        return
      }
      headingRef.current?.focus()
    })
  }

  /* ---- editing ------------------------------------------------------------ */

  const set: Setter = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }))
    // Clearing the error the moment somebody touches the field. Leaving it under
    // something they are actively fixing is just nagging.
    setErrors((e) => {
      if (!(key in e)) return e
      const next = { ...e }
      delete next[key]
      return next
    })
  }

  function setCompanions(rows: CompanionInput[]) {
    setDraft((d) => ({ ...d, companions: rows }))
    setErrors((e) => {
      // Row errors are keyed `companions.0.name`, and the indices shift when a row
      // is removed, so the whole group goes rather than one key.
      const next: Errors = {}
      let changed = false
      for (const [key, message] of Object.entries(e)) {
        if (key === 'companions' || key.startsWith('companions.')) changed = true
        else next[key] = message
      }
      return changed ? next : e
    })
  }

  /* ---- step 1 ------------------------------------------------------------- */

  /**
   * Any edit to the form number invalidates the lookup that answered for it, so
   * the claim resets and Continue is blocked until the endpoint has spoken again.
   * The name and programme stay in the draft — a re-check overwrites them — but
   * the identity block disappears, which is the honest thing to show while the
   * number under it is being retyped.
   */
  function setFormNumber(value: string) {
    if (value === draft.formNumber) return
    set('formNumber', value)
    setClaim({ kind: 'idle' })
  }

  async function check() {
    setClaim({ kind: 'checking' })
    setErrors({})
    setFailure(null)

    const result = await lookupStudent(draft.formNumber)

    if (!result.ok) {
      // A validation failure belongs under the control. Everything else — a shut
      // window, a rate limit, a dead connection — belongs to the step, because no
      // amount of retyping the number fixes it.
      const message = fieldError(result.error, 'formNumber')
      if (message) {
        setErrors({ formNumber: message })
        setClaim({ kind: 'idle' })
        focusFirstProblem()
        return
      }
      setClaim({
        kind: 'error',
        message: result.error.message,
        retryable: isRetryable(result.error),
      })
      return
    }

    if (result.data.status === 'NOT_FOUND') {
      setClaim({ kind: 'missing' })
      return
    }
    if (result.data.status === 'CLAIMED') {
      setClaim({ kind: 'claimed' })
      return
    }

    const student = result.data.student
    setDraft((d) => applyStudent(d, student))
    setClaim({ kind: 'found', already: result.data.status === 'CLAIMED_BY_YOU' })
  }

  /* ---- forward ------------------------------------------------------------ */

  function next() {
    if (step === 0 && claim.kind !== 'found') {
      setErrors({
        formNumber: 'Check your form number first — your name and programme are read from it.',
      })
      focusFirstProblem()
      return
    }

    const validate = STEP_VALIDATORS[step]
    const found = validate ? validate(draft) : {}
    if (Object.keys(found).length > 0) {
      setErrors(found)
      focusFirstProblem()
      return
    }
    go(step + 1)
  }

  async function submit() {
    setFailure(null)
    setSubmitting(true)
    const result = await submitRegistration(draft, consentVersion)
    setSubmitting(false)

    if (result.ok) {
      if (result.data.sessionToken) {
        try {
          localStorage.setItem('orientation2026:student:session', result.data.sessionToken)
        } catch {
          // Ignore storage restrictions
        }
      }
      // The draft has served its purpose. Both copies go.
      void dropDraft()
      moved.current = true
      setDone(result.data)
      return
    }

    setFailure(result.error)

    const fields = result.error.fields
    if (!fields || Object.keys(fields).length === 0) {
      headingRef.current?.focus()
      return
    }

    setErrors(fields)
    const owner = firstErrorStep(fields)
    if (owner !== undefined && owner !== step) {
      // Deliberately not `go()`, which clears the errors we have just routed.
      direction.current = -1
      moved.current = true
      setStep(owner)
      return
    }
    focusFirstProblem()
  }

  function startOver() {
    clearDraft()
    void dropDraft()
    direction.current = -1
    moved.current = true
    setDraft(EMPTY_DRAFT)
    setErrors({})
    setFailure(null)
    setClaim({ kind: 'idle' })
    setRestored(false)
    setStep(0)
    setFurthest(0)
  }

  /* ---- render ------------------------------------------------------------- */

  const meta = REGISTER_STEPS[step]

  return (
    <div ref={rootRef} id="form" className="mx-auto w-full max-w-2xl scroll-mt-28">
      {done ? (
        <Submitted result={done} headingRef={headingRef} />
      ) : (
        <>
          <Stepper current={step} furthest={furthest} onJump={go} />

          {restored ? (
            <p className="text-ink-soft bg-paper-tint mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-4 py-3 text-[0.875rem]">
              <span className="text-leaf shrink-0">
                <Icon name="check" size={16} strokeWidth={2.4} />
              </span>
              Picked up where you left off.
              <button
                type="button"
                onClick={startOver}
                className="text-violet-deep font-semibold underline decoration-1 underline-offset-2"
              >
                Start again
              </button>
            </p>
          ) : null}

          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              if (step === LAST) void submit()
              else next()
            }}
          >
            <div className="bg-card ring-rule/25 shadow-card mt-6 rounded-3xl p-6 ring-1 sm:p-9" ref={panelRef}>
              <p className="text-label text-flame flex items-center gap-2.5 uppercase">
                <span className="bg-flame-mid h-px w-7" />
                Step {step + 1} of {REGISTER_STEPS.length}
              </p>
              <h2 ref={headingRef} tabIndex={-1} className="text-headline mt-3 focus:outline-none">
                {meta?.title}
              </h2>
              <p className="text-ink-soft mt-3 text-[0.9375rem] leading-relaxed sm:text-base">{meta?.body}</p>

              {step === 0 ? (
                <AboutPanel
                  draft={draft}
                  errors={errors}
                  set={set}
                  claim={claim}
                  onFormNumber={setFormNumber}
                  onCheck={() => void check()}
                />
              ) : null}
              {step === 1 ? (
                <GuestsPanel draft={draft} errors={errors} max={maxCompanions} onChange={setCompanions} />
              ) : null}
              {step === 2 ? (
                <PhotoPanel draft={draft} errors={errors} set={set} consentWords={consentWords} />
              ) : null}
              {step === LAST ? (
                <ReviewPanel
                  draft={draft}
                  errors={errors}
                  consentWords={consentWords}
                  onEdit={go}
                  onConsent={(value) => set('consented', value)}
                />
              ) : null}

              {failure ? <Outcome error={failure} onRetry={() => void submit()} busy={submitting} /> : null}
            </div>

            {/* Outside the card, so the card is only ever the question. */}
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              {step > 0 ? (
                <Button type="button" variant="quiet" onClick={() => go(step - 1)}>
                  <Icon name="chevronRight" size={18} className="rotate-180" />
                  Back
                </Button>
              ) : (
                <span className="text-ink-faint text-[0.8125rem] sm:max-w-[24ch]">
                  You can stop after any step and come back.
                </span>
              )}

              {step === LAST ? (
                <Button type="submit" size="lg" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Submit registration'}
                </Button>
              ) : (
                <Button type="submit" size="lg" arrow>
                  Continue
                </Button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Step 1 — about you                                                        */
/* -------------------------------------------------------------------------- */

function ClaimedPassRecovery({ formNumber }: { formNumber: string }) {
  const [contactNo, setContactNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const cleanPhone = contactNo.replace(/\D/g, '')
    if (cleanPhone.length < 10) {
      setError('Please enter your valid 10-digit registered mobile number.')
      return
    }

    setBusy(true)
    const res = await apiPost<RecoverPassResponse>('/api/pass/recover', {
      formNumber: formNumber.trim(),
      contactNo: cleanPhone.slice(-10),
    })
    setBusy(false)

    if (!res.ok) {
      setError(res.error.message || 'Mobile number did not match the registered contact number.')
      return
    }

    if (res.data.sessionToken) {
      try {
        localStorage.setItem('orientation2026:student:session', res.data.sessionToken)
      } catch {
        // Ignore storage restrictions
      }
    }

    window.location.href = '/pass'
  }

  return (
    <div className="mt-4 rounded-2xl bg-paper/95 p-4 ring-1 ring-rule/50">
      <p className="text-xs font-semibold text-navy">
        Already registered? Enter your 10-digit mobile number to access your pass:
      </p>
      <form onSubmit={handleRecover} className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <input
            type="tel"
            value={contactNo}
            onChange={(e) => setContactNo(e.target.value)}
            placeholder="10-digit registered mobile number"
            autoComplete="tel"
            className="w-full rounded-xl border border-rule/70 bg-card px-3.5 py-2 text-xs text-navy placeholder:text-ink-faint focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/20"
            required
          />
        </div>
        <Button type="submit" size="sm" disabled={busy} className="shrink-0 justify-center">
          {busy ? (
            <span className="flex items-center gap-1.5">
              <Icon name="loader" size={14} className="animate-spin" />
              Locating…
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Icon name="qr" size={14} />
              Access Pass
            </span>
          )}
        </Button>
      </form>
      {error ? <p className="mt-2 text-xs font-medium text-flame">{error}</p> : null}

      <div className="mt-3 flex items-center justify-between border-t border-rule/40 pt-2.5 text-[0.8125rem]">
        <Link
          href={`/pass?formNumber=${encodeURIComponent(formNumber)}#recover`}
          className="font-semibold text-violet-deep hover:underline"
        >
          Open pass recovery page &rarr;
        </Link>
      </div>
    </div>
  )
}

function AboutPanel({
  draft,
  errors,
  set,
  claim,
  onFormNumber,
  onCheck,
}: {
  draft: RegisterDraft
  errors: Errors
  set: Setter
  claim: Claim
  onFormNumber: (value: string) => void
  onCheck: () => void
}) {
  const checking = claim.kind === 'checking'
  const found = claim.kind === 'found'

  return (
    <div className="mt-7">
      <div className="mb-5 flex items-center justify-between rounded-2xl bg-paper-tint/90 px-4 py-2.5 text-xs text-ink-soft ring-1 ring-rule/40">
        <span>Already registered on another phone or device?</span>
        <Link
          href="/pass#recover"
          className="ml-2 flex shrink-0 items-center gap-1 font-bold text-violet-deep hover:text-violet"
        >
          <Icon name="search" size={13} />
          Find your pass &rarr;
        </Link>
      </div>

      <Field
        label="Application form number"
        htmlFor="formNumber"
        hint="On your admission letter, and on every fee receipt. Type the digits — anything else is ignored."
        error={errors.formNumber}
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <TextInput
            id="formNumber"
            name="formNumber"
            value={draft.formNumber}
            onChange={(event) => onFormNumber(event.target.value)}
            onKeyDown={(event) => {
              // Enter here means "check this", not "submit the step".
              if (event.key === 'Enter') {
                event.preventDefault()
                onCheck()
              }
            }}
            inputMode="numeric"
            enterKeyHint="search"
            autoComplete="off"
            maxLength={24}
            aria-invalid={errors.formNumber ? true : undefined}
            aria-describedby={noteId('formNumber', true)}
            className="tnum sm:flex-1"
          />
          <Button type="button" variant="secondary" onClick={onCheck} disabled={checking} className="shrink-0">
            {checking ? (
              'Checking…'
            ) : (
              <>
                <Icon name="search" size={17} />
                {found ? 'Check again' : 'Check'}
              </>
            )}
          </Button>
        </div>
      </Field>

      {claim.kind === 'missing' ? (
        <Note tone="warn" icon="alert" title="That number is not on the admission list">
          Check it against your admission letter — it is easy to read a 6 as an 8. If it is right, the
          list may not have caught up with you yet; ring{' '}
          <a href={`tel:${EVENT.helpline.replace(/\s/g, '')}`} className="text-violet-deep font-semibold">
            {EVENT.helpline}
          </a>{' '}
          and we will sort it out.
        </Note>
      ) : null}

      {claim.kind === 'claimed' ? (
        <Note tone="warn" icon="shield" title="This application form is already registered">
          <p>
            A registration has already been created for form{' '}
            <strong className="font-semibold text-navy">{draft.formNumber}</strong>.
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            If this is you, enter your registered 10-digit mobile number below to access or download your pass immediately:
          </p>

          <ClaimedPassRecovery formNumber={draft.formNumber} />

          <p className="mt-3.5 text-xs text-ink-faint">
            Haven&apos;t registered yet? If someone else used your number by mistake, ring{' '}
            <a href={`tel:${EVENT.helpline.replace(/\s/g, '')}`} className="font-semibold text-violet-deep hover:underline">
              {EVENT.helpline}
            </a>
            . The help desk in the Gate 1 foyer can also assist on orientation morning.
          </p>
        </Note>
      ) : null}

      {claim.kind === 'error' ? (
        <Note tone="danger" icon="alert" title="We could not check that just now">
          {claim.message}
          {claim.retryable ? (
            <>
              {' '}
              <button
                type="button"
                onClick={onCheck}
                className="text-violet-deep font-semibold underline decoration-1 underline-offset-2"
              >
                Try again
              </button>
            </>
          ) : null}
        </Note>
      ) : null}

      {claim.kind === 'found' ? (
        <div className="mt-7">
          <p className="text-navy flex items-center gap-2.5 font-bold">
            <span className="bg-leaf-tint text-leaf grid size-7 shrink-0 place-items-center rounded-full">
              <Icon name="check" size={16} strokeWidth={2.6} />
            </span>
            {claim.already ? 'Picking your registration back up' : 'Found you'}
          </p>

          <div className="bg-paper-tint ring-rule/40 mt-4 rounded-2xl px-5 py-4 ring-1">
            <p className="text-label text-ink-faint uppercase">Programme</p>
            {/* Read-only, and verbatim from the admissions sheet. A student sees
                what their admission letter says, not a tidied bucket, and cannot
                edit it here — that is the registry's record to change. */}
            <p className="text-navy mt-1.5 font-bold">{draft.program || '—'}</p>
          </div>

          <div className="mt-6 space-y-6">
            <Field
              label="Your name"
              htmlFor="name"
              hint="This is what gets printed on the pass and read out at the gate. Fix it if the spelling is off."
              error={errors.name}
            >
              <TextInput
                id="name"
                name="name"
                value={draft.name}
                onChange={(event) => set('name', event.target.value)}
                autoComplete="name"
                autoCapitalize="words"
                maxLength={120}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={noteId('name', true)}
              />
            </Field>

            <Field
              label="Mobile number"
              htmlFor="contactNo"
              hint="Ten digits. Only used if something about your pass needs sorting out."
              error={errors.contactNo}
            >
              <TextInput
                id="contactNo"
                name="contactNo"
                value={draft.contactNo}
                onChange={(event) => set('contactNo', event.target.value)}
                inputMode="tel"
                autoComplete="tel"
                maxLength={24}
                aria-invalid={errors.contactNo ? true : undefined}
                aria-describedby={noteId('contactNo', true)}
                className="tnum"
              />
            </Field>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Step 2 — guests                                                           */
/* -------------------------------------------------------------------------- */

function GuestsPanel({
  draft,
  errors,
  max,
  onChange,
}: {
  draft: RegisterDraft
  errors: Errors
  max: number
  onChange: (rows: CompanionInput[]) => void
}) {
  const rows = draft.companions
  const canAdd = rows.length < max

  function add() {
    const relationship = nextRelationship(rows)
    if (!relationship) return
    onChange([...rows, { relationship, name: '' }])
  }

  function edit(index: number, patch: Partial<CompanionInput>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  return (
    <div className="mt-7">
      {rows.length === 0 ? (
        <div className="border-rule/70 rounded-2xl border border-dashed px-5 py-7 text-center">
          <p className="text-navy font-bold">Nobody added yet</p>
          <p className="text-ink-soft mx-auto mt-2 max-w-[38ch] text-[0.9375rem] leading-relaxed">
            That is a complete answer. Leave it empty and your pass admits you alone — you can come
            back and add somebody any time before the day.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((row, index) => {
            const nameId = `companion-${String(index)}-name`
            const nameError = errors[`companions.${String(index)}.name`]
            return (
              <li key={index} className="bg-paper-tint ring-rule/40 rounded-2xl p-4 ring-1 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-label text-ink-faint uppercase">Guest {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => onChange(rows.filter((_, i) => i !== index))}
                    className="text-ink-faint hover:text-danger inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold transition-colors"
                  >
                    <Icon name="close" size={14} strokeWidth={2.4} />
                    Remove
                    <span className="sr-only"> guest {index + 1}</span>
                  </button>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-[11rem_1fr]">
                  <Field label="Coming as" htmlFor={`companion-${String(index)}-relationship`}>
                    <SelectInput
                      id={`companion-${String(index)}-relationship`}
                      value={row.relationship}
                      onChange={(event) =>
                        edit(index, { relationship: event.target.value as CompanionRelationship })
                      }
                    >
                      {COMPANION_RELATIONSHIPS.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          // Father and Mother are one each. The row's own value is
                          // never disabled, or it would vanish from its own select.
                          disabled={
                            option.value !== row.relationship && !relationshipAvailable(rows, option.value)
                          }
                        >
                          {option.label}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>

                  <Field
                    label="Their full name"
                    htmlFor={nameId}
                    hint={index === 0 ? 'As it reads on the ID they will be carrying.' : undefined}
                    error={nameError}
                  >
                    <TextInput
                      id={nameId}
                      value={row.name}
                      onChange={(event) => edit(index, { name: event.target.value })}
                      autoCapitalize="words"
                      maxLength={120}
                      aria-invalid={nameError ? true : undefined}
                      aria-describedby={noteId(nameId, true)}
                    />
                  </Field>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {errors.companions ? (
        <p role="alert" className="text-danger mt-4 text-[0.875rem] font-semibold">
          {errors.companions}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button type="button" variant="secondary" size="sm" onClick={add} disabled={!canAdd}>
          <Icon name="people" size={16} />
          {rows.length === 0 ? 'Add somebody' : 'Add one more'}
        </Button>
        <p className="text-ink-faint text-[0.8125rem]">
          {canAdd
            ? `${String(max - rows.length)} of ${String(max)} ${max - rows.length === 1 ? 'seat' : 'seats'} left`
            : `That is both seats — ${String(max)} guests is the limit on one pass.`}
        </p>
      </div>

      <p className="text-ink-soft border-rule/50 mt-7 border-t pt-5 text-[0.875rem] leading-relaxed">
        <strong className="text-navy font-bold">One pass for orientation day.</strong> Whoever you name
        here walks in beside you at the gate — they do not get a separate pass, and they come in
        alongside you.
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Step 3 — the photo                                                        */
/* -------------------------------------------------------------------------- */

function PhotoPanel({
  draft,
  errors,
  set,
  consentWords,
}: {
  draft: RegisterDraft
  errors: Errors
  set: Setter
  consentWords: string
}) {
  return (
    <div className="mt-7">
      {/* The consent words appear here, at the camera, and again at the tick box on
          the last step. DPDP consent has to be specific, and "specific" means read
          at the moment the photo is taken. */}
      <div className="bg-paper-tint text-ink-soft ring-rule/40 mb-7 rounded-2xl px-5 py-4 text-[0.875rem] leading-relaxed ring-1">
        <strong className="text-navy font-bold">Before you do:</strong> {consentWords} Nothing is
        uploaded until you submit on the next screen. The{' '}
        <a href="/privacy" className="text-violet-deep font-semibold">
          privacy notice
        </a>{' '}
        has the long version.
      </div>

      <SelfieCapture
        value={draft.selfie}
        onChange={(shot: Shot | null) => {
          set('selfie', shot?.image ?? null)
          set('faceDetected', shot?.faceDetected ?? false)
        }}
      />

      {errors.selfie ? (
        <p role="alert" className="text-danger mt-4 text-[0.875rem] font-semibold">
          {errors.selfie}
        </p>
      ) : null}

      <ul className="text-ink-soft mt-7 space-y-2.5 text-[0.875rem] leading-relaxed">
        {[
          'Face the brightest thing in the room, not away from it.',
          'Just you in frame — a friend behind you is what gets a photo sent back.',
          'Take the cap and the sunglasses off. A mask too.',
          'Hold still until it has taken. A blur is the commonest retake.',
        ].map((tip) => (
          <li key={tip} className="flex gap-3">
            <span className="grad-pair mt-2.5 h-px w-4 shrink-0" />
            {tip}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Step 4 — check and submit                                                 */
/* -------------------------------------------------------------------------- */

function ReviewPanel({
  draft,
  errors,
  consentWords,
  onEdit,
  onConsent,
}: {
  draft: RegisterDraft
  errors: Errors
  consentWords: string
  onEdit: (step: number) => void
  onConsent: (value: boolean) => void
}) {
  const guests = realCompanions(draft.companions)

  return (
    <div className="mt-7">
      <dl className="divide-rule/50 border-rule/50 divide-y border-y">
        <Row label="Form number" onEdit={() => onEdit(0)} editing="your form number">
          <span className="tnum">{spaceDigits(draft.formNumber)}</span>
        </Row>

        <Row label="Name" onEdit={() => onEdit(0)} editing="your name">
          {draft.name}
        </Row>

        {/* No Edit button. The programme is the registry's record, not a field. */}
        <Row label="Programme">{draft.program || '—'}</Row>

        <Row label="Mobile" onEdit={() => onEdit(0)} editing="your mobile number">
          <span className="tnum">{draft.contactNo}</span>
        </Row>

        <Row label="Guests" onEdit={() => onEdit(1)} editing="your guests">
          {guests.length === 0 ? (
            <span className="text-ink-soft font-semibold">Coming alone</span>
          ) : (
            <ul className="space-y-1">
              {guests.map((guest, index) => (
                <li key={index}>
                  {tidy(guest.name)}
                  <span className="text-ink-faint"> · {relationshipLabel(guest.relationship)}</span>
                </li>
              ))}
            </ul>
          )}
        </Row>

        <Row label="Photo" onEdit={() => onEdit(2)} editing="your photo" editLabel="Retake">
          {draft.selfie ? (
            // A data URL of a frame this browser just drew. next/image would want to
            // optimise it, which is both impossible and pointless.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.selfie}
              alt="The photo you took"
              className="ring-rule/60 size-16 rounded-xl object-cover ring-1"
            />
          ) : (
            <span className="text-danger font-semibold">Not taken yet</span>
          )}
        </Row>
      </dl>

      <div
        className={cn(
          'mt-8 rounded-2xl px-5 py-5 ring-1',
          errors.consented ? 'bg-danger-tint/50 ring-danger/40' : 'bg-paper-tint ring-rule/40',
        )}
      >
        <CheckBox
          id="consented"
          name="consented"
          checked={draft.consented}
          onChange={(event) => onConsent(event.target.checked)}
          aria-invalid={errors.consented ? true : undefined}
          aria-describedby={noteId('consented', true)}
        >
          {consentWords}
        </CheckBox>
        <p
          id={noteId('consented', true)}
          role={errors.consented ? 'alert' : undefined}
          className={cn(
            'mt-3 text-[0.8125rem] leading-relaxed',
            errors.consented ? 'text-danger font-semibold' : 'text-ink-faint',
          )}
        >
          {errors.consented ?? (
            <>
              You can withdraw this later by writing to{' '}
              <a href={`mailto:${EVENT.email}`} className="text-violet-deep font-semibold">
                {EVENT.email}
              </a>
              . The full notice is on the{' '}
              <a href="/privacy" className="text-violet-deep font-semibold">
                privacy page
              </a>
              .
            </>
          )}
        </p>
      </div>
    </div>
  )
}

function Row({
  label,
  children,
  onEdit,
  editing,
  editLabel = 'Edit',
}: {
  label: string
  children: ReactNode
  onEdit?: () => void
  /** Completes the screen-reader sentence: "Edit <editing>". */
  editing?: string
  editLabel?: string
}) {
  return (
    <div className="flex gap-4 py-4">
      <dt className="text-ink-faint w-[9.5rem] shrink-0 text-[0.8125rem] font-semibold">{label}</dt>
      <dd className="text-navy min-w-0 flex-1 font-semibold break-words">{children}</dd>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="text-violet-deep hover:text-violet shrink-0 self-start text-[0.8125rem] font-semibold transition-colors"
        >
          {editLabel}
          {editing ? <span className="sr-only"> {editing}</span> : null}
        </button>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A submit that came back with something to say.
 *
 * Three registers. Something the student can fix is red and interrupts. A shut
 * registration window is calm — dressing it as an error would be a lie about
 * whose fault it is. Stale consent wording is calm too, and gets the one control
 * that resolves it.
 */
function Outcome({
  error,
  onRetry,
  busy,
}: {
  error: ApiError
  onRetry: () => void
  busy: boolean
}) {
  if (error.code === 'REGISTRATION_CLOSED') {
    return (
      <Note tone="calm" icon="clock" title="Registration has closed" role="status">
        {error.message}
      </Note>
    )
  }

  if (error.code === 'CONSENT_VERSION_MISMATCH') {
    return (
      <Note tone="calm" icon="note" title="The consent notice has changed" role="status">
        {error.message}{' '}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-violet-deep font-semibold underline decoration-1 underline-offset-2"
        >
          Reload the page
        </button>
        .
      </Note>
    )
  }

  const fixable = Boolean(error.fields && Object.keys(error.fields).length > 0)

  return (
    <Note tone="danger" icon="alert" title={fixable ? 'Something needs another look' : 'That did not go through'}>
      {error.message}
      {!fixable && isRetryable(error) ? (
        <>
          {' '}
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="text-violet-deep font-semibold underline decoration-1 underline-offset-2 disabled:opacity-50"
          >
            {busy ? 'Trying…' : 'Try again'}
          </button>
        </>
      ) : null}
    </Note>
  )
}

const TONES = {
  calm: { box: 'bg-paper-tint ring-rule/50', chip: 'bg-navy/5 text-navy' },
  warn: { box: 'bg-flame-tint/60 ring-flame/30', chip: 'bg-flame-tint text-flame' },
  danger: { box: 'bg-danger-tint/50 ring-danger/30', chip: 'bg-danger-tint text-danger' },
} as const

function Note({
  tone,
  icon,
  title,
  children,
  role = 'alert',
}: {
  tone: keyof typeof TONES
  icon: 'alert' | 'shield' | 'clock' | 'note'
  title: string
  children: ReactNode
  role?: 'alert' | 'status'
}) {
  const skin = TONES[tone]
  return (
    <div role={role} className={cn('mt-6 rounded-2xl px-5 py-4 ring-1', skin.box)}>
      <p className="text-navy flex items-center gap-2.5 font-bold">
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', skin.chip)}>
          <Icon name={icon} size={16} strokeWidth={2.2} />
        </span>
        {title}
      </p>
      <p className="text-ink-soft mt-2.5 text-[0.875rem] leading-relaxed">{children}</p>
    </div>
  )
}

/**
 * The last screen.
 *
 * Two shapes, decided by whether a pass came back with the response. Auto-approval
 * issues one immediately; otherwise a moderator has the photo and the honest thing
 * to show is a wait with an end to it.
 */
function Submitted({
  result,
  headingRef,
}: {
  result: SubmitResponse
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const pass = result.pass

  return (
    <div className="bg-card ring-rule/25 shadow-card mx-auto w-full max-w-2xl rounded-3xl p-7 text-center ring-1 sm:p-11">
      <span className="bg-leaf-tint text-leaf mx-auto grid size-16 place-items-center rounded-full">
        <Icon name="check" size={30} strokeWidth={2.4} />
      </span>

      <h2 ref={headingRef} tabIndex={-1} className="text-title mt-7 focus:outline-none">
        {pass ? 'Your pass is ready' : 'You are on the list'}
      </h2>

      <HandNote tilt={-2} className="text-violet-deep mt-3 text-[1.5rem]">
        See you in September!
      </HandNote>

      <p className="text-ink-soft mx-auto mt-5 max-w-[46ch] text-[0.9375rem] leading-relaxed">
        {pass
          ? 'Nothing else to do. Open it once now so you know what it looks like, and download the PDF while you are on wifi — the gate works whether or not you have signal.'
          : 'Somebody is having a look at your photo. Your pass appears on the same page the moment they are done, and we will not need anything else from you in the meantime.'}
      </p>

      {pass ? (
        <div className="bg-paper-tint ring-rule/40 mx-auto mt-7 max-w-xs rounded-2xl px-5 py-4 ring-1">
          <p className="text-label text-ink-faint uppercase">Your gate code</p>
          <p className="text-navy tnum mt-1.5 text-[1.375rem] font-bold">{pass.code10Formatted}</p>
        </div>
      ) : null}

      <p className="text-ink-faint mt-7 text-[0.875rem]">
        Reference <span className="text-navy tnum font-bold">{result.reference}</span>
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <LinkButton href="/pass" size="lg">
          <Icon name="qr" size={19} />
          {pass ? 'Open your pass' : 'Follow it on your pass page'}
        </LinkButton>
        <LinkButton href="/information" variant="secondary" size="lg" arrow>
          What to bring
        </LinkButton>
      </div>
    </div>
  )
}

function relationshipLabel(value: CompanionRelationship): string {
  return COMPANION_RELATIONSHIPS.find((r) => r.value === value)?.label ?? value
}

/**
 * `Field` renders exactly one note — the error when there is one, the hint
 * otherwise — under a single id, which is why callers point `aria-describedby` at
 * it unconditionally rather than trying to guess which is showing.
 */
function noteId(id: string, has: boolean): string | undefined {
  return has ? `${id}-note` : undefined
}
