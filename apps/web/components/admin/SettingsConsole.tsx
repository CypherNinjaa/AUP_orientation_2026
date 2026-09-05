'use client'

/**
 * Settings — the switches that govern the event.
 *
 * Three independent panels, each with its own {@link useResource}:
 *  - Event policy: the registration window, moderation, and the DPDP retention clock.
 *  - Gates: where a pass is scanned; a closed gate refuses every code.
 *  - Storage credentials: the Cloudinary accounts selfies are written to.
 *
 * The ADMIN gate and the single `RealtimeProvider` live in `app/admin/layout.tsx`;
 * this file only *consumes* realtime (gates listen for `gate.config`). Every save
 * here is written to the append-only audit log by the server. Cloudinary secrets
 * are encrypted at rest and never selected back out — the response carries only a
 * masked key, so a secret cannot be shown again once saved.
 */

import { useCallback, useState } from 'react'

import {
  MAX_COMPANIONS,
  type CloudinaryAddRequest,
  type CloudinaryConfigView,
  type CloudinaryPrimaryView,
  type CloudinaryUpdateRequest,
  type GateUpdateRequest,
  type GateView,
  type SettingsResponse,
  type SettingsUpdateRequest,
} from '@orientation/contracts'

import { OpsModal, OpsToggle } from '@/components/admin/controls'
import { Icon } from '@/components/ui/Icon'
import {
  DataTable,
  EmptyState,
  ErrorNote,
  FactList,
  OpsButton,
  OpsField,
  OpsHeading,
  Panel,
  SignalBadge,
  Skeleton,
  Td,
  Th,
  opsControl,
} from '@/components/ui/ops'
import {
  addCloudinary,
  ago,
  count,
  fetchCloudinary,
  fetchGates,
  fetchSettings,
  isoToLocalInput,
  localInputToIso,
  refreshCloudinaryUsage,
  stamp,
  updateCloudinary,
  updateGate,
  updateSettings,
} from '@/lib/admin'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useRealtime } from '@/lib/client/RealtimeProvider'
import { useMutation, useResource } from '@/lib/client/useResource'

// ── local helpers ────────────────────────────────────────────────────────────

const GB = 1024 ** 3

/**
 * A byte count (carried as a string, since the source is a JSON string field)
 * rendered for a human. `null` and unparseable values read as an em dash.
 */
