/**
 * Copies the TinyFaceDetector weights out of node_modules into public/models.
 *
 * Run it with `npm run models:sync -w @orientation/web`, and only after changing
 * the `@vladmandic/face-api` version. The copies in public/models are committed,
 * which is the point: a deploy serves files that are in the repository and were
 * checked, instead of depending on a node_modules layout at build time or on a
 * CDN being reachable from a phone on the Bailey Road campus network.
 *
 * Only these two files are copied. The package ships eight models — landmarks,
 * recognition, expressions, age and gender — and none of them are used. Copying
 * the lot would put megabytes in the repository to serve requests that will
 * never be made. If a future step needs one, add it here explicitly so that the
 * cost of serving it is a decision somebody made rather than a default.
 */

import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const FILES = ['tiny_face_detector_model-weights_manifest.json', 'tiny_face_detector_model.bin']

// Resolved through the package rather than by guessing at a path, so this works
// whether npm hoisted the dependency to the workspace root or kept it local.
const pkg = require.resolve('@vladmandic/face-api/package.json')
const from = join(dirname(pkg), 'model')
const to = join(here, '..', 'public', 'models')

mkdirSync(to, { recursive: true })

for (const file of FILES) {
  const source = join(from, file)
  copyFileSync(source, join(to, file))
  console.log(`${file}  ${(statSync(source).size / 1024).toFixed(1)} KB`)
}

console.log(`\nCopied ${FILES.length} files into public/models from ${from}`)
