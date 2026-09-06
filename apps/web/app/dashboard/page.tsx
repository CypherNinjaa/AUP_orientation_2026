import { redirect } from 'next/navigation'

import { getActorOrRedirect } from '@/lib/server/auth'

/**
 * A signpost, not a page. Nothing renders here.
 *
 * `/dashboard` exists so that everything which needs to send a signed-in user
 * "wherever they belong" has one URL to use and does not have to know the role
 * first: Clerk's post-sign-in fallback, the header's account menu, an emailed
 * link, a bookmark shared between a student and a volunteer.
 *
 * The role is read from Postgres here, not from the session token. The middleware
 * reads the token because it must not touch the database on every navigation, but
 * this route runs once per sign-in and a wrong answer sends somebody to a console
 * they will immediately bounce out of — so it pays for the authoritative read.
 *
 * `redirect()` throws, which is why there is no `return` after each branch and no
 * fallback render at the end.
 */
export default async function DashboardPage() {
  const actor = await getActorOrRedirect('/dashboard')

  if (actor.role === 'ADMIN') redirect('/admin')
  if (actor.role === 'VOLUNTEER') redirect('/volunteer')

  // Students land on the pass. It is the page that answers every question they
  // arrive with — is it approved, what is my code, who is coming with me — and it
  // handles the not-yet-registered case itself by explaining what a pass is and
  // offering the wizard, rather than dropping somebody into step one of a form.
  redirect('/pass')
}
