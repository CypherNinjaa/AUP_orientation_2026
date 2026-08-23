// Generates the placeholder JPEGs the Developer page ships with.
//
// Why real files rather than a CSS stand-in: the page references
// /assets/developer/*.jpg directly, so those paths must resolve or the page
// ships six 404s. These are deliberately abstract — a gradient panel with a
// frame glyph. No invented person, no invented face, no stock photograph.
//
// Replacing one is a file overwrite: same path, same aspect ratio, so nothing
// in the layout moves. The frames own their aspect ratio in CSS and the images
// are object-cover, so a real photo at any resolution drops straight in.
//
//   node scripts/gen-dev-placeholders.mjs

import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'developer')

/** Dot grid, reused by every tile. */
const DOTS = `
  <pattern id="d" width="26" height="26" patternUnits="userSpaceOnUse">
    <circle cx="2" cy="2" r="1.6" fill="#ffffff" opacity="0.16"/>
  </pattern>`

function portrait(w, h) {
  const cx = w / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#7459f7"/>
        <stop offset="54%" stop-color="#a855c9"/>
        <stop offset="100%" stop-color="#fb7185"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="26%" r="52%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2a0f4d" stop-opacity="0"/>
        <stop offset="100%" stop-color="#2a0f4d" stop-opacity="0.38"/>
      </linearGradient>
      ${DOTS}
    </defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <rect width="${w}" height="${h}" fill="url(#d)"/>
    <rect width="${w}" height="${h}" fill="url(#glow)"/>
    <!-- Bottom shading, so the silhouette has something to stand against. At a
         flat wash the head-and-shoulders read as a smudge in the gradient. -->
    <rect y="${h * 0.42}" width="${w}" height="${h * 0.58}" fill="url(#floor)"/>
    <g fill="#ffffff" opacity="0.46">
      <circle cx="${cx}" cy="${h * 0.375}" r="${w * 0.145}"/>
      <path d="M${cx - w * 0.3} ${h} a ${w * 0.3} ${h * 0.29} 0 0 1 ${w * 0.6} 0 Z"/>
    </g>
    <rect x="${w * 0.07}" y="${h * 0.055}" width="${w * 0.86}" height="${h * 0.89}"
      rx="${w * 0.055}" fill="none" stroke="#ffffff" stroke-opacity="0.4"
      stroke-width="${Math.round(w * 0.006)}" stroke-dasharray="${w * 0.05} ${w * 0.032}"/>
  </svg>`
}

/** Five distinct stop pairs so the gallery does not read as one tile repeated. */
const HUES = [
  ['#7459f7', '#c05cd8'],
  ['#8f4ff0', '#fb7185'],
  ['#5b3cdd', '#8b5cf6'],
  ['#b14bd0', '#ff8a9e'],
  ['#6d5bf0', '#e05fb8'],
]

function landscape(w, h, index) {
  const [from, to] = HUES[index % HUES.length]
  const cx = w / 2
  const cy = h / 2
  const s = w * 0.085 // glyph scale
  const pip = w * 0.011

  const pips = HUES.map((_, i) => {
    const gap = pip * 4.4
    const x = cx + (i - (HUES.length - 1) / 2) * gap
    return `<circle cx="${x}" cy="${h * 0.87}" r="${pip}" fill="#ffffff" opacity="${i === index ? 0.92 : 0.34}"/>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${from}"/>
        <stop offset="100%" stop-color="${to}"/>
      </linearGradient>
      ${DOTS}
    </defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <rect width="${w}" height="${h}" fill="url(#d)"/>
    <g fill="none" stroke="#ffffff" stroke-opacity="0.52" stroke-width="${w * 0.007}"
       stroke-linecap="round" stroke-linejoin="round">
      <path d="M${cx - s * 1.5} ${cy - s * 0.55} h${s * 0.62} l${s * 0.4} -${s * 0.52}
               h${s * 0.96} l${s * 0.4} ${s * 0.52} h${s * 0.62}
               a${s * 0.4} ${s * 0.4} 0 0 1 ${s * 0.4} ${s * 0.4}
               v${s * 1.42} a${s * 0.4} ${s * 0.4} 0 0 1 -${s * 0.4} ${s * 0.4}
               h-${s * 3.4} a${s * 0.4} ${s * 0.4} 0 0 1 -${s * 0.4} -${s * 0.4}
               v-${s * 1.42} a${s * 0.4} ${s * 0.4} 0 0 1 ${s * 0.4} -${s * 0.4} z"/>
      <circle cx="${cx}" cy="${cy + s * 0.42}" r="${s * 0.66}"/>
    </g>
    ${pips}
  </svg>`
}

async function write(name, svg) {
  await sharp(Buffer.from(svg)).jpeg({ quality: 82, chromaSubsampling: '4:4:4' }).toFile(join(OUT, name))
  console.log('wrote', name)
}

await mkdir(OUT, { recursive: true })
await write('developer-placeholder.jpg', portrait(900, 1125))
for (let i = 0; i < 5; i += 1) {
  await write(`gallery-0${i + 1}.jpg`, landscape(880, 660, i))
}
