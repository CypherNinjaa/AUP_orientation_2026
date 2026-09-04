import type { Metadata, Viewport } from 'next'
import { Caveat, Plus_Jakarta_Sans } from 'next/font/google'
import type { ReactNode } from 'react'
import { MotionProvider } from '@/components/motion/MotionProvider'
import { EVENT } from '@/lib/event'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
})

const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  display: 'swap',
})

/**
 * Absolute origin for share metadata.
 *
 * `app/opengraph-image.png` is picked up by file convention, but Next can only
 * turn it into the absolute URL that scrapers require if it knows the site's
 * origin — without this it warns at build time and emits
 * `http://localhost:3000/opengraph-image.png`, i.e. a broken share preview in
 * production.
 *
 * Set `NEXT_PUBLIC_SITE_URL` per environment. On Railway, `RAILWAY_PUBLIC_DOMAIN`
 * is injected automatically and covers preview deployments where the generated
 * subdomain is not known ahead of time; a custom domain overrides it explicitly.
 */
const SITE_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.RAILWAY_PUBLIC_DOMAIN !== undefined
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : 'http://localhost:3000'),
).origin

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: `${EVENT.programme} ${EVENT.year} — ${EVENT.institution}`,
    template: `%s — Orientation ${EVENT.year}`,
  },
  description:
    'Three days that turn a campus you have never seen into the place you belong. ' +
    `${EVENT.institution} welcomes the ${EVENT.year} intake — ${EVENT.dateRange}.`,
  applicationName: `Orientation ${EVENT.year}`,
  authors: [{ name: EVENT.institution }],
  openGraph: {
    type: 'website',
    url: SITE_ORIGIN,
    siteName: `${EVENT.institution} — Orientation ${EVENT.year}`,
    title: `Orientation ${EVENT.year}`,
    description: `Your journey, our community. ${EVENT.dateRange} at ${EVENT.institution}.`,
    locale: 'en_IN',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#f8f9fd',
  colorScheme: 'light',
}

/**
 * Adds a `js` class before first paint. Reveal animations hide their targets
 * behind `.js [data-reveal]`, so a failed or blocked bundle leaves the page
 * fully readable instead of blank.
 */
const BOOTSTRAP = "document.documentElement.classList.add('js')"

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning className={`${jakarta.variable} ${caveat.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP }} />
      </head>
      <body>
        <a
          href="#main"
          className="focus-visible:bg-navy sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4 focus-visible:z-100 focus-visible:rounded-full focus-visible:px-5 focus-visible:py-3 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-white"
        >
          Skip to content
        </a>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  )
}
