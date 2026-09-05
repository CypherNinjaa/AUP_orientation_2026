'use client'

/**
 * Roster — the admissions workbook, and the only screen that can rename 15,000
 * students at once.
 *
 * ## Upload is two requests on purpose
 *
 * A preview parses the file and writes nothing (`DRY_RUN`); the admin reads what
 * each header resolved to and which rows are broken, and only then commits by id.
 * One request would mean the destructive write happens before anyone has seen what
 * the headers mapped to — and a spreadsheet with a shifted column would quietly
 * overwrite every name. The two-step is the safety mechanism, so this screen makes
 * the admin look at the column map and the issues before the Commit button does
 * anything.
 *
 * ## The file never touches localStorage, and never leaves as anything but multipart
 *
 * The workbook is real admissions PII. It is held in a `File` in memory, sent once
 * as multipart, and dropped the moment a commit succeeds. Nothing here persists it.
 *
 * ## Committing the same file twice doubles a count
 *
 * The preview reports `duplicateOf` when an identical file was already committed,
 * and the commit refuses unless the admin explicitly allows it. That refusal is a
 * deliberate switch, not a dialog to click through — re-running a roster is the
 * easy way to double the admitted total.
 */

import { useCallback, useRef, useState } from 'react'

import {
  ROSTER_EXTENSIONS,
  ROSTER_MAX_BYTES,
  type RosterCommitRequest,
  type RosterCommitResponse,
  type RosterImportView,
  type RosterPreviewResponse,
  type RosterRollbackRequest,
  type RosterRollbackResponse,
} from '@orientation/contracts'

import { OpsModal, OpsToggle } from '@/components/admin/controls'
import { Icon } from '@/components/ui/Icon'
import {
  DataTable,
  EmptyState,
  ErrorNote,
  FactList,
  LiveRegion,
  OpsButton,
  OpsField,
  OpsHeading,
  Panel,
  type Signal,
  SignalBadge,
  Skeleton,
  StatTile,
  Td,
  Th,
  opsControl,
} from '@/components/ui/ops'
import { ago, commitRoster, count, fetchRosterImports, previewRoster, rollbackRoster, stamp } from '@/lib/admin'
import { useRealtime } from '@/lib/client/RealtimeProvider'
import { useMutation, useResource } from '@/lib/client/useResource'

const STATUS_SIGNAL: Record<RosterImportView['status'], Signal> = {
  DRY_RUN: 'idle',
  COMMITTED: 'go',
  ROLLED_BACK: 'info',
  FAILED: 'stop',
}

const STATUS_LABEL: Record<RosterImportView['status'], string> = {
  DRY_RUN: 'Preview',
  COMMITTED: 'Committed',
  ROLLED_BACK: 'Rolled back',
  FAILED: 'Failed',
}

