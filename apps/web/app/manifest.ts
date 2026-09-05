import type { MetadataRoute } from 'next'

/**
 * The web app manifest, which exists for one screen: the gate scanner.
 *
 * A volunteer standing in September sun for four hours needs the scanner installed
 * to the home screen, not open in a tab — standalone chrome frees roughly 120px of
 * vertical space, the camera view survives a backgrounding better without the
 * browser UI reloading it, and the icon is findable at 7am by someone who was handed
 * the phone thirty seconds earlier.
 *
 * ## Why `start_url` is `/dashboard` and not `/volunteer`
 *
 * The manifest is served site-wide, so anybody can install it — including a student
 * who bookmarked their pass. `/dashboard` is the role signpost: it reads the role
 * from Postgres and forwards to `/volunteer`, `/admin` or `/pass`. Pointing straight
 * at `/volunteer` would give a student an installed app whose only behaviour is to
 * bounce them to `/not-authorised`.
 *
 * ## The dark splash
 *
 * `background_color` and `theme_color` are the ops ground rather than the site's
 * paper, because the install is the scanner's and the splash should not flash white
 * at a volunteer whose eyes have adjusted to a dark console. Students who install it
 * see one dark splash frame before the light site paints; the per-route
 * `viewport.themeColor` still governs the address bar on every page.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Amity Orientation 2026',
    short_name: 'Orientation',
    description:
      'Registration, digital passes and gate check-in for Amity University Patna Orientation 2026.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    // Portrait only. The scanner is held one-handed; a landscape rotation mid-queue
    // reflows the camera view and drops the frame being decoded.
    orientation: 'portrait',
    background_color: '#070c17',
    theme_color: '#070c17',
    categories: ['education', 'utilities'],
    icons: [
      { src: '/brand/scanner-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/scanner-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // The same tile again as maskable: the mark sits at 56% of the canvas, inside
      // the 80% safe circle Android crops to, so no second render is needed.
      { src: '/brand/scanner-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
