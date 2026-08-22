# 01 — Decisions & Scope

Every decision below is recorded with its rationale so that in three months you can tell the difference
between *a choice* and *an accident*. When you disagree with one, change it here first.

---

## 1. Decision log

| # | Decision | Rationale | Reversibility |
| :-- | :--- | :--- | :--- |
| **D1** | **Next.js 15 monolith + one worker service** — not NestJS + separate React SPA | One deployable, one auth context, no CORS, one env set. You are the only person who will debug this at 9 AM with 400 students queued. Two runtimes is the wrong thing to own alone under pressure. | Medium — domain logic lives in `packages/core`, framework-agnostic |
| **D2** | **Single gate entry** — one check-in per pass, ever | Confirmed requirement. Collapses the check-in model to a 1:1 relation with a unique constraint, which is what makes duplicate prevention provable. | Hard — schema-level |
| **D3** | **Live selfie is the anti-impersonation control** | Master data is unreliable and has no photos. A selfie captured at registration and shown to the volunteer at scan time is the only verification that actually works here. | Easy |
| **D4** | **`face-api.js` client-side, detection only** | Free, runs on-device, rejects memes/blank walls/multi-face at capture. It is **not** liveness — a printed photo defeats it. Acceptable because a human eyeballs the match at the gate. | Easy |
| **D5** | **ECDSA P-256 signatures on the QR — not HMAC** | ⚠️ **Corrects the original spec.** HMAC verification requires the signing secret; offline verification would mean shipping that secret to every volunteer phone, so one lost phone = unlimited forged passes. ECDSA ships only a public key. | Hard — changes pass format |
| **D6** | **10-digit fallback code, displayed `123-456-7890`** | ⚠️ **Corrects the original spec.** 15,000 codes in a 6-digit space = one valid code every 67 guesses. 10 digits = 1 in 666,666, same numeric-keypad typing speed. Configurable length; rate-limited regardless. | Easy — config value |
| **D7** | **Full offline manifest on device, verification data only — no selfies cached** | 15k records ≈ 2.7 MB raw / ~700 KB gzipped. Caching 15,000 faces on volunteer phones turns a lost phone into a DPDP incident. Selfies are fetched live when online and gracefully hidden when not. | Easy — manifest is versioned |
| **D8** | **Scan decision is a pure function shared by client and server** | `packages/core/scan/decide.ts` is imported by both the offline scanner and the sync endpoint. One implementation, one set of tests, identical verdicts online and offline. This is what makes offline mode trustworthy. | — foundational |
| **D9** | **Write-order-wins conflict resolution** | First check-in row to reach Postgres owns the pass; every later scan is recorded as a `DUPLICATE` attempt referencing it. No destructive updates, no rewritten audit history. Operationally identical to earliest-timestamp-wins (the student is inside either way). | Medium |
| **D10** | **SSE + Redis pub/sub for realtime — not Socket.io** | Native to Next.js route handlers, no extra always-on service, `EventSource` reconnects for free, cheap at 8k+ concurrent connections. Chat sends over `POST`; ~1 RTT is irrelevant for text. | Medium |
| **D11** | **Guest rides on the student's pass** | `guestCount` on the registration. Scanner displays `RAHUL K. · CSE · +1 guest (father)`. No second pass to issue, deliver, or reconcile. | Easy |
| **D12** | **Pass delivered in-app + PDF download. No email, no WhatsApp.** | Master data has no reliable emails; WhatsApp Business needs a BSP, template approval, and per-message spend. PDF covers dead-battery and print cases at zero cost. | Easy |
| **D13** | **Keep Clerk, behind a thin auth adapter** | Confirmed choice — best-in-class DX and admin MFA out of the box. But see [Cost](08-build-plan.md#cost-model): its free tier is ~10k MAU and you have 15k+ users. All Clerk calls go through `packages/core/auth`, so swapping to Better Auth is a day's work, not a rewrite. | Easy **by design** |
| **D14** | **Cloudflare R2 for object storage — not Cloudinary** | Private buckets with signed URLs (required for selfies), 10 GB free, **zero egress fees**. 15k selfies ≈ 3.75 GB. Public gallery served through `next/image`. | Easy |
| **D15** | **No FFmpeg worker. Compress media before upload.** | ⚠️ **Cut from the original spec.** Server-side transcoding is the least justified component in it: high memory/CPU on Railway, a whole job pipeline, for a gallery of maybe 40 files you upload once. Compress locally with the `ffmpeg` CLI. | Easy — add later if truly needed |
| **D16** | **Curated FAQ + fuzzy search. No LLM in v1.** | An LLM answering official university questions can invent a dress code or a bus time. On a sanctioned deployment that is a reputational risk with no upside a good FAQ doesn't cover. Volunteer chat handles the long tail. | Easy — content index is LLM-ready |
| **D17** | **English only** | Confirmed. Strings still live in one module (no literals in JSX) so Hindi is a translation task, not a refactor — costs nothing now. | Easy |
| **D18** | **Gates are a configurable admin entity** | Launching with 1 gate and 5–10 devices, but gate topology is data, not code. Set at event time. | Easy |
| **D19** | **Split UI skin: light institutional for public/student, dark console for operators** | Gold `#FFB200` on cream is **1.65:1 — a WCAG AA failure**. Dark glassmorphism is hard to read on a phone in direct sunlight at a gate. Operators get contrast, density, and 56px targets; students get warmth and credibility. One token set, two themes. | Easy |
| **D20** | **Every write is audited, append-only** | Official deployment. "Who revoked this pass?" and "who checked this student in?" must be answerable months later. | — foundational |

---

## 2. In scope for v1

Grouped by the persona that consumes it.

### Public (no login)
- Home with countdown, About, Schedule (with live *Happening Now* / *Up Next*), Speakers, Gallery, 2D campus map, Contact
- Announcement ticker (live, SSE)
- FAQ with instant search

### Student
- Clerk sign-in (email + Google)
- **Registration wizard**: record lookup → confirm details → accompanying guest → live selfie → consent → pass issued
- Digital pass: signed QR + Code128 barcode + 10-digit code, PDF download
- Help desk: FAQ search → escalate to live volunteer chat

### Volunteer
- PWA scanner: camera QR, camera barcode, typed code
- **Fully offline capable** — manifest on device, local verdict, queued sync
- Selfie displayed for face match when online
- Live verdict feedback: colour + icon + text + haptic + tone
- Personal scan counter, sync status indicator
- Help desk queue and chat
- Help-desk registration wizard (register a walk-in student on the spot)

### Admin
- Roster ingestion: upload → **column mapper** → dry-run validation report → commit, with dedupe and rollback
- Live mission control: arrivals/minute, total vs checked-in, branch distribution, per-device status
- Registration registry: search, filter, revoke, regenerate, manual check-in
- Emergency broadcast (priority levels)
- Selfie moderation queue (flagged only)
- Device enrolment and approval
- Pass policy config (validity window, gate lock, registration open/close)
- Audit log viewer
- Excel/PDF export: attendance, absentees, per-branch

---

## 3. Explicitly out of scope for v1

Writing these down is what keeps the project finishable. Each has a trigger for revisiting.

| Not building | Why | Revisit when |
| :--- | :--- | :--- |
| Server-side FFmpeg transcoding | High infra cost, ~40 files uploaded once ([D15](#1-decision-log)) | Gallery becomes user-generated |
| LLM assistant | Hallucination risk on official content ([D16](#1-decision-log)) | FAQ deflection rate proves insufficient after event 1 |
| Email / SMS / WhatsApp pass delivery | No reliable emails; per-message cost and BSP approval ([D12](#1-decision-log)) | Admissions supplies verified contact data |
| Per-session / per-venue attendance | Single gate entry confirmed ([D2](#1-decision-log)) | University wants session-level analytics |
| Separate guest passes | Guest rides along ([D11](#1-decision-log)) | Guests need independent arrival |
| Hindi / multi-language | English only confirmed ([D17](#1-decision-log)) | Parent-facing feedback demands it |
| Native iOS/Android apps | PWA covers camera, offline storage, and install | App-store distribution is mandated |
| Automated face matching / liveness API | Human verification at the gate is sufficient and free ([D4](#1-decision-log)) | Impersonation is actually observed |
| Multi-event / multi-tenant | This is one event for one campus | University asks to reuse it for Convocation |
| Selfies cached offline on devices | DPDP blast radius ([D7](#1-decision-log)) | Never, without device-bound encryption + auto-wipe |

---

## 4. Open questions still to resolve

These block specific phases, not the whole project. Resolve before the phase starts.

| Question | Blocks | Owner |
| :--- | :--- | :--- |
| **What is the actual event date?** | Everything — see [R1](08-build-plan.md#risk-register) | You + university |
| Will any admitted students be under 18? | Phase 4 — DPDP requires verifiable guardian consent for minors | Admissions |
| Exact columns in the admissions export | Phase 3 — column mapper handles variance, but a sample file is needed | Admissions |
| Who owns the ~₹8,000 Clerk cost in the event month? | Phase 2 — or switch to Better Auth now | You + university |
| Is campus wifi available at the gate, or is it volunteer 4G? | Phase 6 — changes sync cadence tuning | Campus IT |
| Retention period for selfies after the event | Phase 4 — default 30 days assumed | University / legal |
