import type { ReactElement } from 'react'
import { cn } from '@/lib/cn'

/**
 * A pinned stack of instant photos with handwritten captions.
 *
 * The frames are real and so are the pictures — drawn, in the same paper-cut
 * style as the hero, because empty gradient placeholders read as images that
 * failed to load. Figures are flat brand-coloured silhouettes with no faces:
 * that keeps the style honest (we are not pretending to have photographed
 * anyone) and lets every reader see themselves in the group.
 *
 * Each frame is still a drop-in slot — replace the <Vignette> with an <Image>
 * and the tilt, caption, pin and float all keep working.
 */

type Kind = 'pair' | 'plaza' | 'batch'

/* Three frames in a square, fanned. Widths stay near 46% so all three read at
   once — anything larger buries the frame behind it. */
const FRAMES: { caption: string; tilt: number; kind: Kind; className: string }[] = [
  { caption: 'day one, 9:30am', tilt: -7, kind: 'pair', className: 'z-10 w-[47%] top-0 left-0' },
  { caption: 'the plaza', tilt: 6, kind: 'plaza', className: 'z-20 w-[45%] top-[13%] right-0' },
  {
    caption: "batch of '26",
    tilt: -3,
    kind: 'batch',
    className: 'z-30 w-[48%] bottom-0 left-[19%]',
  },
]

/**
 * Head and shoulders, seen from the front. Origin is the bottom centre.
 *
 * The shape carries a neck notch and sloped shoulders rather than a dome with a
 * circle over it: a floating head above a mound does not read as a person at
 * this size, it reads as a spill. `halo` is the backdrop colour — overlapping
 * figures need an outline in it or the shoulders merge and you cannot count
 * the people.
 */
function Bust({
  x,
  y,
  scale = 1,
  fill,
  halo,
}: {
  x: number
  y: number
  scale?: number
  fill: string
  halo: string
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill={fill} stroke={halo} strokeWidth={5 / scale}>
      <path d="M-46 0v-34q0-20 26-26l7-16h26l-7 16q26 6 26 26V0z" />
      <circle cx="0" cy="-88" r="22" />
    </g>
  )
}

/** Two students at the gate, pass round a neck. */
function Pair() {
  const halo = '#e5deff'
  return (
    <>
      <rect width="200" height="250" fill={halo} />
      <circle cx="98" cy="62" r="70" fill="#d8e2ff" />
      <rect y="206" width="200" height="44" fill="#c7d7f7" />
      {/* the one half a step behind */}
      <Bust x={150} y={240} scale={0.78} fill="#5b3cdd" halo={halo} />
      {/* the one in front */}
      <Bust x={66} y={252} scale={0.96} fill="#001b44" halo={halo} />
      {/* lanyard and pass, over the front figure */}
      <g stroke="#ff8a00" strokeWidth="5" fill="none" strokeLinecap="round">
        <path d="M50 186l14 30" />
        <path d="M82 186l-13 30" />
      </g>
      <rect x="55" y="212" width="27" height="18" rx="3" fill="#ffdcc4" />
    </>
  )
}

/** The block across the lawn. */
function Plaza() {
  return (
    <>
      <rect width="200" height="250" fill="#ffdcc4" />
      <circle cx="154" cy="46" r="34" fill="#ffb77f" opacity="0.9" />
      <rect y="148" width="200" height="102" fill="#dfeee4" />
      <rect x="22" y="64" width="156" height="86" fill="#001b44" />
      <rect x="16" y="58" width="168" height="9" rx="3" fill="#0d2a5c" />
      <g fill="#ffdcc4" opacity="0.8">
        {[0, 1, 2].map((r) =>
          [0, 1, 2, 3, 4].map((c) => (
            <rect key={`${r}-${c}`} x={34 + c * 29} y={78 + r * 22} width="18" height="13" rx="2" />
          )),
        )}
      </g>
      <path d="M86 150h28l38 100H48z" fill="#eef0f7" />
      <g fill="#0d7a4f">
        <circle cx="30" cy="132" r="22" opacity="0.85" />
        <circle cx="176" cy="138" r="18" opacity="0.75" />
      </g>
    </>
  )
}

/** The whole row, shoulder to shoulder. */
function Batch() {
  const halo = '#d8e2ff'
  return (
    <>
      <rect width="200" height="250" fill={halo} />
      <circle cx="100" cy="70" r="72" fill="#e5deff" />
      <rect y="216" width="200" height="34" fill="#c7d7f7" />
      {/* back row — heads at the same height, bodies cut off higher */}
      <Bust x={30} y={234} scale={0.68} fill="#7459f7" halo={halo} />
      <Bust x={172} y={236} scale={0.68} fill="#ca6c00" halo={halo} />
      {/* one arm up, because somebody always has their arm up */}
      <path
        d="M156 172c12-14 15-30 12-45"
        stroke="#ca6c00"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
      {/* front row */}
      <Bust x={74} y={252} scale={0.88} fill="#0d2a5c" halo={halo} />
      <Bust x={130} y={252} scale={0.84} fill="#001b44" halo={halo} />
    </>
  )
}

const ART: Record<Kind, () => ReactElement> = { pair: Pair, plaza: Plaza, batch: Batch }

/* A photograph in a frame is a rectangle. The organic edge treatment belongs to
   the hero, where the art bleeds into the paper; here it only made the picture
   look like a sticker floating inside its own mount. */
function Vignette({ kind }: { kind: Kind }) {
  const Art = ART[kind]
  return (
    <div className="overflow-hidden rounded-[3px]">
      <svg viewBox="0 0 200 250" preserveAspectRatio="xMidYMid slice" className="aspect-4/5 w-full">
        <Art />
      </svg>
    </div>
  )
}

export function PhotoStack({ className }: { className?: string }) {
  return (
    <div className={cn('relative aspect-square w-full', className)} aria-hidden>
      <div className="wash absolute inset-4 -z-10 opacity-60" />

      {FRAMES.map((f, i) => (
        <figure
          key={f.caption}
          className={cn(
            'bg-card shadow-card absolute rounded-md p-2.5 pb-9',
            i === 1 && 'float-slow',
            i === 2 && 'float-slow float-delay',
            f.className,
          )}
          style={{ rotate: `${f.tilt}deg` }}
        >
          <Vignette kind={f.kind} />
          <figcaption className="hand text-ink-soft absolute inset-x-2.5 bottom-1.5 truncate text-center text-lg">
            {f.caption}
          </figcaption>
        </figure>
      ))}

      {/* a pin through the top frame */}
      <span className="bg-flame-bright shadow-card absolute top-1 left-[26%] z-40 size-3.5 rounded-full ring-3 ring-white/70" />
    </div>
  )
}
