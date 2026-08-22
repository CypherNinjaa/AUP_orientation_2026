'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, TextArea, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { EVENT } from '@/lib/event'

/**
 * The message form.
 *
 * It composes a `mailto:` and hands off to the visitor's email app. That is a
 * deliberate choice, not a shortcut waiting to be replaced: there is no
 * message-handling backend yet, and a form that silently drops what a nervous
 * first-year typed is worse than no form. The helper text says exactly what the
 * button does, and the address is printed in full so anyone can write directly.
 *
 * When the backend lands this becomes a POST to /api/contact and the copy under
 * the button changes with it.
 */
export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [enrolment, setEnrolment] = useState('')
  const [phone, setPhone] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  const body = [
    message.trim(),
    '',
    '—',
    `Name: ${name.trim()}`,
    `Email: ${email.trim()}`,
    enrolment.trim() ? `Enrolment / form number: ${enrolment.trim()}` : null,
    phone.trim() ? `Phone: ${phone.trim()}` : null,
    `Sent from the ${EVENT.programme} ${EVENT.year} website`,
  ]
    .filter((l) => l !== null)
    .join('\n')

  const href =
    `mailto:${EVENT.email}` +
    `?subject=${encodeURIComponent(subject.trim() || `Orientation ${EVENT.year} enquiry`)}` +
    `&body=${encodeURIComponent(body)}`

  return (
    <form
      // No `action` — the submit handler owns this, and without JS the address
      // printed under the button is still a working way to get in touch.
      onSubmit={(e) => {
        e.preventDefault()
        window.location.href = href
      }}
      className="bg-card ring-rule/25 shadow-card rounded-3xl p-7 ring-1 sm:p-9"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" htmlFor="c-name">
          <TextInput
            id="c-name"
            name="name"
            required
            autoComplete="name"
            placeholder="As it appears on your application"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Your email" htmlFor="c-email">
          <TextInput
            id="c-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field
          label="Enrolment or form number"
          htmlFor="c-enrolment"
          optional
          hint="Helps the desk find your record faster."
        >
          <TextInput
            id="c-enrolment"
            name="enrolment"
            placeholder="e.g. A0000000000"
            value={enrolment}
            onChange={(e) => setEnrolment(e.target.value)}
          />
        </Field>

        <Field label="Phone number" htmlFor="c-phone" optional>
          <TextInput
            id="c-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>

        <Field label="Subject" htmlFor="c-subject" className="sm:col-span-2">
          <TextInput
            id="c-subject"
            name="subject"
            required
            placeholder="What is this about?"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </Field>

        <Field
          label="Your message"
          htmlFor="c-message"
          className="sm:col-span-2"
          hint="If it is about a date, a document or the gate, say which — it saves a round trip."
        >
          <TextArea
            id="c-message"
            name="message"
            required
            rows={6}
            placeholder="Tell us what you need."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>
      </div>

      <div className="border-rule/40 mt-8 flex flex-col gap-4 border-t pt-7 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-faint max-w-sm text-[0.8125rem] leading-relaxed">
          This opens your email app with the message ready to send, so nothing is stored on this
          site. You can also write to{' '}
          <a href={`mailto:${EVENT.email}`} className="text-violet-deep font-bold hover:underline">
            {EVENT.email}
          </a>{' '}
          directly.
        </p>
        <Button type="submit" size="lg" className="shrink-0">
          <Icon name="mail" size={18} />
          Open in email
        </Button>
      </div>
    </form>
  )
}
