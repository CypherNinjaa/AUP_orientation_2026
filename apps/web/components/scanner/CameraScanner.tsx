'use client'

import { BarcodeFormat, BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ScanMethod } from '@orientation/contracts'

import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'

/**
 * The camera. Two symbologies, one stream, and no network.
 *
 * ZXing decodes in a worker-free loop off the video element, which is why the
 * `delayBetweenScanAttempts` below matters: at 0 it pegs a mid-range phone's CPU and
 * the battery is gone by 10am, and above ~150ms a volunteer moving a phone towards a
 * pass sweeps past the frame that would have decoded.
 *
 * ## Why the stream is never stopped between scans
 *
 * `active` gates the *callback*, not the camera. `getUserMedia` costs 300–600ms and a
 * visible black flash, and a gate scanning three hundred passes an hour would pay
 * that three hundred times. So the stream runs from mount to unmount and results are
 * dropped while a verdict is on screen.
 *
 * ## The lockout
 *
 * A pass is still in frame when the volunteer dismisses its verdict, so the very next
 * decoded frame is the same code — which `decideScan` correctly calls `DUPLICATE`,
 * turning a clean admission into a red screen two seconds later. Identical raw text
 * is therefore ignored for `SAME_CODE_LOCKOUT_MS` after it is accepted. A genuine
 * re-check of the same pass still works; it just has to be deliberate.
 *
 * ## Format, not guesswork
 *
 * `getBarcodeFormat()` distinguishes the QR from the Code128, and that distinction is
 * load-bearing: a QR carries a signed envelope and can admit a pass this device has
 * never heard of, while a barcode carries ten digits and is worth exactly a manifest
 * lookup. Reporting the wrong one would either discard a signature or claim one that
 * was never there.
 */

/** Enough to clear a pass from frame; short enough that a deliberate rescan works. */
const SAME_CODE_LOCKOUT_MS = 3_000

/**
 * A supertype of ZXing's `Result`, which is all this file needs.
 *
 * `@zxing/library` is a transitive dependency — it is not in `package.json` — so its
 * `Result` class is not imported directly. Under `strictFunctionTypes` a callback
 * parameter must *accept* what the caller passes, so a structural type with fewer
 * members than `Result` is exactly what is allowed here.
 */
interface DecodedResult {
  getText: () => string
  getBarcodeFormat: () => BarcodeFormat
}

export interface CameraScannerProps {
  /** False while a verdict is on screen. The stream keeps running regardless. */
  active: boolean
  onDecode: (raw: string, method: ScanMethod) => void
  /** Called once when the camera cannot be used at all, so the shell can act. */
  onUnavailable: (message: string) => void
}

