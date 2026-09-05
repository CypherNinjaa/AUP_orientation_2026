'use client'

/**
 * The three interactive controls the console needs that `ops.tsx` cannot hold.
 *
 * `ops.tsx` is stateless by contract — every export there renders on the server. A
 * modal traps focus and listens for Escape, a toggle owns a pressed state its parent
 * drives, and both need the client. Rather than dilute that file, the moving parts
 * live here, on the same ops palette.
 *
 * `OpsSelect` and `OpsToggle` are presentational — the parent owns their value — but
 * they sit here beside `OpsModal` because the three are the console's form vocabulary
 * and a screen reaches for them together.
 */

import { useEffect, useId, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'

import { Icon, type IconName } from '@/components/ui/Icon'
import { OpsButton, opsControl } from '@/components/ui/ops'
import { cn } from '@/lib/cn'

/* -------------------------------------------------------------------------- */
/* Select                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A native `<select>` on the ops ground.
 *
 * Native rather than a custom listbox on purpose: the console is operated with a
 * keyboard for six hours, and the platform control already does type-ahead, Home/End
 * and the mobile wheel that a hand-rolled one would have to re-earn. Only the closed
 * face is styled; the open list is the OS's, which is the right call on a screen read
 * in a dark room where a mismatched popup would glare.
 */
export function OpsSelect({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<'select'>) {
  return (
    <div className="relative">
      <select className={cn(opsControl, 'appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <Icon
        name="chevronDown"
        size={15}
        className="text-ops-faint pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Toggle                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A switch for a single boolean setting — registration open, auto-approve, a gate's
 * power. A real `role="switch"` button, not a restyled checkbox, so the state is
 * announced as on/off and the whole row is one 44px target.
 */
export function OpsToggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        onChange(!checked)
      }}
      className={cn(
        'group flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left transition-colors',
        'focus-visible:outline-info focus-visible:outline-2 focus-visible:outline-offset-2',
        disabled ? 'opacity-45' : 'hover:bg-ops-raise/60',
      )}
    >
      <span className="min-w-0">
        <span className="text-ops-ink block text-sm font-semibold">{label}</span>
        {description !== undefined ? (
          <span className="text-ops-faint mt-0.5 block text-xs">{description}</span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ring-1 transition-colors',
          checked ? 'bg-go/85 ring-go/40' : 'bg-ops-raise ring-ops-line',
        )}
      >
        <span
          className={cn(
            'bg-ops-ink inline-block size-4 rounded-full shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A focused overlay for one decision — review a registration, confirm a revoke,
 * roll back an import.
 *
 * Why a modal and not an expanding row: every one of these carries a typed
 * confirmation (a ten-digit code, a filename) or a form, and growing a table row to
 * hold that shoves every row below it down the screen while the operator is reading
 * one. A modal takes the decision out of the flow and puts focus on it.
 *
 * It owns the three things a dialog is a bug without: focus moves in on open and
 * returns to the trigger on close, Tab is trapped inside, and Escape and a backdrop
 * click both dismiss. No portal — the layout has no transformed ancestor, so a
 * `fixed` overlay is measured from the viewport, and the console's only higher layer
 * is the `z-30` header this clears at `z-50`.
 */
export function OpsModal({
  open,
  onClose,
  title,
  hint,
  icon,
  tone = 'neutral',
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  hint?: ReactNode
  icon?: IconName
  /** `danger` tints the header glyph for a destructive decision. */
  tone?: 'neutral' | 'danger'
  children: ReactNode
  footer?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const hintId = useId()

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current

    const focusables = (): HTMLElement[] =>
      panel === null
        ? []
        : Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
            ),
          )

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const scrollLock = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Prefer an explicitly-marked field, else the first focusable, else the panel.
    const initial =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? panel
    initial?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = scrollLock
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hint !== undefined ? hintId : undefined}
        className="bg-ops-panel ring-ops-line relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl ring-1 sm:rounded-2xl"
      >
        <header className="border-ops-line/70 flex items-start gap-3 border-b px-5 py-4">
          {icon !== undefined ? (
            <span
              className={cn(
                'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
                tone === 'danger' ? 'bg-stop/12 text-stop' : 'bg-sky/12 text-sky',
              )}
            >
              <Icon name={icon} size={18} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-ops-ink text-base font-bold tracking-[-0.01em]">
              {title}
            </h2>
            {hint !== undefined ? (
              <p id={hintId} className="text-ops-soft mt-0.5 text-xs">
                {hint}
              </p>
            ) : null}
          </div>
          <OpsButton size="sm" variant="ghost" icon="close" onClick={onClose} aria-label="Close" className="-mt-1 -mr-2 px-2">
            <span className="sr-only">Close</span>
          </OpsButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer !== undefined ? (
          <footer className="border-ops-line/70 flex flex-wrap items-center justify-end gap-2 border-t px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}
