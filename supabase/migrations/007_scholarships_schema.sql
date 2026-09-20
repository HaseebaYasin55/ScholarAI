-- =============================================================================
-- SCHOLARSHIP CATALOG (populated later by the web-scraping pipeline)
--
-- This table is deliberately created up-front so the matching engine and the
-- recommendation UI have a stable contract. It will be filled by a scraper
-- that pulls CURRENT opportunities from official university/scholarship
-- pages. Recommendations MUST link back to the official URLs stored here and
-- must never contain invented entries.
-- =============================================================================
CREATE TABLE scholarships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  university TEXT,
  country TEXT,
  degree_levels TEXT[] NOT NULL DEFAULT '{}',
  fields TEXT[] NOT NULL DEFAULT '{}',
  funding_type TEXT,
  tuition_coverage TEXT,
  tuition_fee NUMERIC,
  stipend_amount NUMERIC,
  stipend_frequency TEXT,
  accommodation_support TEXT,
  travel_allowance TEXT,
  health_insurance TEXT,
  application_fee NUMERIC,
  eligibility_requirements TEXT,
  required_documents TEXT[] NOT NULL DEFAULT '{}',
  ielts_requirement TEXT,
  opening_date DATE,
  deadline DATE,
  official_scholarship_url TEXT,
  official_university_url TEXT,
  source_url TEXT,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- RLS: scholarship catalog is public, read-only reference data.
-- Only authenticated users may read it; writes are performed by the scraper
-- service account (not exposed to the client) and blocked for everyone else.
-- =============================================================================
ALTER TABLE scholarships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view scholarships"
  ON scholarships FOR SELECT TO authenticated USING (TRUE);

CREATE INDEX idx_scholarships_country ON scholarships(country);
CREATE INDEX idx_scholarships_deadline ON scholarships(deadline) WHERE deadline IS NOT NULL;
CREATE INDEX idx_scholarships_degree_levels ON scholarships USING GIN (degree_levels);
CREATE INDEX idx_scholarships_fields ON scholarships USING GIN (fields);