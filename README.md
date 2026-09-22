# ScholarAI

**Scholarship discovery, SOP generation, and application tracking in one workspace.**

ScholarAI is a full-stack study-abroad assistant that searches the open web for
real scholarships, verifies them against official sources, and guides you from
"interesting opportunity" to "application submitted" — with an AI-written
Statement of Purpose, a document checklist, and deadline reminders along the way.

Built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **Supabase**,
**Groq / Gemini LLMs**, and **Resend**. Everything runs with an intentionally
monochrome, low-noise interface.

```
Next.js 16 · React 19 · TypeScript 5 · Tailwind CSS 4 · Supabase · Zustand · Groq AI · Gemini · Resend
```

---

## Table of contents

- [Why it exists](#why-it-exists)
- [Features](#features)
- [How scholarship discovery works](#how-scholarship-discovery-works)
- [The application journey](#the-application-journey)
- [AI architecture](#ai-architecture)
- [Tech stack](#tech-stack)
- [Database architecture](#database-architecture)
- [API surface](#api-surface)
- [Project structure](#project-structure)
- [Environment variables](#environment-variables)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Quality & validation](#quality--validation)
- [Design principles](#design-principles)
- [Current status & known limits](#current-status--known-limits)
- [Future improvements](#future-improvements)

---

## Why it exists

Finding scholarships is genuinely broken:

- Opportunities are scattered across thousands of university and government
  pages — there is no single, trustworthy index.
- Aggregator sites are noisy, often stale, and rarely link back to the
  authoritative source.
- Even once you find a scholarship, the real work — eligibility checks,
  documents, a Statement of Purpose, deadlines — is uncoordinated and
  spreadsheet-driven.

ScholarAI treats **official sources as the only source of truth**. It does not
curate scholarship listings by hand and it does not scrape aggregators. Instead,
it runs a live discovery pipeline that finds official pages, reads them, and
turns the results into a tracked, step-by-step application workspace.

---

## Features

### 1. Scholarship discovery (live web search)

- Natural-language search over the open web — no manual catalog to maintain.
- Filters for country, degree level, field, funding type, and scholarship type.
- **Official-source verification**: results are cross-checked against the
  authoritative page; aggregators, blogs, and SEO content are rejected.
- Live results are ranked by a status-aware sort (open → deadline passed → …)
  and cached in memory for 30 minutes to keep repeat searches fast.
- Every result carries its source page, last-updated timestamp, and a clear
  "Official" badge when the source has been verified.

### 2. Official-source gate

A scholarship is only "official" if its URL clears a multi-layer gate:

- Aggregator / news / blog host blocklists.
- A trust model for known university and government domains.
- A verification verdict on the fetched page (fail-closed — no verdict means
  "not official").
- Persisted catalog rows must also pass the gate at read time; anything stale
  or unverifiable is treated as not found rather than shown with confidence.

### 3. Scholarship detail page

Each result gets a full profile: deadline banner with days-remaining urgency
pill, documents required, IELTS / English requirement, source freshness, a
verified "Open Official Website" link, and an **"Add to my applications"** action.

A transparent **Profile Match** panel scores fit against your onboarding profile
and lists exactly what is missing (e.g. "IELTS band required", "Transcript not
uploaded") — with a disclaimer that it is an estimate, never an eligibility
decision.

### 4. Application journey

Every tracked application gets a guided, five-step preparation flow, with each
change persisted to Supabase:

1. **Requirements** — parse the scholarship's requirements into categories
   (CV, transcript, SOP, degree, recommendation, English, other) and mark each
   ready / missing / confirm.
2. **Program & link** — pick the specific program you are applying to; the app
   re-reads the scholarship's official page to offer real program options when
   available.
3. **Documents** — upload and match your documents to the requirements.
4. **SOP** — draft your Statement of Purpose (see below).
5. **Submit** — record the official application link and move your status along
   a clear workflow.

Statuses are self-managed: `Interested → Preparing → Applied → Under Review →
Interview → Accepted → Rejected`, with legacy values mapped in.

### 5. AI Statement of Purpose (SOP) generator

- **Generate**: draft a full SOP from your profile.
- **Improve**: upgrade an existing draft in place.
- Export as a **.docx** file (generated purely in the browser — no server or
  third-party document library).
- Handoff with your application's context so the SOP matches the scholarship
  you are actually applying to.

### 6. Claim checker

Paste your SOP and the app evaluates each factual claim (funding amounts,
eligibility, commitments) and flags it as:

- **Supported** — consistent with the requirements
- **Needs verification** — no evidence found, verify before submitting
- **Potentially unsupported** — looks inconsistent

Claims that cannot be checked are never assumed safe.

### 7. Document requirements matching

A requirements parser maps free-text scholarship requirements to your uploaded
documents using synonym-aware matching (`transcript` ↔ "academic record",
etc.). Matching is intentionally conservative — it only claims a match it can
defend, otherwise it asks you to confirm.

### 8. Deadline & email alerts

A scheduled endpoint (protected by `CRON_SECRET`) evaluates your tracked
applications and sends branded emails through **Resend**:

- **Deadline alerts** for applications due within the next 7 days.
- Document and profile-completion reminders.

Notification preferences are per-user, with all reminders enabled by default
until you opt out.

### 9. Onboarding & profile

A consultant-style, four-step onboarding collects your background and
preferences:

1. About you — name, contact, current country / city.
2. Education — level, field of study, university, graduation year, GPA / scale.
3. Goals — interests, funding preference, destinations, degree level.
4. Final preferences — budget / tuition, IELTS status & band, intake, fee
   waivers, multi-country openness.

Everything entered here can be revisited and edited later from `/profile`.

### 10. Auth

Email/password or Google OAuth via Supabase Auth, with a session-refresh proxy
middleware, a fire-and-forget profile upsert on sign-in, and gated routing
(`onboarded_at` is the single source of truth — you cannot skip onboarding via a
deep link).

---

## How scholarship discovery works

The pipeline runs server-side on every search (`POST /api/scholarships/search`),
needs no API key for web search, and spends a single LLM call per batch.

```
User query
   │
   ▼
Intent classification (heuristic, offline — no LLM)
   │
   ▼
Parallel web search (Tavily Search API)
   │
   ▼
Aggregate results → hard-prune non-official sources
   (host blocklist · trust model · generic-name filter)
   │
   ▼
Fetch official candidate pages (bounded concurrency, per-request timeout)
   │
   ▼
Local scholarship-signal filter (keyword heuristics, no LLM)
   → keep at most 8 official pages
   │
   ▼
ONE bounded Groq LLM batch → strict-JSON extraction
   │
   ▼
Official-domain verification → current status / deadline derivation
   │
   ▼
Status-priority sort → in-memory cache (30 min TTL) → response
```

Design decisions that keep it honest:

- **LLM used only where it earns its place.** Intent classification, source
  pruning, and the scholarship-signal filter are deterministic heuristics. The
  LLM is used for structured extraction (one strict-JSON batch) and is
  fallback-safe: if Groq is unavailable, the app falls back to the page's own
  metadata rather than stopping the search.
- **Aggregators are never trusted.** Scholarship-on-aggregator matches are
  pruned regardless of perceived quality.
- **Fail-closed verification.** A page without a positive official verdict is
  treated as not official.

---

## The application journey

```
Landing page
   │
   ▼
 /auth — Google OAuth or email/password
   │
   ▼
 /onboarding — 4-step profile + preferences (onboarded_at gate)
   │
   ▼
 /dashboard — stats, recent applications, quick actions
   │
   ├── /scholarships — live discovery + filters
   │       └── /scholarships/[id] — verify, match score, "Add to applications"
   │
   ├── /applications — tracked applications by status
   │       └── /applications/[id] — 5-step journey
   │
   ├── /sop-generator — SOP → .docx → /claim-checker
   │
   └── /profile — edit profile & preferences
```

---

## AI architecture

- **Groq** is the primary LLM provider
  (`openai/gpt-oss-120b` over the OpenAI-compatible endpoint). All calls go
  through a single strict-JSON helper that pins to the requested shape, retries
  on rate limits, and never emits prose.
- **Gemini** (`gemini-2.5-flash`) is the SOP-generation fallback if Groq is
  unavailable.
- Provider keys live only server-side in API routes; the browser never touches
  a provider secret.

| Task | Provider choice | Failure behaviour |
| --- | --- | --- |
| Scholarship extraction (strict JSON) | Groq (single bounded batch) | Fall back to page metadata |
| SOP generate / improve | Groq → Gemini fallback | Surface a clean error, keep the draft |
| Claim checking | Groq (strict JSON) | Unknown claims default to "needs verification" |

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16.3.4 (App Router, Turbopack) |
| UI | React 19.2.8, TypeScript 5 |
| Styling | Tailwind CSS 4, lucide-react icons, Geist fonts |
| State | Zustand 5 (client stores) |
| Database & Auth | Supabase (`@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.116.0) |
| AI | Groq (`openai/gpt-oss-120b`) + Gemini (`gemini-2.5-flash`) via HTTP |
| Email | Resend |
| Documents | Pure client-side `.docx` writer (no third-party doc library) |

---

## Database architecture

All schema lives in versioned migrations under `supabase/migrations/`.

| Table | Purpose |
| --- | --- |
| `profiles` | User identity, contact, academic background, **onboarding state** |
| `preferences` | Discovery & matching preferences (destinations, degree levels, funding, IELTS, budget…) |
| `applications` | Tracked applications — scholarship snapshot, status workflow, program / application link, unique per (user, scholarship) |
| `documents` | Uploaded requirement documents |
| `deadlines` | Application deadline tracking |
| `sops` | Generated SOPs |
| `claims` | Claim-checker results |
| `scholarships` | Verified scholarship catalog (source-verified URLs, current status) |
| `email_alerts` | Sent-alert log (prevents duplicate reminders) |
| Storage bucket | `documents` — requirement file uploads |

Migration timeline highlights:

- `001`–`004` — core tables (profiles, applications, documents, deadlines; sops; claims; email alerts)
- `005`–`006` — profile insert policy, onboarding + preferences
- `007`–`010` — scholarship catalog schema, documents storage, preferences RLS fixes
- `011`–`013` — application ↔ scholarship snapshot + status workflow (unique per user), scholarship source verification, tracking privileges
- `014`–`015` — journey state (`requirements_reviewed`), application fields snapshot

**Row-level security** locks the tables to `authenticated` rows — an anonymous
client is refused read access to even the scholarships catalog.

Catalog persistence note: live discovery results are always available, but
writing them into the `scholarships` catalog currently requires a
`SUPABASE_SERVICE_ROLE_KEY` (the planned production scraper that seeds the
catalog is the remaining piece — see [Current status](#current-status--known-limits)).

---

## API surface

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/scholarships/search` | POST | Run the discovery pipeline (query + filters, limit clamped 1–24) |
| `/api/scholarships/program-options` | POST | Re-read an application's official page to list eligible programs |
| `/api/generate-sop` | POST | Generate or improve an SOP (`mode: generate \| improve`) |
| `/api/check-claims` | POST | Evaluate factual claims in a SOP |
| `/api/cron/send-alerts` | GET | Scheduled email alerts — **requires `?key=CRON_SECRET`** |
| `/api/notifications/get-preferences` | GET | Per-user notification preferences (defaults when none exist) |
| `/api/notifications/update-preferences` | POST | Upsert notification preferences |

---

## Project structure

```
src/
├── app/                        # App Router: pages + API routes, proxy middleware
│   ├── page.tsx                # Landing page
│   ├── api/                    # /generate-sop · /check-claims · /scholarships/search
│   │                           # /scholarships/program-options · /cron/send-alerts
│   │                           # /notifications/get-preferences · /update-preferences
│   ├── auth/                   # Email/password + Google OAuth, callback exchange
│   ├── dashboard/  applications/  scholarships/  profile/
│   ├── sop-generator/  claim-checker/  onboarding/
├── components/                 # Header, LandingPage, Select, ScholarshipCard, StatusBadge…
├── features/
│   ├── application-tracking/   # Journey UI, cards, status/URL helpers
│   ├── email-alerts/           # Resend service + branded templates
│   ├── sop-generator/          # Service, form/result components, client-side .docx writer
│   ├── claim-checker/          # Service + handoff
│   ├── onboarding/             # 4-step flow, data-driven option lists, types
│   └── recommendations/        # (foundations for future recommendation modules)
├── hooks/                      # useRequireOnboarding gate
├── lib/
│   ├── supabase.ts             # Server/client Supabase clients
│   ├── scholarship/
│   │   ├── search.ts           # Discovery pipeline orchestrator
│   │   ├── web-search.ts       # Tavily Search API adapter (server key)
│   │   ├── web.ts              # Host blocklists, trust model, URL utilities
│   │   ├── verify.ts           # Official-source verification (fail-closed)
│   │   ├── extract.ts          # LLM extraction schema + prompts
│   │   ├── groq.ts             # Strict-JSON LLM helper (retry, code-fence stripping)
│   │   ├── cache.ts            # In-memory TTL cache + catalog persistence
│   │   ├── intent.ts           # Query intent classification (offline)
│   │   ├── match.ts            # Candidate→profile matching scorer
│   │   ├── journey.ts          # Requirements parser (categories + checks)
│   │   ├── documents.ts        # Requirement ↔ document matching
│   │   ├── status.ts…          # (helpers: status, format, types, API types)
├── store/                      # Zustand stores (auth, app, scholarship results)
└── proxy.ts                    # Session-refresh middleware
supabase/
└── migrations/                 # 001…015 versioned SQL
```

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public anon key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | ⬜ | Catalog persistence / backfill (scraper) — safe to leave empty for live discovery only |
| `GROQ_API_KEY` | ✅ | Primary LLM provider |
| `TAVILY_API_KEY` | ✅ | Web discovery (scholarship search provider) |
| `GEMINI_API_KEY` | ⬜ | SOP-generation fallback provider |
| `RESEND_API_KEY` | ⬜ | Deadline / reminder emails |
| `CRON_SECRET` | ⬜ | Auth for the scheduled alert endpoint |

Copy `.env.example` to `.env.local` and fill in what you have. The app warns (and
degrades gracefully) when Supabase keys are missing.

> No secrets are ever exposed to the browser — provider keys are only read
> inside API route handlers.

---

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your values
npm run dev                  # http://localhost:3000
```

The app works with live discovery using only public keys; a Supabase project is
needed for auth, persistence, and the catalog.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

---

## Quality & validation

This repo ships without a test suite; correctness is enforced through pipeline
stages instead:

```bash
npm run lint      # ESLint
npx tsc --noEmit  # TypeScript type-checking
npm run build     # Full production build (catches route/SSR issues)
```

Every schema change is a versioned migration, so the database can be rebuilt
deterministically from scratch.

---

## Design principles

- **Monochrome by choice.** Black, white, and grays only — no gradients, no
  glow, no decorative color. Color is saved for three cheap signals: urgency
  (deadlines), status, and errors.
- **Truthful UI.** Statuses, progress, and dates are derived from real data or
  clearly marked as "to be confirmed". Nothing is hardcoded or prettified.
- **Aid, don't replace, judgment.** The profile match, claim checker, and
  requirement matcher all say what they know and explicitly flag what they
  don't.

---

## Current status & known limits

- ✅ Live discovery works end-to-end with public keys only (search → verify → extract → sort).
- ✅ Application journey, SOP generation, claim checking, and email alerts are implemented.
- ⬜ **Catalog backfill is the remaining automation** — persisting discovery
  results into the `scholarships` catalog needs the `SUPABASE_SERVICE_ROLE_KEY`
  and is the planned production scraper step. Without it, the catalog stays
  empty and every search is live.
- ⬜ Groq rate limits (HTTP 429) are handled with retry + metadata fallback, but
  under heavy load extraction quality can degrade.
- ⬜ Alert emails only send once `RESEND_API_KEY` is configured; the cron
  already honours per-user notification preferences for all three reminders.

---

## Future improvements

- Production scraper / backfill job into the `scholarships` catalog (using the service-role key),
  so the index grows and repeated searches hit cached catalog rows.
- On-dashboard **recommendation modules** (the matching and filtering
  foundations already exist in `lib/scholarship/match.ts` and the discovery
  filters).
- Automatic re-verification of catalog scholarships to keep `current_status`
  fresh.
- Notification UI wiring for document and profile reminders.
- A proper test suite (the pipeline modules are pure enough to unit-test
  directly).
