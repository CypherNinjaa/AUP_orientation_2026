'use client'

/**
 * Sound and vibration for the gate.
 *
 * The volunteer is not looking at the screen when the verdict lands. They are
 * looking at the person in front of them, holding a phone at chest height, in a
 * queue that is loud. The badge on the screen is for the second glance; the tone
 * and the buzz are the first one, and on a good morning they are the only one.
 *
 * ## Why tones are synthesised rather than shipped as files
 *
 * Three reasons, all of them about the gate rather than the bundle:
 *
 *  1. **Offline.** The scanner is a PWA that has to work with no network for hours.
 *     An `<audio src>` that missed the service-worker cache is a scanner with no
 *     sound and no way to tell. An oscillator cannot fail to load.
 *  2. **Latency.** Decoding even a 4 KB MP3 costs tens of milliseconds on a cheap
 *     Android, and the first play costs more. A scheduled oscillator starts on the
 *     audio thread within one buffer.
 *  3. **Distinguishability.** These four cues have to be told apart by ear at ten
 *     metres by somebody who has heard them four hundred times. That is a job for
 *     deliberate intervals — a rising fifth for admit, a low square for reject —
 *     not for whatever a sound pack happens to contain.
 *
 * ## The unlock
 *
 * Every browser refuses to start an `AudioContext` outside a user gesture, and
 * iOS additionally suspends one whenever the tab is backgrounded. So `unlock()`
 * exists and the scanner shell calls it from the first real tap. Without that
 * call, `cue()` is silent and *says nothing about it* — which is why the shell
 * shows the mute state from `audioReady()` rather than assuming sound works.
 *
 * Nothing in this file throws. A device with no `AudioContext`, no
 * `navigator.vibrate`, or a `localStorage` that a private window has locked, gets
 * a working scanner with one fewer channel.
 */

export type Cue =
  /** Admitted. The only cue that sounds like good news. */
  | 'admit'
  /** Refused for any reason — already used, invalid, revoked, outside the window. */
  | 'reject'
  /** Accepted with something to read: a stale manifest, a missing selfie. */
  | 'warn'
  /** A keypress on the manual-code pad. Quiet by design. */
  | 'tick'

/* -------------------------------------------------------------------------- */
/* Mute                                                                       */
/* -------------------------------------------------------------------------- */

const MUTE_KEY = 'aup26.scanner.mute'

/**
 * Sound is on unless the volunteer turned it off.
 *
 * Read through a module variable rather than off `localStorage` at each cue: this
 * is called on the hot path of every scan, and a synchronous storage read per scan
 * on a low-end Android is measurable.
 */
let muted = false
let mutedLoaded = false

function loadMuted(): boolean {
  if (mutedLoaded) return muted
  mutedLoaded = true
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    // A private window with storage denied. Default to audible.
    muted = false
  }
  return muted
}

export function isMuted(): boolean {
  return loadMuted()
}

export function setMuted(next: boolean): void {
  muted = next
  mutedLoaded = true
  try {
    window.localStorage.setItem(MUTE_KEY, next ? '1' : '0')
  } catch {
    // Lost on reload, honoured for this shift. Better than refusing the toggle.
  }
}

/* -------------------------------------------------------------------------- */
/* Audio                                                                      */
/* -------------------------------------------------------------------------- */

/** A note in a cue: frequency in Hz, start offset and length in seconds. */
interface Note {
  hz: number
  at: number
  for: number
  wave: OscillatorType
  /** Peak gain, 0–1. The gate is loud; these are louder than a UI would want. */
  gain: number
}

/**
 * The four cues, as notes.
 *
 * Pitch does the work that colour cannot. `admit` rises, `reject` falls and sits
 * low, `warn` repeats on one note — a shape you can identify without having to
 * remember which of two beeps meant yes.
 */
