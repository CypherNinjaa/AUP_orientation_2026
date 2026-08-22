'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SelfieCapture } from '@/components/register/SelfieCapture'
import { Stepper } from '@/components/register/Stepper'
import { Button, LinkButton } from '@/components/ui/Button'
import { CheckBox, Choice, Field, SelectInput, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { HandNote } from '@/components/ui/atoms'
import { cn } from '@/lib/cn'
import { EVENT, GUEST_RELATIONSHIPS, PROGRAMMES, REGISTER_STEPS } from '@/lib/event'
import {
  CONSENT_TEXT,
  type DraftField,
  EMPTY_DRAFT,
  type Errors,
  REGISTRATION_OPEN,
  type RegisterDraft,
  STEP_VALIDATORS,
  type SubmitResult,
  clearDraft,
  draftHasContent,
  loadDraft,
  normaliseEnrolment,
  normaliseMobile,
  saveDraft,
  submitRegistration,
  tidy,
} from '@/lib/register'

/**
 * The registration form.
 *
 * Four screens rather than one long page, for one reason: the third screen needs
 * a camera and permission for it, and asking for that halfway down a scroll is
 * how you get a refusal. Splitting it also means a validation error is always
 * within a screen of the field it belongs to.
 *
 * Nothing here carries `data-reveal`. Panels are swapped in and out, and a fresh
 * node inheriting the scroll-reveal gate would arrive invisible with no trigger
 * left to release it — the same trap the FAQ list sidesteps.
 */

const LAST = REGISTER_STEPS.length - 1

/** Which screen a given field lives on, so a server-side rejection can land on it. */
const STEP_OF: Record<DraftField, number> = {
  name: 0,
  enrolment: 0,
  programme: 0,
  email: 0,
  mobile: 0,
  bringingGuest: 1,
  guestName: 1,
  guestRelationship: 1,
  selfie: 2,
  consented: 3,
}

export function RegisterWizard() {
  const [step, setStep] = useState(0)
  const [furthest, setFurthest] = useState(0)
  const [draft, setDraft] = useState<RegisterDraft>(EMPTY_DRAFT)
  const [errors, setErrors] = useState<Errors>({})
  const [hydrated, setHydrated] = useState(false)
  const [restored, setRestored] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const direction = useRef(1)
  /** False until the first deliberate move, so the page does not scroll itself on load. */
  const moved = useRef(false)

  /* ---- draft ------------------------------------------------------------- */

  // Read in an effect, not during render: localStorage does not exist on the
  // server, and a value that appears only on the client is a hydration mismatch.
  useEffect(() => {
    const stored = loadDraft()
    if (draftHasContent(stored)) {
      setDraft(stored)
      setRestored(true)
    }
    setHydrated(true)
  }, [])

  // Guarded on `hydrated` so the first commit cannot write an empty draft over
  // a real one before the read above has landed.
  //
  // An empty draft removes the record rather than storing `{"name":"", …}`.
  // Otherwise `clearDraft()` — which runs on "Start again" and after a
  // successful submit — is undone by this effect a tick later, and "your details
  // are no longer in this browser" stops being true.
  useEffect(() => {
    if (!hydrated) return
    if (draftHasContent(draft)) saveDraft(draft)
    else clearDraft()
  }, [draft, hydrated])

  /* ---- moving between steps ---------------------------------------------- */

  const go = useCallback((to: number) => {
    direction.current = to > step ? 1 : -1
    moved.current = true
    setErrors({})
    setResult(null)
    setStep(to)
    setFurthest((f) => Math.max(f, to))
  }, [step])

  useEffect(() => {
    if (!moved.current) return
    rootRef.current?.scrollIntoView({ block: 'start' })
    // preventScroll because the line above already decided where to be; letting
    // focus scroll as well lands you a few hundred pixels off.
    headingRef.current?.focus({ preventScroll: true })
  }, [step])

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
    // revertOnUpdate so the cleanup above actually runs between steps rather
    // than stacking a matchMedia context per screen.
    { dependencies: [step], revertOnUpdate: true },
  )

  function set<K extends DraftField>(key: K, value: RegisterDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    // Clear the message the moment the field is touched. Leaving it under
    // something somebody is actively fixing is just nagging.
    setErrors((e) => {
      if (!(key in e)) return e
      const next = { ...e }
      delete next[key]
      return next
    })
  }

  /** Puts the cursor on the first thing that is wrong, or on the heading. */
  function focusFirstProblem() {
    window.requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      if (first) {
        first.focus({ preventScroll: true })
        first.scrollIntoView({ block: 'center' })
      } else {
        headingRef.current?.focus({ preventScroll: true })
      }
    })
  }

  function next() {
    const validate = STEP_VALIDATORS[step]
    const found = validate ? validate(draft) : {}
    if (Object.keys(found).length > 0) {
      setErrors(found)
      focusFirstProblem()
      return
    }
    go(Math.min(step + 1, LAST))
  }

  async function submit() {
    setResult(null)
    setSubmitting(true)
    const outcome = await submitRegistration(draft)
    setSubmitting(false)
    setResult(outcome)

    if (outcome.ok) {
      clearDraft()
      return
    }
    if (outcome.field) {
      const target = STEP_OF[outcome.field]
      setErrors({ [outcome.field]: outcome.message })
      if (target !== step) {
        direction.current = -1
        moved.current = true
        setStep(target)
      } else {
        focusFirstProblem()
      }
    }
  }

  function startAgain() {
    clearDraft()
    setDraft(EMPTY_DRAFT)
    setRestored(false)
    setResult(null)
    go(0)
  }

  /* ---- submitted --------------------------------------------------------- */

  if (result?.ok) {
    return <Submitted reference={result.reference} email={tidy(draft.email)} />
  }

  const current = REGISTER_STEPS[step]

  return (
    <div ref={rootRef} id="form" className="mx-auto w-full max-w-2xl scroll-mt-28">
      {!REGISTRATION_OPEN ? (
        <p className="bg-sky/70 text-navy ring-navy/10 mb-7 flex items-start gap-3 rounded-2xl px-5 py-4 text-[0.9375rem] leading-relaxed ring-1">
          <span className="mt-0.5 shrink-0">
            <Icon name="clock" size={18} strokeWidth={2.2} />
          </span>
          <span>
            <strong className="font-bold">Not open yet.</strong> The form below works — walk all four
            steps and see exactly what it asks for. Nothing is sent anywhere, and nothing leaves this
            browser.
          </span>
        </p>
      ) : null}

      <Stepper current={step} furthest={furthest} onJump={go} />

      {restored ? (
        <p className="text-ink-soft bg-paper-tint mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-4 py-3 text-[0.875rem]">
          <span className="text-leaf">
            <Icon name="check" size={15} strokeWidth={2.6} />
          </span>
          Picked up where you left off.
          <button
            type="button"
            onClick={startAgain}
            className="text-violet-deep cursor-pointer font-semibold underline"
          >
            Start again
          </button>
        </p>
      ) : null}

      {/* One <form> per screen. `noValidate` because the messages above are
          written for a nervous first-year and the browser's are not. */}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (step === LAST) void submit()
          else next()
        }}
        className="mt-8"
      >
        <div ref={panelRef} className="bg-card ring-rule/25 shadow-card rounded-3xl p-6 ring-1 sm:p-9">
          <p className="text-label text-flame flex items-center gap-2.5 uppercase">
            <span className="bg-flame-mid h-px w-7" />
            Step {step + 1} of {REGISTER_STEPS.length}
          </p>

          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-headline mt-3 focus:outline-none"
          >
            {current?.title}
          </h2>
          <p className="text-ink-soft mt-3 text-[0.9375rem] leading-relaxed">{current?.body}</p>

          <div className="mt-8">
            {step === 0 ? <AboutPanel draft={draft} errors={errors} set={set} /> : null}
            {step === 1 ? <GuestPanel draft={draft} errors={errors} set={set} /> : null}
            {step === 2 ? <PhotoPanel draft={draft} errors={errors} set={set} /> : null}
            {step === 3 ? (
              <ReviewPanel draft={draft} errors={errors} set={set} onEdit={go} />
            ) : null}
          </div>

          {result && !result.ok ? <Outcome message={result.message} isError={Boolean(result.field)} /> : null}
        </div>

        {/* Buttons sit outside the card so the card is only ever the question. */}
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
              {submitting ? 'Submitting…' : 'Submit registration'}
              {submitting ? null : <Icon name="check" size={18} strokeWidth={2.2} />}
            </Button>
          ) : (
            <Button type="submit" size="lg" arrow>
              Continue
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Panels                                                                     */
/* -------------------------------------------------------------------------- */

interface PanelProps {
  draft: RegisterDraft
  errors: Errors
  set: <K extends DraftField>(key: K, value: RegisterDraft[K]) => void
}

/** `aria-describedby` only when there is something to point at. */
function noteId(id: string, has: boolean) {
  return has ? `${id}-note` : undefined
}

function AboutPanel({ draft, errors, set }: PanelProps) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Field
        label="Your name"
        htmlFor="name"
        hint="As it appears on your application."
        error={errors.name}
        className="sm:col-span-2"
      >
        <TextInput
          id="name"
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          autoComplete="name"
          autoCapitalize="words"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={noteId('name', true)}
        />
      </Field>

      <Field
        label="Enrolment or application number"
        htmlFor="enrolment"
        hint="Whichever you have. It is on your offer of admission."
        error={errors.enrolment}
      >
        <TextInput
          id="enrolment"
          value={draft.enrolment}
          onChange={(e) => set('enrolment', e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="tnum tracking-wide uppercase"
          aria-invalid={errors.enrolment ? true : undefined}
          aria-describedby={noteId('enrolment', true)}
        />
      </Field>

      <Field
        label="Programme"
        htmlFor="programme"
        hint="The one you have been admitted to."
        error={errors.programme}
      >
        <SelectInput
          id="programme"
          value={draft.programme}
          onChange={(e) => set('programme', e.target.value as RegisterDraft['programme'])}
          aria-invalid={errors.programme ? true : undefined}
          aria-describedby={noteId('programme', true)}
        >
          <option value="">Choose one…</option>
          {PROGRAMMES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </SelectInput>
      </Field>

      <Field
        label="Email"
        htmlFor="email"
        hint="Your pass is emailed here as well."
        error={errors.email}
      >
        <TextInput
          id="email"
          type="email"
          inputMode="email"
          value={draft.email}
          onChange={(e) => set('email', e.target.value)}
          autoComplete="email"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={noteId('email', true)}
        />
      </Field>

      <Field
        label="Mobile"
        htmlFor="mobile"
        hint="Only used if something about the day changes."
        error={errors.mobile}
      >
        <TextInput
          id="mobile"
          type="tel"
          inputMode="numeric"
          value={draft.mobile}
          onChange={(e) => set('mobile', e.target.value)}
          autoComplete="tel"
          className="tnum"
          aria-invalid={errors.mobile ? true : undefined}
          aria-describedby={noteId('mobile', true)}
        />
      </Field>
    </div>
  )
}

function GuestPanel({ draft, errors, set }: PanelProps) {
  return (
    <div>
      <fieldset>
        <legend className="text-navy mb-4 text-sm font-bold">Is anyone coming with you?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice
            name="guest"
            title="I am coming alone"
            body="Most people do. Nothing else to fill in."
            checked={!draft.bringingGuest}
            onChange={() => set('bringingGuest', false)}
          />
          <Choice
            name="guest"
            title="I am bringing one guest"
            body="On your pass, for all three days."
            checked={draft.bringingGuest}
            onChange={() => set('bringingGuest', true)}
          />
        </div>
      </fieldset>

      {draft.bringingGuest ? (
        <div className="mt-7 grid gap-6 sm:grid-cols-2">
          <Field
            label="Their name"
            htmlFor="guestName"
            hint="As they would say it at the gate."
            error={errors.guestName}
          >
            <TextInput
              id="guestName"
              value={draft.guestName}
              onChange={(e) => set('guestName', e.target.value)}
              autoComplete="off"
              autoCapitalize="words"
              aria-invalid={errors.guestName ? true : undefined}
              aria-describedby={noteId('guestName', true)}
            />
          </Field>

          <Field
            label="How you know them"
            htmlFor="guestRelationship"
            hint="So a volunteer knows who they are handing a band to."
            error={errors.guestRelationship}
          >
            <SelectInput
              id="guestRelationship"
              value={draft.guestRelationship}
              onChange={(e) =>
                set('guestRelationship', e.target.value as RegisterDraft['guestRelationship'])
              }
              aria-invalid={errors.guestRelationship ? true : undefined}
              aria-describedby={noteId('guestRelationship', true)}
            >
              <option value="">Choose one…</option>
              {GUEST_RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      ) : null}

      <p className="text-ink-faint border-rule/50 mt-7 border-t pt-6 text-[0.875rem] leading-relaxed">
        {EVENT.maxGuestsPerStudent === 1 ? 'One guest per student' : `Up to ${EVENT.maxGuestsPerStudent} guests per student`}
        , and the gate counts. If more of your family want to come, the cultural evening on the last
        day is open — ask at the help desk.
      </p>
    </div>
  )
}

function PhotoPanel({ draft, errors, set }: PanelProps) {
  return (
    <div>
      {/* The words are here, at capture, rather than only beside the tick on the
          last screen: DPDP consent has to be specific, and "specific" means read
          at the moment the photo is taken. The tick that records it is on the
          review screen, with these same words. */}
      <p className="bg-paper-tint text-ink-soft ring-rule/40 mb-7 rounded-2xl px-5 py-4 text-[0.875rem] leading-relaxed ring-1">
        <strong className="text-navy font-bold">Before you do:</strong> {CONSENT_TEXT}{' '}
        <Link href="/privacy" className="text-violet-deep font-semibold underline">
          How we handle it
        </Link>
        .
      </p>

      <SelfieCapture value={draft.selfie} onChange={(v) => set('selfie', v)} />

      {errors.selfie ? (
        <p role="alert" className="text-danger mt-4 text-[0.8125rem] font-semibold">
          {errors.selfie}
        </p>
      ) : null}

      <ul className="text-ink-soft mt-7 grid gap-3 text-[0.875rem] leading-relaxed sm:grid-cols-2">
        {[
          'Face the light, not away from it.',
          'Glasses are fine. So is a mask pulled down.',
          'One person in the frame — yours, not a friend holding the phone.',
          'It is never shown publicly and never printed on your pass.',
        ].map((line) => (
          <li key={line} className="flex gap-2.5">
            <span aria-hidden className="grad-pair mt-2.5 h-px w-4 shrink-0 rounded-full" />
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Review                                                                     */
/* -------------------------------------------------------------------------- */

/** `9876543210` → `+91 98765 43210`. Display only; the stored value is 10 digits. */
function prettyMobile(value: string) {
  const digits = normaliseMobile(value)
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : value
}

function ReviewPanel({
  draft,
  errors,
  set,
  onEdit,
}: PanelProps & { onEdit: (step: number) => void }) {
  const rows: { label: string; value: string; step: number }[] = [
    { label: 'Name', value: tidy(draft.name), step: 0 },
    { label: 'Enrolment number', value: normaliseEnrolment(draft.enrolment), step: 0 },
    { label: 'Programme', value: draft.programme || '—', step: 0 },
    { label: 'Email', value: tidy(draft.email), step: 0 },
    { label: 'Mobile', value: prettyMobile(draft.mobile), step: 0 },
    {
      label: 'Guest',
      value: draft.bringingGuest
        ? `${tidy(draft.guestName)} · ${draft.guestRelationship}`
        : 'Coming alone',
      step: 1,
    },
  ]

  return (
    <div>
      <dl className="divide-rule/50 border-rule/50 divide-y border-y">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline gap-4 py-3.5">
            <dt className="text-ink-faint w-[9.5rem] shrink-0 text-[0.8125rem] font-semibold">
              {r.label}
            </dt>
            <dd className="text-navy min-w-0 flex-1 font-semibold break-words">{r.value}</dd>
            <button
              type="button"
              onClick={() => onEdit(r.step)}
              className="text-violet-deep hover:text-violet shrink-0 cursor-pointer text-[0.8125rem] font-semibold underline"
            >
              Edit
              <span className="sr-only"> {r.label.toLowerCase()}</span>
            </button>
          </div>
        ))}

        <div className="flex items-center gap-4 py-4">
          <dt className="text-ink-faint w-[9.5rem] shrink-0 text-[0.8125rem] font-semibold">
            Your photo
          </dt>
          <dd className="min-w-0 flex-1">
            {draft.selfie ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.selfie}
                alt="The photo you took a moment ago"
                className="ring-rule/60 size-16 rounded-xl object-cover ring-1"
              />
            ) : (
              <span className="text-danger text-[0.9375rem] font-semibold">Not taken yet</span>
            )}
          </dd>
          <button
            type="button"
            onClick={() => onEdit(2)}
            className="text-violet-deep hover:text-violet shrink-0 cursor-pointer text-[0.8125rem] font-semibold underline"
          >
            Retake
          </button>
        </div>
      </dl>

      <div
        className={cn(
          'mt-8 rounded-2xl px-5 py-5 ring-1',
          errors.consented ? 'bg-danger-tint/50 ring-danger/40' : 'bg-paper-tint ring-rule/40',
        )}
      >
        <CheckBox
          checked={draft.consented}
          onChange={(e) => set('consented', e.target.checked)}
          aria-invalid={errors.consented ? true : undefined}
          aria-describedby={errors.consented ? 'consent-error' : undefined}
        >
          {CONSENT_TEXT}{' '}
          <Link href="/privacy" className="text-violet-deep font-semibold underline">
            Read the full notice
          </Link>
          .
        </CheckBox>

        {errors.consented ? (
          <p id="consent-error" className="text-danger mt-3 pl-9 text-[0.8125rem] font-semibold">
            {errors.consented}
          </p>
        ) : null}
      </div>

      <p className="text-ink-faint mt-6 text-[0.875rem] leading-relaxed">
        Submitting checks your number against the admission list. If it matches, your pass appears
        straight away and a copy goes to your email.
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Outcomes                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Two different things wearing one component: something the student can fix
 * (red, `role="alert"`), and something they cannot (calm, `role="status"`).
 * Dressing the second as an error would be a lie about whose fault it is.
 */
function Outcome({ message, isError }: { message: string; isError: boolean }) {
  if (isError) {
    return (
      <p
        role="alert"
        className="bg-danger-tint text-danger mt-8 flex items-start gap-3 rounded-2xl px-5 py-4 text-[0.9375rem] leading-relaxed font-semibold"
      >
        <span className="mt-0.5 shrink-0">
          <Icon name="alert" size={18} strokeWidth={2.2} />
        </span>
        {message}
      </p>
    )
  }

  return (
    <div role="status" className="bg-sky/70 ring-navy/10 mt-8 rounded-2xl px-5 py-5 ring-1">
      <p className="text-navy flex items-center gap-2.5 font-bold">
        <Icon name="clock" size={18} strokeWidth={2.2} />
        Nothing was sent
      </p>
      <p className="text-navy/85 mt-2.5 text-[0.9375rem] leading-relaxed">{message}</p>
      <p className="text-navy/70 mt-2 text-[0.875rem] leading-relaxed">
        Everyone holding an offer of admission is emailed when the form opens. What you typed is kept
        in this browser; the photo is not, so that is the one thing you will do again.
      </p>
      <div className="mt-4">
        <LinkButton
          href={`mailto:${EVENT.email}?subject=Tell me when registration opens`}
          variant="secondary"
          size="sm"
        >
          <Icon name="mail" size={16} />
          Ask to be told when it opens
        </LinkButton>
      </div>
    </div>
  )
}

/**
 * ⚠️ TODO(R1) — unreachable until `REGISTRATION_OPEN` is true. Written now so the
 * success path is designed rather than improvised on the day it is switched on.
 */
function Submitted({ reference, email }: { reference: string; email: string }) {
  return (
    <div className="bg-card ring-rule/25 shadow-card mx-auto w-full max-w-2xl rounded-3xl p-7 text-center ring-1 sm:p-11">
      <span className="bg-leaf-tint text-leaf mx-auto grid size-16 place-items-center rounded-2xl">
        <Icon name="check" size={30} strokeWidth={2.4} />
      </span>

      <h2 className="text-title mt-7">You are on the list</h2>
      <p className="mt-3">
        <HandNote tilt={-2} className="text-violet-deep text-[1.5rem]">
          See you in September!
        </HandNote>
      </p>

      <p className="text-ink-soft mx-auto mt-5 max-w-md leading-relaxed">
        A copy is on its way to {email}. Your reference is{' '}
        <span className="text-navy tnum font-bold">{reference}</span> — quote it if you ever need the
        help desk.
      </p>

      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <LinkButton href="/pass" size="lg">
          <Icon name="qr" size={18} />
          Open your pass
        </LinkButton>
        <LinkButton href="/information" variant="secondary" size="lg" arrow>
          What to bring
        </LinkButton>
      </div>
    </div>
  )
}
