'use client'

import { BarcodeFormat, BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ScanMethod } from '@orientation/contracts'

import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'

/**
 * The camera: Two symbologies (2D QR + 1D Barcode), one hardware-accelerated stream, and zero network.
 *
 * Provides three dedicated scanning modes:
 * - 'auto': Universal hybrid mode detecting both QR codes and 1D barcodes.
 * - 'qr': High-precision 2D QR scanning inside square frame.
 * - 'barcode': Dedicated 1D barcode scanner (Code128, Code39, EAN13) with wide horizontal
 *   laser reticle that isolates the barcode on the pass without the adjacent QR code triggering.
 *
 * Uses native browser `BarcodeDetector` (hardware-accelerated ML) where supported on modern
 * mobile devices (Android Chrome), with ZXing BrowserMultiFormatReader + TRY_HARDER as universal fallback.
 */

/** Enough to clear a pass from frame; short enough that a deliberate rescan works. */
const SAME_CODE_LOCKOUT_MS = 3_000

interface DecodedResult {
  getText: () => string
  getBarcodeFormat: () => BarcodeFormat
}

interface DetectedBarcode {
  rawValue?: string
  format?: string
}

interface NativeBarcodeDetectorInstance {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>
}

interface NativeBarcodeDetectorConstructor {
  new (options?: { formats: string[] }): NativeBarcodeDetectorInstance
}

export type ScanMode = 'auto' | 'qr' | 'barcode'

export interface CameraScannerProps {
  /** False while a verdict is on screen. The stream keeps running regardless. */
  active: boolean
  onDecode: (raw: string, method: ScanMethod) => void
  /** Called once when the camera cannot be used at all, so the shell can act. */
  onUnavailable: (message: string) => void
  /** Selected scanning mode: 'auto' (both), 'qr' (QR code only), or 'barcode' (1D barcode only). */
  scanMode?: ScanMode
  onScanModeChange?: (mode: ScanMode) => void
}

function getZxingFormatsForMode(mode: ScanMode): BarcodeFormat[] {
  switch (mode) {
    case 'barcode':
      return [
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.EAN_13,
        BarcodeFormat.ITF,
        BarcodeFormat.CODABAR,
      ]
    case 'qr':
      return [BarcodeFormat.QR_CODE]
    case 'auto':
    default:
      return [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.EAN_13,
      ]
  }
}

function buildZxingHints(mode: ScanMode): Map<number, unknown> {
  const hints = new Map<number, unknown>()
  // 2 = DecodeHintType.POSSIBLE_FORMATS
  hints.set(2, getZxingFormatsForMode(mode))
  // 3 = DecodeHintType.TRY_HARDER
  hints.set(3, true)
  return hints
}