export function CameraScanner({ active, onDecode, onUnavailable }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)

  // Read inside the decode callback, which is created once and outlives every render.
  const activeRef = useRef(active)
  activeRef.current = active
  const onDecodeRef = useRef(onDecode)
  onDecodeRef.current = onDecode

  const lastRef = useRef<{ raw: string; at: number }>({ raw: '', at: 0 })

  const [fault, setFault] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)
  const [torch, setTorch] = useState<boolean | null>(null)
  const [devices, setDevices] = useState<readonly MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (video === null) return

    let cancelled = false
    setStarting(true)

    const fail = (message: string) => {
      if (cancelled) return
      setFault(message)
      setStarting(false)
      onUnavailable(message)
    }

    if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined) {
      // Almost always an insecure origin: `mediaDevices` is undefined on plain http
      // outside localhost, which is what a volunteer gets from an IP address.
      fail('This browser will not open a camera on an insecure connection. Open the scanner over https, or use the keypad.')
      return
    }

    const reader = new BrowserMultiFormatReader(undefined, {
      // 300ms between successes: long enough that one pass does not decode four
      // times while the volunteer is still lifting the phone away.
      delayBetweenScanSuccess: 300,
      delayBetweenScanAttempts: 120,
    })
    reader.possibleFormats = [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128]

    const handle = (result: DecodedResult | undefined): void => {
      // `undefined` on every frame that did not contain a symbol, which is most of
      // them. Not an error and not worth a state update.
      if (result === undefined) return
      if (!activeRef.current) return

      const raw = result.getText()
      if (raw === '') return

      const now = Date.now()
      if (lastRef.current.raw === raw && now - lastRef.current.at < SAME_CODE_LOCKOUT_MS) return
      lastRef.current = { raw, at: now }

      const method: ScanMethod = result.getBarcodeFormat() === BarcodeFormat.QR_CODE ? 'QR' : 'BARCODE'
      onDecodeRef.current(raw, method)
    }

    const start = async (): Promise<void> => {
      const controls =
        deviceId === null
          ? await reader.decodeFromConstraints(
              {
                // `ideal`, not `exact`: an `exact` facingMode that the device cannot
                // satisfy throws `OverconstrainedError` and leaves the volunteer with
                // no camera at all rather than the wrong one.
                video: {
                  facingMode: { ideal: 'environment' },
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                },
                audio: false,
              },
              video,
              handle,
            )
          : await reader.decodeFromVideoDevice(deviceId, video, handle)

      if (cancelled) {
        controls.stop()
        return
      }

      controlsRef.current = controls
      setStarting(false)
      setFault(null)
      // `switchTorch` is optional and experimental in ZXing, and absent on iOS
      // entirely. `null` means "no such control", which is different from "off".
      setTorch(controls.switchTorch === undefined ? null : false)

      // Labels are blank until permission has been granted, so this runs after the
      // stream is live rather than before it.
      try {
        const found = await navigator.mediaDevices.enumerateDevices()
        if (!cancelled) setDevices(found.filter((d) => d.kind === 'videoinput'))
      } catch {
        // A device list is a convenience. Losing it costs the flip button, nothing more.
      }
    }

    void start().catch((error: unknown) => {
      fail(cameraFault(error))
    })

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [deviceId, onUnavailable])

  const flip = useCallback(() => {
    if (devices.length < 2) return
    const current = devices.findIndex((d) => d.deviceId === deviceId)
    const next = devices[(current + 1) % devices.length]
    if (next !== undefined) setDeviceId(next.deviceId)
  }, [devices, deviceId])

  const toggleTorch = useCallback(() => {
    const controls = controlsRef.current
    if (controls?.switchTorch === undefined) return
    const next = torch !== true
    void controls
      .switchTorch(next)
      .then(() => {
        setTorch(next)
      })
      .catch(() => {
        // The capability was advertised and refused. Hide the control rather than
        setTorch(null)
      })
  }, [torch])

  if (fault !== null) {
    return (
      <div className="bg-white border border-slate-200 shadow-xs flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center rounded-2xl">
        <span className="grid size-12 place-items-center rounded-2xl bg-rose-50 border border-rose-200 text-rose-600">
          <Icon name="alert" size={24} />
        </span>
        <p className="text-navy text-base font-bold">Camera Unavailable</p>
        <p className="text-slate-600 max-w-sm text-sm">{fault}</p>
        <p className="text-slate-400 max-w-sm text-xs">
          Nobody has to be turned away. Switch to &ldquo;Student Search&rdquo; or &ldquo;Passcode Keypad&rdquo; to admit students directly.
        </p>
      </div>
    )
  }

  return (
    <div className="relative flex-1 min-h-[22rem] sm:min-h-[26rem] overflow-hidden rounded-2xl bg-slate-900 border border-slate-200/90 shadow-sm flex flex-col justify-center items-center">
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 size-full object-cover"
      />

      {/* High-legibility alignment reticle */}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center p-4">
        <div
          className={cn(
            'relative aspect-square w-[75%] max-w-72 rounded-2xl transition-all duration-300',
            active ? 'ring-1 ring-amber-400/60 shadow-[0_0_40px_rgba(202,108,0,0.25)]' : 'ring-1 ring-white/30',
          )}
        >
          {/* Amity Flame corner brackets */}
          <div className="absolute -top-1 -left-1 size-6 border-t-[3px] border-l-[3px] border-amber-400 rounded-tl-lg" />
          <div className="absolute -top-1 -right-1 size-6 border-t-[3px] border-r-[3px] border-amber-400 rounded-tr-lg" />
          <div className="absolute -bottom-1 -left-1 size-6 border-b-[3px] border-l-[3px] border-amber-400 rounded-bl-lg" />
          <div className="absolute -bottom-1 -right-1 size-6 border-b-[3px] border-r-[3px] border-amber-400 rounded-br-lg" />

          {/* Laser scanning beam */}
          {active && (
            <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-gradient-to-r from-transparent via-amber-400 to-transparent motion-safe:animate-pulse" />
          )}
        </div>
      </div>

      {starting ? (
        <div className="bg-navy/80 text-white absolute inset-0 grid place-items-center text-sm font-bold backdrop-blur-xs">
          <div className="flex items-center gap-2">
            <Icon name="camera" size={18} className="animate-spin" />
            <span>Starting camera feed…</span>
          </div>
        </div>
      ) : null}

      {!active && !starting ? (
        <div className="bg-navy/70 text-white/90 absolute inset-0 grid place-items-center text-xs font-bold tracking-wider uppercase backdrop-blur-xs">
          <span>Scanner Ready · Awaiting Code</span>
        </div>
      ) : null}

      <div className="absolute right-3 bottom-3 flex gap-2">
        {devices.length > 1 ? (
          <button
            type="button"
            onClick={flip}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/90 hover:bg-white text-navy font-bold text-xs px-3 py-1.5 border border-slate-200/80 shadow-sm backdrop-blur transition-all"
          >
            <Icon name="camera" size={14} />
            <span>Flip</span>
          </button>
        ) : null}
        {torch !== null ? (
          <button
            type="button"
            onClick={toggleTorch}
            aria-pressed={torch}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg font-bold text-xs px-3 py-1.5 border shadow-sm backdrop-blur transition-all',
              torch
                ? 'bg-amber-400 text-navy border-amber-500'
                : 'bg-white/90 hover:bg-white text-navy border-slate-200/80',
            )}
          >
            <Icon name="bolt" size={14} />
            <span>{torch ? 'Torch ON' : 'Torch'}</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * A `getUserMedia` rejection, in words that tell a volunteer what to do.
 *
 * The `name` values are the spec's, not the browser's message — Chrome's own
 * "Permission denied" and Safari's "The request is not allowed by the user agent" are
 * the same problem described two ways, and neither says *how to fix it on a phone*.
 */
function cameraFault(error: unknown): string {
  const name = error instanceof Error ? error.name : ''

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was refused. Open the browser settings for this site, allow the camera, then reload.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No usable camera was found on this device.'
    case 'NotReadableError':
    case 'AbortError':
      return 'Another app is holding the camera. Close it — or restart the phone — and reload.'
    default:
      return error instanceof Error && error.message !== ''
        ? error.message
        : 'The camera could not be started.'
  }
}
