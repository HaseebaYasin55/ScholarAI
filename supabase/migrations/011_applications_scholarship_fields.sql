-- =============================================================================
-- Application Tracking ← Scholarship Discovery integration
--
-- Extends `applications` with a verified snapshot of the scholarship the user
-- chose via "I want to apply", and expands the status workflow to:
--   Interested → Preparing → Applied → Under Review → Interview → Accepted/Rejected
-- Legacy statuses (Draft / In Review / Submitted / Action Required) stay valid so
-- existing rows and the preparation journey keep working.
-- =============================================================================

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS scholarship_id TEXT,
  ADD COLUMN IF NOT EXISTS organization TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS official_url TEXT,
  ADD COLUMN IF NOT EXISTS degree_levels TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_documents TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS application_info TEXT,
  ADD COLUMN IF NOT EXISTS opening_date DATE;

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check;
ALTER TABLE applications
  ADD CONSTRAINT applications_status_check CHECK (status IN (
    'Interested', 'Preparing', 'Applied', 'Under Review', 'Interview',
    'Accepted', 'Rejected', 'Draft', 'In Review', 'Submitted', 'Action Required'
  ));

-- One application per user + scholarship: "I want to apply" is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS applications_user_scholarship_unique
  ON applications(user_id, scholarship_id)
  WHERE scholarship_id IS NOT NULL;