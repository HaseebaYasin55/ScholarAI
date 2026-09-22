# ScholarAI

**Scholarship discovery, SOP generation, and application tracking in one workspace.**

ScholarAI is a full-stack study-abroad assistant. It searches the open web for real, currently-open scholarships — always pointing back to official university and scholarship pages — extracts structured eligibility and deadline data with AI, and walks you through each application from choosing a program to submitting it, with a Statement of Purpose (SOP) generator and a claim checker to keep your materials honest.

**Visit the app:** [ScholarAI](https://scholar-ai-opal.vercel.app/)

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Key Features](#key-features)
- [End-to-End User Flow](#end-to-end-user-flow)
- [Scholarship Discovery Architecture](#scholarship-discovery-architecture)
  - [Tavily Search + Official-Source Filtering](#tavily-search--official-source-filtering)
  - [Cheerio Web Scraping](#cheerio-web-scraping)
  - [Groq AI Extraction](#groq-ai-extraction)
  - [Deadline & Program/Course Extraction](#deadline--programcourse-extraction)
- [Application Preparation Journey](#application-preparation-journey)
- [Document Tracking](#document-tracking)
- [SOP Generator + Saved SOPs](#sop-generator--saved-sops)
- [Profile & Onboarding](#profile--onboarding)
- [Claim Checker](#claim-checker)
- [Supabase Auth + PostgreSQL Architecture](#supabase-auth--postgresql-architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Local Setup](#local-setup)
- [Run & Build Commands](#run--build-commands)
- [Main Routes & Modules](#main-routes--modules)
- [Security Considerations](#security-considerations)
- [Current Project Status](#current-project-status)
- [Future Improvements](#future-improvements)

---

## Problem Statement

Applying for a scholarship abroad is fragmented across dozens of university sites. Students must:

- Discover which scholarships actually match their profile (country, degree level, field, funding).
- Trust that the information they read is real — not SEO bait from aggregators.
- Track deadlines, eligibility, required documents, and application status per university.
- Write a distinct, honest Statement of Purpose for each program.
- Make sure every claim in their materials is supported by evidence.

ScholarAI replaces this scattered workflow with a single workspace: **discovery grounded in official sources**, **an AI-ordered preparation journey per application**, and **tools that help you write and verify your application materials**.

---

## Key Features

| Feature | Description |
| --- | --- |
| **Verified Scholarship Search** | Finds live scholarships on the open web via Tavily, then filters to official university/authority pages. Never surfaces aggregators or invented entries. |
| **AI Structured Extraction** | Groq parses each official page into a clean, typed scholarship record — deadline, funding, eligibility, required documents, programs, IELTS requirements, and more. Unknown values stay `null` ("Not specified") instead of guessing. |
| **Country-Based Relevance** | Search follows your citizenship and preferred destinations: degree level and funding filters, country affinity, and an open-to-all-disciplines check. |
| **Application Tracking** | Track any scholarship through `Interested → Preparing → Applied → Under Review → Interview → Accepted` with a per-application snapshot of deadlines and required documents. |
| **Application Preparation Journey** | A guided 6-step checklist per scholarship: choose program, review official requirements, confirm review, upload documents, generate an SOP, submit the official application. |
| **Document Tracking** | Upload CVs, transcripts, SOPs and degree certificates (PDF/DOC/DOCX) to your private Supabase storage; the journey auto-classifies requirements as ready/missing. |
| **SOP Generator** | Generates and improves personalized statements of purpose from your profile and the program's official requirements — with saved drafts linked to applications. |
| **Saved SOPs** | Every generated SOP is saved and linked to its application, so you can iterate across drafts. |
| **Claim Checker** | Audits individual claims or a full SOP against your profile and supporting documents; flags anything unsupported or potentially fabricated with suggestions on how to fix it. |
| **Readiness Dashboard** | A percentage-based readiness score per application with the concrete missing items blocking submission. |
| **Profile & Onboarding** | One-time onboarding captures education, GPA, IELTS, interests, destinations, and funding preferences; the profile auto-fills SOP generation and claim checking. |

---

## End-to-End User Flow

```
Sign up / Sign in ─► Onboarding ─► Dashboard ─► Discover scholarships
   (Supabase Auth)   (profile +      (readiness,       (Tavily → official pages)
                      preferences)     stats, recs)
                                           │
                                           ▼
                            Scholarship detail (verified facts, Official badge)
                                           │
                              Add to applications (snapshot row created)
                                           │
                                           ▼
                    Application Preparation Journey (/applications/:id)
         ┌───────────┬───────────┬──────────────┬─────────────┬──────────────┐
         ▼           ▼           ▼              ▼             ▼              ▼
    1. Choose    2. Review   3. Confirm    4. Upload     5. Generate     6. Mark
       program    official     review       documents      SOP           applied
       (dropbox)  requirements               (storage)     (Groq/Gemini)
         └───────────┴───────────┴──────────────┴─────────────┴──────────────┘
                                           │
                                           ▼
                        Claim Checker (verify SOP claims ← profile)
                                           │
                                           ▼
                       Apply on the official website → status updates
```

1. **Authentication** — Email/password or Google OAuth via Supabase Auth.
2. **Onboarding** — Answer a few questions; this builds the profile used everywhere else.
3. **Dashboard** — See readiness across tracked applications, stats, and recommendations.
4. **Scholarship search** — Search by name, country, degree, field, or funding. Results are organized with country-based relevance and only official sources.
5. **Scholarship detail** — Read the extracted facts (deadline, funding, eligibility, required documents) with a **_Verified · Official_ badge** on rows confirmed against the authoritative source, plus a link to the official page.
6. **Track it** — "Add to applications" creates a snapshot row (`applications`) for that scholarship.
7. **Preparation journey** — Complete the 6 steps; every signal (program chosen, requirements reviewed, documents uploaded, SOP created, applied) updates the readiness score.
8. **Claim Checker** — Paste a claim or your whole SOP; get a strength score and per-claim verdicts against your profile.
9. **Submit** — "Apply on the official website" opens the verified official URL; mark the application Submitted/Applied to advance the tracker.

---

## Scholarship Discovery Architecture

```
  Intent (heuristic)
        │
        ▼
  3–4 parallel Tavily searches
   (name / country+field+degree / funding+eligibility)
        │
        ▼
  Aggregate + OFFICIAL-domain-preference prune
   (blocked: aggregators, news, blogs, SEO, social)
        │
        ▼
  Fetch ~10 candidate pages in parallel
   (bounded concurrency, per-request timeout,
   respects robots.txt, 1.6 MB page cap)
        │
        ▼
  Local scholarship-signal filter
        │
        ▼
  Pick ≤ 8 official pages
        │
        ▼
  ONE bounded Groq batch extraction
   (deadline / funding / eligibility / programs)
        │
        ▼
  Status & deadline read from the official page
   → status-priority assembly
        │
        ▼
  30-min in-memory cache (optional DB persistence)
```

The pipeline lives in `src/lib/scholarship/` and is orchestrated by `search.ts`.

### Tavily Search + Official-Source Filtering

- Queries are shaped by an **intent heuristic** (`intent.ts`) that understands named scholarships (with safe spelling correction, e.g. "Fullbright" → "Fulbright"), countries, degree levels, funding types, and whether the opportunity must currently be open.
- **Tavily** (`web-search.ts`) is the search/discovery layer; 3–4 searches run in parallel and the results are merged.
- Results are then **pruned toward official domains** by `web.ts`: social media, aggregators, news, blogs, and SEO sites are blocked, so candidates are overwhelmingly university and authority domains.
- An **LLM-assisted verifier** (`verify.ts`) confirms authenticity and is **fail-closed** — a page that does not clearly pass both the deterministic trust gate (institutional domain + on-page scholarship signal → `domainTrust`) and the verification step is not surfaced as verified. A small `TRUSTED_ORGS` allowlist (e.g. `daad.de`, `fulbright.org`) covers authoritative non-`.edu` sources.
- The UI only ever shows an **"Official" badge** (and an official "Apply" link) for rows that cleared this gate (`verifiedOfficialUrl` / `isOfficialApproved` in `scholarshipApps.ts`). Verified results are marked in the database with `source_verified_at`.

### Cheerio Web Scraping

- `web.ts` fetches each candidate page with **Cheerio**, honoring `robots.txt` (`robotsAllow`), using a transparent ScholarAI user agent, capping pages at ~**1.6 MB**, and enforcing short per-request timeouts.
- It **never bypasses CAPTCHAs or paywalls**, and only ever reads public pages.
- The same scraper powers the **program-options** endpoint, which re-reads a tracked application's own official page to return the concrete programs/fields the page actually states.

### Groq AI Extraction

- `extract.ts` sends a **single bounded batch** to **Groq** (`groq.ts`, model `openai/gpt-oss-120b` via the OpenAI-compatible endpoint, with retry and rate-limit handling) to extract a strictly-validated, normalized scholarship record.
- The extractor **never invents information** — an absent value is kept `null` and rendered as "Not specified" in the UI.
- Extraction covers: name, university, country, degree levels, fields, funding type, tuition coverage, stipend, accommodation, travel allowance, health insurance, application fee, eligibility, required documents, IELTS requirement, opening date, deadline, cycle, application status, official URLs, eligible nationalities, and nationality restrictions.

### Deadline & Program/Course Extraction

- **Deadline** comes from the official page and drives status ordering (open / closing soon / closed) and the application tracker's calendar.
- **Programs & courses** ("fields") are extracted per scholarship and used to populate the journey's program dropdown (Step 1). When the official page lists no concrete programs, the UI falls back to a manual entry field.
- **Country-based relevance** mixes your citizenship/destinations with degree level and funding filters; additionally `openToAllDisciplines` flags scholarships that accept every field.

---

## Application Preparation Journey

For every tracked scholarship, `/applications/[id]` (`ApplicationJourney.tsx` + `journey.ts`) presents a 6-step checklist:

1. **Chosen program** — select from the official page's programs (via the program-options endpoint) or enter it manually.
2. **Official requirements** — deadline, IELTS requirement, eligibility, and required documents, loaded from the verified extraction.
3. **Requirements reviewed** — confirm you read them.
4. **Documents** — upload the required documents; the step turns green only when every required item has an upload.
5. **SOP** — generate or improve a Statement of Purpose for that university/program; the saved SOP links to the application.
6. **Deadline & submission** — the tracker's final step; once complete you mark the application as applied.

Every signal is derived from data that is already persisted, so the journey is always in sync:

- Chosen program → `applications.program`
- SOP step → `sops.application_id`
- Documents ready → `documents` (namespaced by university)
- Applied → `applications.status`
- Requirements reviewed → `applications.requirements_reviewed` (the only journey-only column, added in migration 014)

`readiness.ts` (`computeApplicationReadiness`) turns these into a percentage and a list of missing items; the dashboard and detail page render the same numbers.

---

## Document Tracking

- Uploads go to a **private, RLS-scoped `documents` storage bucket** (`documents` ↔ user id prefix), accepting PDF, DOC, and DOCX up to 5 MB (migration 008).
- The `documents` table stores name, university, status, and deadline per file.
- `documents.ts` classifies each requirement by type (CV, transcript, SOP, degree, recommendation, English proof, other) with synonym-aware matching (`docMeets`).
- **"Ready" is assigned conservatively** — only when a real upload exists; everything else is `missing` or needs confirmation.

---

## SOP Generator + Saved SOPs

- Three places surface the generator: the dedicated `/sop-generator` page, the preparation journey (Step 5), and the scholarship detail page (via a session-storage prefill handoff, `SOP_PREFILL_KEY`).
- The API (`/api/generate-sop`) has two modes:
  - **generate** — writes a fresh SOP from your profile facts and the program's official requirements.
  - **improve** — refines an existing draft while preserving every factual claim.
- A hard rule: **only the student's own profile facts may be used; the model never invents achievements, metrics, grades, projects, or university statistics.** Official requirements (pasted from the university site) are followed exactly.
- Every generated SOP is saved to the `sops` table and linked to its application, so you can iterate and revisit drafts.

---

## Profile & Onboarding

- A one-time onboarding flow (`/onboarding`) collects first/last name, location, education level, degree, university, graduation year, GPA and scale, IELTS status/band, interests, preferred field, study destinations, degree levels, and funding preferences.
- Saved to `profiles` (extended in migration 006) and `preferences` (array columns that grow without schema changes).
- The same profile powers dashboard recommendations, SOP generation, and claim checking; `useRequireOnboarding` routes users to `/onboarding` until it is complete.

---

## Claim Checker

The `/claim-checker` page and `/api/check-claims` endpoint audit your application materials in two modes:

- **Single claim** — paste one claim (e.g. "Led a 12-person team"); you get a strength score (0–100), a verdict (**Strong / Needs Evidence / Weak / Contradictory**), analysis, and 2–3 concrete suggestions for improving it.
- **Document mode** — paste your full SOP; the model extracts every factual claim and classifies each as **Supported / Needs verification / Potentially unsupported** against your profile and uploaded documents, quoting the matching evidence or saying none was found.

Results are stored in the `claims` table. The checker **never invents facts or documents** — it only compares claims against what you actually provided.

---

## Supabase Auth + PostgreSQL Architecture

ScholarAI uses a **Supabase** backend with **Supabase SSR** cookie session handling:

```
Browser ──► Next.js App Router (SSR) ──► Supabase client (anon key, RLS everywhere)
   │                                       supabase-browser.ts / supabase-admin.ts
   │
   └────► API routes (server-only) ──► Tavily · Cheerio · Groq (· Gemini fallback)
                     │
                     └──► Supabase (service-role key, never exposed to the client)
                              for cache persistence + admin writes
```

### Authentication & Sessions

- **Email/password** sign-up/login and **Google OAuth** (`/auth`, `src/lib/auth-urls.ts`, `AuthProvider` + `authStore`).
- Sessions are runtime client and server Supabase clients built from the configured cookies; a proxy/edge middleware layers session refresh.
- `useRequireOnboarding` gates every page behind login → onboarding.

### Database (PostgreSQL — 16 migrations in `supabase/migrations/`)

| Table | Purpose | RLS |
| --- | --- | --- |
| `profiles` | Extended student profile (onboarding fields) | Own row only |
| `applications` | Per-scholarship tracker rows + journey state (`requirements_reviewed`, `official_url`, `fields`, ...) | Own rows only |
| `sops` | Saved SOP drafts linked to applications | Own rows only |
| `claims` | Claim-checker results | Own rows only |
| `documents` | Document outbox (name, status, deadlines) + `file_path` into storage | Own rows only |
| `preferences` | Onboarding multi-select preferences (`text[]`) | Own row only |
| `scholarships` | Verified scholarship catalog (read-only for clients) | Authenticated view (`SELECT` only); writes restricted to the server-side service role |
| `deadlines` / `notifications` | Original deadline and notification outbox tables | Own rows only |

- **Row-Level Security is enabled on every table**; the anon key (client) can only touch its own rows and read public catalog data, while the service-role key (server only) performs verification writes to `scholarships`.

---

## Tech Stack

| Area | Technology |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org/) (App Router, Turbopack, TypeScript) |
| UI | React 19, [Tailwind CSS v4](https://tailwindcss.com/), [lucide-react](https://lucide.dev/) |
| State | [Zustand](https://zustand-demo.pmnd.rs/) (`authStore`, `appStore`, `scholarshipResultsStore`) |
| Backend | Next.js API Routes (server-only) |
| Database & Auth | [Supabase](https://supabase.com/) (PostgreSQL + Auth + Storage), `@supabase/ssr` |
| Web search | [Tavily](https://tavily.com/) |
| Scraping | [Cheerio](https://cheerio.js.org/) |
| LLM extraction | [Groq](https://groq.com/) (`openai/gpt-oss-120b`) + optional Gemini 2.5 Flash fallback |
| Document parsing | Cheerio (server) + browser file readers (client) |

---

## Project Structure

```
frontend/
├─ next.config.ts                     # Next.js config
├─ vercel.json                        # deployment metadata
├─ .env.example                       # environment template
├─ supabase/
│  └─ migrations/                     # 16 SQL migrations (001→016), incl. RLS
├─ scripts/
│  ├─ scholarship-scraper/            # standalone scraper contracts/utilities
│  └─ test-deadline-reminders.mjs     # route-level test helper
└─ src/
   ├─ app/                            # App Router pages + API routes
   │  ├─ auth/  onboarding/  dashboard/
   │  ├─ scholarships/  scholarships/[id]/
   │  ├─ applications/  applications/[id]/
   │  ├─ sop-generator/  claim-checker/  profile/
   │  └─ api/
   │     ├─ scholarships/search  scholarships/program-options
   │     ├─ generate-sop  check-claims
   │     └─ (notifications, cron)      # reserved / administrative endpoints
   ├─ components/                     # shared UI + Logo (brand mark)
   ├─ features/
   │  ├─ scholarships/                # search UI, detail, AddToApplications
   │  ├─ sop-generator/               # form, service, save logic
   │  ├─ claim-checker/               # claim + document audit UI
   │  ├─ application-tracking/        # tracker, journey, status helpers
   │  └─ onboarding/                  # onboarding wizard
   ├─ hooks/                          # useRequireOnboarding, etc.
   ├─ lib/
   │  ├─ supabase*.ts                 # client/admin SSR clients
   │  └─ scholarship/                 # discovery pipeline
   │     ├─ search.ts  intent.ts  web-search.ts  web.ts
   │     ├─ extract.ts  verify.ts  groq.ts  cache.ts
   │     └─ journey.ts  documents.ts  readiness.ts  status.ts ...
   └─ store/                          # Zustand stores (auth, apps, results)
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

| Variable | Description | Used by |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) | Client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key | Client + server (RLS-restricted) |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL | Auth redirects |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin key (never committed, never shipped to the client) | Scholarship catalog writes |
| `GROQ_API_KEY` | Groq API key | AI extraction, SOP generation, claim checking |
| `TAVILY_API_KEY` | Tavily search API key | Scholarship discovery |
| `GEMINI_API_KEY` | *(optional)* Gemini 2.5 Flash fallback for SOP/claim routes | Fallback only |

---

## Local Setup

1. **Clone & install**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   ```
   Fill in your Supabase, Groq, and Tavily keys (see above). The app auto-redirects to `/auth` if the session is missing.

3. **Set up Supabase**
   - Create a project, then run the migrations in `supabase/migrations/` in order (or push them via the Supabase CLI):
     ```bash
     supabase db push
     ```
   - Enable **Google OAuth** (and optionally email provider) in Authentication → Providers, and add `http://localhost:3000` as an allowed redirect URL.
   - Make sure the `documents` storage bucket ships with migration 008 (RLS policies included).

4. **Run the app**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000), sign up, complete onboarding, and search for a scholarship.

---

## Run & Build Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Start the production server |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | TypeScript type checking |

---

## Main Routes & Modules

| Route | Page / Purpose |
| --- | --- |
| `/auth` | Login / sign-up (email + Google OAuth) |
| `/onboarding` | Profile + preferences wizard |
| `/dashboard` | Readiness overview, stats & recommendations |
| `/scholarships` | Scholarship discovery & search |
| `/scholarships/[id]` | Verified scholarship detail + journey entry |
| `/applications` | Tracked applications list |
| `/applications/[id]` | Application preparation journey |
| `/sop-generator` | Standalone SOP generator |
| `/claim-checker` | Claim / SOP audit |
| `/profile` | Edit profile & documents |

| API | Purpose |
| --- | --- |
| `POST /api/scholarships/search` | Run the discovery pipeline (filters + refresh option) |
| `POST /api/scholarships/program-options` | Re-read an official page for its listed programs |
| `POST /api/generate-sop` | Generate or improve an SOP (Groq, Gemini fallback) |
| `POST /api/check-claims` | Audit a single claim or a whole SOP document |

---

## Security Considerations

- **Row-Level Security everywhere.** The anon key cannot read or write other users' rows or the storage bucket outside its own `user_id` prefix.
- **Service role is server-side only.** The `SUPABASE_SERVICE_ROLE_KEY` never reaches the client; only API routes use it (e.g. verifying/persisting the scholarship catalog).
- **Official URL strictness.** Only URLs that pass the blocked-source check and the official-source verification/trust gate are rendered as "Official" or "Apply on the official website". The program-options endpoint additionally refuses private hosts and non-`http(s)` schemes.
- **Fetch safety.** Scraping respects robots.txt, caps page size (~1.6 MB), times out, and never bypasses CAPTCHAs or paywalls.
- **No invented data.** Extraction, SOP generation, and claim checking are all prompt-constrained and validated so the app never fabricates facts, requirements, or URLs; unverified values render as "Not specified".
- **Server-side API keys** (`GROQ_API_KEY`, `TAVILY_API_KEY`) are only read in route handlers.
- **No credentials in the repo.** All secrets come from environment variables.

---

## Current Project Status

The application is **functional end-to-end**: authentication and onboarding, verified scholarship discovery (Tavily + Cheerio + Groq), the application preparation journey with document storage and readiness scoring, the SOP generator (with saved drafts), the claim checker, and the dashboard are all working in the current codebase.

### What's implemented
- Verified-official search with structured AI extraction and 30-minute caching.
- Program/fields re-reading for tracked applications.
- 6-step application journey with persisted state and per-step validation.
- Conservative "ready" document detection with synonym matching.
- SOP generate + improve modes with profile awareness and session prefill.
- Claim auditing for individual claims and full documents, with a profile context.
- Branded, accessible UI (Tailwind v4) with a graduation-cap brand mark and reduced-motion support.

### Not included
- Email automation and notification delivery are intentionally out of scope in the current build (some legacy endpoints/dependencies remain reserved and undocumented).
- Scholarship catalog persistence is optional and keyed to the service role; discovery works fully with in-memory caching.

---

## Future Improvements

- Scheduled refresh of the scholarship catalog and per-user discovery "watches".
- In-app deadline notifications (UI-level) instead of external channels.
- Multi-document upload with resume parsing into profile facts.
- Claim-checker history and compare-across-applications views.
- Admin/moderation surface for verifying and editing the official catalog.
- Expanded country/destination coverage and more regional authorities in the trusted list.

## Contributors

- [Haseeba Yasin](https://github.com/HaseebaYasin55)
- [Maryam Sarfaraz](https://github.com/MaryamSarfraz77)