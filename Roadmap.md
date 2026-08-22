# 🎓 Amity University Patna — Orientation 2026 Master Technical Roadmap
> **Production-Grade Incremental Software Engineering Specification & Architecture**  
> **Target Capacity**: 15,000 Concurrent Users | 100,000+ Daily Requests | Real-Time Sync  
> **Deployment Target**: Railway.com  

---

## 🏛️ Executive Summary & Brand Identity

* **Institution**: Amity University Patna
* **Event**: Orientation Program 2026
* **Design Philosophy**: Academic Luxury & High Energy. Deep Academic Navy Blue (`#0B192C`), Amity Gold/Amber (`#FFB200` / `#FFD700`), Slate Glassmorphism, smooth micro-interactions (Framer Motion), mobile-first responsive PWA feel.
* **Core Value Proposition**: A unified, real-time orientation operating system that seamlessly manages pre-loaded student admissions, friction-free Clerk identity claiming, instant QR pass issuance, high-speed volunteer on-ground check-in with fallbacks, AI + human volunteer helpdesk, and real-time live administrative mission control.

---

## 👥 User Roles & Persona Specifications

```
                     ┌────────────────────────────────────────────────────────┐
                     │                  CLERK AUTHENTICATION                  │
                     └───────────────────────────┬────────────────────────────┘
                                                 │
                   ┌─────────────────────────────┼────────────────────────────┐
                   ▼                             ▼                            ▼
        ┌────────────────────┐         ┌────────────────────┐       ┌────────────────────┐
        │      STUDENT       │         │     VOLUNTEER      │       │     SUPER ADMIN    │
        │ (Admitted Fresher) │         │(Ground Operations) │       │  (Core Committee)  │
        └────────────────────┘         └────────────────────┘       └────────────────────┘
```

### 1. 🎓 Student Persona
* **Access**: Authenticates via Clerk (Email/Google) and claims pre-loaded Amity Admitted Student record via Enrollment No / Form No.
* **Capabilities**:
  * View dynamic event schedule with "Happening Now", "Up Next" indicators, and countdown timers.
  * Access personalized **Digital Orientation Pass** with:
    * Encrypted static QR code.
    * 6-digit random emergency fallback code.
    * Code128 standard 1D Barcode.
    * Pass validity countdown (Admin-configurable, default 1 day).
  * Explore Speaker & Faculty Profiles (Bio, topics, designations, LinkedIn/socials).
  * Interactive 2D Campus Map & Venue guide.
  * Official Media Gallery & Highlight Video Reels (Cloudinary CDN).
  * Real-Time Broadcast Ticker (Emergency alerts & event updates pushed via WebSockets).
  * **Dual-Tier Support**: Instant AI Campus Assistant for FAQs + One-Click Escalation to Live Volunteer Chat.

### 2. 🛡️ Volunteer Persona (On-Ground Operations)
* **Access**: Assigned via Admin Role Management.
* **Capabilities**:
  * **High-Speed Mobile Camera QR Scanner** with haptic vibration, audio beep feedback (Success / Already Scanned / Invalid).
  * **Fallback Verification**: Manual 6-digit code entry + 1D Barcode scanner support.
  * Single-entry campus gate check-in with offline queue & reconnect sync.
  * **Live Volunteer Helpdesk Queue**: Accept escalated student inquiries, live two-way chat, and ticket resolution.
  * Real-time volunteer performance metrics (number of students checked in).

### 3. 👑 University Super Admin / Core Committee
* **Access**: Multi-factor Clerk Admin credentials.
* **Capabilities**:
  * **Real-Time Analytics Command Center**: Check-in velocity gauge, total arrivals vs pending, peak check-in time charts, branch/course distribution.
  * **Student Ingestion & Management**: Bulk CSV/Excel parser with data validation, duplicate detection, manual edit, pass status override.
  * **User & Role Management**: Promote users to Volunteer/Admin, revoke access, audit active sessions.
  * **Pass Policy Manager**: Configure global QR life/expiration, regenerate invalid passes, lock gate entry.
  * **Live Emergency Broadcast Engine**: Instant WebSocket push banner to all connected student screens.
  * **Media Center**: Upload 4K photos & highlight reels with automated server-side FFmpeg compression worker to Cloudinary.
  * **Audit & Compliance Logs**: Tamper-proof logs of every check-in scan, CSV upload, role modification, and announcement.
  * **Export Engine**: One-click export of attendance and absentee reports in Excel/PDF.

---

## 🛠️ Complete Technology Stack

