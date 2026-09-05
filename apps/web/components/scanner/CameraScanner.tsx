'use client'

import { BarcodeFormat, BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ScanMethod } from '@orientation/contracts'

import { Icon } from '@/components/ui/Icon'
import { OpsButton } from '@/components/ui/ops'
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
        // leave a button that does nothing.
        setTorch(null)
      })
  }, [torch])

  if (fault !== null) {
    return (
      <div className="bg-ops-panel ring-ops-line/70 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl px-6 py-12 text-center ring-1">
        <span className="bg-stop/12 text-stop grid size-12 place-items-center rounded-full">
          <Icon name="camera" size={22} />
        </span>
        <p className="text-ops-ink text-sm font-bold">The camera is not available</p>
        <p className="text-ops-soft max-w-sm text-sm">{fault}</p>
        <p className="text-ops-faint max-w-sm text-xs">
          Nobody has to be turned away. Ask for the ten-digit number on the pass and key it in.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-ops-panel ring-ops-line/70 relative flex-1 overflow-hidden rounded-xl ring-1">
      <video
        ref={videoRef}
        playsInline
        muted
        // Not `autoPlay`: ZXing calls `play()` itself once the stream is attached, and
        // a competing autoplay attempt is what produces "The play() request was
        // interrupted" in the console on Android.
        className="absolute inset-0 size-full object-cover"
      />

      {/* The reticle. Not a viewfinder — ZXing reads the whole frame — but a target,
          which is what stops a volunteer holding the phone six inches too far away. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
        <div
          className={cn(
            'relative aspect-square w-[68%] max-w-72 rounded-2xl',
            active ? 'ring-info/70' : 'ring-ops-line/60',
            'ring-2',
          )}
        >
          {active ? (
            <span className="bg-info/70 absolute inset-x-3 top-1/2 h-px motion-safe:animate-pulse" />
          ) : null}
        </div>
      </div>

      {starting ? (
        <p className="bg-ops/70 text-ops-soft absolute inset-0 grid place-items-center text-sm font-semibold">
          Opening the camera…
        </p>
      ) : null}

      {!active && !starting ? (
        <p className="bg-ops/55 text-ops-faint absolute inset-0 grid place-items-center text-xs font-bold tracking-[0.11em] uppercase">
          Paused
        </p>
      ) : null}

      <div className="absolute right-2 bottom-2 flex gap-2">
        {devices.length > 1 ? (
          <OpsButton
            size="sm"
            variant="outline"
            icon="camera"
            onClick={flip}
            className="bg-ops/80 backdrop-blur"
          >
            Flip
          </OpsButton>
        ) : null}
        {torch !== null ? (
          <OpsButton
            size="sm"
            variant={torch ? 'primary' : 'outline'}
            icon="bolt"
            onClick={toggleTorch}
            aria-pressed={torch}
            className={torch ? undefined : 'bg-ops/80 backdrop-blur'}
          >
            Light
          </OpsButton>
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
