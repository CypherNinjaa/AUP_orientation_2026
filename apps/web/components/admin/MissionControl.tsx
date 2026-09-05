'use client'

import { useCallback } from 'react'

import type { ScanOutcome, StatsResponse } from '@orientation/contracts'

import {
  BarRow,
  EmptyState,
  ErrorNote,
  FactList,
  OpsButton,
  OpsHeading,
  Panel,
  type Signal,
  StatTile,
} from '@/components/ui/ops'
import { ago, count, fetchStats, stamp } from '@/lib/admin'
import { useRealtime } from '@/lib/client/RealtimeProvider'
import { useResource } from '@/lib/client/useResource'

/**
 * Mission control — the numbers the control room watches all day.
 *
 * ## Reads its own endpoint, ignores the event payloads
 *
 * `/api/admin/stats` is the authority; `stats.tick`, `checkin.recorded` and the two
 * registration events are only nudges to re-read it. Following the same rule the
 * student portal follows — the event says *look again*, never *here is the new
 * number* — because an aggregate assembled from a stream of deltas drifts from the
 * database the first time one event is missed on a flaky connection, and a check-in
 * count that is quietly three low is worse than one that lags by a refresh.
 *
 * No provider here: the admin layout already owns one `RealtimeProvider` for the
 * whole console, so this and every other page subscribe to the single connection.
 *
 * ## Three denominators, kept apart
 *
 * `admitted` (the roster), `registered` (submissions) and `checkedIn` (through the
 * gate) are three different totals, and the tiles show each against the right one
 * with `of` rather than computing a percentage that could be divided by the wrong
 * base. The contract keeps them separate for exactly this reason.
 */
