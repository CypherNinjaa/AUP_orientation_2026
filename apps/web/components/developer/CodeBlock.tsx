import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* ============================================================================
   Syntax highlighting for the four code surfaces on /developer.

   Hand-rolled rather than shiki or prism: the page shows about thirty lines of
   JavaScript in total, all of it written by us, and neither library is worth a
   dependency plus a WASM grammar or a stylesheet fork for that. This tokeniser
   understands exactly the subset those thirty lines use.

   It runs on the server. Nothing here reaches the client bundle.
   ========================================================================== */

/* Order matters: comments and strings must win before anything looks inside
   them, and the call-name rule must come before the punctuation fallthrough.
   Template literals are matched whole, so `${expr}` is not highlighted inside —
   acceptable for one line of one snippet, and it keeps the regex honest. */
const TOKEN = new RegExp(
  [
    '(\\/\\/[^\\n]*)', // 1 comment
    '(`(?:[^`\\\\]|\\\\.)*`|"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')', // 2 string
    '\\b(function|return|const|let|var|export|import|from|default|if|else|new|class|extends|await|async|typeof|true|false|null|undefined|this)\\b', // 3 keyword
    '\\b(\\d+(?:\\.\\d+)?)\\b', // 4 number
    '([A-Za-z_$][\\w$]*)(?=\\s*\\()', // 5 call or declaration name
    '([{}()[\\]<>;,.:=!+\\-*/?&|]+)', // 6 punctuation
  ].join('|'),
  'g',
)

/**
 * Index in each array is the capture group minus one.
 *
 * Two palettes because the page has code on two materials: the dark panels use
 * the syntax tokens, and the white floating card reuses the site's own accents,
 * which are already contrast-checked against paper. Feeding the dark tokens to a
 * white card would have put #a9e07f on #ffffff.
 */
const PALETTE = {
  dark: [
    'text-syn-comment',
    'text-syn-str',
    'text-syn-key',
    'text-syn-num',
    'text-syn-fn',
    'text-syn-punct',
  ],
  light: [
    'text-ink-faint',
    'text-leaf',
    'text-violet-deep',
    'text-flame',
    'text-berry-deep',
    'text-ink-soft',
  ],
} as const

export type CodeTone = keyof typeof PALETTE

/** Tokenises one line. Multi-line constructs are not supported by design. */
export function highlight(line: string, tone: CodeTone = 'dark'): ReactNode[] {
  const classes = PALETTE[tone]
  const out: ReactNode[] = []
  let cursor = 0
  let key = 0

  TOKEN.lastIndex = 0
  for (let m = TOKEN.exec(line); m !== null; m = TOKEN.exec(line)) {
    if (m.index > cursor) out.push(line.slice(cursor, m.index))

    for (let g = 0; g < classes.length; g += 1) {
      const text = m[g + 1]
      if (text === undefined) continue
      key += 1
      out.push(
        <span key={key} className={classes[g]}>
          {text}
        </span>,
      )
      break
    }
    cursor = m.index + m[0].length
  }

  if (cursor < line.length) out.push(line.slice(cursor))
  return out
}

/**
 * Highlighted code. `numbered` turns on the CSS gutter from globals.css, which
 * counts blocks rather than shipping a column of number spans.
 *
 * Blank lines get a non-breaking space: an empty block span collapses to zero
 * height and the deliberate gap in the snippet would disappear.
 */
export function CodeBlock({
  code,
  numbered = false,
  tone = 'dark',
  className,
}: {
  code: string
  numbered?: boolean
  tone?: CodeTone
  className?: string
}) {
  return (
    /* `scrollbar-none`: these panels are decorative surfaces sized to their
       snippet, and a scrollbar drawn across one reads as a rendering fault.
       Dragging, shift-scroll and keyboard panning all still work. */
    <pre className={cn('scrollbar-none overflow-x-auto leading-[1.8]', className)}>
      <code className={cn('block', numbered && 'code-lines')}>
        {code.split('\n').map((line, i) => (
          // The line index is the identity — this array is a split of one string.
          <span key={i} className={numbered ? undefined : 'block'}>
            {line.length > 0 ? highlight(line, tone) : ' '}
          </span>
        ))}
      </code>
    </pre>
  )
}
