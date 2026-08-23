# Orientation 2026 — Engineering Documentation

**Amity University Patna · Orientation Programme 2026**
Digital pass issuance, gate check-in, and live event operations.

---

## Status

| | |
| :--- | :--- |
| **Classification** | Official university deployment — real student PII |
| **Team** | Solo engineer |
| **Target population** | 15,000+ admitted students (+1 accompanying guest each) |
| **Event date** | ⚠️ **NOT PINNED — see Risk R1** |
| **Hosting** | Railway (web + worker + Postgres + Redis) |

---

## How to read these docs

Read in order the first time. After that, each document stands alone.

| # | Document | Answers |
| :-- | :--- | :--- |
| 01 | [Decisions & Scope](01-decisions.md) | What we decided, why, and what we are deliberately **not** building |
| 02 | [Architecture](02-architecture.md) | Stack, the honest load model, repo layout, deployment topology |

**Not written yet.** These are planned, and referenced from 01 and 02 by name. Each is written when the phase
that needs it starts, so that it describes something real rather than something imagined:

| # | Document | Will answer |
| :-- | :--- | :--- |
| 03 | Data Model & API | Prisma schema, every table, every endpoint |
| 04 | Core Flows | Registration, pass issuance, gate scan — step by step |
| 05 | Offline Sync Engine | The hardest part of the system |
| 06 | Security & Compliance | Threat model, DPDP Act 2023 obligations, selfie handling |
| 07 | Design System | Tokens, two skins, accessibility contract, component inventory |
| 08 | Build Plan | Phases 0–10, definition of done, cost table, risks, day-of runbook |

The original vision document, `Roadmap.md`, was **superseded** by these docs and removed from the working tree
in commit `6560629`. Several of its ideas were sharpened rather than replaced. Recover it when you want to
compare:

```bash
git show 6560629^:Roadmap.md
```

---

## The one-paragraph summary

Admissions gives us a spreadsheet of admitted students. We load it. A student signs in, finds their own
record by enrollment/form number, confirms their details, names the guardian coming with them, takes a live
selfie, and receives a digital pass carrying three redundant credentials: a signed QR code, a Code128
barcode, and a typed numeric code. On orientation day, volunteers at the gate scan that pass on their own
phones. Their phones hold a pre-downloaded manifest of every valid pass, so **scanning works with no
network at all** — the verdict is computed on-device in milliseconds, queued locally, and reconciled with
the database the moment connectivity returns. Meanwhile admins watch arrivals stream in live and can push
an emergency broadcast to every screen on campus.

---

## The three things that can actually go wrong

Everything in these docs is organised around preventing these. Not throughput — throughput is easy here.

| | Failure | Where it's handled |
| :-- | :--- | :--- |
| **1** | **The gate stalls.** Venue network drops, 400 students queue, volunteers can't scan. | 05 — Offline Sync |
| **2** | **A student is admitted twice, or a valid student is refused.** Ten devices, one database row, no coordinator. | 05 — Conflict Resolution |
| **3** | **A volunteer's phone with student data is lost.** 15,000 people's PII, one official incident report. | 06 — Security & Compliance |

---

## Quick reference

npm workspaces. Every command below is run from the repository root and exists today.

```bash
npm install
npm run dev            # apps/web on :3000
npm run build          # production build
npm run typecheck      # tsc --noEmit, strict
npm run lint           # eslint
```

One workspace-scoped script, needed only after changing the `@vladmandic/face-api` version:

```bash
npm run models:sync -w @orientation/web
```

Database, worker and test commands (`db:migrate`, `db:seed`, `test`, `test:e2e`) do not exist yet. They arrive
with the phases that introduce Prisma, the worker, and the test harness.
