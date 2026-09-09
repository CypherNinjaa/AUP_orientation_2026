/**
 * Derives every shipped image from the originals in `design/source-images/`.
 *
 *   node scripts/build-assets.mjs
 *
 * Why this exists: the originals are 1.3–2.7 MB PNGs each, ~17 MB in total, and
 * anything inside `public/` is copied byte-for-byte into the build whether a page
 * references it or not. So the originals are committed as *sources* outside
 * `public/`, and this script produces the derived files that ship.
 *
 * `next/image` optimises at request time now that the static export is gone
 * (D21), so the outputs here only need to be a sensible upper bound for it to
 * resize from — not one file per breakpoint.
 *
 * Formats: WebP for the two cut-outs (lossy alpha, ~15× smaller than PNG),
 * JPEG for the opaque photographs, PNG only for the small logo marks where the
 * alpha edge has to stay crisp.
 *
 * Re-run after replacing anything in `design/source-images/`. Output is
 * deterministic, so a re-run with unchanged sources is a no-op in git.
 */
import { mkdir } from 'node:fs/promises'
import { statSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const SRC = 'design/source-images'
const NAVY = '#001b44'
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

const written = []

async function emit(file, pipeline) {
  await mkdir(path.dirname(file), { recursive: true })
  const { width, height } = await pipeline.toFile(file)
  written.push({ file, width, height, bytes: statSync(file).size })
}

/** Centre-crop to `ratio` (w/h) without ever upscaling, then resize to `out`. */
function crop(src, ratio, outWidth) {
  return sharp(src)
    .metadata()
    .then(({ width, height }) => {
      let w = Math.round(height * ratio)
      let h = height
      if (w > width) {
        w = width
        h = Math.round(width / ratio)
      }
      return sharp(src)
        .extract({
          left: Math.round((width - w) / 2),
          top: Math.round((height - h) / 2),
          width: w,
          height: h,
        })
        .resize({ width: Math.min(outWidth, w), withoutEnlargement: true })
    })
}

/* ---- hero artwork ---------------------------------------------------------
   The real portrait of the developer at his desk workstation, high quality WebP. */
await emit(
  'public/assets/developer/developer-photo.webp',
  sharp(`${SRC}/developer .png`).resize({ width: 1145, withoutEnlargement: true }).webp({ quality: 90 }),
)
await emit(
  'public/assets/developer/hero-art.webp',
  sharp(`${SRC}/developer .png`).resize({ width: 1145, withoutEnlargement: true }).webp({ quality: 90 }),
)

/* ---- avatar --------------------------------------------------------------
   Cropped square head-and-shoulders from the real developer photograph. */
{
  const src = `${SRC}/developer .png`
  const { width } = await sharp(src).metadata()
  const box = Math.min(1040, width)
  await emit(
    'public/assets/developer/avatar.webp',
    sharp(src)
      .extract({
        left: Math.round((width - box) / 2),
        top: 60,
        width: box,
        height: box,
      })
      .resize({ width: 400 })
      .webp({ quality: 92 }),
  )
}

/* ---- CTA figure ----------------------------------------------------------
   Also a cut-out — a back view, no face — so it needs no background plate and
   no mask to sit on the closing band's gradient. Anchored bottom-left at up to
   ~370 CSS px tall. */
await emit(
  'public/assets/developer/cta-figure.webp',
  sharp(`${SRC}/footer image.png`).resize({ width: 720 }).webp({ quality: 84, alphaQuality: 90 }),
)

/* ---- gallery -------------------------------------------------------------
   Opaque 3:2 photographs into 4:3 frames, so ~11% of the width is cropped away
   evenly on both sides. Order is the narrative arc, not the filenames:
   plan → wireframe → build → late night → this very page. */
const GALLERY = [
  'img for gallery (4).png',
  'img for gallery (3).png',
  'img for gallery (1).png',
  'img for gallery (2).png',
  'img for gallery (5).png',
]
for (const [i, name] of GALLERY.entries()) {
  const n = String(i + 1).padStart(2, '0')
  await emit(
    `public/assets/developer/gallery-${n}.jpg`,
    (await crop(`${SRC}/${name}`, 4 / 3, 800)).jpeg({ quality: 80, mozjpeg: true }),
  )
}

/* ---- campus photograph ---------------------------------------------------
   The real building, supplied by the university: the glass tower with the
   AMITY UNIVERSITY sign, seen down the tree-lined walk. This is the homepage
   hero, replacing the drawn illustration that stood in for it.

   Emitted at 1600 px, full frame and uncropped. The hero frame is square on a
   phone and near-square on a wide screen, so the crop is done in CSS with
   `object-cover` — that way the frame can change without re-running this. 1600
   is the upper bound `next/image` resizes down from; the sign has to stay legible
   at 2× on a ~700 px panel. */
await emit(
  'public/brand/campus-hero.jpg',
  sharp(`${SRC}/amity-campus.png`)
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true }),
)

