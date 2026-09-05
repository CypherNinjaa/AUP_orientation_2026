import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { EVENT, NAV } from '@/lib/event'
import { BrandMark } from './BrandMark'

const HELP = [
  { label: 'Register', href: '/register' },
  { label: 'Your pass', href: '/pass' },
  { label: 'Help desk', href: '/contact' },
  { label: 'What to bring', href: '/information#bring' },
]

const LEGAL = [
  { label: 'Privacy policy', href: '/privacy' },
  { label: 'Terms of use', href: '/terms' },
  { label: 'Accessibility', href: '/accessibility' },
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
              {EVENT.programme} {EVENT.year}. Your welcome to university life.
            </p>
            <p className="hand text-flame-mid mt-5 text-2xl">See you on campus.</p>
          </div>

          <FooterColumn title="Explore" links={NAV.slice(1)} />
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
          <p>
            © {EVENT.year} {EVENT.institution}. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {LEGAL.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
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
