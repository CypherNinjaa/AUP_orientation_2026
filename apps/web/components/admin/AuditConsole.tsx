'use client'

/**
 * Audit log — the append-only record of who did what, read back.
 *
 * ## Why this screen has no live feed
 *
 * Every other admin console re-reads on a realtime event. This one does not, on
 * purpose. The audit log is a ledger, not a dashboard: an entry is written once and
 * never changes, and reading it must not reorder the page under an operator who is
 * reading a row. So the only way rows change here is a deliberate Refresh or a filter
 * change — both reset to page one, which is correct for a newest-first ledger.
 *
 * ## The PII filter is a one-way switch
 *
 * `piiOnly` answers the DPDP question directly — "show me every recorded read of
 * personal data". It is a coerced boolean on the server, so `fetchAudit` sends it only
 * when on; sending `false` literally would read back as `true`. Off is the absence of
 * the parameter, never the string "false".
 *
 * `before`/`after` are already redacted server-side (`redact()` in `lib/server/audit`),
 * so the JSON shown here never contains a raw selfie URL or an unmasked phone number.
 */

import { useCallback, useState } from 'react'

import type { AuditEntryView, Role } from '@orientation/contracts'

import { OpsModal, OpsSelect, OpsToggle } from '@/components/admin/controls'
import { usePaged } from '@/components/admin/usePaged'
import {
  DataTable,
  EmptyState,
  ErrorNote,
  FactList,
  OpsButton,
  OpsField,
  OpsHeading,
  Panel,
  Skeleton,
  Td,
  Th,
  opsControl,
} from '@/components/ui/ops'
import { ago, count, fetchAudit, fetchAuditActions, localInputToIso, stamp } from '@/lib/admin'
import { useResource } from '@/lib/client/useResource'

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  VOLUNTEER: 'Volunteer',
  STUDENT: 'Student',
}

/** Actor as a person, falling back through the handles the ledger kept. */
function actor(entry: AuditEntryView): string {
  return entry.actorLabel ?? entry.actorId ?? 'System'
}

