import { cn } from '@/lib/cn'

/**
 * A pinned stack of instant photos with handwritten captions.
 *
 * The frames are real; the pictures are washes, because we do not have the
 * photographs yet. Each frame is a drop-in slot — put an <Image> where the
 * gradient div is and the caption and tilt still work.
 */

const FRAMES = [
  {
    caption: 'day one, 9:30am',
    tilt: -7,
    wash: 'linear-gradient(160deg,#d8e2ff 0%,#e5deff 48%,#ffdcc4 100%)',
    className: 'z-10 w-[58%] top-0 left-0',
  },
  {
    caption: 'the plaza',
    tilt: 6,
    wash: 'linear-gradient(200deg,#ffdcc4 0%,#ffb77f 55%,#e5deff 100%)',
    className: 'z-20 w-[52%] top-[26%] right-0',
  },
  {
    caption: "batch of '26",
    tilt: -3,
    wash: 'linear-gradient(140deg,#e5deff 0%,#d8e2ff 40%,#ffb77f 110%)',
    className: 'z-30 w-[56%] bottom-0 left-[8%]',
  },
] as const

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
          <div
            className="brush-alt aspect-4/5 w-full rounded-sm"
            style={{ backgroundImage: f.wash }}
          />
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
