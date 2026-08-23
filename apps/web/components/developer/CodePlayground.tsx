'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useRef, useState } from 'react'
import { Container, Section } from '@/components/ui/atoms'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { PLAYGROUND } from '@/lib/developer'
import { cn } from '@/lib/cn'
import { CodeBlock } from './CodeBlock'
import { DevHeading } from './DevHeading'

/**
 * Editor, output, and a Run button.
 *
 * The output is rendered in full on the server and is part of the static
 * composition — "Run Code" replays the reveal, it does not produce the content.
 * That way the section looks like the design with JavaScript disabled, with
 * reduced motion on, and before anyone presses anything.
 */

/** The decorative panel beside the editor. Hidden below xl, where space runs out. */
function PlaygroundArt() {
  return (
    <svg viewBox="0 0 220 260" aria-hidden className="h-auto w-full max-w-[13rem]">
      <ellipse cx="110" cy="236" rx="86" ry="12" className="fill-violet-tint" opacity="0.7" />

      {/* monitor */}
      <rect x="24" y="30" width="172" height="118" rx="14" className="fill-navy" />
      <rect x="36" y="42" width="148" height="94" rx="8" className="fill-code" />
      <rect x="48" y="58" width="46" height="7" rx="3.5" className="fill-syn-key" />
      <rect x="100" y="58" width="30" height="7" rx="3.5" className="fill-syn-fn" />
      <rect x="48" y="76" width="72" height="7" rx="3.5" className="fill-syn-str" />
      <rect x="60" y="94" width="54" height="7" rx="3.5" className="fill-syn-num" />
      <rect x="48" y="112" width="34" height="7" rx="3.5" className="fill-syn-punct" />
      <rect x="98" y="160" width="24" height="26" className="fill-navy-soft" />
      <rect x="72" y="184" width="76" height="10" rx="5" className="fill-navy" />

      {/* mug */}
      <rect x="158" y="186" width="34" height="30" rx="7" className="fill-berry" />
      <path
        d="M192 194h8a7 7 0 0 1 0 14h-8"
        className="stroke-berry"
        strokeWidth="4"
        fill="none"
      />
      <path
        d="M168 178c0-6 6-6 6-12M180 178c0-6 6-6 6-12"
        className="stroke-coral"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />

      {/* floating brackets */}
      <text x="10" y="176" className="fill-violet font-mono text-[26px] font-bold">
        {'<'}
      </text>
      <text x="188" y="86" className="fill-coral font-mono text-[26px] font-bold">
        {'/>'}
      </text>
      <circle cx="196" cy="152" r="4" className="fill-berry" />
      <circle cx="18" cy="66" r="5" className="fill-violet" opacity="0.55" />
    </svg>
  )
}

export function CodePlayground() {
  const scope = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState(0)
  const [runs, setRuns] = useState(0)
  const current = PLAYGROUND[tab] ?? PLAYGROUND[0]

  useGSAP(
    () => {
      const lines = gsap.utils.toArray<HTMLElement>('[data-out]')
      if (lines.length === 0) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        /* First pass waits for the section to be on screen; every later pass is a
           deliberate press of Run, so it plays at once. */
        const tween = gsap.from(lines, {
          opacity: 0,
          x: -10,
          duration: 0.4,
          stagger: 0.11,
          ease: 'power2.out',
          ...(runs === 0
            ? { scrollTrigger: { trigger: scope.current, start: 'top 85%', once: true } }
            : {}),
        })
        return () => {
          tween.kill()
        }
      })

      return () => mm.revert()
    },
    { dependencies: [tab, runs], revertOnUpdate: true, scope },
  )

  if (current === undefined) return null

  return (
    <Section>
      <Container>
        <DevHeading
          eyebrow="Code playground"
          title="A Little Bit of Code"
          lede="Where logic meets creativity."
        />

        <div
          ref={scope}
          className="mt-14 grid items-center gap-6 lg:grid-cols-[1.6fr_1fr] xl:grid-cols-[0.8fr_1.6fr_1fr]"
        >
          <div className="hidden justify-center xl:flex">
            <PlaygroundArt />
          </div>

          {/* ---- editor ---------------------------------------------------- */}
          <div className="code-panel shadow-glass overflow-hidden rounded-2xl">
            <div
              role="tablist"
              aria-label="Code files"
              className="border-code-line/70 flex items-center gap-1 border-b px-3 pt-3"
            >
              {PLAYGROUND.map((file, i) => (
                <button
                  key={file.file}
                  type="button"
                  role="tab"
                  id={`pg-tab-${file.file}`}
                  aria-selected={i === tab}
                  aria-controls="pg-panel"
                  onClick={() => {
                    setTab(i)
                  }}
                  className={cn(
                    'rounded-t-md px-3 py-2 font-mono text-[0.6875rem] transition-colors duration-200',
                    i === tab
                      ? 'bg-code-soft text-code-ink'
                      : 'text-code-faint hover:text-code-ink',
                  )}
                >
                  {file.file}
                </button>
              ))}
            </div>

            <div
              id="pg-panel"
              role="tabpanel"
              aria-labelledby={`pg-tab-${current.file}`}
              className="p-3 sm:p-4"
            >
              {/* A step down below `sm`. At 13px the longest line —
                  `return "Something People Remember";` — is 338px against a
                  294px panel at 375, and `CodeBlock` hides its scrollbar, so the
                  payoff line of the snippet was clipped with nothing to say so.
                  11px fits it whole and matches the architecture.json panel.
                  From 418px up 13px fits, so `sm` is a safe switch. */}
              <CodeBlock
                code={current.code}
                numbered
                className="text-[0.6875rem] sm:text-[0.8125rem]"
              />
            </div>
          </div>

          {/* ---- output ---------------------------------------------------- */}
          <div className="code-panel shadow-glass rounded-2xl p-4">
            <div className="border-code-line/70 mb-3.5 flex items-center gap-2 border-b pb-3">
              <Icon name="terminal" size={13} className="text-syn-punct" />
              <h3 className="text-code-faint text-[0.6875rem] font-semibold tracking-[0.11em] uppercase">
                Output
              </h3>
            </div>

            <p className="mb-3 text-[0.8125rem]">
              <span className="text-syn-str">$</span>{' '}
              <span className="text-code-ink font-mono">node {current.file}</span>
            </p>

            <ul className="space-y-2">
              {current.output.map((line) => (
                <li
                  key={line}
                  data-out
                  className="text-code-ink flex items-start gap-2 text-[0.8125rem]"
                >
                  <Icon name="check" size={14} className="text-syn-str mt-0.5 shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <p
              data-out
              className="border-code-line/70 text-syn-str mt-4 border-t pt-3 text-sm font-bold"
            >
              {current.done}
            </p>
          </div>
        </div>

        <div className="mt-10 flex justify-center">
          <Button
            type="button"
            className="grad-dev"
            onClick={() => {
              setRuns((n) => n + 1)
            }}
          >
            <Icon name="play" size={15} />
            Run Code
          </Button>
        </div>
      </Container>
    </Section>
  )
}
