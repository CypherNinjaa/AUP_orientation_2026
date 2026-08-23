import { JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { DeveloperFooter } from '@/components/developer/DeveloperFooter'
import { SiteHeader } from '@/components/site/SiteHeader'

/**
 * /developer sits outside the (public) group for one reason: it ends on a slim
 * credit bar rather than the site's four-column footer. The header is the shared
 * one, unmodified — the nav entry in lib/event.ts lights it up on its own.
 *
 * The mono face is loaded here rather than in the root layout so the other twelve
 * routes never request it. `--font-mono` in globals.css falls back to the platform
 * monospace when this variable is absent, which is everywhere but this subtree.
 */
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-dev',
  display: 'swap',
})

export default function DeveloperLayout({ children }: { children: ReactNode }) {
  return (
    <div className={mono.variable}>
      <SiteHeader />
      <main id="main">{children}</main>
      <DeveloperFooter />
    </div>
  )
}
