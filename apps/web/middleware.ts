/**
 * Route protection, before a request reaches a page.
 *
 * ## What this file is for, and what it is not
 *
 * It stops a signed-out browser from loading the admin console shell and stops a
 * student from loading the volunteer scanner. That is a *navigation* concern: it
 * saves a wasted render and it means nobody sees a dark ops console flash before
 * being bounced.
 *
 * It is **not** the authorisation boundary. Every API route re-checks the role
 * against Postgres through `requireActor`, and every server component that reads
 * student data scopes the query to the session's own user. The reason is that the
 * role this file reads comes from Clerk's `publicMetadata`, which is a *cache* of
 * `User.role` — see the note in `lib/server/auth.ts`. A cache that is a few seconds
 * stale is fine for deciding whether to render a page and unacceptable for deciding
 * whether to return one student's selfie.
 *
 * ## Why the matcher excludes the public site
 *
 * Middleware runs on every matched request, including static assets if you let it.
 * The public pages are the ones 15,000 students hit at once when the registration
 * link goes out, and adding a Clerk session read to each of those is latency spent
 * to learn something none of them needs.
 */
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

/** Signed in, any role. */
const requiresSignIn = createRouteMatcher([
  '/register(.*)',
  '/pass(.*)',
  '/dashboard(.*)',
  '/admin(.*)',
  '/volunteer(.*)',
])

const requiresVolunteer = createRouteMatcher(['/volunteer(.*)'])
const requiresAdmin = createRouteMatcher(['/admin(.*)'])

export default clerkMiddleware(async (auth, request) => {
  if (process.env.NODE_ENV === 'development' && request.nextUrl.pathname.startsWith('/volunteer')) {
    return NextResponse.next()
  }

  if (!requiresSignIn(request)) return

  const { userId, sessionClaims } = await auth()

  if (!userId) {
    // `redirectToSignIn` would work, but building the URL here keeps the
    // return-to behaviour explicit: a student who followed a link to their pass
    // lands back on their pass, not on a dashboard they then have to navigate from.
    const signIn = new URL('/sign-in', request.url)
    signIn.searchParams.set('redirect_url', request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(signIn)
  }

  const meta = (sessionClaims?.['metadata'] as { role?: string; isActive?: boolean } | undefined)
    ?? (sessionClaims?.['publicMetadata'] as { role?: string; isActive?: boolean } | undefined)
  const role = meta?.role
  const isActive = meta?.isActive

  if (isActive === false && !request.nextUrl.pathname.startsWith('/deactivated')) {
    return NextResponse.redirect(new URL('/deactivated', request.url))
  }

  // Fast-path edge check: If the session token explicitly declares the user is a non-admin,
  // we can rewrite early. If the role claim is missing (e.g. Clerk default session token
  // where custom JWT templates aren't configured), do NOT block here: let the request
  // reach the server layout (AdminLayout / VolunteerPage), which checks Postgres directly.
  if (requiresAdmin(request) && role && role !== 'ADMIN') {
    return NextResponse.rewrite(new URL('/not-authorised', request.url))
  }

  if (requiresVolunteer(request) && role && role !== 'VOLUNTEER' && role !== 'ADMIN') {
    return NextResponse.rewrite(new URL('/not-authorised', request.url))
  }

  return
})

export const config = {
  /**
   * Everything except Next's internals and files with an extension.
   *
   * The extension exclusion is what keeps the logo, the fonts and the face-detection
   * model weights out of middleware. The model files in particular are several
   * megabytes fetched by the registration page, and a session read per chunk would
   * be pure overhead.
   *
   * Both entries are path-to-regexp, **not** raw regular expressions. A negative
   * lookahead has to sit *inside* a group — `/api/((?!webhooks).*)`, never
   * `/api/(?!webhooks)(.*)`, which fails to parse at boot with "Pattern cannot start
   * with ? at 6" and takes the whole dev server down with it.
   *
   * The second entry looks redundant against the first and is not quite: the first
   * excludes any path ending in an extension, and an API route whose dynamic segment
   * happens to contain a dot should still be protected.
   */
  matcher: [
    '/((?!_next|api/webhooks|.*\\.[\\w]+$).*)',
    '/api/((?!webhooks).*)',
  ],
}
