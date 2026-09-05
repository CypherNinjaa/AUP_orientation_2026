'use client'

import { useCallback, useState, type ReactNode } from 'react'

import { isCode10 } from '@orientation/core/pass/identity'

import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import { cue, unlock } from '@/lib/scanner/feedback'

/**
 * The ten-digit pad. The route that always works.
 *
 * Every other input can fail for a reason nobody at the gate can fix: a cracked
 * screen the camera cannot read through, a printed pass that went through the wash, a
 * QR whose signature does not verify. This is a person reading numbers off another
 * person's phone, and it is the documented fallback for all of them (D8).
 *
 * ## Why a custom pad and not `<input type="tel">`
 *
 * The native keyboard on a phone takes half the screen, puts a "done" bar over the
 * verdict area, and on Android varies enough between vendors that the digit positions
 * move. This pad is 64px per key, in one place, every time. A hardware keyboard still
 * works — the buttons are real buttons and the container listens for digits — so a
 * help-desk laptop with a USB numpad is unaffected.
 *
 * ## The first digit
 *
 * `isCode10` requires a leading 1–9: no issued code starts with a zero. Refusing that
 * keystroke outright, rather than accepting it and rejecting the finished number, is
 * the difference between a volunteer noticing at digit one and at digit ten.
 */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

export interface KeypadProps {
  onSubmit: (code10: string) => void
  /** True while a scan is being decided. Holds the pad rather than queueing taps. */
  busy: boolean
}

export function Keypad({ onSubmit, busy }: KeypadProps) {
  const [digits, setDigits] = useState('')

  const press = useCallback((digit: string) => {
    // Every tap is a user gesture, so every tap is a chance to buy back an
    // `AudioContext` that iOS suspended while the app was backgrounded. `unlock` is
    // cheap and idempotent by design.
    unlock()

    setDigits((current) => {
      if (current.length >= 10) return current
      if (current === '' && digit === '0') {
        // Not a valid opening digit. Say so with the reject cue rather than silently
        // swallowing the press, which reads as a dead button.
        cue('reject')
        return current
      }
      cue('tick')
      return current + digit
    })
  }, [])

  const back = useCallback(() => {
    unlock()
    cue('tick')
    setDigits((current) => current.slice(0, -1))
  }, [])

  const complete = isCode10(digits)

  const submit = useCallback(() => {
    if (!complete || busy) return
    onSubmit(digits)
    setDigits('')
  }, [complete, busy, digits, onSubmit])

  return (
    <div
      className="flex flex-1 flex-col gap-3"
      // A hardware keyboard is not the target but must not be excluded: the help desk
      // runs this on a laptop with a numpad, and re-typing on screen would be absurd.
      onKeyDown={(event) => {
        if (event.key >= '0' && event.key <= '9') {
          event.preventDefault()
          press(event.key)
        } else if (event.key === 'Backspace') {
          event.preventDefault()
          back()
        } else if (event.key === 'Enter') {
          event.preventDefault()
          submit()
        }
      }}
      // Focusable so the keydown handler receives keys without stealing focus from
      // anything else on the screen. -1 keeps it out of the tab order; the buttons
      // inside it are the tab stops.
      tabIndex={-1}
    >
      <div className="bg-white border border-slate-200/90 shadow-xs rounded-2xl px-5 py-4">
        <p className="text-slate-500 text-xs font-bold tracking-wider uppercase">
          10-Digit Pass Code
        </p>
        <p
          className="text-navy tnum mt-1 font-mono text-3xl leading-none font-extrabold tracking-[0.08em]"
          aria-live="polite"
        >
          {group(digits)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {KEYS.map((key) => (
          <Key key={key} label={key} onPress={() => press(key)} />
        ))}
        <Key label="⌫" onPress={back} muted aria-label="Delete last digit" />
        <Key label="0" onPress={() => press('0')} />
        <button
          type="button"
          onClick={submit}
          disabled={!complete || busy}
          className={cn(
            'flex h-16 items-center justify-center gap-2 rounded-xl text-base font-extrabold shadow-xs transition-all',
            'focus-visible:outline-violet focus-visible:outline-2 focus-visible:outline-offset-2',
            'disabled:pointer-events-none disabled:opacity-40',
            complete
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-slate-100 text-slate-400 border border-slate-200',
          )}
        >
          <Icon name="check" size={20} strokeWidth={2.4} />
          <span>Verify</span>
        </button>
      </div>

      <p className="text-slate-500 text-xs leading-relaxed">
        Enter the 10 digits printed under the pass barcode. Read the number back to verify with the student before checking.
      </p>

      {digits.length > 0 ? (
        <button
          type="button"
          onClick={() => setDigits('')}
          className="self-start inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-navy px-3 py-1.5 rounded-lg border border-slate-200 bg-white shadow-xs transition-colors"
        >
          <Icon name="close" size={13} />
          <span>Clear Digits</span>
        </button>
      ) : null}
    </div>
  )
}

function Key({
  label,
  onPress,
  muted = false,
  ...rest
}: {
  label: string
  onPress: () => void
  muted?: boolean
} & { 'aria-label'?: string }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(
        'h-16 rounded-xl font-mono text-2xl font-bold tabular-nums shadow-xs border transition-all duration-70',
        'focus-visible:outline-violet focus-visible:outline-2 focus-visible:outline-offset-2',
        'active:scale-[0.98] active:bg-slate-100',
        muted
          ? 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-navy'
          : 'bg-white border-slate-200/90 text-navy hover:border-slate-300 hover:bg-slate-50/70',
      )}
      {...rest}
    >
      {label}
    </button>
  )
}

/**
 * `123-456-7890`, filled in as it is typed.
 */
function group(digits: string): ReactNode {
  const slots = digits.padEnd(10, '·')
  return (
    <>
      <Chunk text={slots.slice(0, 3)} filled={digits.length} from={0} />
      <Sep />
      <Chunk text={slots.slice(3, 6)} filled={digits.length} from={3} />
      <Sep />
      <Chunk text={slots.slice(6, 10)} filled={digits.length} from={6} />
    </>
  )
}

function Sep() {
  return <span className="text-slate-300 mx-1">-</span>
}

function Chunk({ text, filled, from }: { text: string; filled: number; from: number }) {
  return (
    <>
      {[...text].map((char, index) => (
        <span key={index} className={from + index < filled ? 'text-navy' : 'text-slate-300'}>
          {char}
        </span>
      ))}
    </>
  )
}
