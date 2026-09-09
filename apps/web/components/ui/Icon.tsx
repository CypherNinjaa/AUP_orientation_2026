import type { SVGProps } from 'react'

/**
 * Hand-rolled line icons at a 24px grid, 1.6 stroke, inheriting `currentColor`.
 *
 * We draw these ourselves rather than loading an icon font: the set is small,
 * every glyph ships inline with the markup it belongs to, and there is no
 * render-blocking request for a webfont that only ever renders ~18 glyphs.
 */

const PATHS = {
  /* --- promise row ------------------------------------------------------ */
  sunrise: (
    <>
      <path d="M12 4.5V2.8M5.2 7.2 4 6M18.8 7.2 20 6M3 17h18M2 20.5h20" />
      <path d="M6.8 17a5.2 5.2 0 0 1 10.4 0" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.1" />
      <path d="M3.4 19.4a5.9 5.9 0 0 1 11.2 0" />
      <path d="M16.2 5.4a3.1 3.1 0 0 1 0 5.9M17.8 14.2a5.9 5.9 0 0 1 2.8 4.4" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.4 8.6-2 4.8-4.8 2 2-4.8z" />
    </>
  ),
  spark: (
    <>
      <path d="M12 2.6l1.9 5.5 5.5 1.9-5.5 1.9-1.9 5.5-1.9-5.5L4.6 10l5.5-1.9z" />
      <path d="M18.6 16.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </>
  ),
  flag: (
    <>
      <path d="M5.5 21V3.6" />
      <path d="M5.5 4.2h11.2l-1.8 3.9 1.8 3.9H5.5z" />
    </>
  ),

  /* --- legacy band ------------------------------------------------------ */
  pillar: (
    <>
      <path d="M3 8.6 12 3.4l9 5.2M4.4 20.6h15.2M3 20.6h18" />
      <path d="M7.4 11v9M12 11v9M16.6 11v9M4.6 11h14.8" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.4C10.3 5.1 7.9 4.4 4 4.4v13.2c3.9 0 6.3.7 8 2 1.7-1.3 4.1-2 8-2V4.4c-3.9 0-6.3.7-8 2Z" />
      <path d="M12 6.4v13.2" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v4.6a4 4 0 0 1-8 0z" />
      <path d="M8 5.4H5.2v1.4a3.4 3.4 0 0 0 3 3.3M16 5.4h2.8v1.4a3.4 3.4 0 0 1-3 3.3" />
      <path d="M12 12.6V16M8.6 20.4h6.8M9.8 16h4.4l1.2 4.4H8.6z" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7.6" width="18" height="12.4" rx="2.2" />
      <path d="M9 7.6V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8v1.8M3 13h18" />
    </>
  ),

  /* --- facts ------------------------------------------------------------ */
  calendar: (
    <>
      <rect x="3.2" y="5.4" width="17.6" height="15.2" rx="2.4" />
      <path d="M3.2 10.2h17.6M8 3.4v4M16 3.4v4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21.2s7-5.9 7-11a7 7 0 1 0-14 0c0 5.1 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 7.2V12l3.4 2.2" />
    </>
  ),

  /* --- controls --------------------------------------------------------- */
  arrowRight: <path d="M4.6 12h14.2m-5.4-5.6L18.8 12l-5.4 5.6" />,
  chevronRight: <path d="m9.6 6.4 5.4 5.6-5.4 5.6" />,
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.6" />
      <path d="m15.6 15.6 4.4 4.4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.6v11.2m-4.4-4.2L12 15l4.4-4.4" />
      <path d="M4.4 17.8v1.4a1.6 1.6 0 0 0 1.6 1.6h12a1.6 1.6 0 0 0 1.6-1.6v-1.4" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M10.2 8.8 15.6 12l-5.4 3.2z" />
    </>
  ),
  check: <path d="m4.8 12.6 4.6 4.4 9.8-10" />,
  chevronDown: <path d="m6.4 9.6 5.6 5.4 5.6-5.4" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6.2 6.2l11.6 11.6M17.8 6.2 6.2 17.8" />,
  phone: (
    <path d="M6.4 3.6h3l1.6 4-2 1.4a11 11 0 0 0 5 5l1.4-2 4 1.6v3a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 4.4 5.8a2 2 0 0 1 2-2.2Z" />
  ),
  mail: (
    <>
      <rect x="3" y="5.4" width="18" height="13.2" rx="2.4" />
      <path d="m3.8 7.4 8.2 5.8 8.2-5.8" />
    </>
  ),
  qr: (
    <>
      <rect x="3.4" y="3.4" width="6.4" height="6.4" rx="1.4" />
      <rect x="14.2" y="3.4" width="6.4" height="6.4" rx="1.4" />
      <rect x="3.4" y="14.2" width="6.4" height="6.4" rx="1.4" />
      <path d="M14.2 14.2h3v3h-3zM20.6 14.2v3M17.6 20.6h3M14.2 20.6h.6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 5.6v5.9c0 4.3 2.9 7.6 7 9.5 4.1-1.9 7-5.2 7-9.5V5.6z" />
      <path d="M12 8.4c-1.1 1.5-1.6 2.6-1.6 3.6a1.6 1.6 0 0 0 3.2 0c0-1-.5-2.1-1.6-3.6Z" />
    </>
  ),

  /* --- subpages --------------------------------------------------------- */
  heart: (
    <path d="M12 20.4C12 20.4 3.6 15.6 3.6 9.9A4.3 4.3 0 0 1 12 8.1a4.3 4.3 0 0 1 8.4 1.8c0 5.7-8.4 10.5-8.4 10.5Z" />
  ),
  cap: (
    <>
      <path d="M2.4 8.6 12 4.4l9.6 4.2L12 12.8z" />
      <path d="M6.4 10.4v4.9c0 1.9 2.5 3.3 5.6 3.3s5.6-1.4 5.6-3.3v-4.9" />
      <path d="M20.6 9.4v5.2" />
    </>
  ),
  headset: (
    <>
      <path d="M4.4 14.6v-2.2a7.6 7.6 0 0 1 15.2 0v2.2" />
      <rect x="2.6" y="13.4" width="3.8" height="6.2" rx="1.9" />
      <rect x="17.6" y="13.4" width="3.8" height="6.2" rx="1.9" />
      <path d="M19.5 19.6v.5a2 2 0 0 1-2 2H13" />
    </>
  ),
  bus: (
    <>
      <rect x="3.6" y="3.6" width="16.8" height="13.4" rx="2.4" />
      <path d="M3.6 10.8h16.8M12 3.6v7.2" />
      <circle cx="7.4" cy="19.2" r="1.6" />
      <circle cx="16.6" cy="19.2" r="1.6" />
    </>
  ),
  shirt: (
    <path d="M8.6 3.4 12 6.2l3.4-2.8 4.2 2.2a1.6 1.6 0 0 1 .8 1.9l-.9 3.3-2.7-.7v9a1.6 1.6 0 0 1-1.6 1.6H8.8a1.6 1.6 0 0 1-1.6-1.6v-9l-2.7.7-.9-3.3a1.6 1.6 0 0 1 .8-1.9z" />
  ),
  utensils: (
    <>
      <path d="M7.6 3.4v4.6a2.6 2.6 0 0 1-5.2 0V3.4M5 8.6v12M5 3.4v4.4" />
      <path d="M17.4 3.4c2.2 2.1 3.2 4.5 3.2 7.3 0 1.7-1 2.7-2.4 2.9v7" />
    </>
  ),
  accessibility: (
    <>
      <circle cx="12" cy="4.4" r="1.9" />
      <path d="M5.4 8.4 12 9.8l6.6-1.4" />
      <path d="M12 9.8v4.4l3.6 6.2M12 14.2l-3.6 6.2" />
    </>
  ),
  note: (
    <>
      <rect x="4.4" y="5" width="15.2" height="15.6" rx="2.2" />
      <path d="M8.8 5V3.8a1.4 1.4 0 0 1 1.4-1.4h3.6a1.4 1.4 0 0 1 1.4 1.4V5z" />
      <path d="M8.6 10.8h6.8M8.6 14.6h4.6" />
    </>
  ),
  camera: (
    <>
      <path d="M4.2 8.4h2.6l1.4-2.2h7.6l1.4 2.2h2.6a1.8 1.8 0 0 1 1.8 1.8v7.2a1.8 1.8 0 0 1-1.8 1.8H4.2a1.8 1.8 0 0 1-1.8-1.8v-7.2a1.8 1.8 0 0 1 1.8-1.8Z" />
      <circle cx="12" cy="13.6" r="3.4" />
    </>
  ),
  id: (
    <>
      <rect x="2.6" y="5" width="18.8" height="14" rx="2.4" />
      <circle cx="8.6" cy="10.6" r="2.2" />
      <path d="M5 16a3.9 3.9 0 0 1 7.2 0" />
      <path d="M15 9.8h3.8M15 13.2h3.8" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.6 21.4 20H2.6z" />
      <path d="M12 9.4v4.4M12 16.9h.01" />
    </>
  ),
  /* Unevenly spaced bars on purpose — evenly spaced ones read as an equaliser. */
  barcode: (
    <path d="M3.4 5.6v12.8M6.6 5.6v12.8M9.4 5.6v12.8M12.8 5.6v12.8M15.2 5.6v12.8M18 5.6v12.8M20.6 5.6v12.8" />
  ),
  keypad: (
    <>
      <rect x="4" y="2.6" width="16" height="18.8" rx="2.4" />
      <path d="M8.4 7.4h.01M12 7.4h.01M15.6 7.4h.01M8.4 11.4h.01M12 11.4h.01M15.6 11.4h.01M8.4 15.4h.01M12 15.4h.01M15.6 15.4h.01" />
    </>
  ),
  loader: (
    <>
      <path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),

  /* --- /developer -------------------------------------------------------
     Same 24-grid and 1.6 stroke as everything above. The multi-colour brand
     and technology marks are filled shapes and live in
     components/developer/TechMark.tsx instead. */
  code: <path d="m9 8.4-4.4 3.6L9 15.6M15 8.4l4.4 3.6L15 15.6M13.4 4.6l-2.8 14.8" />,
  terminal: (
    <>
      <rect x="2.6" y="4" width="18.8" height="16" rx="2.4" />
      <path d="m6.8 10 2.6 2.4-2.6 2.4M12.4 15.2h4.4" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3.2a8.8 8.8 0 0 0 0 17.6c1.3 0 1.9-.9 1.9-1.8s-.7-1.7-.7-2.5c0-.9.7-1.6 1.7-1.6h1.7A4.7 4.7 0 0 0 21 10.2C21 6.2 17 3.2 12 3.2Z" />
      <path d="M7.4 9.2h.01M10.8 7.2h.01M14.6 7.8h.01M6.6 13h.01" />
    </>
  ),
  bug: (
    <>
      <rect x="8" y="7.4" width="8" height="11.2" rx="4" />
      <path d="M9.4 5.4 10.8 7.6M14.6 5.4 13.2 7.6M8 11H4.6M8 15H5.2M16 11h3.4M16 15h2.8M12 18.6v2.2" />
    </>
  ),
  rocket: (
    <>
      <path d="M13.4 15.4 8.6 10.6c.5-3.2 2.6-6.4 6.2-7.8 1.9-.7 3.4-.4 4.2.4s1.1 2.3.4 4.2c-1.4 3.6-4.6 5.7-6 6Z" />
      <circle cx="15" cy="9" r="1.7" />
      <path d="M8.6 15.4c-1.6.5-2.6 1.9-3 4.6 2.7-.4 4.1-1.4 4.6-3M6.4 12.2 4 11.4l2.8-2.8 2 .6M11.8 17.6l.8 2.4 2.8-2.8-.6-2" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3.2 8.4 4.2L12 11.6 3.6 7.4z" />
      <path d="m3.6 12 8.4 4.2 8.4-4.2M3.6 16.6 12 20.8l8.4-4.2" />
    </>
  ),
  /* A commit is a node on the line, not a dot beside it. */
  commit: (
    <>
      <circle cx="12" cy="12" r="3.4" />
      <path d="M2.8 12h5.8M15.4 12h5.8" />
    </>
  ),
  puzzle: (
    <path d="M10.4 3.2a1.9 1.9 0 0 1 1.9 1.9c0 .5-.2.9-.4 1.3h2.9a1.2 1.2 0 0 1 1.2 1.2v2.6c.4-.2.8-.4 1.3-.4a1.9 1.9 0 0 1 0 3.8c-.5 0-.9-.2-1.3-.4v2.6a1.2 1.2 0 0 1-1.2 1.2h-2.6c.2.4.4.8.4 1.3a1.9 1.9 0 0 1-3.8 0c0-.5.2-.9.4-1.3H6.5a1.2 1.2 0 0 1-1.2-1.2V8.4a1.2 1.2 0 0 1 1.2-1.2h2.4c-.2-.4-.4-.8-.4-1.3a1.9 1.9 0 0 1 1.9-1.7Z" />
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.6" ry="3" />
      <path d="M4.4 6v12c0 1.7 3.4 3 7.6 3s7.6-1.3 7.6-3V6" />
      <path d="M4.4 12c0 1.7 3.4 3 7.6 3s7.6-1.3 7.6-3" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="3.6" width="18" height="7" rx="2" />
      <rect x="3" y="13.4" width="18" height="7" rx="2" />
      <path d="M7.2 7.1h.01M7.2 16.9h.01M11 7.1h3.8M11 16.9h3.8" />
    </>
  ),
  cloud: (
    <path d="M7.2 19.4h9.6a4.2 4.2 0 0 0 .5-8.4 5.8 5.8 0 0 0-11.2-1 3.8 3.8 0 0 0 1.1 9.4Z" />
  ),
  bolt: <path d="M13.4 2.8 5.2 13.6h5.2l-.8 7.6 8.2-10.8h-5.2z" />,
  external: (
    <>
      <path d="M18.4 13.6v4.8a2 2 0 0 1-2 2H5.8a2 2 0 0 1-2-2V7.6a2 2 0 0 1 2-2h4.8" />
      <path d="M14.4 3.6h6v6M20.4 3.6 11.6 12.4" />
    </>
  ),
  chevronLeft: <path d="M14.4 6.4 9 12l5.4 5.6" />,
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
  user: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
} as const

export type IconName = keyof typeof PATHS

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  /** Pixel size for width and height. Defaults to 24. */
  size?: number
}

export function Icon({ name, size = 24, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
