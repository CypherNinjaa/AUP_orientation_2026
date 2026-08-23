import { Container, Section } from '@/components/ui/atoms'
import { Reveal } from '@/components/motion/Reveal'
import { LinkButton } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { ARCHITECTURE, ARCHITECTURE_JSON, type ArchTier } from '@/lib/developer'
import { CodeBlock } from './CodeBlock'
import { DevHeading } from './DevHeading'

/**
 * The architecture section: copy, the tier diagram, and the JSON panel.
 *
 * The diagram is the specific one from the design — users, application, three
 * surfaces, gateway, three stores, cloud — driven by ARCHITECTURE in
 * lib/developer.ts. It is a list of tiers, not a picture, so it reflows on a phone
 * and reads correctly to a screen reader.
 */

/** Per-cell glyphs. Keyed by label because a tier row is just strings. */
const CELL_ICONS: Record<string, IconName> = {
  'User Portal': 'people',
  'Admin Panel': 'shield',
  'Volunteer App': 'headset',
  'Redis Cache': 'bolt',
  PostgreSQL: 'database',
  'Object Storage': 'cloud',
}

function Tier({ tier }: { tier: ArchTier }) {
  if (tier.kind === 'edge') {
    return (
      <div className="grad-dev rounded-2xl px-5 py-3.5 text-center text-white">
        <p className="text-label uppercase">{tier.row[0]}</p>
        {tier.note ? <p className="mt-1 text-xs text-white/85">{tier.note}</p> : null}
      </div>
    )
  }

  if (tier.kind === 'app') {
    return (
      <div className="bg-navy shadow-card rounded-2xl px-5 py-4 text-center">
        <p className="text-[0.9375rem] font-bold tracking-tight text-white">{tier.row[0]}</p>
      </div>
    )
  }

  if (tier.kind === 'gateway') {
    return (
      <div className="bg-violet-tint ring-violet/25 rounded-2xl px-5 py-3.5 text-center ring-1">
        <p className="text-violet-deep text-sm font-bold">{tier.row[0]}</p>
      </div>
    )
  }

  if (tier.kind === 'cloud') {
    return (
      <div className="grad-dev flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-white">
        <Icon name="cloud" size={16} />
        <p className="text-sm font-bold">{tier.row[0]}</p>
      </div>
    )
  }

  /* surface and store: a fan-out row of small cards. */
  return (
    <ul className="grid grid-cols-3 gap-2.5">
      {tier.row.map((cell) => (
        <li
          key={cell}
          className="bg-card ring-rule/30 shadow-soft flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center ring-1"
        >
          <Icon
            name={CELL_ICONS[cell] ?? 'layers'}
            size={16}
            className={tier.kind === 'store' ? 'text-coral' : 'text-violet'}
          />
          <span className="text-navy text-[0.6875rem] leading-tight font-semibold">{cell}</span>
        </li>
      ))}
    </ul>
  )
}

/* The 9×8 bitmap under the JSON. Signature, not information. */
const HEART = [
  '.XX...XX.',
  'XXXXXXXXX',
  'XXXXXXXXX',
  'XXXXXXXXX',
  '.XXXXXXX.',
  '..XXXXX..',
  '...XXX...',
  '....X....',
]

function PixelHeart({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 9 8" width={40} height={36} aria-hidden className={className}>
      {HEART.map((row, y) =>
        [...row].map((px, x) =>
          px === 'X' ? (
            <rect key={`${String(y)}-${String(x)}`} x={x} y={y} width={1} height={1} />
          ) : null,
        ),
      )}
    </svg>
  )
}

export function ArchitectureSection() {
  return (
    <Section id="architecture" className="scroll-mt-24 overflow-hidden">
      <div aria-hidden className="wash-dev pointer-events-none absolute -top-24 -left-32 size-96 opacity-30" />

      <Container>
        {/* Three Reveal boundaries, one per column, rather than one around the
            grid: DevHeading owns its own boundary, and wrapping it again would
            put two competing tweens on the same three elements.

            5 / 4 / 3 rather than 4 / 5 / 3: the diagram is a stack of narrow
            tiers and never used the wider column, while the heading has to hold
            "Designed for Reliability" on one line as it does in the design. */}
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-8">
          <DevHeading
            className="lg:col-span-5"
            align="left"
            eyebrow="The architecture"
            /* One step below text-title. At the title scale the second line
               breaks after "for" and the two-line lock-up becomes three. */
            titleClassName="text-[clamp(1.875rem,2.7vw,2.125rem)] leading-[1.1] tracking-[-0.03em]"
            title={
              <>
                Built for Scale
                <br />
                {/* Non-breaking space, not a plain one. At 375 the second line
                    is 362px against a 327px column, so it has to break — and
                    with a normal space the only break point after "Reliability"
                    is before the ⚡, which then sits alone on a third line. The
                    NBSP makes "Reliability ⚡" one run, so the break falls at
                    "Designed for" instead. Nothing changes from `lg` up, where
                    the whole line fits. */}
                <span className="grad-dev-text">Designed for Reliability</span>&nbsp;
                <span aria-hidden>⚡</span>
              </>
            }
            lede="A robust architecture that ensures speed, security and seamless experience for thousands."
          >
            <LinkButton href="#architecture-diagram" className="grad-dev" arrow>
              Explore Architecture
            </LinkButton>
          </DevHeading>

          {/* ---- the diagram ---------------------------------------------- */}
          <Reveal id="architecture-diagram" className="scroll-mt-24 lg:col-span-4">
            <ol data-reveal className="mx-auto max-w-sm space-y-0 lg:max-w-none">
              {ARCHITECTURE.map((tier, i) => (
                <li key={tier.id}>
                  {i > 0 ? (
                    <div aria-hidden className="flex justify-center py-1.5">
                      {/* --color-rule is too light to read as a connector at
                          16px against paper; violet keeps it quiet but present. */}
                      <Icon name="chevronDown" size={16} className="text-violet/55" />
                    </div>
                  ) : null}
                  <Tier tier={tier} />
                </li>
              ))}
            </ol>
          </Reveal>

          {/* ---- the JSON panel -------------------------------------------- */}
          <Reveal className="lg:col-span-3">
            <div data-reveal className="code-panel shadow-glass rounded-2xl p-4">
              <div className="border-code-line/70 mb-3 flex items-center gap-2 border-b pb-2.5">
                <Icon name="code" size={13} className="text-syn-punct" />
                <span className="text-code-faint text-[0.6875rem] tracking-wide">
                  architecture.json
                </span>
              </div>
              <CodeBlock code={ARCHITECTURE_JSON} className="text-[0.6875rem]" />
              <div className="border-code-line/70 mt-3 flex items-center justify-between border-t pt-3">
                <span className="text-code-faint text-[0.625rem] tracking-wide uppercase">
                  built with
                </span>
                <PixelHeart className="text-coral fill-current" />
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
