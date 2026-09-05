import Link from 'next/link'
import { redirect } from 'next/navigation'

import { prisma } from '@orientation/db'

import { ScannerShell } from '@/components/scanner/ScannerShell'
import { Icon } from '@/components/ui/Icon'
import { getActor } from '@/lib/server/auth'

/**
 * `/volunteer` — the gate scanner.
 *
 * Almost nothing happens here. The scanner is a client application by necessity: its
 * verdicts come from IndexedDB and WebCrypto and it has to keep working when this
 * server is unreachable. What the server *can* do, and what a phone standing in a
 * queue should not have to, is answer "which gate is this device working" before the
 * camera opens.
 *
 * ## Why the gate is resolved here
 *
 * `deviceHello` refuses an unknown or switched-off gate code with a sentence written
 * for a volunteer — but `helloDevice` on the client returns `null` for every failure,
 * because a scanner must not treat "the server did not answer" as fatal. That is the
 * right trade for a network error and the wrong one for a typo: a mistyped code would
 * surface on the phone as "no pass list on this device", which sends somebody looking
 * for a wifi problem that does not exist.
 *
 * So the codes come from the database, on the server, before anything is handed to the
 * client. One active gate is used directly (the deployment is single-gate by design);
 * several offer a choice; none is its own screen, because a gate that is switched off
 * is an administrator's job and no amount of tapping at the gate will fix it.
 *
 * ## The role check is duplicated on purpose
 *
 * `middleware.ts` already rewrites `/volunteer(.*)` to `/not-authorised` for anyone
 * below VOLUNTEER, reading the role from the session token. This reads it from
 * Postgres, which is authoritative: a volunteer whose access was revoked ten seconds
 * ago still holds a token that says otherwise, and the gate is the last place that
 * should be trusting a cached claim.
 */
export default async function VolunteerPage({
  searchParams,
}: {
  searchParams: Promise<{ gate?: string }>
}) {
  let actor = await getActor()

  if (process.env.NODE_ENV === 'development' && !actor) {
    const devVolunteer = await prisma.user.findFirst({
      where: { role: { in: ['VOLUNTEER', 'ADMIN'] }, isActive: true },
      orderBy: { role: 'asc' },
    })
    if (devVolunteer) {
      actor = {
        id: devVolunteer.id,
        clerkUserId: devVolunteer.clerkUserId,
        role: devVolunteer.role,
        email: devVolunteer.email,
        name: devVolunteer.name,
      }
    }
  }

  if (actor === null) redirect('/sign-in?redirect_url=%2Fvolunteer')
  if (actor.role === 'STUDENT') redirect('/not-authorised')

  const [{ gate }, gates] = await Promise.all([
    searchParams.then((params) => ({ gate: params.gate })),
    prisma.gate.findMany({
      where: { isActive: true },
      select: { code: true, name: true },
      orderBy: { code: 'asc' },
    }),
  ])

  if (gates.length === 0) return <NoGate />

  const requested = gate === undefined ? undefined : gates.find((g) => g.code === gate)
  const only = gates.length === 1 ? gates[0] : undefined
  const chosen = requested ?? only

  if (chosen === undefined) return <PickGate gates={gates} />

  // Name, then email, then a label. The last is reachable — a volunteer created by
  // the Clerk webhook before they ever signed in has neither — and it is only ever a
  // device label and a line in the footer, so a placeholder is honest there.
  return (
    <ScannerShell
      gateCode={chosen.code}
      volunteerName={actor.name ?? actor.email ?? 'Volunteer'}
    />
  )
}

function NoGate() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="bg-amber-50 text-amber-600 border border-amber-200 grid size-14 place-items-center rounded-2xl shadow-xs">
        <Icon name="alert" size={26} />
      </span>
      <p className="text-navy text-lg font-bold">No gate is currently open</p>
      <p className="text-ink-soft max-w-sm text-sm leading-relaxed">
        Every gate is switched off, so there is nothing for this device to scan against. The
        control room activates gates from the command console. Please contact operations and reload this page.
      </p>
    </div>
  )
}

/**
 * Only reachable in a multi-gate deployment, which this one is not. Kept because the
 * alternative — silently picking the alphabetically first gate — would attribute a
 * whole shift of check-ins to the wrong door, and nobody would notice until the
 * arrival figures were compared afterwards.
 */
function PickGate({ gates }: { gates: readonly { code: string; name: string }[] }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6">
      <div className="text-center">
        <p className="text-navy text-lg font-bold">Which gate are you stationed at?</p>
        <p className="text-ink-soft mt-1 text-sm">
          Every scan is logged against your gate station. Select your assigned entrance.
        </p>
      </div>
      <ul className="flex w-full max-w-sm flex-col gap-2">
        {gates.map((gate) => (
          <li key={gate.code}>
            <Link
              href={`/volunteer?gate=${encodeURIComponent(gate.code)}`}
              className="bg-white border border-slate-200 hover:border-violet hover:shadow-sm focus-visible:outline-violet flex min-h-14 items-center justify-between gap-3 rounded-xl px-4 shadow-xs transition-all focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="text-navy text-sm font-bold">{gate.name}</span>
              <span className="text-ink-faint font-mono text-xs font-bold tracking-[0.08em] bg-paper-tint px-2 py-0.5 rounded border border-slate-200/60">
                {gate.code}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
