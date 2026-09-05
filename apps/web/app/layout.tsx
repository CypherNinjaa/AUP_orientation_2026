import type { Metadata, Viewport } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
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
    'The day that turns a campus you have never seen into the place you belong. ' +
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

/**
 * Clerk's appearance, set once here.
 *
 * The sign-in card is the first authenticated surface a fresher sees and it should
 * not look like a different product from the page they arrived on, so it inherits
 * the site's navy and its radius. The variables are the only ones that matter for
 * that: everything else Clerk renders is already neutral.
 */
const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: '#12235c',
    colorText: '#12235c',
    borderRadius: '0.75rem',
    fontFamily: 'var(--font-jakarta)',
  },
} as const

/**
 * Where Clerk sends people, set here so no component has to remember.
 *
 * `signInUrl`/`signUpUrl` point at this app's own pages — without them Clerk
 * falls back to its hosted Account Portal, which is a different domain wearing a
 * different theme, and the return trip loses the `redirect_url` the middleware
 * attached.
 *
 * The two `*FallbackRedirectUrl`s are *fallbacks*: an existing `redirect_url`
 * always wins, so a student who followed a link to their pass still lands on their
 * pass. `/dashboard` only handles the case where there was no destination — it
 * reads the role and forwards, which is the one thing Clerk cannot do.
 */
const CLERK_ROUTES = {
  signInUrl: '/sign-in',
  signUpUrl: '/sign-up',
  signInFallbackRedirectUrl: '/dashboard',
  signUpFallbackRedirectUrl: '/dashboard',
  afterSignOutUrl: '/',
} as const

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider appearance={CLERK_APPEARANCE} {...CLERK_ROUTES}>
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
    </ClerkProvider>
  )
}