export function MissionControl() {
  const stats = useResource<StatsResponse>(
    useCallback((signal: AbortSignal) => fetchStats(false, signal), []),
    [],
  )

  const refresh = stats.refresh
  useRealtime({
    'stats.tick': () => refresh(),
    'checkin.recorded': () => refresh(),
    'registration.created': () => refresh(),
    'registration.reviewed': () => refresh(),
    'roster.imported': () => refresh(),
  })

  const heading = (
    <OpsHeading
      eyebrow="Live · campus time"
      title="Mission control"
      lede="The roster, the submissions and the gate — three counts that are never the same number."
      action={
        <div className="flex items-center gap-3">
          {stats.data !== null ? (
            <span className="text-ops-faint hidden text-xs font-semibold sm:block">
              Updated {ago(stats.data.generatedAt)}
            </span>
          ) : null}
          <OpsButton size="sm" variant="outline" onClick={refresh} disabled={stats.refreshing}>
            {stats.refreshing ? 'Syncing…' : 'Refresh'}
          </OpsButton>
        </div>
      }
    />
  )

  if (stats.loading) {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="bg-ops-panel ring-ops-line/70 h-[5.5rem] animate-pulse rounded-xl ring-1" />
          ))}
        </div>
        <span className="sr-only" role="status">
          Loading the live figures
        </span>
      </div>
    )
  }

  if (stats.data === null) {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        {stats.error !== null ? (
          <ErrorNote error={stats.error} onRetry={refresh} />
        ) : (
          <div className="bg-ops-panel ring-ops-line/70 h-40 animate-pulse rounded-xl ring-1" />
        )}
      </div>
    )
  }

  const s = stats.data
  const topPrograms = [...s.byProgram].sort((a, b) => b.admitted - a.admitted).slice(0, 8)
  const outcomes = [...s.scanOutcomes].sort((a, b) => b.count - a.count)
  const outcomeMax = outcomes.reduce((m, o) => Math.max(m, o.count), 0)

  return (
    <div className="flex flex-col gap-6">
      {heading}

      {/* The funnel, left to right: on the roster → submitted → approved → arrived. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Admitted" value={count(s.admitted)} note="On the roster" />
        <StatTile label="Registered" value={count(s.registered)} of={count(s.admitted)} signal="info" />
        <StatTile label="Approved" value={count(s.approved)} of={count(s.registered)} signal={s.approved > 0 ? 'go' : 'idle'} />
        <StatTile label="Checked in" value={count(s.checkedIn)} of={count(s.admitted)} signal="go" />
        <StatTile
          label="Pending review"
          value={count(s.pendingReview)}
          signal={s.pendingReview > 0 ? 'warn' : 'idle'}
          note={s.pendingReview > 0 ? 'Waiting on a moderator' : 'Queue clear'}
        />
        <StatTile
          label="Revision asked"
          value={count(s.revisionRequested)}
          signal={s.revisionRequested > 0 ? 'info' : 'idle'}
          note="Students re-taking a selfie"
        />
        <StatTile label="Passes issued" value={count(s.passesIssued)} signal={s.passesIssued > 0 ? 'go' : 'idle'} />
        <StatTile
          label="Arrivals / min"
          value={count(s.arrivalsPerMinute)}
          signal={s.arrivalsPerMinute > 0 ? 'go' : 'idle'}
          note="Last 60 seconds"
        />
      </div>

      {/* Registration progress and arrivals, both per programme, side by side. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Registration · by programme" hint="Registered of admitted" icon="people">
          {topPrograms.length > 0 ? (
            <div className="flex flex-col gap-3">
              {topPrograms.map((p) => (
                <BarRow key={p.program} label={p.program} value={p.registered} max={p.admitted} signal="info" />
              ))}
            </div>
          ) : (
            <EmptyState icon="database" title="No roster yet">
              Import the admissions workbook from the Roster screen and the branches appear here.
            </EmptyState>
          )}
        </Panel>

        <Panel title="Arrivals · by programme" hint="Checked in of admitted" icon="flag">
          {topPrograms.length > 0 ? (
            <div className="flex flex-col gap-3">
              {topPrograms.map((p) => (
                <BarRow key={p.program} label={p.program} value={p.checkedIn} max={p.admitted} signal="go" />
              ))}
            </div>
          ) : (
            <EmptyState icon="flag" title="Nobody through the gate yet">
              Check-ins land here the moment the first pass is scanned.
            </EmptyState>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Scan outcomes" hint="Every verdict the gates have returned" icon="barcode">
          {outcomes.length > 0 ? (
            <div className="flex flex-col gap-3">
              {outcomes.map((o) => (
                <BarRow
                  key={o.outcome}
                  label={OUTCOME_LABEL[o.outcome]}
                  value={o.count}
                  max={outcomeMax}
                  signal={OUTCOME_SIGNAL[o.outcome]}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon="barcode" title="No scans yet">
              The gates have not returned a verdict. This fills the moment scanning starts.
            </EmptyState>
          )}
        </Panel>

        <Panel title="By level" hint="Registered of admitted" icon="layers">
          {s.byLevel.length > 0 ? (
            <div className="flex flex-col gap-3">
              {s.byLevel.map((l) => (
                <BarRow key={l.level} label={l.level} value={l.registered} max={l.admitted} signal="info" />
              ))}
            </div>
          ) : (
            <EmptyState icon="layers" title="No levels yet" />
          )}
        </Panel>
      </div>

      <Panel title="Arrivals · last two hours" hint="By the minute, campus time" icon="clock">
        <Sparkline points={s.arrivals} />
      </Panel>

      {/* Only when a device's offline verdict disagreed with the server's re-check —
          the one number here that means "look at a specific scanner", not "watch". */}
      {s.clientDisagreements.length > 0 ? (
        <Panel title="Device disagreements" hint="Offline verdict differed from the server" icon="alert">
          <FactList
            facts={s.clientDisagreements.map((d) => ({
              label: d.deviceId,
              value: `${count(d.count)} scan${d.count === 1 ? '' : 's'}`,
              numeric: true,
            }))}
          />
        </Panel>
      ) : null}

      <Panel title="Totals" icon="note">
        <FactList
          facts={[
            { label: 'Passes revoked', value: count(s.passesRevoked), numeric: true },
            { label: 'Guests admitted', value: count(s.guestsAdmitted), numeric: true },
            { label: 'Snapshot taken', value: stamp(s.generatedAt) },
          ]}
        />
      </Panel>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

const OUTCOME_LABEL: Record<ScanOutcome, string> = {
  ADMITTED: 'Admitted',
  DUPLICATE: 'Duplicate',
  INVALID: 'Invalid',
  REVOKED: 'Revoked',
  NOT_APPROVED: 'Not approved',
  OUT_OF_WINDOW: 'Out of window',
  STALE_MANIFEST: 'Stale manifest',
  NOT_FOUND: 'Not found',
}

const OUTCOME_SIGNAL: Record<ScanOutcome, Signal> = {
  ADMITTED: 'go',
  DUPLICATE: 'warn',
  OUT_OF_WINDOW: 'warn',
  STALE_MANIFEST: 'warn',
  INVALID: 'stop',
  REVOKED: 'stop',
  NOT_APPROVED: 'stop',
  NOT_FOUND: 'stop',
}

/**
 * A minute-by-minute arrivals strip.
 *
 * Deliberately not a charting library: this is one series of small non-negative
 * integers, and a bar per bucket reads at a glance and ships nothing. The peak is
 * labelled because the shape only means something against its maximum, and the whole
 * strip carries an `sr-only` summary because a screen reader gets nothing from bars.
 */
function Sparkline({ points }: { points: readonly { at: string; count: number }[] }) {
  if (points.length === 0) {
    return <p className="text-ops-soft py-6 text-center text-sm">No arrivals in the last two hours.</p>
  }

  const peak = points.reduce((m, p) => Math.max(m, p.count), 0)
  const total = points.reduce((sum, p) => sum + p.count, 0)

  return (
    <div>
      <div className="flex items-end gap-px" style={{ height: '3rem' }} aria-hidden>
        {points.map((p) => (
          <div
            key={p.at}
            className="bg-go/70 min-h-px flex-1 rounded-t-[1px]"
            style={{ height: `${String(Math.round((p.count / (peak || 1)) * 100))}%` }}
            title={`${count(p.count)} at ${stamp(p.at)}`}
          />
        ))}
      </div>
      <div className="text-ops-faint mt-2 flex items-center justify-between text-xs">
        <span>Peak {count(peak)}/min</span>
        <span className="tnum">{count(total)} in the window</span>
      </div>
      <p className="sr-only">
        {count(total)} arrivals across the last two hours, peaking at {count(peak)} in a minute.
      </p>
    </div>
  )
}
