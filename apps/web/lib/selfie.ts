/**
 * Judging a frame before it is captured.
 *
 * The point of the selfie (decision D6) is that a volunteer at the gate can
 * match a face to a pass in seconds. So the test a frame has to pass is a human
 * one, and the checks here are the failures a human at a gate cannot work
 * around: a frame that is nearly black, blown out, blank because a thumb is over
 * the lens, or — once ../lib/faceDetect has a model loaded — one with no face in
 * it, or somebody else's face beside it. Anything subtler is left as advice,
 * because a form that refuses a usable photo sends a student to the help desk
 * for nothing.
 *
 * Two kinds of evidence, deliberately separated:
 *
 *   - `sampleFrame()` reads pixel statistics. No download, a fraction of a
 *     millisecond, works everywhere.
 *   - `FaceReading` comes from ./faceDetect, which loads face-api.js on demand.
 *     It answers the questions statistics cannot: how many faces, how large,
 *     how central.
 *
 * `verdict()` takes the second as optional, and that is the load-bearing part of
 * the design rather than a convenience. Absent face information means the
 * detector could not be downloaded, could not run, or has not read a frame yet;
 * in every one of those cases the statistics still stand on their own and the
 * student still registers. No student is stopped by a model that did not arrive.
 *
 * One property worth stating: a frame drawn to a canvas and exported has no EXIF
 * block at all, so there is no orientation tag, no timestamp and no GPS to strip
 * later. The capture path removes that class of problem rather than cleaning up
 * after it.
 */

/** Edge of the stored square, in pixels. Enough for a face on a 6" phone at arm's length. */
export const CAPTURE_SIZE = 640

/** JPEG quality. Above ~0.85 the file doubles for detail nobody at a gate can use. */
export const CAPTURE_QUALITY = 0.82

/** Edge of the square sampled for analysis. Small on purpose — this runs on a timer. */
const SAMPLE_SIZE = 96

export interface FrameStats {
  /** Mean luma, 0–255. */
  luma: number
  /** Standard deviation of luma. Near zero means a flat, featureless frame. */
  spread: number
  /** Variance of a Laplacian response. Higher is sharper. Scale is arbitrary. */
  detail: number
}

/**
 * What the detector saw in one frame. Produced by ./faceDetect, consumed by
 * `verdict()` below — the two numbers are fractions rather than pixels so that
 * thresholds mean the same thing on a 480p webcam and a 4K phone.
 */
export interface FaceReading {
  /** How many faces were found. Anything other than 1 is a problem here. */
  count: number
  /** The largest face's box area as a fraction of the square that gets stored. */
  fill: number
  /** How far that box's centre sits from the frame's, as a fraction of the square's edge. */
  offset: number
}

export type Level = 'good' | 'advice' | 'block'

export interface Verdict {
  level: Level
  /** One short sentence, addressed to the person holding the camera. */
  hint: string
}

/**
 * Reads the middle of the frame — where the guide puts the face — rather than
 * the whole thing. A bright window behind somebody's head should not count as
 * "well lit".
 */
export function sampleFrame(source: HTMLVideoElement | HTMLCanvasElement): FrameStats | null {
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height
  if (!width || !height) return null

  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_SIZE
  canvas.height = SAMPLE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  // Centre 70% of the shorter edge, scaled down to the sample square.
  const edge = Math.min(width, height) * 0.7
  ctx.drawImage(
    source,
    (width - edge) / 2,
    (height - edge) / 2,
    edge,
    edge,
    0,
    0,
    SAMPLE_SIZE,
    SAMPLE_SIZE,
  )

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data
  } catch {
    // Tainted canvas. Cannot happen with a same-origin camera stream, but
    // getImageData throwing must not take the capture screen down with it.
    return null
  }

  // Rec. 601 luma, integer weights to keep it in one pass.
  const grey = new Float32Array(SAMPLE_SIZE * SAMPLE_SIZE)
  let sum = 0
  for (let i = 0; i < grey.length; i++) {
    const p = i * 4
    const value = 0.299 * (data[p] ?? 0) + 0.587 * (data[p + 1] ?? 0) + 0.114 * (data[p + 2] ?? 0)
    grey[i] = value
    sum += value
  }
  const luma = sum / grey.length

  let variance = 0
  for (let i = 0; i < grey.length; i++) {
    const d = (grey[i] ?? 0) - luma
    variance += d * d
  }
  const spread = Math.sqrt(variance / grey.length)

  // Four-neighbour Laplacian, skipping the border. Its variance is the standard
  // cheap focus measure: a blurred image has little high-frequency energy.
  let lapSum = 0
  let lapSq = 0
  let count = 0
  for (let y = 1; y < SAMPLE_SIZE - 1; y++) {
    for (let x = 1; x < SAMPLE_SIZE - 1; x++) {
      const i = y * SAMPLE_SIZE + x
      const response =
        4 * (grey[i] ?? 0) -
        (grey[i - 1] ?? 0) -
        (grey[i + 1] ?? 0) -
        (grey[i - SAMPLE_SIZE] ?? 0) -
        (grey[i + SAMPLE_SIZE] ?? 0)
      lapSum += response
      lapSq += response * response
      count++
    }
  }
  const mean = lapSum / count
  const detail = lapSq / count - mean * mean

  return { luma, spread, detail }
}

