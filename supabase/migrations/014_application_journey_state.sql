-- =============================================================================
-- APPLICATION PREPARATION JOURNEY STATE
--
-- Per-application preparation state for the "Application Preparation Journey"
-- (reached from My Applications → Continue application → /applications/:id).
--
-- The journey lives on the existing `applications` row and derives everything
-- it can from data we already persist:
--   * application_id  -> sops.application_id          (SOP step)
--   * program         -> applications.program         (Chosen program step)
--   * documents ready -> documents (namespaced by university)   (Documents step)
--   * applied         -> applications.status          (Final submission step)
--
-- The only journey signal with no existing column is "the user reviewed this
-- scholarship's requirements" (Step 3). Adding it here avoids inventing a new
-- table and keeps the whole journey on one row, which is already RLS-scoped by
-- auth.uid() = user_id (migration 013) — the new column inherits those policies
-- and the authenticated grants automatically.
-- =============================================================================

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS requirements_reviewed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.applications.requirements_reviewed IS
  'Set when the user confirms they reviewed the scholarship requirements in the application preparation journey.';

-- Validation: must return true.
SELECT has_table_privilege('authenticated', 'public.applications', 'SELECT') AS can_select,
       has_table_privilege('authenticated', 'public.applications', 'UPDATE') AS can_update;