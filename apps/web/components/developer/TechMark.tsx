import type { ReactNode } from 'react'

/* ============================================================================
   Brand and technology marks for /developer.

   Separate from components/ui/Icon.tsx on purpose: those are one-colour line
   glyphs on a shared 24-grid, and these are filled, multi-colour, and each has
   its own native viewBox. Mixing them would have meant either flattening the
   logos to strokes or giving the icon set a fill mode it has no other use for.

   Drawn by hand and simplified for legibility at 26–34px. They are recognisable
   at that size but they are not the official assets — replace any mark with the
   vendor's own SVG if this page ever needs to be exact.
   ========================================================================== */

interface Mark {
  readonly viewBox: string
  /** Accent used for rings, tints and hover states. */
  readonly brand: string
  readonly body: ReactNode
}

/* Knockouts are white because every mark here sits on a white card. */

const MARKS = {
  /* ---- social ---------------------------------------------------------- */
  github: {
    viewBox: '0 0 24 24',
    brand: '#24292f',
    body: (
      <path
        fill="#24292f"
        d="M12 2.2a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.8c-2.7.6-3.3-1.3-3.3-1.3-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.4-2.2-.2-4.5-1.1-4.5-4.9 0-1.1.4-2 1-2.7-.1-.2-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.4.1 2.6.6.7 1 1.6 1 2.7 0 3.8-2.3 4.7-4.5 4.9.4.4.7 1.1.7 2.2v2.8c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.2Z"
      />
    ),
  },
  linkedin: {
    viewBox: '0 0 24 24',
    brand: '#0a66c2',
    body: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="3.4" fill="#0a66c2" />
        <path
          fill="#fff"
          d="M6.6 9.6h2.7v8.3H6.6zM7.95 5.4a1.62 1.62 0 1 1 0 3.25 1.62 1.62 0 0 1 0-3.25ZM11.2 9.6h2.6v1.14c.42-.71 1.35-1.34 2.63-1.34 2.03 0 3.02 1.3 3.02 3.6v4.9h-2.7v-4.4c0-1.1-.4-1.79-1.4-1.79s-1.55.63-1.55 1.79v4.4h-2.6z"
        />
      </>
    ),
  },
  instagram: {
    viewBox: '0 0 24 24',
    brand: '#e1306c',
    body: (
      <>
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="5.2"
          fill="none"
          stroke="#e1306c"
          strokeWidth="1.9"
        />
        <circle cx="12" cy="12" r="3.9" fill="none" stroke="#e1306c" strokeWidth="1.9" />
        <circle cx="17.1" cy="6.9" r="1.25" fill="#e1306c" />
      </>
    ),
  },
  hashnode: {
    viewBox: '0 0 24 24',
    brand: '#2962ff',
    body: (
      <>
        <rect
          x="4.6"
          y="4.6"
          width="14.8"
          height="14.8"
          rx="4.6"
          transform="rotate(45 12 12)"
          fill="#2962ff"
        />
        <circle cx="12" cy="12" r="3.4" fill="#fff" />
      </>
    ),
  },

  /* ---- stack ----------------------------------------------------------- */
  react: {
    viewBox: '0 0 24 24',
    brand: '#61dafb',
    body: (
      <>
        <circle cx="12" cy="12" r="2.1" fill="#61dafb" />
        <g fill="none" stroke="#61dafb" strokeWidth="1.4">
          <ellipse cx="12" cy="12" rx="10.2" ry="3.9" />
          <ellipse cx="12" cy="12" rx="10.2" ry="3.9" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="10.2" ry="3.9" transform="rotate(120 12 12)" />
        </g>
      </>
    ),
  },
  next: {
    viewBox: '0 0 24 24',
    brand: '#111111',
    body: (
      <>
        <circle cx="12" cy="12" r="10" fill="#111111" />
        <path fill="#fff" d="M8.1 7.2h1.9l6.3 9.1-1.6 1.1-4.9-7.1v7.5H8.1z" />
        <path fill="#fff" d="M14.9 7.2h1.5v6.6l-1.5-2.1z" />
      </>
    ),
  },
  typescript: {
    viewBox: '0 0 24 24',
    brand: '#3178c6',
    body: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="2.4" fill="#3178c6" />
        <path fill="#fff" d="M7.2 12.9h6.1v1.9h-1.9v5.8H9.1v-5.8H7.2z" />
        <path
          fill="#fff"
          d="M14.7 13.2c1.4-.5 2.9-.3 3.9.4l-.8 1.7c-.6-.4-1.5-.6-2-.4-.6.2-.5.9.1 1.2l1.2.5c1.6.8 2.1 1.9 1.6 3.1-.5 1.5-2.6 1.9-4.5 1.1l.6-1.8c.9.4 2 .6 2.3 0 .2-.4-.2-.8-.9-1.1l-1.1-.5c-1.5-.7-1.9-1.8-1.5-3 .2-.5.6-.9 1.1-1.2Z"
        />
      </>
    ),
  },
  tailwind: {
    viewBox: '0 0 54 33',
    brand: '#38bdf8',
    body: (
      <path
        fill="#38bdf8"
        d="M27 0c-7.2 0-11.7 3.6-13.5 10.8 2.7-3.6 5.85-4.95 9.45-4.05 2.054.513 3.522 2.004 5.147 3.653C30.744 13.09 33.808 16.2 40.5 16.2c7.2 0 11.7-3.6 13.5-10.8-2.7 3.6-5.85 4.95-9.45 4.05-2.054-.513-3.522-2.004-5.147-3.653C36.756 3.11 33.692 0 27 0ZM13.5 16.2C6.3 16.2 1.8 19.8 0 27c2.7-3.6 5.85-4.95 9.45-4.05 2.054.514 3.522 2.005 5.147 3.653C17.244 29.29 20.308 32.4 27 32.4c7.2 0 11.7-3.6 13.5-10.8-2.7 3.6-5.85 4.95-9.45 4.05-2.054-.513-3.522-2.004-5.147-3.653C23.256 19.31 20.192 16.2 13.5 16.2Z"
      />
    ),
  },
  node: {
    viewBox: '0 0 24 24',
    brand: '#5fa04e',
    body: (
      <>
        <path fill="#5fa04e" d="M12 2.1 21 7.05v9.9L12 21.9 3 16.95V7.05z" />
        <path fill="#3f7c33" d="M12 2.1 21 7.05v9.9L12 21.9z" />
        <path fill="#fff" d="M9.9 9.2h1.5l2.7 4.2V9.2h1.4v6.1h-1.5l-2.7-4.2v4.2H9.9z" />
      </>
    ),
  },
  postgres: {
    viewBox: '0 0 24 24',
    brand: '#336791',
    body: (
      <>
        <path
          fill="#336791"
          d="M17.9 3.7c-1.6-1-3.7-1.4-5.9-1.2-4.2.4-7.2 3.2-7.5 7.1-.2 2.4.5 4.3 1.6 6.1.6 1 .9 2 .8 3.1l-.2 2c-.1.9.5 1.6 1.4 1.6.8 0 1.4-.6 1.5-1.4l.2-1.9c0-.4 0-.8-.1-1.2 1.1.4 2.2.6 3.3.6h.3l.7 3.6c.2.9 1 1.4 1.8 1.2.8-.2 1.3-1 1.1-1.8l-.7-4c2-1.2 3.3-3.3 3.6-5.7.4-3.6-1-6.5-3.2-8.3Z"
        />
        <circle cx="9.6" cy="8" r="1.05" fill="#fff" />
        <path
          fill="none"
          stroke="#fff"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity=".55"
          d="M13.4 7.4c1.6.3 2.6 1.5 2.8 3.2"
        />
      </>
    ),
  },
  redis: {
    viewBox: '0 0 24 24',
    brand: '#ff4438',
    body: (
      <g fill="#ff4438">
        <path d="M12 2.6 21.4 6 12 9.4 2.6 6z" />
        <path opacity=".82" d="M2.6 9.1 12 12.5l9.4-3.4v2.7L12 15.2 2.6 11.8z" />
        <path opacity=".64" d="M2.6 14.3 12 17.7l9.4-3.4V17L12 20.4 2.6 17z" />
      </g>
    ),
  },
  railway: {
    viewBox: '0 0 24 24',
    brand: '#1a1c1f',
    body: (
      <>
        <rect x="2.4" y="2.4" width="19.2" height="19.2" rx="4.8" fill="#1a1c1f" />
        <g stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
          <path d="M6.6 8.6h10.8M6.6 12h10.8M6.6 15.4h10.8" />
          <path d="M9.7 6.8v10.4M14.3 6.8v10.4" opacity=".55" />
        </g>
      </>
    ),
  },
  cloudinary: {
    viewBox: '0 0 24 24',
    brand: '#3448c5',
    body: (
      <>
        <path
          fill="#3448c5"
          d="M7.3 19.2h9.7a4.2 4.2 0 0 0 .5-8.3 5.8 5.8 0 0 0-11.1-1 3.85 3.85 0 0 0 .9 9.3Z"
        />
        <path fill="#fff" d="M12 8.5l3.1 3.4h-2v3.3h-2.2v-3.3h-2z" />
      </>
    ),
  },
} as const satisfies Record<string, Mark>

export type TechKey = keyof typeof MARKS

/** Accent colour for a mark, for rings and status pips. */
export function techBrand(key: TechKey): string {
  return MARKS[key].brand
}

export function TechMark({
  name,
  size = 28,
  className,
}: {
  name: TechKey
  size?: number
  className?: string
}) {
  const mark = MARKS[name]
  return (
    <svg
      viewBox={mark.viewBox}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {mark.body}
    </svg>
  )
}