export function CameraScanner({
  active,
  onDecode,
  onUnavailable,
  scanMode = 'auto',
  onScanModeChange,
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)

  const activeRef = useRef(active)
  activeRef.current = active
  const onDecodeRef = useRef(onDecode)
  onDecodeRef.current = onDecode

  const lastRef = useRef<{ raw: string; at: number }>({ raw: '', at: 0 })

  const [mode, setMode] = useState<ScanMode>(scanMode)
  const currentMode = scanMode ?? mode
  const currentModeRef = useRef<ScanMode>(currentMode)
  currentModeRef.current = currentMode

  const handleModeChange = (next: ScanMode) => {
    setMode(next)
    onScanModeChange?.(next)
    if (readerRef.current) {
      readerRef.current.setHints(buildZxingHints(next))
    }
  }

  // Synchronize when prop changes
  useEffect(() => {
    if (scanMode !== undefined && scanMode !== mode) {
      setMode(scanMode)
      if (readerRef.current) {
        readerRef.current.setHints(buildZxingHints(scanMode))
      }
    }
  }, [scanMode, mode])

  const [fault, setFault] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)
  const [cameraStopped, setCameraStopped] = useState(false)
  const [devices, setDevices] = useState<readonly MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(null)

  useEffect(() => {
    activeRef.current = active && !cameraStopped
    if (videoRef.current) {
      if (cameraStopped) {
        videoRef.current.pause()
      } else if (active) {
        void videoRef.current.play().catch(() => {})
      }
    }
  }, [active, cameraStopped])

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
      fail('This browser will not open a camera on an insecure connection. Open the scanner over https, or use the keypad.')
      return
    }

    const reader = new BrowserMultiFormatReader(buildZxingHints(currentModeRef.current), {
      delayBetweenScanSuccess: 300,
      delayBetweenScanAttempts: 100,
    })
    readerRef.current = reader

    const handle = (result: DecodedResult | undefined): void => {
      if (result === undefined) return
      if (!activeRef.current) return

      const raw = result.getText()
      if (raw === '') return

      const now = Date.now()
      if (lastRef.current.raw === raw && now - lastRef.current.at < SAME_CODE_LOCKOUT_MS) return

      const activeMode = currentModeRef.current
      const isQr = result.getBarcodeFormat() === BarcodeFormat.QR_CODE
      if (activeMode === 'qr' && !isQr) return
      if (activeMode === 'barcode' && isQr) return

      lastRef.current = { raw, at: now }
      const method: ScanMethod = isQr ? 'QR' : 'BARCODE'

      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(50)
        } catch {
          // ignore vibration issues
        }
      }

      onDecodeRef.current(raw, method)
    }

    // Hardware-accelerated native BarcodeDetector for Android Chrome / supported phones
    let nativeDetectorActive = true
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const detectorWindow = window as unknown as {
          BarcodeDetector?: NativeBarcodeDetectorConstructor
        }
        const BarcodeDetectorClass = detectorWindow.BarcodeDetector
        if (BarcodeDetectorClass) {
          const nativeDetector = new BarcodeDetectorClass({
            formats: ['qr_code', 'code_128', 'code_39', 'ean_13'],
          })

          const runNativeDetect = async () => {
            if (!nativeDetectorActive || cancelled) return
            if (
              videoRef.current &&
              activeRef.current &&
              videoRef.current.readyState >= 2 &&
              !videoRef.current.paused
            ) {
              try {
                const detected = await nativeDetector.detect(videoRef.current)
                if (detected.length > 0 && activeRef.current) {
                  const item = detected[0]
                  const raw = item?.rawValue
                  if (raw && raw !== '') {
                    const activeMode = currentModeRef.current
                    const isQr = item.format === 'qr_code'
                    const allowScan =
                      activeMode === 'auto' ||
                      (activeMode === 'qr' && isQr) ||
                      (activeMode === 'barcode' && !isQr)

                    if (allowScan) {
                      const now = Date.now()
                      if (
                        lastRef.current.raw !== raw ||
                        now - lastRef.current.at >= SAME_CODE_LOCKOUT_MS
                      ) {
                        lastRef.current = { raw, at: now }
                        const method: ScanMethod = isQr ? 'QR' : 'BARCODE'

                        if (
                          typeof navigator !== 'undefined' &&
                          typeof navigator.vibrate === 'function'
                        ) {
                          try {
                            navigator.vibrate(50)
                          } catch {
                            // ignore vibration issues
                          }
                        }

                        onDecodeRef.current(raw, method)
                      }
                    }
                  }
                }
              } catch {
                // Frame dropped or detection glitch, continue next frame
              }
            }
            if (nativeDetectorActive && !cancelled) {
              setTimeout(runNativeDetect, 120)
            }
          }
          setTimeout(runNativeDetect, 400)
        }
      } catch {
        // Fallback silently to ZXing
      }
    }

    const start = async (): Promise<void> => {
      const controls =
        deviceId === null
          ? await reader.decodeFromConstraints(
              {
                video: {
                  facingMode: { ideal: 'environment' },
                  width: { ideal: 1920, min: 1280 },
                  height: { ideal: 1080, min: 720 },
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

      try {
        const found = await navigator.mediaDevices.enumerateDevices()
        if (!cancelled) setDevices(found.filter((d) => d.kind === 'videoinput'))
      } catch {
        // losing device list costs flip button, nothing more
      }
    }

    void start().catch((error: unknown) => {
      fail(cameraFault(error))
    })

    return () => {
      cancelled = true
      nativeDetectorActive = false
      controlsRef.current?.stop()
      controlsRef.current = null
      readerRef.current = null
    }
  }, [deviceId, onUnavailable])

  const flip = useCallback(() => {
    if (devices.length < 2) return
    const current = devices.findIndex((d) => d.deviceId === deviceId)
    const next = devices[(current + 1) % devices.length]
    if (next !== undefined) setDeviceId(next.deviceId)
  }, [devices, deviceId])


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

      {/* Floating Scan Mode Pills */}
      <div className="absolute top-3 inset-x-0 z-10 flex justify-center px-3 pointer-events-auto">
        <div className="inline-flex items-center gap-1 rounded-full bg-slate-900/85 p-1 border border-white/20 shadow-lg backdrop-blur-md">
          <button
            type="button"
            onClick={() => handleModeChange('auto')}
            className={cn(
              'px-3 py-1.5 rounded-full text-[0.6875rem] font-bold transition-all',
              currentMode === 'auto'
                ? 'bg-amber-400 text-navy shadow-xs'
                : 'text-white/80 hover:text-white hover:bg-white/10',
            )}
          >
            Auto (Both)
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('qr')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.6875rem] font-bold transition-all',
              currentMode === 'qr'
                ? 'bg-amber-400 text-navy shadow-xs'
                : 'text-white/80 hover:text-white hover:bg-white/10',
            )}
          >
            <Icon name="qr" size={13} />
            <span>QR Code</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('barcode')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.6875rem] font-bold transition-all',
              currentMode === 'barcode'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'text-white/80 hover:text-white hover:bg-white/10',
            )}
          >
            <Icon name="barcode" size={13} />
            <span>Barcode</span>
          </button>
        </div>
      </div>

      {/* High-legibility alignment reticle */}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center p-4">
        {currentMode === 'barcode' ? (
          <div
            className={cn(
              'relative w-[88%] max-w-sm aspect-[2.6/1] rounded-2xl transition-all duration-300',
              active
                ? 'ring-2 ring-rose-500 shadow-[0_0_40px_rgba(244,63,94,0.35)]'
                : 'ring-1 ring-white/30',
            )}
          >
            <div className="absolute -top-1 -left-1 size-6 border-t-[3px] border-l-[3px] border-rose-500 rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 size-6 border-t-[3px] border-r-[3px] border-rose-500 rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 size-6 border-b-[3px] border-l-[3px] border-rose-500 rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 size-6 border-b-[3px] border-r-[3px] border-rose-500 rounded-br-lg" />

            {active && (
              <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-gradient-to-r from-rose-500 via-rose-400 to-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.9)] motion-safe:animate-pulse" />
            )}
          </div>
        ) : currentMode === 'qr' ? (
          <div
            className={cn(
              'relative aspect-square w-[75%] max-w-72 rounded-2xl transition-all duration-300',
              active ? 'ring-1 ring-amber-400/60 shadow-[0_0_40px_rgba(202,108,0,0.25)]' : 'ring-1 ring-white/30',
            )}
          >
            <div className="absolute -top-1 -left-1 size-6 border-t-[3px] border-l-[3px] border-amber-400 rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 size-6 border-t-[3px] border-r-[3px] border-amber-400 rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 size-6 border-b-[3px] border-l-[3px] border-amber-400 rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 size-6 border-b-[3px] border-r-[3px] border-amber-400 rounded-br-lg" />

            {active && (
              <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-gradient-to-r from-transparent via-amber-400 to-transparent motion-safe:animate-pulse" />
            )}
          </div>
        ) : (
          <div
            className={cn(
              'relative w-[82%] max-w-72 aspect-[1.35/1] rounded-2xl transition-all duration-300',
              active ? 'ring-1 ring-amber-400/70 shadow-[0_0_40px_rgba(202,108,0,0.25)]' : 'ring-1 ring-white/30',
            )}
          >
            <div className="absolute -top-1 -left-1 size-6 border-t-[3px] border-l-[3px] border-amber-400 rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 size-6 border-t-[3px] border-r-[3px] border-amber-400 rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 size-6 border-b-[3px] border-l-[3px] border-amber-400 rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 size-6 border-b-[3px] border-r-[3px] border-amber-400 rounded-br-lg" />

            {active && (
              <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-gradient-to-r from-transparent via-amber-400 to-transparent motion-safe:animate-pulse" />
            )}
          </div>
        )}
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

      {cameraStopped && (
        <div className="bg-navy/90 text-white absolute inset-0 z-15 flex flex-col items-center justify-center p-6 text-center backdrop-blur-xs">
          <div className="size-14 rounded-2xl bg-white/10 flex items-center justify-center mb-3">
            <Icon name="camera" size={28} className="text-white/60" />
          </div>
          <p className="text-base font-extrabold">Camera Stopped</p>
          <p className="text-xs text-white/70 mt-1 max-w-xs">
            Camera is paused to conserve device battery.
          </p>
          <button
            type="button"
            onClick={() => setCameraStopped(false)}
            className="mt-4 px-4 py-2 rounded-xl bg-white text-navy font-extrabold text-xs shadow-md hover:bg-white/90 transition-all flex items-center gap-2"
          >
            <Icon name="camera" size={14} />
            <span>Resume Camera</span>
          </button>
        </div>
      )}

      <div className="absolute right-3 bottom-3 flex gap-2 z-20">
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
        <button
          type="button"
          onClick={() => setCameraStopped((prev) => !prev)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg font-bold text-xs px-3 py-1.5 border shadow-sm backdrop-blur transition-all',
            cameraStopped
              ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600'
              : 'bg-white/90 hover:bg-white text-navy border-slate-200/80',
          )}
        >
          <Icon name={cameraStopped ? 'camera' : 'close'} size={14} />
          <span>{cameraStopped ? 'Resume Camera' : 'Stop Camera'}</span>
        </button>
      </div>
    </div>
  )
}

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