| Layer | Technologies | Key Responsibility |
| :--- | :--- | :--- |
| **Frontend Web App** | React 18, Vite, Tailwind CSS, Framer Motion, Lucide Icons, HTML5 Canvas / Barcode generators, HTML5 QR Scanner | Ultra-fast, responsive, accessible UI with smooth micro-animations and zero layout shift. |
| **Authentication & RBAC** | Clerk Core SDK, JWT verification, Role-based Route Guards | Frictionless student onboarding, Google SSO, session management, secure role assignment. |
| **Backend API** | NestJS (TypeScript), Fastify/Express engine | Scalable modular enterprise architecture, dependency injection, validation pipes. |
| **Real-Time Engine** | Socket.io + Redis Adapter | Full-duplex WebSocket communication for live announcements, check-in stats, and helpdesk chat. |
| **Primary Database** | PostgreSQL 16 + Prisma ORM + PgBouncer | Acid-compliant data storage, relation management, index-optimized search. |
| **In-Memory & Cache Layer** | Redis 7 | Endpoint caching, session state, rate limiting counters, duplicate scan mutex locks. |
| **Job Queue & Workers** | BullMQ (Redis-backed) | Background CSV bulk parsing, email notifications, FFmpeg video processing pipeline. |
| **Media Processing** | FFmpeg (server-side) + Cloudinary CDN | Video compression, WebP image conversion, thumbnail generation, ultra-fast asset delivery. |
| **Security & Protection** | `@nestjs/throttler`, Helmet, CORS, `class-validator`, bcrypt | DDoS mitigation, rate limiting, SQLi/XSS prevention, tamper-proof encrypted QR tokens. |
| **Deployment & DevOps** | Railway.com, Docker Multi-stage Builds | Containerized deployment, managed PostgreSQL & Redis, automated CI/CD, horizontal scaling. |

---

## 📐 Incremental Phase-by-Phase Development Roadmap

```
Phase 1: UI/UX & Design System (React + Tailwind)
   │
   ▼
Phase 2: Core NestJS, PostgreSQL Schema, Prisma & Clerk Auth
   │
   ▼
Phase 3: QR Pass Engine & Volunteer Mobile Scanner
   │
   ▼
Phase 4: Real-Time Sockets & Admin Mission Control
   │
   ▼
Phase 5: Media Worker (FFmpeg), AI Helpdesk & 15k Scale Load Testing
```

---

### 🎨 Phase 1: Frontend Architecture & UI/UX Foundation

#### 1.1 Design System & Theme Engine
* Set up Tailwind CSS with custom Amity University Patna tokens:
  * Primary: Deep Navy `#0B192C`, Midnight `#150050`
  * Accent: Amity Gold `#FFB200`, Amber `#FFD700`
  * Neutral/Surfaces: `#0F172A`, `#1E293B`, `#F8FAFC`
  * Glassmorphism & custom glowing borders.
* Configure typography: Google Fonts (`Outfit` / `Inter`).
* Framer Motion setup for hero transitions, card hovers, and page route animations.

#### 1.2 Public Pages
* **Home Page**:
  * Hero Section with interactive countdown timer to Orientation 2026.
  * Quick Actions: "Claim Your Pass", "View Schedule", "Campus Guide".
  * University Dignitaries & Welcome Note.
  * Live Highlight Reel preview.
* **About Page**:
  * Amity University Patna legacy, mission, leadership messages, student life highlights.
* **Schedule Page**:
  * Interactive timeline with "Happening Now" and "Up Next" live indicators.
  * Filter by session type (Keynote, Department Induction, Cultural Evening).
  * Add-to-Calendar (Google / Apple Calendar) integrations.
* **Dignitaries & Speaker Showcase**:
  * Speaker cards with profile images, designations, topics, and social links.
* **Gallery Page**:
  * Responsive masonry grid with lightbox preview, category filters, and 4K video reel player.
* **Contact & Campus Navigation Page**:
  * Interactive 2D Campus Map with clickable pins (Auditoriums, Help Desks, Cafeteria).
  * Emergency helpline contacts and location directions.

#### 1.3 Student Portal UI
* Clerk Sign-in / Sign-up modal integration.
* **Claim Pass Step Wizard**:
  * Step 1: Search by Enrollment No / Form No.
  * Step 2: Verify personal details (Name, Course, Email, Section).
  * Step 3: Instant Pass Generation.
* **Digital Pass Card Component**:
  * High-contrast QR code rendered via SVG/Canvas.
  * 6-digit fallback security code with copy button.
  * Code128 standard 1D Barcode.
  * One-click PDF download & screenshot-ready view.

---

### ⚙️ Phase 2: Core NestJS Backend, PostgreSQL & Clerk Authentication

#### 2.1 Database Schema (Prisma ORM & PostgreSQL)
* **StudentMaster Model**:
  * `id`, `enrollmentNo` (unique indexed), `formNo` (unique indexed), `fullName`, `email`, `phone`, `program`, `branch`, `batch`, `isClaimed`, `claimedAt`, `createdAt`.
