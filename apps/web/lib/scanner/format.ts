/**
 * The two things the scanner has to say about time, and nothing else.
 *
 * Both are written for a glance rather than for a record. A volunteer reading "7 min"
 * knows the manifest is fresh; a volunteer reading "00:07:14" has to do arithmetic
 * while a queue waits. Precision here costs comprehension and buys nothing — the
 * audit log holds the exact timestamps.
 */

/**
 * A duration as few characters as will still be unambiguous.
 *
 * Deliberately coarse above an hour: at that point the only decision the number
 * drives is "resync now", and whether it has been 74 or 79 minutes does not change
 * it. Negative input reads as "just now" rather than as a negative number, because a
 * device whose clock is a few seconds ahead of the server is normal and a screen
 * saying "-3 s ago" reads as a fault.
 */
export function shortDuration(ms: number): string {
  if (ms < 45_000) return 'just now'

  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${String(minutes)} min`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) return `${String(hours)} hr`
  return `${String(hours)} hr ${String(rest)} min`
}

/**
 * "8:42 am" — campus time, never device time.
 *
 * The gate is in Patna and so is everyone reading this, but a volunteer's phone can
 * be on a wrong timezone as easily as a wrong clock, and a check-in time that
 * disagrees with the wall clock in the foyer starts an argument nobody can settle.
 * `Asia/Kolkata` is pinned for the same reason the student portal pins it.
 */
export function clockTime(epochMs: number): string {
  const at = new Date(epochMs)
  if (Number.isNaN(at.getTime())) return '—'
  return at.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })
}