/** A redacted before/after snapshot, or an em dash when there was nothing to record. */
function Snapshot({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-ops-faint text-sm">—</p>
  }
  return (
    <pre className="text-ops-soft ring-ops-line max-h-64 overflow-auto rounded-md bg-black/30 p-3 text-xs ring-1">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export function AuditConsole() {
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [piiOnly, setPiiOnly] = useState(false)
  const [selected, setSelected] = useState<AuditEntryView | null>(null)

  // The distinct action names populate the filter; a plain read, not paged.
  const actions = useResource(
    useCallback((signal: AbortSignal) => fetchAuditActions(signal), []),
    [],
  )

  const fetchPage = useCallback(
    (cursor: string | undefined, signal: AbortSignal) =>
      fetchAudit(
        {
          limit: 50,
          cursor,
          action: action !== '' ? action : undefined,
          from: localInputToIso(from) ?? undefined,
          to: localInputToIso(to) ?? undefined,
          piiOnly,
        },
        signal,
      ),
    [action, from, to, piiOnly],
  )
  const entries = usePaged<AuditEntryView>(fetchPage, [action, from, to, piiOnly])

  return (
    <div className="flex flex-col gap-6">
      <OpsHeading
        eyebrow="Ledger · append-only"
        title="Audit log"
        lede="Every privileged action, written once and never edited. Reads of personal data are recorded here too — filter to them for a DPDP answer."
        action={
          <OpsButton size="sm" variant="outline" icon="search" onClick={entries.refresh} disabled={entries.loading}>
            {entries.loading ? 'Loading…' : 'Refresh'}
          </OpsButton>
        }
      />

      <Panel title="Narrow it down" hint="Filters reset to the newest matching entry." icon="search">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <OpsField label="Action" htmlFor="au-action">
            <OpsSelect
              id="au-action"
              value={action}
              onChange={(event) => {
                setAction(event.target.value)
              }}
            >
              <option value="">Any action</option>
              {(actions.data ?? []).map((a) => (
                <option key={a.action} value={a.action}>
                  {a.action} · {count(a.count)}
                </option>
              ))}
            </OpsSelect>
          </OpsField>
          <OpsField label="From" htmlFor="au-from" hint="Optional.">
            <input
              id="au-from"
              type="datetime-local"
              className={opsControl}
              value={from}
              onChange={(event) => {
                setFrom(event.target.value)
              }}
            />
          </OpsField>
          <OpsField label="To" htmlFor="au-to" hint="Optional.">
            <input
              id="au-to"
              type="datetime-local"
              className={opsControl}
              value={to}
              onChange={(event) => {
                setTo(event.target.value)
              }}
            />
          </OpsField>
          <div className="pb-0.5">
            <OpsToggle
              checked={piiOnly}
              onChange={setPiiOnly}
              label="Reads of personal data only"
              description="Every recorded look at a selfie or contact detail."
            />
          </div>
        </div>
      </Panel>

      <Panel title="Entries" hint="Newest first" icon="note" flush>
        {entries.loading ? (
          <div className="p-5">
            <Skeleton rows={6} />
          </div>
        ) : entries.items.length === 0 ? (
          entries.error !== null ? (
            <div className="p-5">
              <ErrorNote error={entries.error} onRetry={entries.refresh} />
            </div>
          ) : (
            <EmptyState icon="note" title="Nothing matches">
              No audit entries for these filters. Widen the window or clear the action.
            </EmptyState>
          )
        ) : (
          <>
            <DataTable
              head={
                <>
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th align="right">Detail</Th>
                </>
              }
            >
              {entries.items.map((entry) => (
                <tr key={entry.id} className="hover:bg-ops-raise/40">
                  <Td>
                    <span className="text-ops-soft text-xs" title={stamp(entry.createdAt)}>
                      {ago(entry.createdAt)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-ops-ink block font-semibold">{actor(entry)}</span>
                    {entry.actorRole !== null ? (
                      <span className="text-ops-faint block text-xs">{ROLE_LABEL[entry.actorRole]}</span>
                    ) : null}
                  </Td>
                  <Td>
                    <code className="text-ops-ink text-xs">{entry.action}</code>
                  </Td>
                  <Td>
                    <span className="text-ops-soft block text-xs">{entry.entityType}</span>
                    {entry.entityId !== null ? (
                      <span className="text-ops-faint block font-mono text-[11px] break-all">{entry.entityId}</span>
                    ) : null}
                  </Td>
                  <Td align="right">
                    <OpsButton
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelected(entry)
                      }}
                    >
                      View
                    </OpsButton>
                  </Td>
                </tr>
              ))}
            </DataTable>
            {entries.error !== null ? (
              <div className="p-5 pt-4">
                <ErrorNote error={entries.error} />
              </div>
            ) : null}
            {entries.hasMore ? (
              <div className="border-ops-line/70 flex justify-center border-t p-4">
                <OpsButton variant="outline" onClick={entries.loadMore} disabled={entries.loadingMore}>
                  {entries.loadingMore ? 'Loading…' : 'Load more'}
                </OpsButton>
              </div>
            ) : null}
          </>
        )}
      </Panel>

      <OpsModal
        open={selected !== null}
        onClose={() => {
          setSelected(null)
        }}
        title="Audit entry"
        hint={selected !== null ? selected.action : undefined}
        icon="note"
      >
        {selected !== null ? (
          <div className="flex flex-col gap-5">
            <FactList
              facts={[
                { label: 'Actor', value: actor(selected) },
                { label: 'Role', value: selected.actorRole !== null ? ROLE_LABEL[selected.actorRole] : '—' },
                { label: 'Action', value: <code className="text-ops-ink text-xs">{selected.action}</code> },
                {
                  label: 'Entity',
                  value:
                    selected.entityId !== null ? `${selected.entityType} · ${selected.entityId}` : selected.entityType,
                },
                { label: 'When', value: stamp(selected.createdAt) },
                { label: 'IP', value: selected.ip ?? '—' },
              ]}
            />
            {selected.userAgent !== null ? (
              <p className="text-ops-faint text-xs break-words">{selected.userAgent}</p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-ops-faint mb-1.5 text-xs font-semibold tracking-wide uppercase">Before</p>
                <Snapshot value={selected.before} />
              </div>
              <div>
                <p className="text-ops-faint mb-1.5 text-xs font-semibold tracking-wide uppercase">After</p>
                <Snapshot value={selected.after} />
              </div>
            </div>
          </div>
        ) : null}
      </OpsModal>
    </div>
  )
}
