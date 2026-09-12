import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { EVENT, NAV } from '@/lib/event'
import { BrandMark } from './BrandMark'

const HELP = [
  { label: 'Register', href: '/register' },
  { label: 'Your pass', href: '/pass' },
  { label: 'Schedule', href: '/schedule' },
  { label: 'Help desk', href: '/contact' },
]

const LEGAL = [
  { label: 'Privacy policy', href: '/privacy' },
  { label: 'Terms of use', href: '/terms' },
  { label: 'Accessibility', href: '/accessibility' },
  { label: 'Team portal', href: '/staff/sign-in' },
]

export function SiteFooter() {
  return (
    <footer className="bg-navy text-sky/75 relative overflow-hidden">
      {/* a single warm bloom so the navy is not flat */}
      <div
        aria-hidden
        className="bg-flame/12 pointer-events-none absolute -top-24 -right-20 size-96 rounded-full blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-[var(--container-page)] px-6 pt-16 pb-10">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <BrandMark tone="white" />
            <p className="mt-5 max-w-xs text-[0.9375rem] leading-relaxed">
              {EVENT.programme} {EVENT.year}. Welcome to university life.
            </p>
            <p className="hand text-flame-mid mt-5 text-2xl">See you at campus.</p>
          </div>

          <FooterColumn
            title="Explore"
            links={[...NAV.slice(1), { label: 'Developer', href: '/developer' }]}
          />
          <FooterColumn title="Get ready" links={HELP} />

          <div>
            <h3 className="text-label mb-4 text-white uppercase">Reach us</h3>
            <ul className="space-y-3.5 text-[0.9375rem]">
              <li className="flex gap-3">
                <Icon name="pin" size={18} className="text-flame-mid mt-0.5 shrink-0" />
                <span>
                  {EVENT.venue.name}
                  <br />
                  {EVENT.venue.street}, {EVENT.venue.city}
                </span>
              </li>
              <li className="flex gap-3">
                <Icon name="mail" size={18} className="text-flame-mid mt-0.5 shrink-0" />
                <a href={`mailto:${EVENT.email}`} className="hover:text-white">
                  {EVENT.email}
                </a>
              </li>
              <li className="flex gap-3">
                <Icon name="phone" size={18} className="text-flame-mid mt-0.5 shrink-0" />
                <a href={`tel:${EVENT.helpline.replace(/\s/g, '')}`} className="hover:text-white">
                  {EVENT.helpline}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-navy-line/25 mt-14 flex flex-col gap-4 border-t pt-7 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3.5">
            <p>
              © {EVENT.year} {EVENT.institution}. All rights reserved.
            </p>
            <span className="hidden sm:inline text-sky/30" aria-hidden>•</span>
            <Link
              href="/developer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky/85 hover:text-white transition-all duration-300 bg-white/5 hover:bg-white/10 px-3 py-1 rounded-full border border-white/10 group w-fit"
            >
              <span>Designed & Built with</span>
              <span className="text-berry-deep group-hover:scale-125 transition-transform" aria-hidden>❤️</span>
              <span>by</span>
              <span className="text-white font-bold underline decoration-flame/60 underline-offset-2">Vikash</span>
            </Link>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {LEGAL.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/developer" className="text-sky/90 hover:text-white font-medium">
                Developer
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: readonly { label: string; href: string }[]
}) {
  return (
    <div>
      <h3 className="text-label mb-4 text-white uppercase">{title}</h3>
      <ul className="space-y-3 text-[0.9375rem]">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="transition-colors hover:text-white">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
