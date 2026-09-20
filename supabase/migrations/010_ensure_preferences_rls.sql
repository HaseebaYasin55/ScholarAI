-- =============================================================================
-- Ensure preferences RLS policies (self-contained, idempotent)
-- =============================================================================
-- Symptom: "[Profile] Could not load preferences: permission denied for table
-- preferences" (Postgres code 42501).
--
-- Root cause(s) this migration fixes (both produce this exact message):
--   1. The `preferences` table exists in the deployed database with ROW LEVEL
--      SECURITY enabled (or expected to be), but no policy grants the
--      `authenticated` role any access, so every query against it fails.
--   2. The `authenticated` role lacks base table privileges on `preferences`
--      (possible when the table was created outside Supabase's default ACLs).
--      RLS policies alone cannot authorize reads if the role holds no table
--      privileges at all.
--
-- This is shipped as a NEW migration (rather than editing 006/009) because we
-- cannot assume whether those older policy statements were ever executed.
-- It is safe to run repeatedly: privileges and RLS are idempotent, policies are
-- dropped and recreated.
--
-- Security model: preferences is a per-user table keyed by user_id (FK to
-- auth.users). Every policy pins rows to the authenticated user via
-- auth.uid() = user_id, so cross-user access is impossible. No USING (true),
-- no RLS bypass, .env uses the anon key.
-- =============================================================================

-- 1. Base privileges for the authenticated role (idempotent).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preferences TO authenticated;

-- 2. RLS enabled (idempotent; runs even if the table already had it).
ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;

-- 3. Ownership policies. INSERT/UPDATE also carry WITH CHECK so a row can never
--    be created or rewritten to a user_id other than the current user.
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.preferences;
CREATE POLICY "Users can view their own preferences"
  ON public.preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.preferences;
CREATE POLICY "Users can insert their own preferences"
  ON public.preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own preferences" ON public.preferences;
CREATE POLICY "Users can update their own preferences"
  ON public.preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own preferences" ON public.preferences;
CREATE POLICY "Users can delete their own preferences"
  ON public.preferences FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Validation (results appear in the SQL Editor after running):
--    4a. Must show exactly 4 policies, one per command, all scoped to
--        (auth.uid() = user_id).
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'preferences'
ORDER BY cmd;

--    4b. Must return true for all three privileged commands.
SELECT has_table_privilege('authenticated', 'public.preferences', 'SELECT') AS can_select,
       has_table_privilege('authenticated', 'public.preferences', 'INSERT') AS can_insert,
       has_table_privilege('authenticated', 'public.preferences', 'UPDATE') AS can_update;