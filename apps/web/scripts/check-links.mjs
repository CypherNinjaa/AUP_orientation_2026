/**
 * Link check for the static export.
 *
 * Every root-absolute `src`/`href` in every emitted page is mapped back to a
 * file in `out/` the way GitHub Pages will serve it — Pages publishes `out/` at
 * `/AUP_orientation_2026/`, so a reference to `/AUP_orientation_2026/x.png` must
 * be `out/x.png` on disk. Reports anything that would 404, and anything emitted
 * without the basePath at all (which is the same 404 by a different route).
 *
 * Run after `next build` with the CI environment:
 *   node scripts/check-links.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const OUT = 'out'

const pages = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p)
    else if (entry.name.endsWith('.html')) pages.push(p)
  }
}
walk(OUT)

const resolved = new Set()
const missing = new Set()
const unprefixed = new Set()
const deadFragments = new Set()

/** `id="…"` values per emitted page, so `#fragment` links can be checked too. */
const idsOf = new Map()
function ids(diskPath) {
  let set = idsOf.get(diskPath)
  if (set === undefined) {
    set = new Set()
    if (fs.existsSync(diskPath)) {
      for (const m of fs.readFileSync(diskPath, 'utf8').matchAll(/\sid="([^"]+)"/g)) set.add(m[1])
    }
    idsOf.set(diskPath, set)
  }
  return set
}

for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8')
  for (const match of html.matchAll(/(?:src|href)="(\/[^"]*?)"/g)) {
    const raw = match[1]
    if (raw.startsWith('//')) continue // protocol-relative, external
    const url = raw.split('?')[0].split('#')[0]
    const fragment = raw.includes('#') ? raw.slice(raw.indexOf('#') + 1) : ''
    const from = page.split(path.sep).join('/')

    if (url === '') continue // same-page "#id", nothing to resolve
    if (BASE !== '' && !url.startsWith(`${BASE}/`)) {
      unprefixed.add(`${from} -> ${raw}`)
      continue
    }
    const rel = url.slice(BASE.length)
    const disk = rel.endsWith('/') ? path.join(OUT, rel, 'index.html') : path.join(OUT, rel)
    if (!fs.existsSync(disk)) {
      missing.add(`${from} -> ${raw}`)
      continue
    }
    resolved.add(rel)
    if (fragment !== '' && disk.endsWith('.html') && !ids(disk).has(fragment)) {
      deadFragments.add(`${from} -> ${raw}`)
    }
  }
}

console.log(`basePath: ${BASE === '' ? '(none)' : BASE}`)
console.log(`pages scanned: ${pages.length}`)
console.log(`distinct local references resolved: ${resolved.size}`)
console.log(`\nmissing (${missing.size}):`)
for (const m of missing) console.log(`  ${m}`)
console.log(`\nemitted without basePath (${unprefixed.size}):`)
for (const u of unprefixed) console.log(`  ${u}`)
console.log(`\nfragment targets not found on the destination page (${deadFragments.size}):`)
for (const d of deadFragments) console.log(`  ${d}`)

process.exit(missing.size + unprefixed.size + deadFragments.size === 0 ? 0 : 1)