/* ---- brand marks --------------------------------------------------------
   The crest is transparent, so it works on the header's clear background, on
   the navy footer, and on a browser tab. */
const CREST = `${SRC}/amity-small-logo.png`
await emit(
  'public/brand/amity-shield.png',
  sharp(CREST).resize({ height: 200 }).png({ compressionLevel: 9, effort: 10, palette: true }),
)

/* Favicon. `contain` on a square canvas rather than a crop: the crest is
   taller than it is wide and clipping it would cut the flame. */
await emit(
  'app/icon.png',
  sharp(CREST)
    .resize({ width: 64, height: 64, fit: 'contain', background: TRANSPARENT })
    .png({ compressionLevel: 9, effort: 10 }),
)

/* iOS home screen. Transparency there composites onto black, so the plate is
   explicit — and it is the navy from the crest itself. Apple rounds the
   corners, so the plate is full-bleed. */
await emit(
  'app/apple-icon.png',
  sharp({ create: { width: 180, height: 180, channels: 4, background: NAVY } })
    .composite([
      {
        input: await sharp(CREST)
          .resize({ width: 124, height: 124, fit: 'contain', background: TRANSPARENT })
          .png()
          .toBuffer(),
        gravity: 'center',
      },
    ])
    .png({ compressionLevel: 9, effort: 10 }),
)

/* ---- share card --------------------------------------------------------
   The full horizontal lock-up, which is the one place its opaque off-white
   background belongs: a 1.91:1 card that is never composited onto the site.
   The plate is sampled from the artwork's own corner so there is no seam. */
{
  const { data } = await sharp(`${SRC}/aup.jpeg`)
    .extract({ left: 0, top: 0, width: 8, height: 8 })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const plate = { r: data[0], g: data[1], b: data[2], alpha: 1 }

  await emit(
    'app/opengraph-image.png',
    sharp({ create: { width: 1200, height: 630, channels: 4, background: plate } })
      .composite([
        {
          input: await sharp(`${SRC}/aup.jpeg`).resize({ width: 880 }).png().toBuffer(),
          gravity: 'center',
        },
      ])
      .png({ compressionLevel: 9, effort: 10, palette: true }),
  )
}

/* ---- contact sheet -----------------------------------------------------
   Not shipped. A single strip of everything derived, so the framing of each
   crop can be checked in one look instead of opening nine files. */
{
  const tiles = [
    'public/assets/developer/hero-art.webp',
    'public/assets/developer/cta-figure.webp',
    'public/assets/developer/avatar.webp',
    ...[1, 2, 3, 4, 5].map((n) => `public/assets/developer/gallery-0${String(n)}.jpg`),
  ]
  const H = 200
  const laid = []
  let x = 0
  for (const t of tiles) {
    const buf = await sharp(t).resize({ height: H }).png().toBuffer()
    const { width } = await sharp(buf).metadata()
    laid.push({ input: buf, left: x, top: 0 })
    x += width + 8
  }
  await mkdir('.scratch/probe', { recursive: true })
  await sharp({ create: { width: x, height: H, channels: 4, background: '#ffffff' } })
    .composite(laid)
    .jpeg({ quality: 84 })
    .toFile('.scratch/probe/contact-sheet.jpg')
}

const total = written.reduce((n, w) => n + w.bytes, 0)
for (const w of written) {
  const kb = `${(w.bytes / 1024).toFixed(0)}KB`.padStart(7)
  console.log(`${kb}  ${String(w.width).padStart(4)}x${String(w.height).padEnd(4)}  ${w.file}`)
}
console.log(`\n${written.length} files, ${(total / 1024).toFixed(0)}KB total`)
