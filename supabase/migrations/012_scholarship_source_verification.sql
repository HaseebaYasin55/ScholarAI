-- =============================================================================
-- SCHOLARSHIP SOURCE VERIFICATION
--
-- Marks catalog rows that passed the discovery pipeline's official-source
-- verification (URL fetched from the authoritative provider/authority and
-- confirmed by the verifier), plus the current application state read from the
-- official page. Recommendations and Drill-down queries only surface rows with
-- a verification timestamp — never legacy/unverified scrapes.
-- =============================================================================

ALTER TABLE scholarships
  ADD COLUMN IF NOT EXISTS source_verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS current_status TEXT;

CREATE INDEX IF NOT EXISTS idx_scholarships_verified
  ON scholarships(source_verified_at)
  WHERE source_verified_at IS NOT NULL;