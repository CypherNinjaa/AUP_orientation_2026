import type { NextConfig } from 'next'

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
  transpilePackages: ['@orientation/core', '@orientation/db'],

  experimental: {
    optimizePackageImports: ['gsap'],
  },
}

export default nextConfig
