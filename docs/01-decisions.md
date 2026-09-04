# 01 — Decisions & Scope

Every decision below is recorded with its rationale so that in three months you can tell the difference
between *a choice* and *an accident*. When you disagree with one, change it here first.

---

## 1. Decision log

| # | Decision | Rationale | Reversibility |
| :-- | :--- | :--- | :--- |
| **D1** | **Next.js 15 monolith + one worker service** — not NestJS + separate React SPA | One deployable, one auth context, no CORS, one env set. You are the only person who will debug this at 9 AM with 400 students queued. Two runtimes is the wrong thing to own alone under pressure. | Medium — domain logic lives in `packages/core`, framework-agnostic |
| **D2** | **Single gate entry** — one check-in per pass, ever | Confirmed requirement. Collapses the check-in model to a 1:1 relation with a unique constraint, which is what makes duplicate prevention provable. Amended by [D23](#1-decision-log), which gives the *rejected* scans somewhere to live. | Hard — schema-level |
| **D3** | **Live selfie is the anti-impersonation control** | Master data is unreliable and has no photos. A selfie captured at registration and shown to the volunteer at scan time is the only verification that actually works here. | Easy |
| **D4** | **Client-side face detection, advisory only** — `@vladmandic/face-api`, TinyFaceDetector alone | Free, runs on-device, catches memes, blank walls and second faces *while the student is still holding the camera* rather than at 08:30 on day one. It **warns, it does not refuse**: a flagged frame demotes the confirm button and says why, and a student who insists still gets a pass — a false refusal sends somebody to the help desk for nothing. Not liveness; a printed photo defeats it, which is acceptable because a human eyeballs the match at the gate. **As built:** the original `face-api.js` is unmaintained since 2020 and pins TFJS 1.x, so the maintained fork is used. Only the 193 KB TinyFaceDetector weights ship, committed to `apps/web/public/models/` rather than fetched from a CDN a phone on the campus network may not reach. The 1.24 MB library sits behind a dynamic `import()` that runs only when a camera opens, so it is in no first-load bundle. If the weights 404 or the device cannot run them, guidance falls back to canvas light/focus statistics and registration is unaffected. | Easy |
| **D5** | **ECDSA P-256 signatures on the QR — not HMAC** | ⚠️ **Corrects the original spec.** HMAC verification requires the signing secret; offline verification would mean shipping that secret to every volunteer phone, so one lost phone = unlimited forged passes. ECDSA ships only a public key. | Hard — changes pass format |
| **D6** | **10-digit fallback code, displayed `123-456-7890`** | ⚠️ **Corrects the original spec.** 15,000 codes in a 6-digit space = one valid code every 67 guesses. 10 digits = 1 in 666,666, same numeric-keypad typing speed. Configurable length; rate-limited regardless. | Easy — config value |
| **D7** | **Full offline manifest on device, verification data only — no selfies cached** | 15k records ≈ 2.7 MB raw / ~700 KB gzipped. Caching 15,000 faces on volunteer phones turns a lost phone into a DPDP incident. Selfies are fetched live when online and gracefully hidden when not. | Easy — manifest is versioned |
| **D8** | **Scan decision is a pure function shared by client and server** | `packages/core/scan/decide.ts` is imported by both the offline scanner and the sync endpoint. One implementation, one set of tests, identical verdicts online and offline. This is what makes offline mode trustworthy. | — foundational |
| **D9** | **Write-order-wins conflict resolution** | First check-in row to reach Postgres owns the pass; every later scan is recorded as a `DUPLICATE` attempt referencing it. No destructive updates, no rewritten audit history. Operationally identical to earliest-timestamp-wins (the student is inside either way). Amended by [D23](#1-decision-log). | Medium |
| **D10** | **SSE + Redis pub/sub for realtime — not Socket.io** | Native to Next.js route handlers, no extra always-on service, `EventSource` reconnects for free, cheap at 8k+ concurrent connections. Chat sends over `POST`; ~1 RTT is irrelevant for text. | Medium |
| **D11** | **Guest rides on the student's pass** | `guestCount` on the registration. Scanner displays `RAHUL K. · CSE · +1 guest (father)`. No second pass to issue, deliver, or reconcile. | Easy |
| **D12** | **Pass delivered in-app + PDF download. No email, no WhatsApp.** | Master data has no reliable emails; WhatsApp Business needs a BSP, template approval, and per-message spend. PDF covers dead-battery and print cases at zero cost. | Easy |
| **D13** | **Keep Clerk, behind a thin auth adapter** | Confirmed choice — best-in-class DX and admin MFA out of the box. But see Cost: its free tier is ~10k MAU and you have 15k+ users. All Clerk calls go through `packages/core/auth`, so swapping to Better Auth is a day's work, not a rewrite. | Easy **by design** |
| **D14** | ~~**Cloudflare R2 for object storage**~~ → **Cloudinary**, uploaded `type: 'authenticated'` | ⚠️ **Reversed at Phase 1.** R2 was chosen on egress cost, and it is still the cheaper store — the decision changed because selfies need *transformation*, not just storage. Cloudinary does the downscale, the EXIF/GPS strip, `q_auto` and `f_auto` in the delivery URL; on R2 that is a `sharp` pipeline in the worker plus a second variant to store and expire. Assets go up as `type: 'authenticated'`, so there is no durable public URL at all and every read is a ~60-second signed URL — the same DPDP property the private bucket gave us ([D7](#1-decision-log)). **Consequence:** `Registration` stores `selfiePublicId` + `selfieVersion`, *not* a `secure_url`, because an authenticated asset has no permanent one. When the free tier fills, the admin adds another credential set: `CloudinaryConfig` holds credentials in priority order with the API secret encrypted at rest — never plaintext in a column. | Medium — the upload seam is one module and the stored `publicId` is portable; the transformation URLs are not |
| **D15** | **No FFmpeg worker. Compress media before upload.** | ⚠️ **Cut from the original spec.** Server-side transcoding is the least justified component in it: high memory/CPU on Railway, a whole job pipeline, for a gallery of maybe 40 files you upload once. Compress locally with the `ffmpeg` CLI. | Easy — add later if truly needed |
| **D16** | **Curated FAQ + fuzzy search. No LLM in v1.** | An LLM answering official university questions can invent a dress code or a bus time. On a sanctioned deployment that is a reputational risk with no upside a good FAQ doesn't cover. Volunteer chat handles the long tail. | Easy — content index is LLM-ready |
| **D17** | **English only** | Confirmed. Strings still live in one module (no literals in JSX) so Hindi is a translation task, not a refactor — costs nothing now. | Easy |
| **D18** | **Gates are a configurable admin entity** | Launching with 1 gate and 5–10 devices, but gate topology is data, not code. Set at event time. | Easy |
| **D19** | **Split UI skin: light Amity-branded for public/student, dark console for operators** | Gold `#FFB200` on cream is **1.65:1 — a WCAG AA failure**. Dark glassmorphism is hard to read on a phone in direct sunlight at a gate. Operators get contrast, density, and 56px targets; students get warmth and credibility. One token set, two themes. | Easy |
| **D19a** | ⚠️ **A dark "gold foil on dark card stock" public site was built and rejected.** The student-facing skin is light, warm, and unmistakably Amity. | Rejected on the brief, not on contrast. It read as a ticketing product selling a pass — and the pass is the *outcome* of these pages, not their subject. The people arriving are freshers walking onto a campus for the first time in their lives, and the public pages have to carry that: college, arrival, belonging. Practical consequences, so this is testable rather than a mood: no dark surfaces on public/student routes except deliberately framed ones (the camera viewport, the footer); navy is a text and accent colour, not a page background; the palette leads with flame and marigold on white; photography and campus warmth do the work that gradients and glass were doing. | Medium — it is a theme, but it is also the brief |
| **D20** | **Every write is audited, append-only** | Official deployment. "Who revoked this pass?" and "who checked this student in?" must be answerable months later. **As built:** append-only is enforced by a Postgres trigger that raises on `UPDATE`/`DELETE` against `AuditLog`, not by application discipline. An application check has a race window and a bypass; the database does not. | — foundational |

The rows below were decided during Phase 1, with the schema and the local stack in front of us.

| # | Decision | Rationale | Reversibility |
| :-- | :--- | :--- | :--- |
| **D21** | **No static export. The app is server-rendered on Railway, as §3 of [02](02-architecture.md#3-deployment-topology) always said.** | ⚠️ **Corrects the code, not the plan.** While the frontend was built ahead of the backend, `next.config.ts` carried `output: 'export'` with `basePath`, `assetPrefix`, `trailingSlash` and `images.unoptimized` so the pages could be previewed as flat files. None of that survives Phase 2 — route handlers, SSE, signed URLs and `next/image` all need a server — so it was removed rather than left to be discovered later. **Two visible consequences:** public URLs lost their trailing slash (`/register/` → `/register`), and `next/image` optimises at request time again, so `scripts/build-assets.mjs` emits one sensible upper bound per image instead of a file per breakpoint. | Easy in isolation — but nothing after Phase 1 works without a server |
| **D22** | **Approval mode is admin-configurable; the default is auto-approve** | Confirmed choice. A queue of 15,000 submissions nobody has time to read is theatre, and a student who cannot see their pass phones the help desk — so the default cannot be manual. `SystemConfig.approvalMode` decides whether a submission lands `APPROVED` or `PENDING_REVIEW`; the moderation queue works on *flagged* selfies either way ([D4](#1-decision-log)). Auto-approve is not "no review", it is review after the fact backed by revocation, which is the only version that scales to one admin. | Easy — one config row |
| **D23** | **`ScanEvent` logs every scan attempt; `CheckIn` stays 1:1 with the pass** | Amends [D2](#1-decision-log)/[D9](#1-decision-log) with the table that makes them usable. One check-in per pass ever, first write wins — which leaves every *later* scan with nowhere to go, and those are exactly the rows that evidence an impersonation attempt, a device with a drifting clock, or a volunteer re-scanning the same queue. So the unique `CheckIn` is the *outcome* and `ScanEvent` is the append-only log of *attempts*, each carrying its verdict, its device, and whether it was decided offline. Duplicate reporting and per-device stats read `ScanEvent`; nothing reads `CheckIn` for that. | Hard — schema-level, but purely additive |
| **D24** | **Roster import is one code path, and every run leaves a row** | The CLI seed and the admin upload both call `ingestRoster()` in `packages/db/src/roster/`, so a file that previews cleanly in the admin UI seeds identically from a terminal — the only way "the admin can also seed the sheet" is true rather than approximately true. Each run writes a `RosterImport` (`DRY_RUN` / `COMMITTED` / `FAILED`) carrying the column map, the parse issues and a snapshot of every row it changed, so an import can be explained and rolled back. It refuses a file whose SHA-256 matches an already-committed import unless a human overrides, because re-running the same file is how a roster gets doubled. And it never writes claim state: correcting a misspelled name must not release a pass a student is already holding. | — foundational |
| **D25** | **Local Postgres and Redis publish on `127.0.0.1:5433` / `127.0.0.1:6380`** | Not cosmetic, and not a preference. On Windows a native `postgresql-x64-18` service and Docker's port proxy can both hold 5432: `docker compose ps` reports `healthy`, the client connects happily, and it is talking to the *other* server — migrations then appear to apply to a database that never receives them. Non-default ports make that mistake impossible to make silently, and binding to loopback keeps the dev database off the LAN. The native service is deliberately left running and untouched. | Easy — two lines of `docker-compose.yml` and one `DATABASE_URL` |
| **D26** | **Four transitive `npm audit` advisories are accepted, not patched** | Eight findings (2 moderate, 6 high), none with a non-breaking fix: `deepmerge-ts` via `@prisma/config` (a dev-only CLI config merge), `postcss` 8.4.31 nested under `next` (build-time CSS we author ourselves), the `sharp` that `next` declares as an optional dependency (no remote image host is configured), and `uuid` via `exceljs` (called without a `buf`). None is reachable from user input. ⚠️ **Do not run `npm audit fix --force`** — every offered fix is a semver-major: it installs **Next 16** and downgrades `exceljs` to 3.x. An `overrides` block was tried; npm 11.6.1 silently ignored it, so it was reverted rather than left in the file as decoration. | Easy — re-check when Next 16 is adopted on purpose |
| **D27** | **The sheet's `payment status` is stored, and is admin-only** | The spec says never to show it to the student, and that is what is built: it is absent from the wizard, from `/api/registration/lookup`, and from the offline manifest ([D7](#1-decision-log)). It is *kept* on `AdmittedStudent` because it is the only available answer to "this student is on the list but has the fee cleared?", which is a question the help desk will be asked at the gate. **If it should not be persisted at all, say so and the column goes** — the importer already tolerates the header being absent. | Easy — one column, one migration |

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
| **What is the actual event date?** | Everything — see R1 | You + university |
| Will any admitted students be under 18? | Phase 4 — DPDP requires verifiable guardian consent for minors | Admissions |
| Does the full export use the same headers as the sample? | Nothing — the 830-row sample is imported and the column mapper handles variance. Worth 30 seconds of checking before the real file is uploaded. **Resolved for the sample:** `Si.No`, `Name`, `Program`, `From No.` (that spelling), `Contact No.`, `Alt. contact no.`, `E-Mail ID`, `payment status` | Admissions |
| Who owns the ~₹8,000 Clerk cost in the event month? | Phase 2 — or switch to Better Auth now | You + university |
| Is campus wifi available at the gate, or is it volunteer 4G? | Phase 6 — changes sync cadence tuning | Campus IT |
| Retention period for selfies after the event | Phase 4 — default 30 days assumed | University / legal |
