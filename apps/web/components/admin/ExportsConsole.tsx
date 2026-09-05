'use client'

/**
 * Exports — hand a dataset to a spreadsheet, on purpose.
 *
 * The whole screen is one form and one link. The download is a plain `<a href download>`
 * rather than a fetch: the file is up to 15,000 rows of bytes the server streams, and
 * buffering that through `fetch` into a blob only to hand it back to the browser wastes
 * the memory twice. The route writes an audit entry for the egress however the link is
 * clicked, so the trail does not depend on this screen.
 *
 * ## Contact is off unless you turn it on
 *
 * `includeContact` unmasks phone numbers for the whole file. It defaults off, and
 * `exportUrl` only ever puts it on the wire when it is on — sending `includeContact=false`
 * literally would read back as `true` on a server that coerces the query, which is the
 * opposite of what off means. So this toggle can only ever widen access deliberately.
 */

import { useState } from 'react'

import type { ExportQuery, RegistrationStatus } from '@orientation/contracts'

import { OpsSelect, OpsToggle } from '@/components/admin/controls'
import { Icon } from '@/components/ui/Icon'
import { OpsField, OpsHeading, Panel } from '@/components/ui/ops'
import { exportUrl, localInputToIso } from '@/lib/admin'
import { cn } from '@/lib/cn'

type Dataset = ExportQuery['dataset']
type Format = ExportQuery['format']

const DATASETS: { value: Dataset; label: string; blurb: string }[] = [
  { value: 'registrations', label: 'Registrations', blurb: 'Every submission, its status and pass.' },
  { value: 'checkins', label: 'Check-ins', blurb: 'Who came through a gate, and when.' },
  { value: 'roster', label: 'Roster', blurb: 'The admitted list as it stands now.' },
  { value: 'scan-events', label: 'Scan events', blurb: 'Every gate verdict, admitted or not.' },
  { value: 'audit', label: 'Audit log', blurb: 'The append-only record of who did what.' },
]

const STATUS_LABEL: Record<RegistrationStatus, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REVISION_REQUESTED: 'Revision requested',
  REJECTED: 'Rejected',
}

/** The button classes, by hand — `ops.tsx` does not export them, and this is an anchor. */
const DOWNLOAD_CLASS = cn(
  'inline-flex items-center justify-center gap-2 rounded-md font-bold whitespace-nowrap',
  'transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info',
  'h-10 px-4 text-sm bg-sky text-navy hover:bg-white',
)

export function ExportsConsole() {
  const [dataset, setDataset] = useState<Dataset>('registrations')
  const [format, setFormat] = useState<Format>('xlsx')
  const [status, setStatus] = useState<RegistrationStatus | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [includeContact, setIncludeContact] = useState(false)

  const showStatus = dataset === 'registrations'

  const query: ExportQuery = {
    dataset,
    format,
    status: showStatus && status !== '' ? status : undefined,
    from: localInputToIso(from) ?? undefined,
    to: localInputToIso(to) ?? undefined,
    includeContact,
  }

  const active = DATASETS.find((d) => d.value === dataset)

  return (
    <div className="flex flex-col gap-6">
      <OpsHeading
        eyebrow="Data · leaves an audit entry"
        title="Exports"
        lede="Pull a dataset into a spreadsheet. Every download is recorded, and contact details stay masked unless you ask."
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Build an export" hint="Pick what to pull and how to slice it." icon="database">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <OpsField label="Dataset" htmlFor="ex-dataset" hint={active?.blurb}>
                <OpsSelect
                  id="ex-dataset"
                  value={dataset}
                  onChange={(event) => {
                    setDataset(event.target.value as Dataset)
                  }}
                >
                  {DATASETS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </OpsSelect>
              </OpsField>
              <OpsField label="Format" htmlFor="ex-format">
                <OpsSelect
                  id="ex-format"
                  value={format}
                  onChange={(event) => {
                    setFormat(event.target.value as Format)
                  }}
                >
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="csv">CSV (.csv)</option>
                </OpsSelect>
              </OpsField>
            </div>

            {showStatus ? (
              <OpsField label="Status" htmlFor="ex-status" hint="Registrations only. Leave on “Any” for the full list.">
                <OpsSelect
                  id="ex-status"
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as RegistrationStatus | '')
                  }}
                >
                  <option value="">Any status</option>
                  {(Object.keys(STATUS_LABEL) as RegistrationStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </OpsSelect>
              </OpsField>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <OpsField label="From" htmlFor="ex-from" hint="Optional. Start of the window.">
                <input
                  id="ex-from"
                  type="datetime-local"
                  className="w-full rounded-md bg-ops px-3.5 py-2.5 text-base sm:text-sm text-ops-ink ring-1 ring-ops-line focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value)
                  }}
                />
              </OpsField>
              <OpsField label="To" htmlFor="ex-to" hint="Optional. End of the window.">
                <input
                  id="ex-to"
                  type="datetime-local"
                  className="w-full rounded-md bg-ops px-3.5 py-2.5 text-base sm:text-sm text-ops-ink ring-1 ring-ops-line focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value)
                  }}
                />
              </OpsField>
            </div>
          </div>
        </Panel>

        <Panel title="Personal data" hint="Off by default — and audited when on." icon="shield">
          <div className="flex flex-col gap-4">
            <OpsToggle
              checked={includeContact}
              onChange={setIncludeContact}
              label="Include contact numbers, unmasked"
              description="Applies to datasets that carry a phone number. Leave off for a shareable file."
            />
            {includeContact ? (
              <div className="bg-warn/8 ring-warn/30 flex items-start gap-3 rounded-lg px-4 py-3 ring-1">
                <Icon name="alert" size={16} className="text-warn mt-0.5 shrink-0" />
                <p className="text-ops-soft text-xs">
                  This file will contain <span className="text-ops-ink font-semibold">unmasked phone numbers</span>.
                  Handle it as personal data under the DPDP Act — the download is recorded against your account.
                </p>
              </div>
            ) : null}

            <div className="border-ops-line/70 mt-1 border-t pt-4">
              <a href={exportUrl(query)} download className={DOWNLOAD_CLASS}>
                <Icon name="download" size={15} />
                Download {format === 'xlsx' ? 'Excel' : 'CSV'}
              </a>
              <p className="text-ops-faint mt-2 text-xs">
                Downloads {active?.label.toLowerCase() ?? 'the dataset'}
                {showStatus && status !== '' ? ` · ${STATUS_LABEL[status].toLowerCase()}` : ''}
                {from !== '' || to !== '' ? ' · within your date window' : ''}.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