const CUES: Record<Cue, readonly Note[]> = {
  admit: [
    { hz: 784, at: 0, for: 0.07, wave: 'sine', gain: 0.3 },
    { hz: 1175, at: 0.07, for: 0.11, wave: 'sine', gain: 0.3 },
  ],
  reject: [
    // Square, low, and long enough to be unmistakable over a crowd. This is the
    // one cue that must never be mistaken for the other three.
    { hz: 190, at: 0, for: 0.16, wave: 'square', gain: 0.22 },
    { hz: 150, at: 0.17, for: 0.24, wave: 'square', gain: 0.22 },
  ],
  warn: [
    { hz: 640, at: 0, for: 0.08, wave: 'triangle', gain: 0.26 },
    { hz: 640, at: 0.15, for: 0.08, wave: 'triangle', gain: 0.26 },
  ],
  tick: [{ hz: 1500, at: 0, for: 0.018, wave: 'sine', gain: 0.1 }],
}

let context: AudioContext | null = null
/** Set once a context could not be created. Stops retrying on every scan. */
let audioImpossible = false

function ctor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  // Safari below 14.1 only has the prefixed constructor, and a handful of the
  // volunteer devices at a gate are always older than anyone plans for.
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  )
}

/**
 * Start or resume audio. Must be called from inside a user gesture.
 *
 * Safe and cheap to call repeatedly — the scanner shell calls it on every tap on
 * purpose, because iOS suspends the context when the tab is backgrounded and a
 * volunteer switching apps must not come back to a silent scanner.
 */
export function unlock(): void {
  if (audioImpossible) return
  const Ctor = ctor()
  if (!Ctor) {
    audioImpossible = true
    return
  }
  try {
    context ??= new Ctor()
    if (context.state === 'suspended') void context.resume()
  } catch {
    audioImpossible = true
    context = null
  }
}

/** Whether a cue would actually be heard. Drives the mute indicator in the UI. */
export function audioReady(): boolean {
  return context !== null && context.state === 'running' && !loadMuted()
}

function sound(cue: Cue): void {
  if (loadMuted()) return
  // Deliberately not calling `unlock()` here. This runs from a scan result, which
  // may arrive from a camera frame rather than a tap, and a `new AudioContext()`
  // outside a gesture is created suspended and then counts against Chrome's
  // autoplay reputation for the origin.
  const ac = context
  if (!ac || ac.state !== 'running') return

  const now = ac.currentTime
  for (const note of CUES[cue]) {
    try {
      const osc = ac.createOscillator()
      const amp = ac.createGain()
      osc.type = note.wave
      osc.frequency.value = note.hz

      const from = now + note.at
      const to = from + note.for
      // Ramped rather than switched. A gain that steps from 0 to 0.3 produces a
      // click at the discontinuity, and four hundred clicks a morning is what
      // makes a volunteer turn the sound off.
      amp.gain.setValueAtTime(0.0001, from)
      amp.gain.exponentialRampToValueAtTime(note.gain, from + 0.008)
      amp.gain.exponentialRampToValueAtTime(0.0001, to)

      osc.connect(amp).connect(ac.destination)
      osc.start(from)
      osc.stop(to + 0.02)
    } catch {
      // One note failing is not worth losing the rest of the cue, or the scan.
      return
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Haptics                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Milliseconds on, off, on… as `navigator.vibrate` wants them.
 *
 * `reject` is three distinct buzzes because a single long one is what a
 * notification feels like. Three is a refusal, and a volunteer feels it through a
 * glove and a phone case.
 */
const BUZZ: Record<Cue, readonly number[]> = {
  admit: [45],
  reject: [80, 55, 80, 55, 110],
  warn: [30, 45, 30],
  tick: [10],
}

function haptic(cue: Cue): void {
  // iOS Safari has never implemented this. No feature-detect fallback exists that
  // is not a lie, so the scanner leans on sound there and says nothing.
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(BUZZ[cue] as number[])
  } catch {
    // Some Android builds throw when the tab is not visible.
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Fire a cue on every channel that works on this device.
 *
 * Vibration is *not* gated on the mute toggle, and that is deliberate: muting is
 * what a volunteer does in a quiet foyer or during a speech, and it must not also
 * remove the only feedback they get when the phone is at their side.
 */
export function cue(kind: Cue): void {
  sound(kind)
  haptic(kind)
}
