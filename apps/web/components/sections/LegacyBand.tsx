import { Counter } from '@/components/motion/Counter'
import { Reveal } from '@/components/motion/Reveal'
import { Icon } from '@/components/ui/Icon'
import { LEGACY_STATS } from '@/lib/event'

/**
 * The navy band. This is the only dark surface above the footer, and it earns it
 * by being the one place the page speaks as the institution rather than to the
 * student. Figures count up once, on entry.
 */
export function LegacyBand() {
  return (
    <div className="relative px-6 py-4 md:py-10">
      <Reveal
        stagger={0.08}
        className="bg-navy relative mx-auto w-full max-w-[var(--container-page)] overflow-hidden rounded-3xl px-8 py-10 md:px-12"
      >
        <div
          aria-hidden
          className="bg-flame/15 pointer-events-none absolute -top-24 -left-16 size-72 rounded-full blur-3xl"
        />
        <div
          aria-hidden
          className="bg-violet/20 pointer-events-none absolute -right-16 -bottom-24 size-72 rounded-full blur-3xl"
        />

        <div className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {LEGACY_STATS.map((s) => (
            <div key={s.label} data-reveal className="flex items-center gap-4">
              <Icon name={s.icon} size={30} className="text-flame-mid shrink-0" />
              <span>
                <Counter
                  value={s.value}
                  suffix={s.suffix}
                  className="block text-[1.75rem] leading-none font-extrabold text-white"
                />
                <span className="text-navy-line mt-1 block text-[0.8125rem] font-semibold">
                  {s.label}
                </span>
              </span>
            </div>
          ))}
        </div>

       
      </Reveal>
    </div>
  )
}
