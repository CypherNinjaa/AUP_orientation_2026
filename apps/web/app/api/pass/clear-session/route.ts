import { handle, ok } from '@/lib/server/http'
import { buildClearStudentSessionCookieHeader } from '@/lib/server/student-session'

export const dynamic = 'force-dynamic'

/**
 * POST /api/pass/clear-session
 * Clears the orientation_student_session cookie so another student can register or claim.
 */
export async function POST(): Promise<Response> {
  return handle(async () => {
    const res = ok({ cleared: true })
    res.headers.append('Set-Cookie', buildClearStudentSessionCookieHeader())
    return res
  })
}