function formatBytes(value: string | null): string {
  if (value === null) return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (n < 1024) return `${String(n)} B`
  const units = ['KB', 'MB', 'GB', 'TB', 'PB']
  let size = n / 1024
  let i = 0
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i += 1
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[i] ?? ''}`
}

/** A stored byte limit shown as whole-ish GB for the edit form; blank when unset. */
function bytesToGbInput(value: string | null): string {
  if (value === null) return ''
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  return String(Math.round((n / GB) * 100) / 100)
}

/** A bounded integer parsed from a form field, or a sentence saying why not. */
function parseBounded(
  raw: string,
  min: number,
  max: number,
): { ok: true; value: number } | { ok: false; message: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: false, message: 'Enter a number.' }
  const n = Number(trimmed)
  if (!Number.isInteger(n)) return { ok: false, message: 'Whole numbers only.' }
  if (n < min || n > max) {
    return { ok: false, message: `Must be between ${String(min)} and ${String(max)}.` }
  }
  return { ok: true, value: n }
}

const BAR_TONE: Record<'go' | 'warn' | 'stop', string> = {
  go: 'bg-go',
  warn: 'bg-warn',
  stop: 'bg-stop',
}

/** A slim used/limit bar; renders nothing without a positive numeric limit. */
function UsageBar({ used, limit }: { used: string | null; limit: string | null }) {
  if (used === null || limit === null) return null
  const u = Number(used)
  const l = Number(limit)
  if (!Number.isFinite(u) || !Number.isFinite(l) || l <= 0) return null
  const pct = Math.min(100, Math.max(0, Math.round((u / l) * 100)))
  const tone = pct >= 90 ? 'stop' : pct >= 75 ? 'warn' : 'go'
  return (
    <div className="bg-ops mt-2 h-1.5 w-full overflow-hidden rounded-full" aria-hidden="true">
      <div className={cn('h-full rounded-full', BAR_TONE[tone])} style={{ width: `${String(pct)}%` }} />
    </div>
  )
}

// ── console ───────────────────────────────────────────────────────────────────

export function SettingsConsole() {
  return (
    <div className="flex flex-col gap-6">
      <OpsHeading
        eyebrow="System · policy, gates and storage"
        title="Settings"
        lede="The registration window, the gates a scanner can open, and the Cloudinary accounts selfies land in. Every change here is written to the audit log."
      />
      <PolicyPanel />
      <GatesPanel />
      <CloudinaryPanel />
    </div>
  )
}

// ── event policy ───────────────────────────────────────────────────────────────

function PolicyPanel() {
  const settings = useResource(
    useCallback((signal: AbortSignal) => fetchSettings(signal), []),
    [],
  )

  return (
    <Panel
      title="Event policy"
      icon="shield"
      hint="Registration window, moderation, and the DPDP retention clock"
    >
      {settings.loading ? (
        <Skeleton rows={5} />
      ) : settings.data === null ? (
        settings.error !== null ? (
          <ErrorNote error={settings.error} onRetry={settings.refresh} />
        ) : null
      ) : (
        <PolicyForm initial={settings.data} onSaved={settings.set} />
      )}
    </Panel>
  )
}

type NumField = 'selfieRetentionDays' | 'maxCompanions' | 'sseDegradeThreshold'

interface PolicyDraft {
  registrationOpen: boolean
  autoApprove: boolean
  registrationOpensAt: string
  registrationClosesAt: string
  selfieRetentionDays: string
  maxCompanions: string
  sseDegradeThreshold: string
  bumpManifest: boolean
}

function draftFrom(s: SettingsResponse): PolicyDraft {
  return {
    registrationOpen: s.registrationOpen,
    autoApprove: s.autoApprove,
    registrationOpensAt: isoToLocalInput(s.registrationOpensAt),
    registrationClosesAt: isoToLocalInput(s.registrationClosesAt),
    selfieRetentionDays: String(s.selfieRetentionDays),
    maxCompanions: String(s.maxCompanions),
    sseDegradeThreshold: String(s.sseDegradeThreshold),
    bumpManifest: false,
  }
}

function PolicyForm({
  initial,
  onSaved,
}: {
  initial: SettingsResponse
  onSaved: (next: SettingsResponse) => void
}) {
  const [current, setCurrent] = useState(initial)
  const [draft, setDraft] = useState<PolicyDraft>(() => draftFrom(initial))
  const [errors, setErrors] = useState<Partial<Record<NumField, string>>>({})
  const [notice, setNotice] = useState<string | null>(null)

  const saveM = useMutation<SettingsUpdateRequest, SettingsResponse>(updateSettings)

  function edit<K extends keyof PolicyDraft>(key: K, value: PolicyDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setNotice(null)
  }

  function editNum(key: NumField, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      if (prev[key] === undefined) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    setNotice(null)
  }

  async function submit() {
    setNotice(null)
    saveM.reset()

    const patch: SettingsUpdateRequest = {}
    const nextErrors: Partial<Record<NumField, string>> = {}

    if (draft.registrationOpen !== current.registrationOpen) {
      patch.registrationOpen = draft.registrationOpen
    }
    if (draft.autoApprove !== current.autoApprove) {
      patch.autoApprove = draft.autoApprove
    }

    // Compare datetimes on their local-input form, so an untouched field with a
    // different ISO offset does not read as an edit. Send back a UTC ISO (or null).
    if (draft.registrationOpensAt !== isoToLocalInput(current.registrationOpensAt)) {
      patch.registrationOpensAt = localInputToIso(draft.registrationOpensAt)
    }
    if (draft.registrationClosesAt !== isoToLocalInput(current.registrationClosesAt)) {
      patch.registrationClosesAt = localInputToIso(draft.registrationClosesAt)
    }

    const bounds: { key: NumField; min: number; max: number }[] = [
      { key: 'selfieRetentionDays', min: 1, max: 180 },
      { key: 'maxCompanions', min: 0, max: MAX_COMPANIONS },
      { key: 'sseDegradeThreshold', min: 100, max: 50_000 },
    ]
    for (const { key, min, max } of bounds) {
      if (draft[key] === String(current[key])) continue
      const parsed = parseBounded(draft[key], min, max)
      if (parsed.ok) {
        patch[key] = parsed.value
      } else {
        nextErrors[key] = parsed.message
      }
    }

    if (draft.bumpManifest) patch.bumpManifestVersion = true

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    if (Object.keys(patch).length === 0) {
      setNotice('Nothing to change.')
      return
    }

    const result = await saveM.run(patch)
    if (result.ok) {
      setCurrent(result.data)
      setDraft(draftFrom(result.data))
      setErrors({})
      onSaved(result.data)
      setNotice('Settings saved.')
    }
  }

  const generalError =
    saveM.error !== null &&
    (saveM.error.fields === undefined || Object.keys(saveM.error.fields).length === 0)
      ? saveM.error
      : null

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-2 sm:grid-cols-2">
        <OpsToggle
          checked={draft.registrationOpen}
          onChange={(v) => {
            edit('registrationOpen', v)
          }}
          label="Registration open"
          description="When off, the public form is closed and shows the closed notice."
        />
        <OpsToggle
          checked={draft.autoApprove}
          onChange={(v) => {
            edit('autoApprove', v)
          }}
          label="Auto-approve submissions"
          description="When off, every submission waits in the moderation queue for a pass."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <OpsField
          label="Registration opens"
          htmlFor="reg-opens"
          hint="Optional. Local time. Clear to leave open-ended."
          error={fieldError(saveM.error, 'registrationOpensAt')}
        >
          <input
            id="reg-opens"
            type="datetime-local"
            className={opsControl}
            value={draft.registrationOpensAt}
            onChange={(e) => {
              edit('registrationOpensAt', e.target.value)
            }}
          />
        </OpsField>
        <OpsField
          label="Registration closes"
          htmlFor="reg-closes"
          hint="Optional. Local time. Clear to leave open-ended."
          error={fieldError(saveM.error, 'registrationClosesAt')}
        >
          <input
            id="reg-closes"
            type="datetime-local"
            className={opsControl}
            value={draft.registrationClosesAt}
            onChange={(e) => {
              edit('registrationClosesAt', e.target.value)
            }}
          />
        </OpsField>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <OpsField
          label="Selfie retention (days)"
          htmlFor="retention"
          hint="DPDP. 1–180. A selfie is deleted this many days after capture."
          error={errors.selfieRetentionDays ?? fieldError(saveM.error, 'selfieRetentionDays')}
        >
          <input
            id="retention"
            type="number"
            min={1}
            max={180}
            className={opsControl}
            value={draft.selfieRetentionDays}
            onChange={(e) => {
              editNum('selfieRetentionDays', e.target.value)
            }}
          />
        </OpsField>
        <OpsField
          label="Max companions"
          htmlFor="companions"
          hint={`0–${String(MAX_COMPANIONS)} guests a student may bring.`}
          error={errors.maxCompanions ?? fieldError(saveM.error, 'maxCompanions')}
        >
          <input
            id="companions"
            type="number"
            min={0}
            max={MAX_COMPANIONS}
            className={opsControl}
            value={draft.maxCompanions}
            onChange={(e) => {
              editNum('maxCompanions', e.target.value)
            }}
          />
        </OpsField>
        <OpsField
          label="SSE degrade threshold"
          htmlFor="sse"
          hint="100–50,000 live connections before the stream falls back to polling."
          error={errors.sseDegradeThreshold ?? fieldError(saveM.error, 'sseDegradeThreshold')}
        >
          <input
            id="sse"
            type="number"
            min={100}
            max={50000}
            className={opsControl}
            value={draft.sseDegradeThreshold}
            onChange={(e) => {
              editNum('sseDegradeThreshold', e.target.value)
            }}
          />
        </OpsField>
      </div>

      <div className="bg-warn/8 ring-warn/25 rounded-lg px-1 ring-1">
        <OpsToggle
          checked={draft.bumpManifest}
          onChange={(v) => {
            edit('bumpManifest', v)
          }}
          label="Bump manifest version on save"
          description={`Forces every volunteer device to re-download its offline manifest. Currently v${String(current.manifestVersion)}.`}
        />
      </div>

      <FactList
        facts={[
          { label: 'Consent version', value: current.consentVersion },
          { label: 'Manifest version', value: `v${String(current.manifestVersion)}`, numeric: true },
          {
            label: 'Last updated',
            value: `${stamp(current.updatedAt)}${current.updatedBy !== null ? ` · ${current.updatedBy}` : ''}`,
          },
        ]}
      />

      {generalError !== null ? <ErrorNote error={generalError} /> : null}

      <div className="border-ops-line/70 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-ops-faint text-xs" aria-live="polite">
          {notice ?? 'Only the fields you change are sent.'}
        </p>
        <OpsButton
          variant="primary"
          icon="check"
          onClick={() => {
            void submit()
          }}
          disabled={saveM.pending}
        >
          {saveM.pending ? 'Saving…' : 'Save changes'}
        </OpsButton>
      </div>
    </div>
  )
}

// ── gates ──────────────────────────────────────────────────────────────────────

interface GateForm {
  code: string
  name: string
  isActive: boolean
  opensAt: string
  closesAt: string
}

const emptyGateForm: GateForm = { code: '', name: '', isActive: true, opensAt: '', closesAt: '' }

function GatesPanel() {
  const gates = useResource(
    useCallback((signal: AbortSignal) => fetchGates(signal), []),
    [],
  )
  const refresh = gates.refresh
  useRealtime({
    'gate.config': () => {
      refresh()
    },
  })

  const toggleM = useMutation<GateUpdateRequest, GateView>(updateGate)
  const upsertM = useMutation<GateUpdateRequest, GateView>(updateGate)
  const [busyCode, setBusyCode] = useState<string | null>(null)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [form, setForm] = useState<GateForm>(emptyGateForm)
  const [formNotice, setFormNotice] = useState<string | null>(null)

  async function toggle(gate: GateView) {
    setBusyCode(gate.code)
    const result = await toggleM.run({ code: gate.code, isActive: !gate.isActive })
    setBusyCode(null)
    if (result.ok) refresh()
  }

  function editGate(gate: GateView) {
    upsertM.reset()
    setFormNotice(null)
    setEditingCode(gate.code)
    setForm({
      code: gate.code,
      name: gate.name,
      isActive: gate.isActive,
      opensAt: isoToLocalInput(gate.opensAt),
      closesAt: isoToLocalInput(gate.closesAt),
    })
  }

  function newGate() {
    upsertM.reset()
    setFormNotice(null)
    setEditingCode(null)
    setForm(emptyGateForm)
  }

  async function submitGate() {
    upsertM.reset()
    setFormNotice(null)
    const code = form.code.trim().toUpperCase()
    if (code === '') {
      setFormNotice('A gate needs a code.')
      return
    }
    const body: GateUpdateRequest = {
      code,
      isActive: form.isActive,
      opensAt: localInputToIso(form.opensAt),
      closesAt: localInputToIso(form.closesAt),
    }
    const name = form.name.trim()
    if (name !== '') body.name = name

    const result = await upsertM.run(body)
    if (result.ok) {
      setFormNotice(`Gate ${result.data.code} saved.`)
      setEditingCode(null)
      setForm(emptyGateForm)
      refresh()
    }
  }

  const upsertGeneralError =
    upsertM.error !== null &&
    (upsertM.error.fields === undefined || Object.keys(upsertM.error.fields).length === 0)
      ? upsertM.error
      : null

  return (
    <Panel
      title="Gates"
      icon="pin"
      hint="Where a pass is scanned. A closed gate refuses every code."
      action={
        <OpsButton
          size="sm"
          variant="ghost"
          icon="search"
          onClick={() => {
            refresh()
          }}
          disabled={gates.refreshing}
        >
          {gates.refreshing ? 'Refreshing…' : 'Refresh'}
        </OpsButton>
      }
      flush
    >
      {gates.loading ? (
        <div className="p-5">
          <Skeleton rows={3} />
        </div>
      ) : gates.data === null ? (
        gates.error !== null ? (
          <div className="p-5">
            <ErrorNote error={gates.error} onRetry={refresh} />
          </div>
        ) : null
      ) : (
        <>
          {toggleM.error !== null ? (
            <div className="px-5 pt-5">
              <ErrorNote error={toggleM.error} />
            </div>
          ) : null}

          {gates.data.items.length === 0 ? (
            <EmptyState icon="pin" title="No gates yet">
              Add the first gate below. A scanner opens whichever gate it is assigned.
            </EmptyState>
          ) : (
            <DataTable
              head={
                <tr>
                  <Th>Code</Th>
                  <Th>Name</Th>
                  <Th>Status</Th>
                  <Th>Window</Th>
                  <Th align="right">Check-ins</Th>
                  <Th align="right">Actions</Th>
                </tr>
              }
            >
              {gates.data.items.map((gate) => (
                <tr key={gate.id} className="hover:bg-ops-raise/40">
                  <Td>
                    <span className="text-ops-ink font-bold tracking-wide">{gate.code}</span>
                  </Td>
                  <Td>
                    <span className="text-ops-soft">{gate.name}</span>
                  </Td>
                  <Td>
                    <SignalBadge signal={gate.isActive ? 'go' : 'idle'}>
                      {gate.isActive ? 'Active' : 'Off'}
                    </SignalBadge>
                  </Td>
                  <Td>
                    <span className="text-ops-soft text-xs">
                      {gate.opensAt === null && gate.closesAt === null
                        ? 'Any time'
                        : `${stamp(gate.opensAt)} – ${stamp(gate.closesAt)}`}
                    </span>
                  </Td>
                  <Td align="right" numeric>
                    {count(gate.checkInCount)}
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end gap-2">
                      <OpsButton
                        size="sm"
                        variant={gate.isActive ? 'ghost' : 'outline'}
                        onClick={() => {
                          void toggle(gate)
                        }}
                        disabled={busyCode === gate.code && toggleM.pending}
                      >
                        {busyCode === gate.code && toggleM.pending
                          ? '…'
                          : gate.isActive
                            ? 'Disable'
                            : 'Enable'}
                      </OpsButton>
                      <OpsButton
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          editGate(gate)
                        }}
                      >
                        Edit
                      </OpsButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </DataTable>
          )}

          <div className="border-ops-line/70 border-t p-5">
            <h3 className="text-ops-faint text-[0.6875rem] font-bold tracking-[0.11em] uppercase">
              {editingCode !== null ? `Edit gate ${editingCode}` : 'Add a gate'}
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <OpsField
                label="Code"
                htmlFor="gate-code"
                hint="Uppercased. A scanner's assignment."
                error={fieldError(upsertM.error, 'code')}
              >
                <input
                  id="gate-code"
                  className={opsControl}
                  value={form.code}
                  disabled={editingCode !== null}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, code: e.target.value }))
                  }}
                />
              </OpsField>
              <OpsField
                label="Name"
                htmlFor="gate-name"
                hint="Optional. Shown to volunteers."
                error={fieldError(upsertM.error, 'name')}
              >
                <input
                  id="gate-name"
                  className={opsControl}
                  value={form.name}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }}
                />
              </OpsField>
              <OpsField
                label="Opens"
                htmlFor="gate-opens"
                hint="Optional. Local time."
                error={fieldError(upsertM.error, 'opensAt')}
              >
                <input
                  id="gate-opens"
                  type="datetime-local"
                  className={opsControl}
                  value={form.opensAt}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, opensAt: e.target.value }))
                  }}
                />
              </OpsField>
              <OpsField
                label="Closes"
                htmlFor="gate-closes"
                hint="Optional. Local time."
                error={fieldError(upsertM.error, 'closesAt')}
              >
                <input
                  id="gate-closes"
                  type="datetime-local"
                  className={opsControl}
                  value={form.closesAt}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, closesAt: e.target.value }))
                  }}
                />
              </OpsField>
            </div>
            <div className="mt-3">
              <OpsToggle
                checked={form.isActive}
                onChange={(v) => {
                  setForm((p) => ({ ...p, isActive: v }))
                }}
                label="Active"
                description="An inactive gate refuses every scan."
              />
            </div>

            {upsertGeneralError !== null ? (
              <div className="mt-3">
                <ErrorNote error={upsertGeneralError} />
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-ops-faint text-xs" aria-live="polite">
                {formNotice ??
                  (editingCode !== null
                    ? 'Editing an existing gate. The code cannot change.'
                    : 'A new gate is live as soon as you add it.')}
              </p>
              <div className="flex gap-2">
                {editingCode !== null ? (
                  <OpsButton variant="ghost" onClick={newGate}>
                    Cancel
                  </OpsButton>
                ) : null}
                <OpsButton
                  variant="primary"
                  icon="check"
                  onClick={() => {
                    void submitGate()
                  }}
                  disabled={upsertM.pending || form.code.trim() === ''}
                >
                  {upsertM.pending ? 'Saving…' : editingCode !== null ? 'Save gate' : 'Add gate'}
                </OpsButton>
              </div>
            </div>
          </div>
        </>
      )}
    </Panel>
  )
}

// ── storage credentials ─────────────────────────────────────────────────────────

interface AddForm {
  label: string
  cloudName: string
  apiKey: string
  apiSecret: string
  priority: string
  storageLimitGb: string
}

const emptyAddForm: AddForm = {
  label: '',
  cloudName: '',
  apiKey: '',
  apiSecret: '',
  priority: '100',
  storageLimitGb: '',
}

interface EditForm {
  label: string
  isActive: boolean
  priority: string
  storageLimitGb: string
  clearError: boolean
}

type CloudNumField = 'priority' | 'storageLimitBytes'

function CloudinaryPanel() {
  const cloud = useResource(
    useCallback((signal: AbortSignal) => fetchCloudinary(signal), []),
    [],
  )
  const refresh = cloud.refresh

  const usageM = useMutation<string, CloudinaryConfigView>(refreshCloudinaryUsage)
  const addM = useMutation<CloudinaryAddRequest, CloudinaryConfigView>(addCloudinary)
  const editM = useMutation<{ id: string; body: CloudinaryUpdateRequest }, CloudinaryConfigView>(
    useCallback(
      ({ id, body }: { id: string; body: CloudinaryUpdateRequest }) => updateCloudinary(id, body),
      [],
    ),
  )

  const [usageBusy, setUsageBusy] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<AddForm>(emptyAddForm)
  const [addNum, setAddNum] = useState<Partial<Record<CloudNumField, string>>>({})
  const [editing, setEditing] = useState<CloudinaryConfigView | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [editNumErr, setEditNumErr] = useState<Partial<Record<CloudNumField, string>>>({})

  async function checkUsage(id: string) {
    setUsageBusy(id)
    const result = await usageM.run(id)
    setUsageBusy(null)
    if (result.ok) refresh()
  }

  function openAdd() {
    addM.reset()
    setAddNum({})
    setAddForm(emptyAddForm)
    setAddOpen(true)
  }

  async function submitAdd() {
    addM.reset()
    const nums: Partial<Record<CloudNumField, string>> = {}

    const priority = parseBounded(addForm.priority, 1, 999)
    if (!priority.ok) nums.priority = priority.message

    let storageLimitBytes: number | undefined
    const limRaw = addForm.storageLimitGb.trim()
    if (limRaw !== '') {
      const gb = Number(limRaw)
      if (!Number.isFinite(gb) || gb < 0) {
        nums.storageLimitBytes = 'GB, 0 or more.'
      } else {
        storageLimitBytes = Math.round(gb * GB)
      }
    }

    setAddNum(nums)
    if (Object.keys(nums).length > 0 || !priority.ok) return

    const body: CloudinaryAddRequest = {
      label: addForm.label.trim(),
      cloudName: addForm.cloudName.trim(),
      apiKey: addForm.apiKey.trim(),
      apiSecret: addForm.apiSecret,
      priority: priority.value,
      ...(storageLimitBytes !== undefined ? { storageLimitBytes } : {}),
    }
    const result = await addM.run(body)
    if (result.ok) {
      setAddOpen(false)
      setAddForm(emptyAddForm)
      refresh()
    }
  }

  function openEdit(item: CloudinaryConfigView) {
    editM.reset()
    setEditNumErr({})
    setEditing(item)
    setEditForm({
      label: item.label,
      isActive: item.isActive,
      priority: String(item.priority),
      storageLimitGb: bytesToGbInput(item.storageLimitBytes),
      clearError: false,
    })
  }

  function closeEdit() {
    setEditing(null)
    setEditForm(null)
    setEditNumErr({})
  }

  async function submitEdit() {
    if (editing === null || editForm === null) return
    editM.reset()
    const nums: Partial<Record<CloudNumField, string>> = {}

    const priority = parseBounded(editForm.priority, 1, 999)
    if (!priority.ok) nums.priority = priority.message

    // Blank clears the limit; a value sets it. Always sent, so the request is never empty.
    let storageLimitBytes: number | null = null
    const limRaw = editForm.storageLimitGb.trim()
    if (limRaw !== '') {
      const gb = Number(limRaw)
      if (!Number.isFinite(gb) || gb < 0) {
        nums.storageLimitBytes = 'GB, 0 or more.'
      } else {
        storageLimitBytes = Math.round(gb * GB)
      }
    }

    setEditNumErr(nums)
    if (Object.keys(nums).length > 0 || !priority.ok) return

    const body: CloudinaryUpdateRequest = {
      label: editForm.label.trim(),
      isActive: editForm.isActive,
      priority: priority.value,
      storageLimitBytes,
      ...(editForm.clearError ? { clearError: true } : {}),
    }
    const result = await editM.run({ id: editing.id, body })
    if (result.ok) {
      closeEdit()
      refresh()
    }
  }

  const addGeneralError =
    addM.error !== null &&
    (addM.error.fields === undefined || Object.keys(addM.error.fields).length === 0)
      ? addM.error
      : null
  const editGeneralError =
    editM.error !== null &&
    (editM.error.fields === undefined || Object.keys(editM.error.fields).length === 0)
      ? editM.error
      : null

  return (
    <Panel
      title="Storage credentials"
      icon="cloud"
      hint="The Cloudinary accounts selfies are written to. Secrets are encrypted and never shown again."
      action={
        <div className="flex gap-2">
          <OpsButton
            size="sm"
            variant="ghost"
            icon="search"
            onClick={() => {
              refresh()
            }}
            disabled={cloud.refreshing}
          >
            {cloud.refreshing ? 'Refreshing…' : 'Refresh'}
          </OpsButton>
          <OpsButton size="sm" variant="primary" onClick={openAdd}>
            Add account
          </OpsButton>
        </div>
      }
      flush
    >
      {cloud.loading ? (
        <div className="p-5">
          <Skeleton rows={4} />
        </div>
      ) : cloud.data === null ? (
        cloud.error !== null ? (
          <div className="p-5">
            <ErrorNote error={cloud.error} onRetry={refresh} />
          </div>
        ) : null
      ) : (
        <div className="flex flex-col gap-5 p-5">
          {usageM.error !== null ? <ErrorNote error={usageM.error} /> : null}

          <PrimaryCard primary={cloud.data.primary} />

          {cloud.data.items.length === 0 ? (
            <EmptyState icon="cloud" title="No spare accounts">
              The primary account above handles uploads. Add a spare to fail over when it fills or
              errors.
            </EmptyState>
          ) : (
            <DataTable
              head={
                <tr>
                  <Th>Account</Th>
                  <Th align="right">Priority</Th>
                  <Th>Status</Th>
                  <Th>Storage</Th>
                  <Th align="right">Uploads</Th>
                  <Th align="right">Actions</Th>
                </tr>
              }
            >
              {cloud.data.items.map((item) => (
                <tr key={item.id} className="hover:bg-ops-raise/40 align-top">
                  <Td>
                    <span className="text-ops-ink block font-semibold">{item.label}</span>
                    <span className="text-ops-faint block text-xs">
                      {item.cloudName} · key ••••{item.apiKeyMasked}
                    </span>
                  </Td>
                  <Td align="right" numeric>
                    {item.priority}
                  </Td>
                  <Td>
                    <SignalBadge
                      signal={item.isActive ? (item.lastError !== null ? 'warn' : 'go') : 'idle'}
                    >
                      {item.isActive ? (item.lastError !== null ? 'Erroring' : 'Active') : 'Off'}
                    </SignalBadge>
                    {item.lastError !== null ? (
                      <span className="text-warn mt-1 block max-w-[16rem] text-xs">
                        {item.lastError}
                        {item.lastErrorAt !== null ? ` · ${ago(item.lastErrorAt)}` : ''}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <span className="text-ops-soft text-xs">
                      {formatBytes(item.storageUsedBytes)}
                      {item.storageLimitBytes !== null
                        ? ` / ${formatBytes(item.storageLimitBytes)}`
                        : ''}
                    </span>
                    <UsageBar used={item.storageUsedBytes} limit={item.storageLimitBytes} />
                    <span className="text-ops-faint mt-1 block text-xs">
                      checked {ago(item.usageCheckedAt)}
                    </span>
                  </Td>
                  <Td align="right" numeric>
                    {count(item.uploadCount)}
                  </Td>
                  <Td align="right">
                    <div className="flex flex-col items-end gap-2">
                      <OpsButton
                        size="sm"
                        variant="ghost"
                        icon="search"
                        onClick={() => {
                          void checkUsage(item.id)
                        }}
                        disabled={usageBusy === item.id && usageM.pending}
                      >
                        {usageBusy === item.id && usageM.pending ? 'Checking…' : 'Check usage'}
                      </OpsButton>
                      <OpsButton
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          openEdit(item)
                        }}
                      >
                        Edit
                      </OpsButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      )}

      {/* Add account */}
      <OpsModal
        open={addOpen}
        onClose={() => {
          setAddOpen(false)
        }}
        title="Add a Cloudinary account"
        hint="A spare, tried after the primary in priority order. The secret is encrypted at rest and never shown again."
        icon="cloud"
        footer={
          <>
            <OpsButton
              variant="ghost"
              onClick={() => {
                setAddOpen(false)
              }}
            >
              Cancel
            </OpsButton>
            <OpsButton
              variant="primary"
              icon="check"
              onClick={() => {
                void submitAdd()
              }}
              disabled={addM.pending}
            >
              {addM.pending ? 'Adding…' : 'Add account'}
            </OpsButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <OpsField label="Label" htmlFor="cl-label" error={fieldError(addM.error, 'label')}>
            <input
              id="cl-label"
              className={opsControl}
              value={addForm.label}
              data-autofocus
              onChange={(e) => {
                setAddForm((p) => ({ ...p, label: e.target.value }))
              }}
            />
          </OpsField>
          <div className="grid gap-4 sm:grid-cols-2">
            <OpsField
              label="Cloud name"
              htmlFor="cl-cloud"
              hint="Lowercase, as shown in your Cloudinary console."
              error={fieldError(addM.error, 'cloudName')}
            >
              <input
                id="cl-cloud"
                className={opsControl}
                value={addForm.cloudName}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setAddForm((p) => ({ ...p, cloudName: e.target.value }))
                }}
              />
            </OpsField>
            <OpsField
              label="API key"
              htmlFor="cl-key"
              hint="Digits only."
              error={fieldError(addM.error, 'apiKey')}
            >
              <input
                id="cl-key"
                className={opsControl}
                value={addForm.apiKey}
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => {
                  setAddForm((p) => ({ ...p, apiKey: e.target.value }))
                }}
              />
            </OpsField>
          </div>
          <OpsField
            label="API secret"
            htmlFor="cl-secret"
            hint="Encrypted at rest. Never displayed after saving."
            error={fieldError(addM.error, 'apiSecret')}
          >
            <input
              id="cl-secret"
              type="password"
              className={opsControl}
              value={addForm.apiSecret}
              autoComplete="off"
              onChange={(e) => {
                setAddForm((p) => ({ ...p, apiSecret: e.target.value }))
              }}
            />
          </OpsField>
          <div className="grid gap-4 sm:grid-cols-2">
            <OpsField
              label="Priority"
              htmlFor="cl-prio"
              hint="1–999. Lower is tried first."
              error={addNum.priority ?? fieldError(addM.error, 'priority')}
            >
              <input
                id="cl-prio"
                type="number"
                min={1}
                max={999}
                className={opsControl}
                value={addForm.priority}
                onChange={(e) => {
                  setAddForm((p) => ({ ...p, priority: e.target.value }))
                }}
              />
            </OpsField>
            <OpsField
              label="Storage limit (GB)"
              htmlFor="cl-limit"
              hint="Optional. Blank for no limit."
              error={addNum.storageLimitBytes ?? fieldError(addM.error, 'storageLimitBytes')}
            >
              <input
                id="cl-limit"
                type="number"
                min={0}
                className={opsControl}
                value={addForm.storageLimitGb}
                onChange={(e) => {
                  setAddForm((p) => ({ ...p, storageLimitGb: e.target.value }))
                }}
              />
            </OpsField>
          </div>
          {addGeneralError !== null ? <ErrorNote error={addGeneralError} /> : null}
        </div>
      </OpsModal>

      {/* Edit account */}
      <OpsModal
        open={editing !== null && editForm !== null}
        onClose={closeEdit}
        title={editing !== null ? `Edit ${editing.label}` : 'Edit account'}
        hint="The cloud name, key and secret cannot change here — add a new account instead."
        icon="cloud"
        footer={
          <>
            <OpsButton variant="ghost" onClick={closeEdit}>
              Cancel
            </OpsButton>
            <OpsButton
              variant="primary"
              icon="check"
              onClick={() => {
                void submitEdit()
              }}
              disabled={editM.pending}
            >
              {editM.pending ? 'Saving…' : 'Save account'}
            </OpsButton>
          </>
        }
      >
        {editForm !== null ? (
          <div className="flex flex-col gap-4">
            <OpsField label="Label" htmlFor="ed-label" error={fieldError(editM.error, 'label')}>
              <input
                id="ed-label"
                className={opsControl}
                value={editForm.label}
                data-autofocus
                onChange={(e) => {
                  setEditForm((p) => (p === null ? p : { ...p, label: e.target.value }))
                }}
              />
            </OpsField>
            <div className="grid gap-4 sm:grid-cols-2">
              <OpsField
                label="Priority"
                htmlFor="ed-prio"
                hint="1–999. Lower is tried first."
                error={editNumErr.priority ?? fieldError(editM.error, 'priority')}
              >
                <input
                  id="ed-prio"
                  type="number"
                  min={1}
                  max={999}
                  className={opsControl}
                  value={editForm.priority}
                  onChange={(e) => {
                    setEditForm((p) => (p === null ? p : { ...p, priority: e.target.value }))
                  }}
                />
              </OpsField>
              <OpsField
                label="Storage limit (GB)"
                htmlFor="ed-limit"
                hint="Blank clears the limit."
                error={editNumErr.storageLimitBytes ?? fieldError(editM.error, 'storageLimitBytes')}
              >
                <input
                  id="ed-limit"
                  type="number"
                  min={0}
                  className={opsControl}
                  value={editForm.storageLimitGb}
                  onChange={(e) => {
                    setEditForm((p) => (p === null ? p : { ...p, storageLimitGb: e.target.value }))
                  }}
                />
              </OpsField>
            </div>
            <OpsToggle
              checked={editForm.isActive}
              onChange={(v) => {
                setEditForm((p) => (p === null ? p : { ...p, isActive: v }))
              }}
              label="Active"
              description="An inactive account is skipped in the failover order."
            />
            {editing !== null && editing.lastError !== null ? (
              <OpsToggle
                checked={editForm.clearError}
                onChange={(v) => {
                  setEditForm((p) => (p === null ? p : { ...p, clearError: v }))
                }}
                label="Clear the last error"
                description={editing.lastError}
              />
            ) : null}
            {editGeneralError !== null ? <ErrorNote error={editGeneralError} /> : null}
          </div>
        ) : null}
      </OpsModal>
    </Panel>
  )
}

function PrimaryCard({ primary }: { primary: CloudinaryPrimaryView }) {
  return (
    <div className="bg-ops-raise/40 ring-ops-line/70 rounded-xl p-4 ring-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-ops-faint text-[0.6875rem] font-bold tracking-[0.11em] uppercase">
            Primary · from environment
          </p>
          <p className="text-ops-ink mt-1 flex items-center gap-2 font-bold">
            <Icon name="cloud" className="text-ops-faint size-4" />
            {primary.configured ? primary.cloudName : 'Not configured'}
          </p>
          {primary.configured ? (
            <p className="text-ops-faint text-xs">key ••••{primary.apiKeyMasked}</p>
          ) : null}
        </div>
        <SignalBadge signal={primary.configured ? 'go' : 'stop'}>
          {primary.configured ? 'Configured' : 'Missing'}
        </SignalBadge>
      </div>
      {primary.configured ? (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ops-soft">
              {formatBytes(primary.storageUsedBytes)}
              {primary.storageLimitBytes !== null
                ? ` of ${formatBytes(primary.storageLimitBytes)}`
                : ' used'}
            </span>
            <span className="text-ops-faint">checked {ago(primary.usageCheckedAt)}</span>
          </div>
          <UsageBar used={primary.storageUsedBytes} limit={primary.storageLimitBytes} />
        </div>
      ) : null}
    </div>
  )
}
