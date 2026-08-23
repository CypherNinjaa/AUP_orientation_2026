/**
 * Prefixes a root-absolute `public/` path with the deployment's base path.
 *
 * Next applies `basePath` to JS chunks, `<Link>` hrefs and the `app/icon.png`
 * file conventions — but *not* to a `next/image` `src`. With
 * `images.unoptimized` (which `output: 'export'` requires) the src is emitted
 * verbatim, so `/brand/amity-shield.png` ships as `/brand/amity-shield.png` and
 * 404s once GitHub Pages serves the site from `/AUP_orientation_2026/`.
 *
 * Same idiom as the model path in lib/faceDetect.ts. Wrap every `src` that
 * points into `public/`; leave data URLs and absolute URLs alone.
 */
export function asset(path: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`
}
