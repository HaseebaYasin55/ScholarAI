# Scholarship Discovery Pipeline (Phase 1 Foundation)

> This directory documents the **architecture and contracts** for the scholarship delivery pipeline.
> Phase 1 ships the data schema, matching engine, UI, and this contract documentation. The scraper
> implementation itself is a designated Phase 2 job, gated behind the contract below.

## Goal

Populate the `scholarships` catalog **only** with verified, real scholarships sourced from
official university and government pages — never invented, never scraped blindly from aggregators.

## Pipeline

```
SOURCES ──> SCRAPER(S) ──> PARSER / NORMALIZER ──> VALIDATION ──> SUPABASE (scholarships)
 (official)    (per-source)      (-> ScholarshipInput)         (hard gates)
```



### 1. Sources (approved)

Priority order — always prefer an official record over a summary:

1. **Official university scholarship pages** (university domain). e.g. `scholarships.ox.ac.uk/...`
2. **Official government / ministry pages** e.g. `daad.de`, `studyinaustralia.gov.au`, `gov.uk/...`
3. **Recognised embassy / national commission pages**

Disallowed:

- Aggregator pages as the *source* (e.g. scholarship listing sites). They may be used only to
  **discover** candidates, never as the record of truth.
- Any page that does not expose a stable URL for the scholarship record.

### 2. Scraper

One scraper module per source profile (university template, gov portal template, …). Each scraper
MUST:

- record `sourceUrl` (the exact page scraped),
- record `officialScholarshipUrl` (the canonical application/description URL, usually same page),
- record `officialUniversityUrl` when the university is known,
- tolerate missing fields (leave `null`) — never fabricate.

### 3. Parser / Normalizer

Maps raw source fields into the shared `ScholarshipInput` contract (below). Responsibilities:

- normalize country, funding type, coverage labels to the controlled vocabulary in the DB check
  constraints (see migration `007`),
- parse dates to ISO (`YYYY-MM-DD`) or leave `null`,
- split multi-valued fields into arrays (degree levels, fields, required documents),
- if a source only lists a funding range, store the **confirmed** base value and leave the rest null.

### 4. Validation (hard gates)

A record is rejected unless **all** of these hold:

- `name`, `country`, and at least one of `officialScholarshipUrl` / `officialUniversityUrl` are set,
- `sourceUrl` is an `http(s)` URL,
- `deadline`/`openingDate`, when set, are parseable ISO dates,
- degrees and fields pass the controlled vocabulary,
- the record has a stable id (`name + university + country + deadline` composite) — re-runs must
  UPSERT, not duplicate.

### 5. Supabase

- Insert via `supabase-js` into table `scholarships` (schema in migration `007`).
- Re-inserts use the stable id to upsert and refresh `last_updated`.
- The catalog is read-only for clients (RLS: `authenticated` CAN SELECT, no writes).
- A future cron (with `CRON_SECRET` already present in `.env.local`) can schedule nightly refreshes.

## Matching

Matching is **rule-based and transparent** (`src/lib/scholarship/match.ts`). Weights:

| Factor               | Weight |
| -------------------- | ------ |
| Degree level         | 25     |
| Field of study       | 25     |
| Destination          | 20     |
| Funding compatibility| 15     |
| IELTS status         | 10     |
| Tuition budget       | 5      |

Scores are normalized to 0–100 when factors don't apply. The result exposes `score`, `reasons`,
and `missing` items. The UI always labels it **Profile Match** with the official disclaimer:
not an eligibility decision.

## Contracts

See `contracts.ts` for the TypeScript types used across the pipeline.