* **User Model (Clerk Synced)**:
  * `id`, `clerkId` (unique indexed), `email`, `role` (`STUDENT`, `VOLUNTEER`, `ADMIN`, `FACULTY`), `createdAt`.
* **Registration / Pass Model**:
  * `id`, `userId` (FK), `studentMasterId` (FK, unique), `qrToken` (encrypted hash), `fallbackCode` (6-digit unique), `barcodeValue`, `status` (`ACTIVE`, `CHECKED_IN`, `REVOKED`), `validUntil`, `checkedInAt`, `checkedInBy` (FK Volunteer), `createdAt`.
* **CheckInLog Model**:
  * `id`, `passId`, `volunteerId`, `checkInMethod` (`QR_SCAN`, `FALLBACK_CODE`, `BARCODE`), `timestamp`, `ipAddress`, `deviceInfo`.
* **Announcement Model**:
  * `id`, `title`, `message`, `priority` (`INFO`, `WARNING`, `URGENT`), `isActive`, `createdById`, `createdAt`.
* **HelpdeskTicket Model**:
  * `id`, `studentId`, `assignedVolunteerId`, `subject`, `status` (`OPEN`, `IN_PROGRESS`, `RESOLVED`), `createdAt`.
* **TicketMessage Model**:
  * `id`, `ticketId`, `senderId`, `senderRole`, `message`, `createdAt`.
* **MediaAsset Model**:
  * `id`, `title`, `category`, `mediaType` (`PHOTO`, `VIDEO`), `cloudinaryPublicId`, `url`, `thumbnailUrl`, `uploadedById`, `createdAt`.

#### 2.2 Auth & Ingestion Modules
* **Clerk Webhook & JWT Guard**:
  * Intercept user signup/login, verify Clerk JWT, sync/upsert user record in PostgreSQL.
  * NestJS `@Roles()` decorator and `RolesGuard` for granular RBAC.
* **Student Ingestion Pipeline**:
  * Multipart CSV/Excel parser with streaming worker.
  * Data hygiene check: Duplicate enrollment detection, schema validation, batch insertion.
* **Pass Claim Engine**:
  * API endpoint to query unclaimed student record by enrollment number.
  * Atomically lock record in Redis/Postgres transaction to prevent race conditions.
  * Generate cryptographically signed QR token + unique 6-digit numeric fallback code.

---

### 📱 Phase 3: QR Pass Engine, Volunteer Mobile Scanner & Check-in Flow

#### 3.1 Pass Security & Token Generation
* QR payload encrypted with server secret (`HMAC-SHA256`) containing `passId`, `studentMasterId`, and `timestamp`.
* Admin-configurable pass validity TTL (stored in Redis).
* 6-digit collision-free backup code generation.
* Barcode rendering endpoint (`Code128` format).

#### 3.2 Volunteer Mobile Web App (PWA)
* Responsive, high-speed camera scanner using WebRTC / `html5-qrcode`.
* Multi-method verification input:
  1. Instant Camera QR Scan.
  2. Manual 6-digit code keypad.
  3. Barcode scan mode.
* Instant visual and sensory feedback:
  * 🟢 **Green / Haptic Buzz**: "Welcome [Student Name] — [Branch] — Checked In Successfully!"
  * 🟡 **Yellow / Warning Sound**: "Already Checked In at [Time] by [Volunteer Name]!"
  * 🔴 **Red / Error Tone**: "Invalid Pass / Student Record Not Found."
* Offline verification cache & auto-sync upon network reconnection.

#### 3.3 Anti-Fraud & Concurrency Safeguards
* **Redis Distributed Mutex Lock**: When a QR code is scanned, an atomic Redis lock (`SETNX pass:lock:<id>`) prevents double-check-in attempts from concurrent gate scanners.
* Detailed Check-In Audit trail recording scanner ID, timestamp, and method.

---

### ⚡ Phase 4: Real-Time WebSockets, Admin Mission Control & Analytics

#### 4.1 Socket.io & Redis Adapter Architecture
* NestJS WebSocket Gateway connected to Redis Pub/Sub for horizontal scaling across multiple instances.
* Real-time rooms: `students_global`, `volunteers_gate`, `admin_mission_control`, `ticket_<id>`.
* Events:
  * `announcement:broadcast` -> Instant pop-up alert on all connected student screens.
  * `checkin:velocity_update` -> Real-time live check-in counter update on Admin charts.
  * `ticket:new_message` -> Real-time bidirectional chat between student and volunteer.

#### 4.2 Super Admin Mission Control Dashboard
* **Live Analytics Center**:
  * Real-time Check-in Speedometer (students scanned per minute).
  * Arrival Progress Bar (Total Admitted vs Registered vs Checked In).
  * Course/Branch attendance distribution breakdown.
