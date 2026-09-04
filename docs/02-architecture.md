# 02 — Architecture

---

## 1. The honest load model

The original roadmap targeted *"15,000 concurrent users, 100,000+ daily requests."* Let's do the arithmetic,
because it changes what you build.

> **On 830 vs 15,000.** The admissions sheet in hand holds **830 pre-admitted students, and it is a sample** —
> the real export lands later and the admin can upload further files after that. Every number below stays sized
> for **15,000**, because that is what the system is being built for; 830 is only what the seed happens to load
> today. Nothing in the import path treats 830 as a limit: it reads the table once, diffs in memory, and writes
> in 1,000-row batches inside a single transaction ([D24](01-decisions.md#1-decision-log)).

### 1.1 Registration window (3 weeks before the event)

| Quantity | Calculation | Result |
| :--- | :--- | :--- |
| Total registrations | given | 15,000 |
| Worst-case burst (announcement blast) | 20% of all students in 30 min | **1.7 submissions/sec** |
| Writes per submission | 1 transaction + 1 object PUT | 1.7 txn/sec |
| Selfie upload bandwidth | 1.7/sec × 250 KB | **425 KB/sec** |

**Verdict:** trivial. A single 512 MB Postgres handles this without noticing.

### 1.2 Gate check-in (event morning)

| Quantity | Calculation | Result |
| :--- | :--- | :--- |
| Arrivals | 15,000 over a 2-hour window | 7,500/hour |
| Sustained scan rate | 7,500 / 3600 | **2.1 scans/sec** |
| Per device (10 devices) | 2.1 / 10 | 1 scan every 4.8 sec |
| Peak burst (3× sustained) | | **6.3 scans/sec** |
| Total check-in rows written, ever | | 15,000 |

**Verdict:** trivial. 15,000 inserts is a rounding error. And because scanning is local-first, the *scan*
never waits on the server at all — only the background sync does.

### 1.3 Public reads

| Quantity | Calculation | Result |
| :--- | :--- | :--- |
| Page views across the event | 30,000 people × ~20 views | 600,000 |
| Peak hour | ~10% of total | **17 req/sec** |
| Cacheable share | schedule, speakers, gallery, FAQ | ~95% |

**Verdict:** trivial with Redis caching and `Cache-Control` headers.

### 1.4 The number that actually matters

| Quantity | Calculation | Result |
| :--- | :--- | :--- |
| Concurrent SSE connections during the keynote | ~25% of 30,000 people with the site open | **~7,500 idle long-lived connections** |

**This is the only genuinely demanding number in the system**, and it is a *memory and file-descriptor*
problem, not a CPU problem. Handled by:

- One shared Redis subscriber **per process**, fanning out in-process — not one Redis connection per client
- No per-connection timers; a single shared 25-second heartbeat tick writes to all streams
- Zero allocation in the fan-out path (pre-serialise the payload once, write the same buffer to every stream)
- 2–3 web instances on Railway, ~2,500–3,750 connections each
- Explicit `ulimit -n` raise in the container
- Graceful degradation: if `activeConnections > threshold`, new clients are served a `Retry-After` and fall
  back to 20-second polling of the same cached endpoint. **The ticker degrades; it never fails.**

### 1.5 Conclusion — where the engineering effort goes

> **Throughput is not your problem. Correctness under concurrency, network resilience at the gate, and
> data protection are your problems.**

| Effort | Concern | Document |
| :--- | :--- | :--- |
| 🔴 **High** | Offline scan + multi-device sync correctness | 05 — Offline Sync Engine |
| 🔴 **High** | Selfie handling / DPDP compliance | 06 — Security & Compliance |
| 🟡 Medium | SSE connection scaling | this doc, §1.4 |
| 🟢 Low | Request throughput, DB write volume | Redis cache + 3 indexes |

**PgBouncer is not needed** at this write volume. Prisma's own pool (`connection_limit=10` per instance) is
sufficient. Revisit only if the connection count in Railway metrics approaches the Postgres `max_connections`.

---

## 2. Stack

| Layer | Choice | Notes |
| :--- | :--- | :--- |
| Framework | **Next.js 15**, App Router, React 19 | UI + API in one deployable ([D1](01-decisions.md#1-decision-log)) |
| Language | **TypeScript**, `strict: true`, `noUncheckedIndexedAccess` | |
| Styling | **Tailwind CSS v4** + CSS custom properties for tokens | Two themes, one token set (07) |
| Components | **Hand-written primitives** in `apps/web/components/ui/` — owned source, no component dependency | ⚠️ shadcn/ui was planned and **not used**. Radix, `cva` and `tailwind-merge` earned nothing on this surface, and `cn()` is six lines |
| Animation | **GSAP 3** + `@gsap/react` (`useGSAP`) — public/student only, never on the scanner verdict path | ScrollTrigger for reveals. `prefers-reduced-motion` is honoured in unlayered CSS, so it wins before any JS runs |
| Auth | **Clerk** behind `packages/core/auth` adapter | ([D13](01-decisions.md#1-decision-log)) |
| Validation | **Zod** — one schema per boundary, shared client/server | `packages/contracts` |
| ORM | **Prisma 6** + PostgreSQL 16 | |
| Cache / pub-sub / locks | **Redis 7** (`ioredis`) | |
| Jobs | **None.** No queue, no worker service | ⚠️ **Corrects the plan.** BullMQ in `apps/worker` was specified; nothing needed it. Exports and PDFs are generated in the request that asks for them (both are sub-second for one document), and the only genuinely scheduled work — the DPDP retention sweep — is a `POST /api/cron/retention` a scheduler pings. A second always-on runtime to hold one cron job is the thing D1 exists to avoid |
| Object storage | **Cloudinary**, `type: 'authenticated'` | No public URL exists; reads are short-lived signed URLs. Transformation replaces a `sharp` step ([D14](01-decisions.md#1-decision-log)) |
| Client-side face detect | **`@vladmandic/face-api`** — TinyFaceDetector only, behind a dynamic `import()` on the selfie step | 193 KB of weights committed to `public/models/`; the 1.24 MB library is its own chunk, in no first-load bundle ([D4](01-decisions.md#1-decision-log)) |
| QR generate / read | `qrcode` (server, SVG) · `@zxing/browser` (camera, QR **and** Code128) | One decoder for both formats |
| Barcode | `bwip-js` server-side Code128 render | |
| Offline store | **IndexedDB** via `idb` | Manifest + outbox (05) |
| PDF | **`pdf-lib`**, in `GET /api/pass/pdf` | ⚠️ `@react-pdf/renderer` was specified. It brings a React reconciler and a Yoga layout engine to draw one A5 card of fixed geometry; `pdf-lib` draws it directly, has no React dependency, and runs in the route rather than needing a worker to run in |
| Excel | `exceljs`, in `GET /api/admin/export` | Streamed to the response. A 15,000-row workbook is ~2 s, which is a spinner, not a job queue |
| Testing | Vitest (unit) · Playwright (E2E, incl. offline) · k6 (load) | |
| Errors / logs | Sentry + `pino` structured JSON | |
| Deploy | Railway, Docker multi-stage | |

### Why not NestJS

NestJS's real value is dependency injection, guards, pipes, and modular boundaries. Those are worth keeping —
so they're reproduced without the second runtime:

| NestJS feature | Replacement here |
| :--- | :--- |
| Modules | `packages/core/<domain>/` — one folder per bounded context |
| Guards + `@Roles()` | `withAuth(handler, { roles: [...] })` wrapper + Next middleware |
| Validation pipes | Zod schemas at every route boundary, in `packages/contracts` |
| Providers / DI | Explicit constructor injection in service classes; no container needed at this size |
| Interceptors | Route wrapper composing logging, audit, rate limit, error mapping |

You keep the discipline. You drop the second deploy target, the CORS layer, the duplicated types, and the
cross-service auth handshake.

---

## 3. Deployment topology

```
                                 ┌──────────────────────┐
                       students, │   Cloudflare (DNS,   │
                    volunteers,  │   TLS, WAF, cache)   │
                        admins ──►                      │
                                 └──────────┬───────────┘
                                            │
                    ┌───────────────────────┴────────────────────────┐
                    │              RAILWAY PROJECT                   │
                    │                                                │
                    │  ┌──────────────────────────────────────────┐  │
                    │  │  web  (Next.js)          × 2–3 replicas  │  │
                    │  │  ────────────────────────────────────────│  │
                    │  │   public pages      (ISR / Redis cached) │  │
                    │  │   /api/*            (route handlers)     │  │
                    │  │   /api/stream       (SSE, Redis SUB)     │  │
                    │  │   /api/scanner/*    (manifest + sync)    │  │
                    │  └───────┬───────────────────────┬──────────┘  │
                    │          │                       │             │
                    │  ┌───────▼─────────┐   ┌─────────▼──────────┐  │
                    │  │  PostgreSQL 16  │   │     Redis 7        │  │
                    │  │  ─────────────  │   │  ────────────────  │  │
                    │  │  source of      │   │  cache             │  │
                    │  │  truth          │   │  pub/sub (SSE)     │  │
                    │  │                 │   │  scan mutex        │  │
                    │  │  daily backup   │   │  rate-limit counts │  │
                    │  └───────▲─────────┘   └─────────▲──────────┘  │
                    │          │                       │             │
                    │          └───────────┬───────────┘             │
                    │                      │                         │
                    │        ┌─────────────┴──────────────┐          │
                    │        │  cron  (scheduler only)    │          │
                    │        │  ────────────────────────  │          │
                    │        │  POST /api/cron/retention  │          │
                    │        │  → the web service does    │          │
                    │        │    the work. No runtime.   │          │
                    │        └────────────────────────────┘          │
                    └────────────────────────┬───────────────────────┘
                                             │  signed upload / URL
                                 ┌───────────▼────────────┐
                                 │  Cloudinary            │
                                 │  ────────────────────  │
                                 │  selfies/  (signed)    │
                                 │  gallery/  public      │
                                 └────────────────────────┘
```

**Three Railway services, not four**, and only `web` runs application code. The fourth was a `worker`; ⚠️ it
was not built, and the row for **Jobs** above says why. Roster imports, PDFs and Excel exports all happen in the
request that asks for them, and the retention sweep is a scheduled `curl` at a route — so what would have been a
second always-on Node runtime is a cron entry with no code of its own.

`Excel` and `PDF` exports are generated on demand and streamed to the requesting admin rather than parked in
object storage, so the only thing Cloudinary holds is imagery. Selfies are `type: 'authenticated'`: no URL for
them works without a signature, which is what keeps a leaked link from becoming a leaked face
([D14](01-decisions.md#1-decision-log)).

### Environments

| Env | Branch | Data | Purpose |
| :--- | :--- | :--- | :--- |
| `local` | any | the 830-row admissions sample, seeded from the sheet | Development |
| `staging` | `main` | **synthetic only — never real student data** | Rehearsal, load tests, chaos drills |
| `production` | tagged release | real | The event |

Staging must never hold real PII. Load tests and destructive chaos drills run there.

The local roster is real names and real mobile numbers, so the sheet is **gitignored** (`*.xlsx`) and lives only
on the machine that runs the import. Docker publishes Postgres and Redis on `127.0.0.1:5433` / `127.0.0.1:6380`
rather than the default ports, for the reason in [D25](01-decisions.md#1-decision-log).

---

## 4. Repository layout

Monorepo, **npm workspaces** (`apps/*`, `packages/*`). No Turborepo — there is one buildable app, and a task
graph over a single node is a dependency doing no work. Revisit if `packages/*` grows its own build steps.

> ⚠️ The tree below is the **target** layout. As of Phase 1, `apps/web` (public + student routes),
> `packages/core` (`roster/`) and `packages/db` (schema, migrations, client, seed, ingestion) exist. The rest is
> created when the phase that needs it starts.

```
orientation2026/
│
├── apps/
│   ├── web/                          # Next.js 15 — the only public surface
│   │   ├── app/
│   │   │   ├── (public)/             # / about schedule speakers gallery map contact faq
│   │   │   ├── (student)/            # register/* pass
│   │   │   ├── (volunteer)/          # scan desk helpdesk        ← dark ops skin
│   │   │   ├── (admin)/              # dashboard roster registry
│   │   │   │                         #   broadcast devices moderation audit exports
│   │   │   └── api/
│   │   │       ├── public/           # cached read endpoints
│   │   │       ├── registration/     # lookup, claim, pass, pdf
│   │   │       ├── scanner/          # enroll, manifest, sync, lookup, checkin
│   │   │       ├── desk/             # walk-in registration
│   │   │       ├── helpdesk/         # tickets, messages
│   │   │       ├── admin/            # everything admin
│   │   │       ├── stream/           # SSE
│   │   │       └── webhooks/clerk/   # user sync
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── offline/              # IndexedDB manifest store + outbox + sync loop
│   │   │   └── scanner/              # camera pipeline, decode, feedback
│   │   └── public/sw.js              # service worker: app shell + background sync
│                                     # ⚠️ no apps/worker/ — see the Jobs row above.
│                                     #    roster import, exports and PDF render in the
│                                     #    request; the retention sweep is a cron'd POST
│                                     #    to /api/cron/retention.
│
├── packages/
│   ├── db/                           # Prisma schema, migrations, client singleton, seed
│   │   └── src/roster/ingest.ts      # shared by the CLI seed and the admin upload (D24)
│   ├── contracts/                    # Zod schemas + inferred types (the API contract)
│   ├── core/                         # ★ ALL DOMAIN LOGIC — framework-free, heavily tested
│   │   ├── auth/                     # Clerk adapter (the swap seam)
│   │   ├── pass/                     # issue, sign, verify, revoke, codes
│   │   ├── scan/
│   │   │   └── decide.ts             # ★★ THE shared scan decision function
│   │   ├── sync/                     # manifest diff, batch reconciliation
│   │   ├── roster/                   # parse, map columns, validate, dedupe
│   │   ├── realtime/                 # channel names, event payloads
│   │   └── audit/
│   └── ui/                           # design tokens + primitives shared across skins
│
├── docs/                             # you are here
└── ops/
    ├── railway/                      # service config
    ├── loadtest/                     # k6 scripts
    └── RUNBOOK.md                    # day-of operations
```

### The single most important file in the repo

```ts
// packages/core/scan/decide.ts
//
// Pure. No I/O. No imports from next, prisma, or the browser.
// Imported by BOTH the offline scanner (apps/web/lib/offline) AND the
// server sync endpoint (apps/web/app/api/scanner/sync).
//
// One implementation → the offline verdict and the online verdict can
// never disagree. This is the entire basis for trusting offline mode.

export function decideScan(
  input: ScanInput,
  known: KnownPass | null,
  ctx: ScanContext,
): ScanDecision
```

`ctx` is the third argument because a verdict is not a property of the pass alone. It carries
`manifestGeneratedAt`, `manifestMaxAgeMs` and the gate's `opensAt` / `closesAt`, which is what lets the same
function say "not on the list, but this device's list is forty minutes old, so send them to the help desk
rather than turning them away" — and what makes a clock-skew check possible, since a scan timestamped before
the manifest that the device is holding was generated is a device with a wrong clock, not a wrong student.

Everything else in the system is replaceable. If this function is wrong, students get turned away at the gate.
It gets exhaustive unit tests covering every combination of pass status, signature validity, manifest
staleness, validity window, and prior local check-in.
