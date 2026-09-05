'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import { EVENT } from '@/lib/event'
import { loadDetector } from '@/lib/faceDetect'
import {
  type FaceReading,
  type Level,
  captureSquare,
  dataUrlKb,
  sampleFrame,
  verdict,
} from '@/lib/selfie'

/**
 * The camera step.
 *
 * Camera only — there is no file picker anywhere in here, and that is a security
 * property rather than an oversight (decision D6). A photo chosen from a gallery
 * can be a photo of anybody, which would make the one check a volunteer performs
 * at the gate worthless. `getUserMedia` with no `capture` fallback is the whole
 * point.
 *
 * Two taps, like every phone camera: take it, then approve it. The second tap is
 * where a student actually looks at the picture, which is the right place to have
 * just read what happens to it.
 */

/**
 * An approved frame, and what the detector saw in it.
 *
 * `faceDetected` travels with the image because the contract asks for both, and
 * it can only be answered here — by the time the parent has a data URL there is
 * nothing left to read it off. It is advisory in every direction (decision D4): a
 * `false` sorts the moderation queue and warns the student, and refuses nothing.
 * A device where the detector never loaded reports `false`, which is the honest
 * answer to "did anything confirm a face" and lands the photo in front of a human.
 */
export interface Shot {
  image: string
  faceDetected: boolean
}

type Phase = 'idle' | 'opening' | 'live' | 'denied' | 'unsupported' | 'failed'

const RING: Record<Level, string> = {
  good: 'ring-leaf',
  advice: 'ring-flame-bright',
  block: 'ring-danger',
}

const HINT: Record<Level, string> = {
  good: 'text-leaf',
  advice: 'text-flame',
  block: 'text-danger',
}

