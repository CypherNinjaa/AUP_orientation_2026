import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'

/**
 * The gate scanner's shell. Not the website.
 *
 * Full-bleed and chrome-free: no `SiteHeader`, no footer, no container. Every pixel
 * this layout does not spend is a pixel of camera view, and a volunteer who taps the
 * site's nav by accident mid-queue has lost their place.
 *
 * ## Three overrides of the root layout, each for a reason
 *
 * 1. **`viewport`** — the root exports `themeColor: '#f8f9fd'` and
 *    `colorScheme: 'light'`. Left alone, an installed scanner would show a white
 *    status bar above a near-black screen, and form controls would render in light
 *    mode against the ops ground.
 * 2. **The mono face** — loaded on this subtree only, via the `--font-mono-var`
 *    pattern `globals.css` documents. Ten-digit codes are read aloud off this screen
 *    and compared character by character; a proportional `1` next to a proportional
 *    `l` is how a volunteer keys in the wrong number.
 * 3. **`robots: noindex`** — the console is behind the middleware's role check
 *    anyway, but a crawler that reaches the sign-in redirect should not index it.
 *
 * `min-h-dvh` rather than `min-h-screen`: on iOS Safari `100vh` includes the toolbar
 * that is not there in standalone mode, which pushes the tab bar off the bottom of
 * the exact screen this is designed for.
 */
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-var',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Gate scanner',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#070c17',
  colorScheme: 'dark',
}

export default function VolunteerLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${mono.variable} bg-ops text-ops-ink min-h-dvh`}>
      <main id="main" className="min-h-dvh">
        {children}
      </main>
    </div>
  )
}
