import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

/**
 * ESLint 9 flat config.
 *
 * `eslint-config-next` 15 still ships in the old eslintrc format, so it comes in
 * through FlatCompat rather than being spread directly. When it publishes a flat
 * config the compat layer and the `@eslint/eslintrc` import both come out.
 *
 * Run through the ESLint CLI, not `next lint` — that command is deprecated in
 * Next 15 and removed in 16, and with no config on disk it drops into an
 * interactive setup prompt that hangs any non-interactive run (CI, an agent, a
 * pre-commit hook).
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  // `out/**` is the static-export bundle. Linting minified chunks produces
  // thousands of no-unused-expressions hits and buries every real finding.
  { ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
]

export default config