export function SelfieCapture({
  value,
  onChange,
}: {
  value: string | null
  onChange: (next: Shot | null) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  /**
   * The most recent thing the detector saw, in a ref rather than state: it is
   * read by the guidance timer below, and putting four re-renders a second
   * through a component with a live video in it buys nothing.
   */
  const facesRef = useRef<FaceReading | null>(null)
  /** Set once the detector has proved too slow or too broken to keep asking. */
  const detectorDropped = useRef(false)

  const [phase, setPhase] = useState<Phase>('idle')
  /** A frame that has been taken but not yet approved. */
  const [shot, setShot] = useState<string | null>(null)
  const [live, setLive] = useState(verdict(null))
  const [shotLevel, setShotLevel] = useState<Level>('good')
  /**
   * What the detector saw when the frame was taken.
   *
   * Three states, not two. `null` means it had nothing to say — never downloaded,
   * dropped for being slow, or simply had not read a frame yet — which is not the
   * same as looking and finding nobody, and only the second is worth telling a
   * student about.
   */
  const [shotFace, setShotFace] = useState<boolean | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
  }, [])

  // The camera light going off when you leave the step is not a nicety.
  useEffect(() => stop, [stop])

  const open = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase('unsupported')
      return
    }
    setPhase('opening')
    // Fire and forget: this is the same memoised promise the detection loop
    // awaits below, so starting it here spends the seconds the browser is asking
    // for permission on the download instead of spending them after.
    void loadDetector()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // A square-ish request so the centre crop throws away as little as
        // possible; browsers treat these as hints and pick the nearest mode.
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      video.srcObject = stream
      // Rejects with AbortError if the element goes away mid-play. Not an error
      // worth showing anybody.
      await video.play().catch(() => undefined)
      setPhase('live')
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') setPhase('denied')
      else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') setPhase('unsupported')
      else setPhase('failed')
    }
  }, [])

  // Live guidance. A quarter-second is often enough to feel immediate and is
  // four reads a second rather than sixty — this runs on phones.
  useEffect(() => {
    if (phase !== 'live') return
    const id = window.setInterval(() => {
      const video = videoRef.current
      if (video) setLive(verdict(sampleFrame(video), facesRef.current))
    }, 250)
    return () => window.clearInterval(id)
  }, [phase])

  // The detector gets its own loop rather than riding the timer above. A read
  // can take longer than the interval on a cheap phone, and a timer would stack
  // them up until the page stopped responding; here each read schedules the next
  // one only once it has finished.
  useEffect(() => {
    if (phase !== 'live') return
    let stopped = false

    const drop = (why: string) => {
      facesRef.current = null
      detectorDropped.current = true
      // Deliberately noisy. This is a feature that switches itself off, and a
      // silent degradation is one nobody will ever know to look at.
      console.warn(`[selfie] face detection off — ${why}. Light and focus checks continue.`)
    }

    void (async () => {
      if (detectorDropped.current) return
      const detector = await loadDetector()
      if (!detector || stopped) return

      let reads = 0
      let slow = 0

      while (!stopped) {
        const video = videoRef.current
        if (!video) return

        const began = performance.now()
        try {
          facesRef.current = await detector.read(video)
        } catch (err) {
          // A lost WebGL context, or a frame it could not read.
          drop(err instanceof Error ? err.message : 'a read threw')
          return
        }
        const cost = performance.now() - began

        // The first read is not representative of the rest: TensorFlow compiles
        // its shaders on the way through it, which is a second or two even on a
        // good GPU. Judging the detector by its warm-up would switch it off on
        // every device there is.
        const budget = reads === 0 ? 8000 : 1800
        reads++
        slow = cost > budget ? slow + 1 : 0

        // Two consecutive slow reads before giving up, so that one garbage
        // collection, or one moment spent in a background tab, does not cost a
        // student the guidance for the rest of the step. A device that really is
        // this slow would spend the whole step blocked, so it stops being asked
        // and the form behaves as if the model had never loaded.
        if (slow >= 2) {
          drop(`two reads over ${budget} ms — the last took ${Math.round(cost)} ms`)
          return
        }

        await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, 250 - cost)))
      }
    })()

    return () => {
      stopped = true
      // Nothing stale survives into the next camera session.
      facesRef.current = null
    }
  }, [phase])

  function take() {
    const video = videoRef.current
    if (!video) return
    const url = captureSquare(video)
    if (!url) {
      setPhase('failed')
      return
    }
    const faces = facesRef.current
    setShotFace(faces ? faces.count === 1 : null)
    setShotLevel(live.level)
    setShot(url)
    stop()
    setPhase('idle')
  }

  function retake() {
    setShot(null)
    setShotFace(null)
    onChange(null)
    void open()
  }

  /* ---- approved ---------------------------------------------------------- */
  if (value) {
    return (
      <div className="bg-card ring-rule/40 rounded-3xl p-5 ring-1 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Photo src={value} className="ring-leaf/50 mx-auto w-40 sm:mx-0" />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-navy flex items-center justify-center gap-2 font-bold sm:justify-start">
              <span className="bg-leaf-tint text-leaf grid size-6 shrink-0 place-items-center rounded-full">
                <Icon name="check" size={14} strokeWidth={2.6} />
              </span>
              Photo taken
            </p>
            <p className="text-ink-soft mt-2 text-[0.9375rem] leading-relaxed">
              This is the picture a volunteer will see beside your name at the gate. It has not left
              this device yet.
            </p>
            {shotFace === false ? (
              // Said plainly, and it stops nothing. The photo goes to a moderator
              // either way; a student who knows why is a student who can fix it
              // now rather than at the gate.
              <p className="text-flame mt-2 flex items-start gap-2 text-[0.875rem] leading-relaxed font-semibold">
                <span className="mt-0.5 shrink-0">
                  <Icon name="alert" size={15} strokeWidth={2.2} />
                </span>
                We could not find a face in this one, so somebody will check it by hand. Taking
                another in better light is quicker.
              </p>
            ) : null}
            <p className="text-ink-faint mt-1 text-[0.8125rem]">{dataUrlKb(value)} KB</p>
            <div className="mt-4 flex justify-center sm:justify-start">
              <Button type="button" variant="secondary" size="sm" onClick={retake}>
                <Icon name="camera" size={16} />
                Take a different one
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ---- taken, not yet approved ------------------------------------------ */
  if (shot) {
    return (
      <div className="bg-card ring-rule/40 rounded-3xl p-5 ring-1 sm:p-6">
        <Photo src={shot} className="ring-rule/60 mx-auto w-full max-w-[18rem]" />

        {shotLevel === 'block' ? (
          <p className="bg-danger-tint text-danger mt-5 flex items-start gap-3 rounded-2xl px-4 py-3 text-[0.9375rem] leading-relaxed font-semibold">
            <span className="mt-0.5 shrink-0">
              <Icon name="alert" size={18} strokeWidth={2.2} />
            </span>
            A volunteer will not be able to match this to your face. Please take another.
          </p>
        ) : (
          <p className="text-ink-soft mt-5 text-center text-[0.9375rem] leading-relaxed">
            Can somebody who has never met you tell it is you? That is the only test.
          </p>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button type="button" variant="secondary" onClick={retake}>
            <Icon name="camera" size={18} />
            Take another
          </Button>
          <Button
            type="button"
            variant={shotLevel === 'block' ? 'secondary' : 'primary'}
            onClick={() => onChange({ image: shot, faceDetected: shotFace === true })}
          >
            <Icon name="check" size={18} strokeWidth={2.2} />
            Use this photo
          </Button>
        </div>
      </div>
    )
  }

  /* ---- no camera ---------------------------------------------------------- */
  if (phase === 'denied' || phase === 'unsupported' || phase === 'failed') {
    return <NoCamera phase={phase} onRetry={() => void open()} />
  }

  /* ---- before, and live --------------------------------------------------- */
  return (
    <div
      role="group"
      aria-label="Camera"
      className="bg-navy ring-navy/20 relative overflow-hidden rounded-3xl p-5 ring-1 sm:p-6"
    >
      <div className="relative mx-auto aspect-square w-full max-w-[20rem] overflow-hidden rounded-2xl bg-black/40">
        <video
          ref={videoRef}
          playsInline
          muted
          // Mirrored so that moving left moves left. The stored frame is
          // mirrored to match — see captureSquare().
          className={cn(
            'size-full scale-x-[-1] object-cover transition-opacity duration-500',
            phase === 'live' ? 'opacity-100' : 'opacity-0',
          )}
        />

        {phase === 'live' ? (
          <>
            {/* The vignette and the guide are one element: a circle with an
                enormous spread shadow darkens everything outside it. */}
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[68%] -translate-x-1/2 -translate-y-1/2',
                'rounded-full shadow-[0_0_0_9999px_rgba(0,27,68,0.5)] ring-2 transition-colors duration-500',
                RING[live.level],
              )}
            />
            <p
              aria-live="polite"
              className={cn(
                'absolute inset-x-3 bottom-3 rounded-xl bg-black/55 px-3 py-2 text-center text-[0.8125rem] leading-snug font-semibold backdrop-blur-sm',
                HINT[live.level],
              )}
            >
              {live.hint}
            </p>
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            {phase === 'opening' ? (
              <p className="text-sky/90 text-[0.9375rem] font-semibold">
                Opening the camera — your browser will ask first.
              </p>
            ) : (
              <div>
                <span className="bg-white/10 text-flame-mid mx-auto mb-4 grid size-14 place-items-center rounded-2xl">
                  <Icon name="camera" size={26} />
                </span>
                <p className="text-sky/85 mx-auto max-w-[22ch] text-[0.9375rem] leading-relaxed">
                  Front camera, one photo, taken here. Nothing from your gallery.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-center">
        {phase === 'live' ? (
          <Button type="button" variant="onNavy" size="lg" onClick={take}>
            <Icon name="camera" size={20} />
            Take the photo
          </Button>
        ) : (
          <Button
            type="button"
            variant="onNavy"
            size="lg"
            disabled={phase === 'opening'}
            onClick={() => void open()}
          >
            <Icon name="camera" size={20} />
            {phase === 'opening' ? 'One moment…' : 'Open the camera'}
          </Button>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Photo({ src, className }: { src: string; className?: string }) {
  return (
    // A data URL of a frame this browser just drew. next/image would want to
    // optimise it, which is both impossible and pointless.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="The photo you have just taken"
      className={cn('aspect-square rounded-2xl object-cover ring-1', className)}
    />
  )
}

function NoCamera({ phase, onRetry }: { phase: 'denied' | 'unsupported' | 'failed'; onRetry: () => void }) {
  const copy = {
    denied: {
      title: 'The camera is blocked',
      body: 'Your browser is holding the permission. Look for the camera icon in the address bar and allow it, then try again. On a phone this lives in the site settings for this page.',
    },
    unsupported: {
      title: 'No camera here',
      body: 'This browser cannot find one. If you are on a laptop without a camera, open this page on your phone — everything you have typed so far is saved and will still be here.',
    },
    failed: {
      title: 'The camera did not start',
      body: 'Something else may be using it — a video call, or another tab. Close that and try again.',
    },
  }[phase]

  return (
    <div className="bg-card ring-danger/25 rounded-3xl p-6 ring-1 sm:p-7">
      <p className="text-navy flex items-center gap-3 font-bold">
        <span className="bg-danger-tint text-danger grid size-8 shrink-0 place-items-center rounded-full">
          <Icon name="alert" size={17} strokeWidth={2.2} />
        </span>
        {copy.title}
      </p>
      <p className="text-ink-soft mt-3 text-[0.9375rem] leading-relaxed">{copy.body}</p>

      <div className="mt-5">
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          Try the camera again
        </Button>
      </div>

      {/* Nobody gets stuck here. Decision D8 — the help desk runs the same form. */}
      <p className="text-ink-faint border-rule/50 mt-6 border-t pt-5 text-[0.875rem] leading-relaxed">
        Still nothing? The help desk in the Gate 1 foyer will do this bit with you on the morning —
        bring your form number. Or ask us first on{' '}
        <a href={`tel:${EVENT.helpline.replace(/\s/g, '')}`} className="text-violet-deep font-semibold">
          {EVENT.helpline}
        </a>
        .
      </p>
    </div>
  )
}
