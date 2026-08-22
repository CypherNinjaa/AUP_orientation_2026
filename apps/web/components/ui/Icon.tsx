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
