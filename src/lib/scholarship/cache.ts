// ─── Result cache + optional DB persistence for discovered scholarships ──────
// Server-side only. A short-lived in-memory TTL cache avoids hammering the
// search/scrape pipeline on repeated queries. Persistence to the `scholarships`
// table is OPTIONAL and only runs when a SUPABASE_SERVICE_ROLE_KEY is present
// (the anon key cannot write that table by design).

const TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

function now(): number {
  return Date.now();
}

export function cacheKey(key: string): string {
  // Reuse the FNV-1a hash from web.ts for stable short keys.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `scholarship:${(hash >>> 0).toString(36)}`;
}

export function getCached<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached<T>(key: string, value: T, ttlMs = TTL_MS): void {
  // Opportunistic cleanup so the map cannot grow unbounded.
  if (store.size > 250) {
    for (const [k, e] of store) {
      if (e.expiresAt <= now()) store.delete(k);
    }
  }
  store.set(key, { value, expiresAt: now() + ttlMs });
}

// ─── Optional persistence to Supabase ────────────────────────────────────────

// The write path below is a deliberate no-op without a service role key — the
// `scholarships` table's RLS blocks writes from the anon key. When the key is
// configured, VERIFIED discoveries are upserted (deduped by source_url) so the
// dashboard catalog eventually benefits too. Unverified results are never
// persisted, so the catalog only ever contains officially-verified sources.
export async function persistResults(results: import("./types").Scholarship[]): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || results.length === 0) return;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, key, { auth: { persistSession: false } });

    for (const s of results) {
      if (!s.sourceUrl) continue;
      if (!s.officialSourceVerified) continue; // NEVER persist unverified rows
      const { data: existing } = await client
        .from("scholarships")
        .select("id")
        .eq("source_url", s.sourceUrl)
        .maybeSingle();

      const row = {
        name: s.name,
        university: s.university,
        country: s.country,
        degree_levels: s.degreeLevels,
        fields: s.fields,
        funding_type: s.fundingType,
        tuition_coverage: s.tuitionCoverage,
        tuition_fee: s.tuitionFee,
        stipend_amount: s.stipendAmount,
        stipend_frequency: s.stipendFrequency,
        accommodation_support: s.accommodationSupport,
        travel_allowance: s.travelAllowance,
        health_insurance: s.healthInsurance,
        application_fee: s.applicationFee,
        eligibility_requirements: s.eligibilityRequirements,
        required_documents: s.requiredDocuments,
        ielts_requirement: s.ieltsRequirement,
        opening_date: s.openingDate,
        deadline: s.deadline,
        official_scholarship_url: s.officialScholarshipUrl,
        official_university_url: s.officialUniversityUrl,
        source_url: s.sourceUrl,
        current_status: s.currentStatus ?? null,
        source_verified_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      };

      if (existing?.id) {
        await client.from("scholarships").update(row).eq("id", existing.id);
      } else {
        await client.from("scholarships").insert(row);
      }
    }
  } catch (err) {
    console.error("[cache] Could not persist scholarships to DB:", err);
  }
}