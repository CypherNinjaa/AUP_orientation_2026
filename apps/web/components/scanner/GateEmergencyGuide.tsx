'use client'

import { Icon } from '@/components/ui/Icon'
import { EVENT } from '@/lib/event'

interface GateEmergencyGuideProps {
  gateCode: string
  clockOffsetMs: number | null
  passCount: number
  online: boolean
}

export function GateEmergencyGuide({
  gateCode,
  clockOffsetMs,
  passCount,
  online,
}: GateEmergencyGuideProps) {
  const contacts = [
    { title: 'Control Room / Admin', phone: EVENT.helpline, desc: 'Immediate incident or policy escalation' },
    { title: 'Campus Security Gate 1', phone: '+919102401102', desc: 'Crowd management or gate assistance' },
    { title: 'First Aid & Medical Station', phone: '+919102401103', desc: 'Ambulance or health emergencies' },
    { title: 'Admissions Desk', phone: '+919102401104', desc: 'Unregistered or unverified admissions' },
  ]

  const faqs = [
    {
      q: 'Student has a dead phone battery or no pass?',
      a: 'Switch to the "Help Desk" tab on this dashboard. Ask for their official Admission Form Number or full name to view their record and admit them directly.',
    },
    {
      q: 'QR Code is damaged, unreadable, or blurry?',
      a: 'Switch to the "Keypad" tab on the Scan Station and type the 10-digit pass code printed or written below the QR code.',
    },
    {
      q: 'Screen displays ALREADY USED or DUPLICATE?',
      a: 'Check with the student if they exited and re-entered. If this is disputed, tap "Dispute / Lookup" in the verdict card to see the original check-in timestamp and gate.',
    },
    {
      q: 'Campus Wi-Fi drops or network is offline?',
      a: 'Do not panic. Your device is running fully offline. It contains the approved manifest and ECDSA public key in local storage. Continue scanning normally; all scans queue in your outbox and sync automatically once signal returns.',
    },
    {
      q: 'Accompanying parents or guardians?',
      a: 'Family members ride on the student pass. Verify the companion count on the admission card and use the + / - buttons to adjust the actual number entering.',
    },
  ]

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Emergency Contacts */}
      <div className="bg-white border border-slate-200/90 shadow-xs rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-100">
          <span className="grid size-8 place-items-center rounded-xl bg-rose-50 text-rose-600 border border-rose-200/70">
            <Icon name="phone" size={17} />
          </span>
          <div>
            <h3 className="text-sm font-extrabold text-navy">Gate Emergency & Control Room Helplines</h3>
            <p className="text-xs text-slate-500 font-medium">Instant click-to-call direct lines for gate operations</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3.5">
          {contacts.map((contact) => (
            <a
              key={contact.title}
              href={`tel:${contact.phone}`}
              className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-paper-tint border border-slate-200 hover:border-violet hover:bg-white transition-all shadow-xs group"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-navy group-hover:text-violet transition-colors">{contact.title}</p>
                <p className="text-[0.6875rem] text-slate-500 truncate mt-0.5">{contact.desc}</p>
                <p className="font-mono text-xs font-bold text-navy mt-1">{contact.phone}</p>
              </div>
              <span className="size-8 grid place-items-center rounded-lg bg-violet/10 text-violet border border-violet/20 shrink-0 group-hover:bg-violet group-hover:text-white transition-all">
                <Icon name="phone" size={14} />
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Volunteer Protocol & FAQs */}
      <div className="bg-white border border-slate-200/90 shadow-xs rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-100">
          <span className="grid size-8 place-items-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200/70">
            <Icon name="shield" size={17} />
          </span>
          <div>
            <h3 className="text-sm font-extrabold text-navy">Gate Protocols & Dispute Guidelines</h3>
            <p className="text-xs text-slate-500 font-medium">Standard operating instructions for common gate incidents</p>
          </div>
        </div>

        <div className="divide-y divide-slate-100 mt-1">
          {faqs.map((faq, idx) => (
            <div key={idx} className="py-3.5">
              <h4 className="text-xs font-bold text-navy mb-1 flex items-start gap-2">
                <span className="text-violet font-mono font-bold">0{idx + 1}.</span>
                <span>{faq.q}</span>
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed pl-6">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Device Diagnostics */}
      <div className="bg-white border border-slate-200/90 shadow-xs rounded-2xl p-4 sm:p-5">
        <h4 className="text-[0.6875rem] font-bold text-slate-500 uppercase tracking-wider mb-2.5">
          Station Device Diagnostics
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          <div className="bg-paper-tint p-2.5 rounded-xl border border-slate-200/70">
            <span className="text-slate-400 block text-[0.6875rem]">Gate Assignment</span>
            <span className="text-navy font-bold">{gateCode}</span>
          </div>
          <div className="bg-paper-tint p-2.5 rounded-xl border border-slate-200/70">
            <span className="text-slate-400 block text-[0.6875rem]">Network State</span>
            <span className={online ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
              {online ? 'Online Connected' : 'Offline Mode'}
            </span>
          </div>
          <div className="bg-paper-tint p-2.5 rounded-xl border border-slate-200/70">
            <span className="text-slate-400 block text-[0.6875rem]">Clock Drift</span>
            <span className="text-navy font-bold">
              {clockOffsetMs === null ? '0ms' : `${Math.round(clockOffsetMs)}ms`}
            </span>
          </div>
          <div className="bg-paper-tint p-2.5 rounded-xl border border-slate-200/70">
            <span className="text-slate-400 block text-[0.6875rem]">Pass Cache</span>
            <span className="text-navy font-bold">{passCount} cached</span>
          </div>
        </div>
      </div>
    </div>
  )
}
