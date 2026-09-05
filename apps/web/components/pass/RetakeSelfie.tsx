'use client'

import { useCallback, useState } from 'react'

import { SelfieCapture, type Shot } from '@/components/register/SelfieCapture'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useMutation } from '@/lib/client/useResource'
import { replaceSelfie } from '@/lib/register'

/**
 * Taking the photo again.
 *
 * A moderator has looked at a student's selfie and asked for another one. This is
 * the whole of what that student has to do — nothing else about their registration
 * changes, they do not re-enter their form number, and they do not lose their place
 * in the queue.
 *
 * ## Why it opens in place and not in a modal
 *
 * A live camera inside a dialog on a phone is a fight nobody wins: the viewport
 * shrinks when the keyboard appears, `100vh` lies in Safari, and a scroll-locked
 * body means the capture guidance below the frame cannot be read. Expanding in the
 * flow keeps the moderator's reason on screen directly above the camera, which is
 * the one piece of context that makes the retake correct rather than a second
 * rejected photo.
 *
 * ## Why consent is not asked again
 *
 * It was given, with a version and a timestamp, when the first photo was taken, and
 * `PUT /api/registration/selfie` deliberately does not accept a consent field. This
 * is a replacement of a photo inside a purpose the student already agreed to, not a
 * new collection. If the consent text itself ever changes, that is a re-consent flow
 * and it is not this component.
 */
export function RetakeSelfie({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [shot, setShot] = useState<Shot | null>(null)
  const [sent, setSent] = useState(false)

  const submit = useMutation(
    useCallback(
      (next: Shot) => replaceSelfie(next.image, next.faceDetected),
      [],
    ),
  )

  if (sent) {
    return (
      <p role="status" className="text-leaf flex items-start gap-2.5 text-[0.9375rem] font-semibold">
        <Icon name="check" size={18} strokeWidth={2.6} className="mt-0.5 shrink-0" />
        <span>
          New photo sent. It goes back for checking — this page updates on its own when it is
          decided.
        </span>
      </p>
    )
  }

  if (!open) {
    return (
      <Button type="button" variant="navy" size="md" onClick={() => setOpen(true)}>
        <Icon name="camera" size={18} />
        Take a new photo
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <SelfieCapture
        value={shot?.image ?? null}
        onChange={(next) => {
          setShot(next)
          submit.reset()
        }}
      />

      {submit.error !== null ? (
        <p role="alert" className="text-danger text-[0.9375rem] leading-relaxed font-semibold">
          {submit.error.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={shot === null || submit.pending}
          onClick={() => {
            if (shot === null) return
            void submit.run(shot).then((result) => {
              if (result.ok) {
                setSent(true)
                onDone()
              }
            })
          }}
        >
          {submit.pending ? 'Sending…' : 'Send this photo'}
        </Button>
        <Button
          type="button"
          variant="quiet"
          size="md"
          disabled={submit.pending}
          onClick={() => {
            setOpen(false)
            setShot(null)
            submit.reset()
          }}
        >
          Not now
        </Button>
      </div>

      {shot === null ? (
        <p className="text-ink-faint text-[0.8125rem]">
          Take the photo first, then send it. You can retake it as many times as you like before
          sending — only the one you send is stored.
        </p>
      ) : null}
    </div>
  )
}
