import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

/**
 * Form primitives, shared by the contact form and (next) the registration
 * wizard.
 *
 * No hooks here on purpose — these are plain components so a server page can
 * render a static form and a client component can render an interactive one
 * from the same parts.
 *
 * Two rules the styling encodes:
 *  - the label is always visible. Placeholder-as-label disappears the moment
 *    you start typing, which is exactly when a nervous first-year re-reads it.
 *  - "Optional" is marked; required is the default and is not decorated with
 *    an asterisk nobody has explained.
 */

export const controlClass =
  // `rounded-md` is 12px in this project — the radius scale in globals.css is
  // shifted about two steps up from Tailwind's default so cards can be generous,
  // which also makes `rounded-xl` 24px and turns a 48px-tall input into a pill.
  // A pill reads as a search box or a chat composer; a form field should read as
  // a field. 12px is the roundness the design system specifies.
  'w-full rounded-md bg-card px-4 py-3 text-base sm:text-[0.9375rem] text-ink ring-1 ring-rule/70 ' +
  // 16px on phones, stepping down to 15px from `sm` up. Not a whim: iOS Safari
  // zooms the whole page when a focused control's text is under 16px, and it
  // does not zoom back out — so the form would jump on the first tap and stay
  // magnified for the rest of it. The smaller size is a desktop refinement.
  'transition-shadow duration-200 placeholder:text-ink-faint/70 ' +
  'hover:ring-rule focus:outline-none focus-visible:ring-2 focus-visible:ring-violet'

export function Field({
  label,
  htmlFor,
  hint,
  optional = false,
  error,
  children,
  className,
}: {
  label: string
  htmlFor: string
  /** Shown under the control. Use for format help, not for restating the label. */
  hint?: ReactNode
  optional?: boolean
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={htmlFor} className="text-navy flex items-baseline gap-2 text-sm font-bold">
        {label}
        {optional ? (
          <span className="text-ink-faint text-[0.75rem] font-semibold">Optional</span>
        ) : null}
      </label>

      {children}

      {/* The id is derived so a control can point `aria-describedby` at whichever
          of these is showing without the caller having to invent a name. */}
      {error ? (
        <p id={`${htmlFor}-note`} className="text-danger text-[0.8125rem] font-semibold">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-note`} className="text-ink-faint text-[0.8125rem]">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function TextInput({ className, ...rest }: ComponentPropsWithoutRef<'input'>) {
  return <input className={cn(controlClass, className)} {...rest} />
}

export function TextArea({ className, ...rest }: ComponentPropsWithoutRef<'textarea'>) {
  return <textarea className={cn(controlClass, 'resize-y leading-relaxed', className)} {...rest} />
}

/**
 * A native <select>, on purpose.
 *
 * A custom listbox would match the rest of the site more closely and would be
 * worse: the native control opens the phone's own wheel picker, is searchable by
 * keyboard, and works with every assistive technology without being taught how.
 * Only the arrow is ours.
 */
export function SelectInput({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<'select'>) {
  return (
    <div className="relative">
      <select
        className={cn(
          controlClass,
          // pr-11 keeps the longest option clear of the arrow; the extra py
          // matches the text inputs, which a select does not do by default.
          'appearance-none cursor-pointer pr-11 py-[0.8125rem]',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="text-ink-faint pointer-events-none absolute top-1/2 right-4 -translate-y-1/2"
      >
        <Icon name="chevronDown" size={18} strokeWidth={2.2} />
      </span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Choices                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One option of a radio group, as a card.
 *
 * The input stays visible rather than being hidden behind a styled stand-in — a
 * real radio dot says "pick one of these" without anybody having to work it out,
 * and it comes with keyboard behaviour and a focus ring already correct. The
 * card is the label, so the whole thing is the tap target.
 */
export function Choice({
  title,
  body,
  className,
  ...rest
}: { title: string; body?: string } & ComponentPropsWithoutRef<'input'>) {
  return (
    <label
      className={cn(
        'bg-card ring-rule/60 hover:ring-rule flex cursor-pointer items-start gap-4 rounded-2xl p-5 ring-1',
        'transition-shadow duration-200',
        'has-[:checked]:ring-violet has-[:checked]:ring-2',
        'has-[:focus-visible]:ring-violet has-[:focus-visible]:ring-2',
        className,
      )}
    >
      <input type="radio" className="accent-violet mt-0.5 size-5 shrink-0" {...rest} />
      <span className="min-w-0">
        <span className="text-navy block font-bold">{title}</span>
        {body ? (
          <span className="text-ink-soft mt-1 block text-[0.875rem] leading-relaxed">{body}</span>
        ) : null}
      </span>
    </label>
  )
}

/** A checkbox with its wording beside it. Used once, for consent. */
export function CheckBox({
  children,
  className,
  ...rest
}: { children: ReactNode } & ComponentPropsWithoutRef<'input'>) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-4', className)}>
      <input type="checkbox" className="accent-violet mt-0.5 size-5 shrink-0" {...rest} />
      <span className="text-ink-soft text-[0.9375rem] leading-relaxed">{children}</span>
    </label>
  )
}
