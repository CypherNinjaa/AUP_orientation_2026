import Link from 'next/link'
import { Container } from '@/components/ui/atoms'
import { Icon } from '@/components/ui/Icon'
import { DEVELOPER } from '@/lib/developer'

/**
 * The slim credit bar that closes /developer.
 *
 * Deliberately not the site's four-column SiteFooter: the design ends on a single
 * line of credit, and this route sits outside the (public) group so it can have
 * that without forking anything shared. Every other page still gets SiteFooter.
 *
 * The credit reads DEVELOPER.name, the same source the profile card uses, so the
 * name is written down once.
 */
export function DeveloperFooter() {
  return (
    <footer className="bg-navy border-navy-line/25 border-t">
      <Container className="flex flex-col items-center gap-6 py-9 md:flex-row md:justify-between md:gap-4">
        <Link href="/" className="group flex items-center gap-3">
          <span className="grad-dev grid size-9 place-items-center rounded-xl">
            <Icon name="code" size={17} className="text-white" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[0.9375rem] font-extrabold tracking-tight text-white">
              Orientation 2026
            </span>
            <span className="text-sky/65 text-[0.6875rem] tracking-wide">
              {DEVELOPER.campus}
            </span>
          </span>
        </Link>

        <p className="text-sky/70 order-3 text-center text-xs md:order-none">
          © 2026 Orientation 2026. All rights reserved.
        </p>

        <p className="text-sky/85 flex items-center gap-1.5 text-xs">
          Built with <span aria-hidden>❤️</span>
          <span className="sr-only">love</span> by
          <span className="font-semibold text-white">{DEVELOPER.name}</span>
        </p>
      </Container>
    </footer>
  )
}
