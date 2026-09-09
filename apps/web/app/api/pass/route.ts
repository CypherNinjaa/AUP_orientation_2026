/**
 * GET /api/pass — the student's own pass, with the symbologies rendered.
 *
 * Separate from `/api/registration/me` even though `me` already returns a
 * `PassSummary`, because this one carries the rendered QR (a few kilobytes of SVG)
 * and the barcode as inline SVG. The dashboard reads `me` on every load and every
 * SSE reconnect; it fetches this once, when the student opens their pass.
 *
 * Scoped by `userId` like every student endpoint, so there is no id in the request
 * that could name somebody else's pass.
 */
import { prisma } from '@orientation/db'
import { formatCode10 } from '@orientation/core/pass'

import { getActor } from '@/lib/server/auth'
import { fail, handle, ok } from '@/lib/server/http'
import { issueSelfiePath } from '@/lib/server/media/selfie-url'
import { barcodeSvg, qrSvg } from '@/lib/server/pass-render'
import { toCompanionSummary, toPassSummary } from '@/lib/server/registration'
import { getStudentSessionFromRequest } from '@/lib/server/student-session'
import type { CompanionSummary, PassSummary } from '@orientation/contracts'

export const dynamic = 'force-dynamic'

export interface PassRenderResponse {
  pass: PassSummary
  companions: CompanionSummary[]
  student: {
    name: string
    program: string
    reference: string
    photoUrl?: string | null
  }
  /** Inline SVG. The whole signed envelope, verifiable offline. */
  qrSvg: string
  /** Inline SVG. Code128 of the ten digits only — a lookup key, not a credential. */
  barcodeSvg: string
  /** `XXX-XXX-XXXX`, for the volunteer keypad fallback. */
  code10Formatted: string
}

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const session = await getStudentSessionFromRequest(request)
    const actor = session ? null : await getActor()

    if (!session && !actor) {
      return fail('UNAUTHENTICATED', 'No active pass session. Please find your pass using your Form Number.')
    }

    const registration = await prisma.registration.findUnique({
      where: session ? { id: session.registrationId } : { userId: actor!.id },
      include: {
        companions: { orderBy: { position: 'asc' } },
        pass: { include: { checkIn: { select: { scannedAt: true } } } },
      },
    })

    if (!registration) return fail('NOT_FOUND', 'You have not registered yet.')
    if (!registration.pass) {
      let holdMessage = 'Your pass is issued once your registration is approved.'
      if (registration.status === 'REVISION_REQUESTED') {
        const note = registration.reviewNote?.toLowerCase() ?? ''
        const isPhoto =
          note.includes('photo') ||
          note.includes('selfie') ||
          note.includes('face') ||
          note.includes('dark') ||
          note.includes('blur') ||
          note.includes('camera') ||
          note.includes('orientation') ||
          note.includes('retake')
        const isNameMismatch =
          note.includes('name') || note.includes('admission') || note.includes('record')

        if (isNameMismatch && !isPhoto) {
          holdMessage = 'Your pass is on hold due to an admissions record mismatch.'
        } else if (isPhoto) {
          holdMessage = 'Your pass is on hold until you retake your photo.'
        } else {
          holdMessage = 'Your pass is on hold until the requested revision is resolved.'
        }
      }

      return fail('NOT_FOUND', holdMessage)
    }

    const pass = registration.pass

    const qr = await qrSvg(pass.qrPayload)
    const barcode = barcodeSvg(pass.code10)

    const audience = session ? registration.id : actor!.id
    const photoUrl = registration.selfiePublicId
      ? issueSelfiePath(registration.id, audience, 3600).path
      : null

    const body: PassRenderResponse = {
      pass: toPassSummary(pass, pass.checkIn?.scannedAt ?? null),
      companions: registration.companions.map(toCompanionSummary),
      student: {
        name: registration.name,
        program: registration.program,
        reference: registration.reference,
        photoUrl,
      },
      qrSvg: qr,
      barcodeSvg: barcode,
      code10Formatted: formatCode10(pass.code10),
    }

    return ok(body)
  })
}
