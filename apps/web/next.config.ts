import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { loadEnvConfig } from '@next/env'
import type { NextConfig } from 'next'

/**
 * Load the monorepo's single `.env` — the one thing that has to happen before
 * anything else in this file.
 *
 * npm runs a workspace script with the cwd set to the *package* directory, so
 * `npm run dev` (from anywhere) lands `next dev` in `apps/web`, and Next looks for
 * `.env` there. The canonical `.env` is at the repo root, next to the Prisma schema
 * and the compose file that read it. Without this call, `apps/web` starts with an
 * empty environment and the first request dies on
 * `@clerk/nextjs: Missing publishableKey`.
 *
 * The alternative — a second `.env` inside `apps/web` — means two files holding the
 * same live Clerk and Cloudinary credentials, which is one file too many to keep in
 * step and one more place to leak them from.
 *
 * `forceReload` is required, not optional. Next has already called `loadEnvConfig`
 * for `apps/web` by the time it evaluates this config, and the second call is a
 * no-op against its own cache unless it is told to reload. The reload resets
 * `process.env` to the snapshot taken *before* any dotenv file was applied, so
 * nothing is layered twice, and real OS/platform environment variables still win —
 * which is what keeps Railway's injected `DATABASE_URL` authoritative in production,
 * where no `.env` exists at all.
 */
function repoRoot(): string {
  // The root is the directory whose package.json declares the workspaces. Walking up
  // to find it works whether the cwd is `apps/web` (npm script) or the repo root
  // (`next dev apps/web`), and it does not depend on `import.meta.url`, which Next
  // rewrites when it transpiles this file.
  let dir = process.cwd()
  for (let up = 0; up < 5; up += 1) {
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { workspaces?: unknown }
        if (parsed.workspaces !== undefined) return dir
      } catch {
        // A malformed package.json is not this function's problem; keep walking.
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

loadEnvConfig(repoRoot(), process.env.NODE_ENV !== 'production', undefined, true)

// A missing root `.env` is survivable in production (the platform injects the real
// values) and fatal in development, so say so once rather than letting it surface
// forty lines later as a Clerk or Prisma error.
if (process.env.NODE_ENV !== 'production' && !existsSync(resolve(repoRoot(), '.env'))) {
  console.warn(
    `[env] No .env at ${repoRoot()}. Copy .env.example to .env and fill it in, or the app will fail on its first request.`,
  )
}

/**
 * This app runs on a Node server (Railway), not as a static export — see D21.
 *
 * The static export was the right call while this was a brochure site, but every
 * feature from here on needs a request-time runtime: Prisma queries, Clerk
 * middleware, Cloudinary signing, the SSE ticker, the scanner sync endpoint.
 * `output: 'export'` forbids all of them, which is why the one existing route
 * handler (`app/calendar.ics`) had to be marked `force-static`.
 *
 * Consequences of the switch, all deliberate:
 *   - `basePath`/`assetPrefix` are gone. The app is served from the domain root,
 *     so `lib/asset.ts` and `scripts/check-links.mjs` were deleted too.
 *   - `trailingSlash` is gone. It exists for directory-style static hosts; on a
 *     server it makes every `POST /api/x` eat a 308 to `/api/x/`, which the
 *     offline scanner's outbox would pay on every flush.
 *   - `images.unoptimized` is gone, so `next/image` optimises again. Selfies are
 *     deliberately NOT routed through it: they are served as expiring signed
 *     Cloudinary URLs and the optimiser would cache them to disk, which is not
 *     compatible with the retention rules in D14.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * Workspace packages ship TypeScript source with no build step, so Next has to
   * compile them. `@orientation/db` is included because it is a thin wrapper
   * around `@prisma/client` — which Next already treats as a server-external
   * package by default, so the query engine binary is required from
   * node_modules at runtime rather than bundled.
   */
  transpilePackages: ['@orientation/contracts', '@orientation/core', '@orientation/db'],

  experimental: {
    optimizePackageImports: ['gsap'],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ]
  },
}

export default nextConfig