* **Student Registry Manager**:
  * Paginated table with instant search (Name, Roll No, Branch, Status).
  * One-click pass regeneration, manual check-in toggle, and student pass PDF preview.
* **Volunteer Operations**:
  * Live status of active volunteer scanners, scan velocity per volunteer, ticket resolution tracking.
* **Live Broadcast Manager**:
  * Compose emergency or informational announcements with priority flags and broadcast immediately.
* **Export & Reporting Engine**:
  * Generate exportable Excel/CSV and PDF reports for official university administration.

---

### 🚀 Phase 5: Media Worker, AI Helpdesk Escalation & 15k Concurrency Scaling

#### 5.1 Server-Side FFmpeg & Cloudinary Media Pipeline
* NestJS background worker using BullMQ.
* On Admin upload:
  * Images: Auto-convert to optimized WebP format with responsive thumbnail generation.
  * Videos: FFmpeg transcode to H.264/MP4, compressed bitrate for mobile streaming, poster frame extraction.
  * Upload to Cloudinary CDN with caching headers.

#### 5.2 AI Campus Assistant & Human Escalation
* Integrated AI assistant trained on Amity University Patna orientation FAQs, schedules, dress codes, bus routes, and venues.
* If a question is complex or unresolved:
  * AI automatically generates a Helpdesk Ticket.
  * Routes query to the active Volunteer Helpdesk Queue.
  * Initiates real-time Socket.io chat between student and volunteer.

#### 5.3 High-Concurrency Performance Optimization (15K Concurrent Users)
* **Redis Caching Strategy**:
  * Public endpoints (`/schedule`, `/announcements`, `/gallery`, `/speakers`) cached in Redis with TTL and event-driven cache invalidation.
* **PostgreSQL & Prisma Connection Pooling**:
  * PgBouncer integration to manage pool limits during burst traffic.
  * Database indexing on `enrollmentNo`, `formNo`, `clerkId`, `qrToken`, and `status`.
* **API Rate Limiting**:
  * `@nestjs/throttler` with Redis store:
    * Public browsing: 120 req/min.
    * Registration/Claim: 20 req/min.
    * Volunteer Scanner: 300 req/min (whitelisted role).
* **Load Testing & Benchmarking**:
  * Simulated 15,000 concurrent virtual users using `k6` / `Autocannon`.
  * Measure p95 response time (< 150ms) and zero database connection exhaustion.
* **Production Deployment on Railway.com**:
  * Multi-container setup (NestJS API service, Redis 7 instance, PostgreSQL 16 database, BullMQ Worker).
  * SSL/TLS termination, automated health checks, environment secrets configuration.

---

## 📈 Quality Assurance, Security & Verification Matrix

| Area | Verification Method | Pass Criteria |
| :--- | :--- | :--- |
| **Identity & Pass Claim** | Automated Unit & Integration Tests | 100% accurate match against pre-loaded CSV; zero duplicate claims. |
| **QR Code & Scanning** | Camera QR Scan + 6-digit Code + Barcode | Scan resolution in < 200ms with accurate sound/haptic feedback. |
| **Concurrency & Duplicate Prevention** | Parallel Check-in Stress Test | Atomic Redis lock rejects 100% of simultaneous duplicate scan requests. |
| **WebSocket Real-time Sync** | Multi-client broadcast test | Broadcast announcements reach 15,000 active clients in < 500ms. |
| **High-Traffic Scale** | k6 Load Testing (15k concurrent simulation) | System operates at > 99.9% success rate with p95 latency < 150ms. |
| **Security & Compliance** | OWASP Top 10 Audit | Strict input validation, sanitized SQL queries, Helmet headers, protected routes. |

---

## 📅 Suggested Implementation Sprints

* **Sprint 1 (Days 1–3)**: Frontend UI Design System, Public Pages (Home, Schedule, Speakers, Gallery, Map) & Framer Motion Animations.
* **Sprint 2 (Days 4–6)**: NestJS Core Backend, PostgreSQL Schema, Prisma ORM, Clerk Auth & CSV Student Ingestion Pipeline.
* **Sprint 3 (Days 7–8)**: Digital Pass Generation Engine, Fallback 6-digit Code, Barcode & Volunteer Mobile Camera Scanner PWA.
* **Sprint 4 (Days 9–11)**: Socket.io Real-time Layer, Live Admin Mission Control Dashboard, Check-in Velocity Analytics & Broadcast Ticker.
* **Sprint 5 (Days 12–14)**: Server-side FFmpeg Media Processing Worker, Cloudinary CDN, AI Helpdesk with Volunteer Chat Escalation, 15k Concurrency Load Testing & Railway.com Deployment.
