-- =============================================================================
-- APPLICATION SNAPSHOT: ELIGIBLE FIELDS / PROGRAMS
--
-- The Application Preparation Journey's "Choose your program" step (Step 2)
-- needs the catalog's eligible programs/fields for THAT scholarship. The
-- catalog already stores them on `scholarships.fields` (extracted from the
-- official page by the discovery pipeline), but the per-application snapshot
-- (migration 011) only mirrored `degree_levels` and `required_documents` —
-- never `fields`.
--
-- This adds the same snapshot convention for `fields`, so each tracked
-- application carries its own scholarship-specific program list. It mirrors
-- migration 011's array columns exactly; the journey reads it straight off the
-- application row (no join to the catalog, no second lookup).
--
-- Existing rows get the default '{}' — the journey then falls back to the
-- manual "enter the program" flow for those applications, so nothing breaks.
-- The new column inherits the RLS policies and authenticated grants from
-- migration 013 automatically.
-- =============================================================================

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS fields TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.applications.fields IS
  'Snapshot of the scholarship catalog fields (eligible programs/fields of study) captured when the scholarship was tracked, used by the application preparation journey program dropdown.';

-- Validation: must return true.
SELECT has_table_privilege('authenticated', 'public.applications', 'SELECT') AS can_select,
       has_table_privilege('authenticated', 'public.applications', 'UPDATE') AS can_update;