/** Human bytes off a plain number. Kept local — the console has no shared formatter. */
function bytes(n: number): string {
  if (n < 1024) return `${String(n)} B`
  const kb = n / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

export function RosterConsole() {
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<RosterPreviewResponse | null>(null)
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [rollbackTarget, setRollbackTarget] = useState<RosterImportView | null>(null)
  const [confirmFilename, setConfirmFilename] = useState('')

  const previewM = useMutation<File, RosterPreviewResponse>(previewRoster)
  const commitM = useMutation<RosterCommitRequest, RosterCommitResponse>(commitRoster)
  const rollbackM = useMutation<RosterRollbackRequest, RosterRollbackResponse>(rollbackRoster)

  const imports = useResource(
    useCallback((signal: AbortSignal) => fetchRosterImports(signal), []),
    [],
  )
  const refreshImports = imports.refresh
  useRealtime({ 'roster.imported': () => refreshImports() })

  function reset() {
    setPreview(null)
    setAllowDuplicate(false)
    setClientError(null)
    previewM.reset()
    commitM.reset()
  }

  function choose(next: File | null) {
    reset()
    if (next === null) {
      setFile(null)
      return
    }
    // Guard on the client before a 20 MB upload leaves the device — the server
    // enforces the same limits, this just fails fast and says why.
    if (!(ROSTER_EXTENSIONS as readonly string[]).includes(fileExtension(next.name))) {
      setFile(null)
      setClientError(`Choose one of ${ROSTER_EXTENSIONS.join(', ')}.`)
      return
    }
    if (next.size > ROSTER_MAX_BYTES) {
      setFile(null)
      setClientError(`That file is ${bytes(next.size)} — the limit is ${bytes(ROSTER_MAX_BYTES)}.`)
      return
    }
    setFile(next)
  }

  async function runPreview() {
    if (file === null) return
    const result = await previewM.run(file)
    if (result.ok) {
      setPreview(result.data)
      setAllowDuplicate(false)
    }
  }

  const isDuplicate = preview !== null && preview.duplicateOf !== null
  const nothingToApply = preview !== null && preview.created + preview.updated === 0
  const commitBlocked = preview === null || nothingToApply || (isDuplicate && !allowDuplicate)

  async function runCommit() {
    if (preview === null) return
    const result = await commitM.run({
      importId: preview.importId,
      fileHash: preview.fileHash,
      allowDuplicateFile: allowDuplicate,
    })
    if (result.ok) {
      setNotice(
        `Roster committed — ${count(result.data.created)} added, ${count(result.data.updated)} updated.`,
      )
      setFile(null)
      reset()
      if (inputRef.current !== null) inputRef.current.value = ''
      refreshImports()
    }
  }

  function openRollback(target: RosterImportView) {
    rollbackM.reset()
    setConfirmFilename('')
    setRollbackTarget(target)
  }

  const filenameMatches = rollbackTarget !== null && confirmFilename.trim() === rollbackTarget.filename

  async function runRollback() {
    if (rollbackTarget === null || !filenameMatches) return
    const result = await rollbackM.run({
      importId: rollbackTarget.id,
      confirmFilename: confirmFilename.trim(),
    })
    if (result.ok) {
      setNotice(
        `Rolled back — ${count(result.data.deleted)} removed, ${count(result.data.restored)} restored` +
          (result.data.keptBecauseClaimed > 0
            ? `, ${count(result.data.keptBecauseClaimed)} kept because already claimed.`
            : '.'),
      )
      setRollbackTarget(null)
      setConfirmFilename('')
      refreshImports()
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <OpsHeading
        eyebrow="Admissions roster · the source of truth"
        title="Roster"
        lede="Upload the admissions workbook, read what every column resolved to, then commit. A commit can rename thousands of records, so nothing lands until you have seen the preview."
      />

      <div className="bg-warn/8 ring-warn/25 flex items-start gap-3 rounded-lg px-4 py-3 ring-1">
        <Icon name="alert" size={16} className="text-warn mt-0.5 shrink-0" />
        <p className="text-ops-soft text-sm">
          The workbook holds real admissions data. It is uploaded once, previewed, and dropped on commit — never stored
          on this device.
        </p>
      </div>

      <Panel title="Upload a workbook" icon="database" hint={`${ROSTER_EXTENSIONS.join(' · ')} · up to ${bytes(ROSTER_MAX_BYTES)}`}>
        <div className="flex flex-col gap-4">
          <input
            ref={inputRef}
            type="file"
            accept={ROSTER_EXTENSIONS.join(',')}
            className="sr-only"
            onChange={(event) => {
              choose(event.target.files?.[0] ?? null)
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <OpsButton
              variant="outline"
              icon="note"
              onClick={() => {
                inputRef.current?.click()
              }}
            >
              Choose file
            </OpsButton>
            {file !== null ? (
              <span className="text-ops-soft text-sm">
                <span className="text-ops-ink font-semibold">{file.name}</span> · {bytes(file.size)}
              </span>
            ) : (
              <span className="text-ops-faint text-sm">No file chosen.</span>
            )}
            <div className="ml-auto">
              <OpsButton variant="primary" icon="layers" onClick={() => { void runPreview() }} disabled={file === null || previewM.pending}>
                {previewM.pending ? 'Reading…' : 'Preview'}
              </OpsButton>
            </div>
          </div>

          {clientError !== null ? (
            <p className="text-stop flex items-center gap-1.5 text-sm font-semibold">
              <Icon name="alert" size={14} />
              {clientError}
            </p>
          ) : null}
          {previewM.error !== null ? <ErrorNote error={previewM.error} /> : null}
          {previewM.pending ? (
            <p className="text-ops-faint text-xs">Parsing 15,000 rows can take up to a minute. Keep this tab open.</p>
          ) : null}
        </div>
      </Panel>

      {preview !== null ? (
        <Panel
          title="Preview"
          icon="layers"
          hint={`${preview.filename} · ${count(preview.totalRows)} rows`}
          flush
        >
          <div className="flex flex-col gap-5 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile label="New" value={count(preview.created)} signal={preview.created > 0 ? 'go' : 'idle'} />
              <StatTile label="Updated" value={count(preview.updated)} signal={preview.updated > 0 ? 'info' : 'idle'} />
              <StatTile label="Unchanged" value={count(preview.unchanged)} />
              <StatTile label="Errored" value={count(preview.errored)} signal={preview.errored > 0 ? 'stop' : 'idle'} />
              <StatTile
                label="Absent from file"
                value={count(preview.absentFromFile)}
                note="Kept, never deleted"
              />
            </div>

            {isDuplicate ? (
              <div className="bg-warn/8 ring-warn/30 flex flex-col gap-3 rounded-lg px-4 py-3.5 ring-1">
                <div className="flex items-start gap-3">
                  <Icon name="alert" size={16} className="text-warn mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-ops-ink text-sm font-semibold">This exact file was already committed.</p>
                    <p className="text-ops-soft mt-0.5 text-xs">
                      {preview.duplicateOf?.filename}
                      {preview.duplicateOf?.committedAt != null
                        ? ` · committed ${stamp(preview.duplicateOf.committedAt)}`
                        : ''}
                      . Committing again re-applies every row and can double a count.
                    </p>
                  </div>
                </div>
                <OpsToggle
                  checked={allowDuplicate}
                  onChange={setAllowDuplicate}
                  label="Commit this duplicate anyway"
                  description="Only if you mean to re-apply the same workbook."
                />
              </div>
            ) : null}

            <section className="flex flex-col gap-2">
              <h3 className="text-ops-faint text-[0.6875rem] font-bold tracking-[0.11em] uppercase">Column mapping</h3>
              <p className="text-ops-soft text-xs">
                Each header, and the field it resolved to. Read this before committing — a shifted column shows up here.
              </p>
              <FactList
                className="mt-1"
                facts={Object.entries(preview.columnMap).map(([header, field]) => ({
                  label: header,
                  value: field,
                }))}
              />
              {preview.unmapped.length > 0 ? (
                <p className="text-warn mt-1 text-xs">
                  <span className="font-semibold">Unmapped:</span> {preview.unmapped.join(', ')} — these columns matched
                  no field and will be ignored.
                </p>
              ) : null}
            </section>

            {preview.issues.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-ops-faint text-[0.6875rem] font-bold tracking-[0.11em] uppercase">
                  Issues{preview.issuesTruncated ? ' (first shown)' : ''}
                </h3>
                <div className="ring-ops-line/70 overflow-hidden rounded-lg ring-1">
                  <DataTable
                    head={
                      <>
                        <Th>Row</Th>
                        <Th>Field</Th>
                        <Th>Severity</Th>
                        <Th>Detail</Th>
                      </>
                    }
                  >
                    {preview.issues.map((issue, i) => (
                      <tr key={`${String(issue.row)}-${issue.field}-${String(i)}`}>
                        <Td numeric>{issue.row}</Td>
                        <Td>{issue.field}</Td>
                        <Td>
                          <SignalBadge signal={issue.severity === 'error' ? 'stop' : 'warn'}>
                            {issue.severity === 'error' ? 'Error' : 'Warning'}
                          </SignalBadge>
                        </Td>
                        <Td>
                          <span className="text-ops-soft text-xs">
                            {issue.message}
                            {issue.value !== undefined ? <span className="text-ops-faint"> — “{issue.value}”</span> : null}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              </section>
            ) : null}

            {preview.sample.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-ops-faint text-[0.6875rem] font-bold tracking-[0.11em] uppercase">First rows</h3>
                <div className="ring-ops-line/70 overflow-hidden rounded-lg ring-1">
                  <DataTable
                    head={
                      <>
                        <Th>Form no.</Th>
                        <Th>Name</Th>
                        <Th>Programme</Th>
                        <Th>Level</Th>
                        <Th>Contact</Th>
                      </>
                    }
                  >
                    {preview.sample.map((row, i) => (
                      <tr key={`${row.formNumber}-${String(i)}`}>
                        <Td>{row.formNumber}</Td>
                        <Td>{row.name}</Td>
                        <Td>
                          <span className="text-ops-soft text-xs">{row.program}</span>
                        </Td>
                        <Td>
                          <span className="text-ops-soft text-xs">{row.programLevel}</span>
                        </Td>
                        <Td>
                          <span className="text-ops-faint text-xs">{row.contactNo ?? '—'}</span>
                        </Td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              </section>
            ) : null}

            {commitM.error !== null ? <ErrorNote error={commitM.error} /> : null}

            <div className="border-ops-line/70 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-ops-faint text-xs">
                {nothingToApply
                  ? 'Nothing new to apply — every row already matches.'
                  : `Will add ${count(preview.created)} and update ${count(preview.updated)} records.`}
              </p>
              <div className="flex gap-2">
                <OpsButton
                  variant="ghost"
                  onClick={() => {
                    setFile(null)
                    reset()
                    if (inputRef.current !== null) inputRef.current.value = ''
                  }}
                >
                  Discard
                </OpsButton>
                <OpsButton
                  variant="primary"
                  icon="check"
                  onClick={() => { void runCommit() }}
                  disabled={commitBlocked || commitM.pending}
                >
                  {commitM.pending ? 'Committing…' : 'Commit roster'}
                </OpsButton>
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel title="Import history" icon="clock" hint="Most recent first · only the latest committed import can be rolled back" flush>
        {imports.loading ? (
          <div className="p-5">
            <Skeleton rows={4} />
          </div>
        ) : imports.data === null || imports.data.items.length === 0 ? (
          imports.error !== null ? (
            <div className="p-5">
              <ErrorNote error={imports.error} onRetry={refreshImports} />
            </div>
          ) : (
            <EmptyState icon="database" title="No imports yet">
              Upload the admissions workbook above to seed the roster.
            </EmptyState>
          )
        ) : (
          <>
            <DataTable
              head={
                <>
                  <Th>File</Th>
                  <Th>Status</Th>
                  <Th align="right">Rows</Th>
                  <Th>When</Th>
                  <Th>By</Th>
                  <Th align="right">Action</Th>
                </>
              }
            >
              {imports.data.items.map((row) => (
                <tr key={row.id} className="hover:bg-ops-raise/40">
                  <Td>
                    <span className="text-ops-ink block font-semibold">{row.filename}</span>
                    {row.errored > 0 ? (
                      <span className="text-warn block text-xs">{count(row.errored)} errored</span>
                    ) : null}
                  </Td>
                  <Td>
                    <SignalBadge signal={STATUS_SIGNAL[row.status]}>{STATUS_LABEL[row.status]}</SignalBadge>
                  </Td>
                  <Td align="right" numeric>
                    <span title={`${count(row.created)} new · ${count(row.updated)} updated`}>{count(row.totalRows)}</span>
                  </Td>
                  <Td>
                    <span
                      className="text-ops-soft text-xs"
                      title={stamp(row.committedAt ?? row.rolledBackAt ?? row.createdAt)}
                    >
                      {ago(row.committedAt ?? row.rolledBackAt ?? row.createdAt)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-ops-faint text-xs">{row.uploadedBy ?? 'System'}</span>
                  </Td>
                  <Td align="right">
                    {row.canRollback ? (
                      <OpsButton size="sm" variant="danger" onClick={() => { openRollback(row) }}>
                        Roll back
                      </OpsButton>
                    ) : (
                      <span className="text-ops-faint text-xs">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </DataTable>
            {imports.error !== null ? (
              <div className="p-5 pt-4">
                <ErrorNote error={imports.error} />
              </div>
            ) : null}
          </>
        )}
      </Panel>

      <OpsModal
        open={rollbackTarget !== null}
        onClose={() => {
          setRollbackTarget(null)
        }}
        title="Roll back import"
        hint={rollbackTarget !== null ? rollbackTarget.filename : undefined}
        icon="alert"
        tone="danger"
        footer={
          <div className="flex justify-end gap-3">
            <OpsButton variant="ghost" onClick={() => { setRollbackTarget(null) }}>
              Cancel
            </OpsButton>
            <OpsButton
              variant="danger"
              onClick={() => { void runRollback() }}
              disabled={!filenameMatches || rollbackM.pending}
              data-autofocus
            >
              {rollbackM.pending ? 'Rolling back…' : 'Roll back'}
            </OpsButton>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-ops-soft text-sm">
            This undoes the most recent committed import. Records a student has already claimed are kept; everything else
            this import created is removed and any records it overwrote are restored. Type the filename to confirm.
          </p>
          <OpsField label="Confirm filename" htmlFor="roster-confirm" hint={rollbackTarget !== null ? `Type ${rollbackTarget.filename}` : undefined}>
            <input
              id="roster-confirm"
              className={opsControl}
              value={confirmFilename}
              onChange={(event) => {
                setConfirmFilename(event.target.value)
              }}
              autoComplete="off"
              spellCheck={false}
            />
          </OpsField>
          {confirmFilename.trim() !== '' && !filenameMatches ? (
            <p className="text-warn text-xs">That does not match the filename.</p>
          ) : null}
          {rollbackM.error !== null ? <ErrorNote error={rollbackM.error} /> : null}
        </div>
      </OpsModal>

      <LiveRegion>{notice}</LiveRegion>
    </div>
  )
}
