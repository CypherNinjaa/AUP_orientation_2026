import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/site/PageHeader'
import { Container, Section } from '@/components/ui/atoms'
import { EVENT, MAX_GUESTS_WORD } from '@/lib/event'

export const metadata: Metadata = {
  title: 'Accessibility',
  description:
    'How this site is built to be usable, what is still unfinished, and how to get what you need on the day.',
}

export default function AccessibilityPage() {
  return (
    <>
      <PageHeader
        crumb="Accessibility"
        eyebrow="Everyone gets in"
        title="Accessibility"
        lede="What we have built, what we have not finished, and who to tell so that the day works for you. Written plainly rather than as a compliance badge."
      />

      <Section>
        <Container>
          <div className="prose-page">
            <h2>The standard we build to</h2>
            <p>
              WCAG 2.2 level AA. That is the target for every page here, and it is checked as pages
              are built rather than audited once at the end.
            </p>
            <p className="todo">
              <strong>Honest status.</strong> This site is still being built. It has been checked by
              hand with a keyboard and a screen reader as each page was written, but it has not yet
              had a full independent audit. Until it has, we are not claiming conformance — we are
              claiming intent and listing what we know about below.
            </p>

            <h2>What is already true</h2>
            <ul>
              <li>
                <strong>It works without JavaScript.</strong> Animations are an enhancement. If the
                script fails or you block it, every page still renders and reads in full.
              </li>
              <li>
                <strong>It works without a mouse.</strong> Every link, button and form control is
                reachable by keyboard, in a sensible order, with a visible focus ring that is not
                the browser default hairline.
              </li>
              <li>
                <strong>Motion is optional.</strong> Turn on &ldquo;reduce motion&rdquo; in your
                operating system and the scroll reveals, the floating elements and the transitions
                all stop. Nothing is hidden as a result.
              </li>
              <li>
                <strong>Text contrast is measured, not eyeballed.</strong> Body text meets 4.5:1
                against its background; large headings meet 3:1. Where text sits on a colour
                gradient, the gradient carries a scrim behind it to keep it there.
              </li>
              <li>
                <strong>Text resizes.</strong> Type is set in relative units and scales with your
                browser or OS text size. Nothing is locked to a pixel height.
              </li>
              <li>
                <strong>Form labels stay visible.</strong> No field uses its placeholder as its
                label, because the label vanishes exactly when you need to re-read it.
              </li>
              <li>
                <strong>Colour is never the only signal.</strong> Status is always carried by a word
                or an icon as well as a colour.
              </li>
              <li>
                <strong>Illustrations are decorative and marked as such</strong>, so a screen reader
                skips them rather than reading a filename aloud.
              </li>
            </ul>

            <h2>What we know is not finished</h2>
            <ul>
              <li>
                The registration wizard — including the camera step — has not been built yet, so it
                has not been tested. An alternative to taking your own photograph will be offered
                before it ships; if the camera step is a barrier for you, the help desk will
                complete your registration in person.
              </li>
              <li>
                No independent audit has been commissioned yet. When one has, its findings and the
                fixes will be summarised on this page.
              </li>
              <li>
                The site is in English only. If you would rather read it in Hindi, tell us — see
                below.
              </li>
              <li>
                Testing has been with keyboard, browser zoom and a screen reader on desktop. It has
                not yet been tested with a screen reader on a phone, or with voice control.
              </li>
            </ul>

            <h2>On the day</h2>
            <p>
              The website is the easy part. If you need any of the following, say so — either in the
              optional accessibility box during registration, or by writing to{' '}
              <a href={`mailto:${EVENT.email}`}>{EVENT.email}</a> before you travel:
            </p>
            <ul>
              <li>Step-free access, lift access, or a route that avoids stairs.</li>
              <li>Reserved seating near the front, near an exit, or beside your companion.</li>
              <li>An interpreter, a note-taker, or captions for a session.</li>
              <li>
                A quiet space to step out to. A full day with several thousand people is a lot, and
                needing a room with the volume turned down is normal.
              </li>
              <li>
                A companion or carer, over and above the {MAX_GUESTS_WORD} guest seats everyone
                gets — that is not a problem.
              </li>
              <li>
                Anything about medication, food, or the length of time between breaks.
              </li>
            </ul>
            <p>
              Asking early means it is arranged rather than improvised. Asking late is still much
              better than not asking — the desk at Gate 1 can sort most things on the morning.{' '}
              <Link href="/information#practicals">Food, dress and access</Link> covers the general
              picture.
            </p>

            <h2>Tell us when we get it wrong</h2>
            <p>
              If a page will not work with your assistive technology, or something on it is
              unreadable, that is a defect and we want to know. Email{' '}
              <a href={`mailto:${EVENT.email}`}>{EVENT.email}</a> or call{' '}
              <a href={`tel:${EVENT.helpline.replace(/\s/g, '')}`}>{EVENT.helpline}</a>. Say which
              page and what happened, and you will get a reply — and if it is something we can fix
              quickly, we will fix it and then reply.
            </p>
          </div>
        </Container>
      </Section>
    </>
  )
}
