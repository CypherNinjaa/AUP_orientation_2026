/**
 * GET /api/pass/pdf — "Download PDF Pass".
 *
 * A revoked pass is still downloadable, deliberately. The PDF is a record of what
 * was issued; a student whose pass was revoked needs to be able to show the help
 * desk what they were holding, and the gate rejects it regardless of what is on
 * paper — `decideScan` reads `status`, not the document.
 *
 * Rate limited at 10 an hour. Rendering embeds two PNGs and runs a QR encode, so it
 * is the most CPU-expensive thing a student can ask for, and nobody needs their pass
 * eleven times in an hour.
 */
import { prisma } from '@orientation/db'

import { getActor } from '@/lib/server/auth'
import { fail, handle, rateLimited } from '@/lib/server/http'
import { downloadUrl } from '@/lib/server/media/cloudinary'
import { renderPassPdf } from '@/lib/server/pass-render'
import { rateLimit } from '@/lib/server/redis'
import { getStudentSessionFromRequest } from '@/lib/server/student-session'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const session = await getStudentSessionFromRequest(request)
    const actor = session ? null : await getActor()

    if (!session && !actor) {
      return fail('UNAUTHENTICATED', 'No active pass session. Please find your pass using your Form Number.')
    }

    const limitKey = session ? `pass-pdf:student:${session.registrationId}` : `pass-pdf:${actor!.id}`
    const limit = await rateLimit(limitKey, 10, 3600)
    if (!limit.ok) return rateLimited(limit)

    const registration = await prisma.registration.findUnique({
      where: session ? { id: session.registrationId } : { userId: actor!.id },
      include: { companions: { orderBy: { position: 'asc' } }, pass: true },
    })

    if (!registration?.pass) {
      return fail('NOT_FOUND', 'Your pass is issued once your registration is approved.')
    }

    let photoBytes: Uint8Array | null = null
    if (registration.selfiePublicId) {
      try {
        const url = await downloadUrl(
          registration.selfiePublicId,
          registration.selfieCloudName ?? '',
        )
        if (url) {
          const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
          if (res.ok) {
            const buffer = await res.arrayBuffer()
            photoBytes = new Uint8Array(buffer)
          }
        }
      } catch (err) {
        console.warn('[pass/pdf] failed to fetch selfie bytes for PDF', err)
      }
    }

    const pdf = await renderPassPdf({
      name: registration.name,
      program: registration.program,
      reference: registration.reference,
      code10: registration.pass.code10,
      qrPayload: registration.pass.qrPayload,
      guestCount: registration.pass.guestCount,
      companions: registration.companions.map((c) => ({
        relationship: c.relationship,
        name: c.name,
      })),
      issuedAt: registration.pass.issuedAt,
      photoBytes,
    })

    // The filename carries the reference rather than the name: a phone's download
    // tray showing `orientation-pass-AUP26-4KQ2M9.pdf` is unambiguous, and it does
    // not put a student's name in a filename that gets shared in a group chat.
    const filename = `orientation-pass-${registration.reference}.pdf`

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'content-length': String(pdf.byteLength),
        // Never cached anywhere. The document contains a signed credential.
        'cache-control': 'no-store, no-cache, must-revalidate, private',
      },
    })
  })
}
