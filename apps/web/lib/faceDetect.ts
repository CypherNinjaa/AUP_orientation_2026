import type { FaceReading } from './selfie'

/**
 * Finding the face in the frame.
 *
 * Decision D6 asked for face-api.js on the capture screen, so that a photo which
 * cannot be matched at the gate is caught while the student is still holding the
 * camera rather than at 08:30 on day one. This wraps it in the smallest surface
 * that answers the only three questions the form has: is there a face, is there
 * exactly one, and is it big enough and central enough to be matched by eye.
 *
 * What is loaded, and what is not:
 *
 *   - `@vladmandic/face-api`, not the original `justadudewhohacks/face-api.js`.
 *     The original has had no release since 2020 and pins TensorFlow.js 1.x.
 *     The fork is the same API on a current TFJS, which it bundles itself.
 *   - TinyFaceDetector alone — 193 KB of weights. It returns a box and a score,
 *     which is all three questions above need. The 68-point landmark and the
 *     recognition nets would add megabytes to draw a face we are not comparing
 *     against anything.
 *
 * Two properties this module is written to keep:
 *
 *   1. Nothing here is on the critical path. `loadDetector()` resolves to `null`
 *      rather than throwing, `read()` reports what it saw or gives up, and
 *      `verdict()` in ./selfie treats absent face information as simply having
 *      nothing to say. A student on a connection too slow to fetch the model, or
 *      a device too slow to run it, still gets the light and focus checks and
 *      still registers.
 *   2. The 1.3 MB of JavaScript is behind a dynamic `import()` that only runs
 *      when a camera is actually opened, so it never reaches the initial bundle
 *      of a page nobody has started the form on.
 */

/**
 * Served from apps/web/public/models, where the weights are committed rather
 * than fetched from a CDN at runtime. `npm run models:sync` puts them there —
 * see scripts/sync-models.mjs for why they are copied and why only two of the
 * eight models the package ships are.
 */
const MODEL_URI = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/models`

/**
 * TinyYolov2 requires a multiple of 32. The default is 416; 224 is a quarter of
 * the work and ample for one face filling most of a guide circle, which is the
 * only thing this ever looks at.
 */
const INPUT_SIZE = 224

/** Below this the detector starts calling hands and shoulders faces. */
const SCORE_THRESHOLD = 0.5

export interface Detector {
  /**
   * Reads one frame. Returns `null` when the video has no dimensions yet, and
   * throws if the detector itself fails — a lost WebGL context, say. The caller
   * decides what to do about that; this does not paper over it.
   */
  read(video: HTMLVideoElement): Promise<FaceReading | null>
}

let pending: Promise<Detector | null> | null = null

/**
 * Loads the library and the weights, once per page. Safe and cheap to call
 * repeatedly — every caller after the first gets the same promise, which is why
 * the capture screen can start the download while the browser is still asking
 * for camera permission and then simply await it again when frames arrive.
 *
 * Resolves `null` if anything goes wrong. That is the whole error handling
 * strategy: a missing detector is a degraded form, not a broken one.
 */
export function loadDetector(): Promise<Detector | null> {
  pending ??= begin()
  return pending
}

async function begin(): Promise<Detector | null> {
  try {
    const faceapi = await import('@vladmandic/face-api')
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URI)

    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: INPUT_SIZE,
      scoreThreshold: SCORE_THRESHOLD,
    })

    return {
      async read(video) {
        const { videoWidth: width, videoHeight: height } = video
        if (!width || !height) return null

        // The preview is mirrored in CSS; the element's pixels are not, so the
        // boxes come back in the frame's own coordinates. Nothing below cares
        // about the direction of the offset, only its size, so the mirror is
        // not something this has to undo.
        const found = await faceapi.detectAllFaces(video, options)

        // Measured against the centre square, because that is the square
        // captureSquare() actually stores — a face that fills the crop is what
        // matters, not one that fills a wide sensor frame.
        const edge = Math.min(width, height)

        let largest = found[0]
        for (const face of found) {
          if (face.box.width * face.box.height > (largest?.box.width ?? 0) * (largest?.box.height ?? 0)) {
            largest = face
          }
        }
        if (!largest) return { count: 0, fill: 0, offset: 0 }

        const { x, y, width: boxWidth, height: boxHeight } = largest.box
        const dx = x + boxWidth / 2 - width / 2
        const dy = y + boxHeight / 2 - height / 2

        return {
          count: found.length,
          fill: (boxWidth * boxHeight) / (edge * edge),
          offset: Math.hypot(dx, dy) / edge,
        }
      },
    }
  } catch {
    // A blocked fetch, a browser without the WebGL and WASM backends, a 404 on
    // the weights after a bad deploy. None of them is a reason to stop somebody
    // registering, so none of them is reported as an error.
    return null
  }
}