/**
 * Thresholds are deliberately generous. Every one of them is a reason to stop a
 * student, so each has to be a case where the photo is genuinely unusable rather
 * than merely imperfect.
 *
 * `faces` is optional on purpose — see the note at the top of the file. Omitted
 * or null means there is no face information for this frame, and the light and
 * focus checks answer alone.
 */
export function verdict(stats: FrameStats | null, faces?: FaceReading | null): Verdict {
  if (!stats) return { level: 'advice', hint: 'Getting a look at the picture…' }

  // Light and lens first, before anything about faces. In a frame this dark or
  // this flat there is no face to find, so "no face" would be true and useless:
  // the light is the thing the student can actually do something about.
  if (stats.spread < 10) {
    return { level: 'block', hint: 'The camera cannot see much. Check nothing is covering it.' }
  }
  if (stats.luma < 45) {
    return { level: 'block', hint: 'Too dark to make out a face. Turn towards a window or a light.' }
  }
  if (stats.luma > 235) {
    return { level: 'block', hint: 'Too bright — the light is behind you. Turn around so it is on your face.' }
  }

  if (faces) {
    if (faces.count === 0) {
      return { level: 'block', hint: 'No face in the circle yet. Move so yours is inside it.' }
    }
    if (faces.count > 1) {
      // Not pedantry. A volunteer holding two faces and one name has to guess,
      // and the whole point of the photo is that they never have to.
      return { level: 'block', hint: 'More than one face in shot. This photo has to be just you.' }
    }
    // A box under 3.5% of the stored square is a face about a fifth as wide as
    // the crop — too small to recognise on a phone in daylight.
    if (faces.fill < 0.035) {
      return { level: 'block', hint: 'Too far away to recognise. Bring the camera closer.' }
    }
    if (faces.offset > 0.22) {
      return { level: 'advice', hint: 'Almost — move so your face is in the middle of the circle.' }
    }
    if (faces.fill < 0.1) {
      return { level: 'advice', hint: 'A little closer, so your face fills more of the circle.' }
    }
    if (faces.fill > 0.8) {
      return { level: 'advice', hint: 'That is very close. Move back a little.' }
    }
  }

  if (stats.luma < 70) {
    return { level: 'advice', hint: 'A little more light on your face would help.' }
  }
  if (stats.detail < 40) {
    return { level: 'advice', hint: 'Looks slightly soft. Hold still for a moment before you tap.' }
  }
  // Once a face has been found and placed, telling somebody to fill the circle
  // is instructing them to do what they have just done.
  if (faces?.count === 1) {
    return { level: 'good', hint: 'That looks good. Tap to take it.' }
  }
  return { level: 'good', hint: 'That looks good. Fill the circle with your face and tap.' }
}

/**
 * Centre-crops the video to a square and returns a JPEG data URL.
 *
 * Mirrored, matching the preview. The preview has to be mirrored — an unmirrored
 * one makes people move the wrong way when they try to centre themselves — and
 * saving something other than the frame the student looked at and approved is a
 * surprise nobody needs. Faces are near enough symmetrical that it costs the
 * volunteer nothing.
 */
export function captureSquare(video: HTMLVideoElement): string | null {
  const { videoWidth: width, videoHeight: height } = video
  if (!width || !height) return null

  const canvas = document.createElement('canvas')
  canvas.width = CAPTURE_SIZE
  canvas.height = CAPTURE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.translate(CAPTURE_SIZE, 0)
  ctx.scale(-1, 1)

  const edge = Math.min(width, height)
  ctx.drawImage(
    video,
    (width - edge) / 2,
    (height - edge) / 2,
    edge,
    edge,
    0,
    0,
    CAPTURE_SIZE,
    CAPTURE_SIZE,
  )

  return canvas.toDataURL('image/jpeg', CAPTURE_QUALITY)
}

/** Roughly how large the stored photo is, for the review screen. */
export function dataUrlKb(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.round((base64.length * 3) / 4 / 1024)
}
