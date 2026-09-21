-- =============================================================================
-- Enable application tracking: base privileges + explicit applications policies
-- =============================================================================
-- Symptom: Discover Scholarships → "I want to apply" fails with
--   "Could not add the application."
-- and the scholarship never appears under Dashboard → My Scholarships.
-- PostgREST returns:
--   permission denied for table applications   (Postgres code 42501)
--
-- Root cause (same class as migration 010 fixed for `preferences`):
--   `applications`, `documents`, `deadlines`, `notifications`, `sops`,
--   `claims` and `profiles` all have RLS enabled with per-user policies
--   (`auth.uid() = user_id`), but the tables were created WITHOUT the base
--   privileges the `authenticated` role needs. RLS policies alone are not
--   sufficient: without table privileges the role never reaches the row-level
--   checks, so EVERY browser-client operation (anon key) fails with 42501.
--
-- This restores Supabase's default ACL for the `authenticated` role on the
-- user-owned tables the tracking feature reads/writes. It mirrors the grant +
-- policy pattern established in migration 010 and is safe to run repeatedly
-- (privileges are idempotent; policies are dropped and recreated).
--
-- Security model: every table is keyed by user_id (FK to auth.users) and each
-- policy pins rows to the current user via auth.uid() = user_id. No USING
-- (true), no RLS bypass, and the browser client still uses the anon key.
-- INSERT/UPDATE policies carry WITH CHECK so a row can never be created or
-- rewritten for another user.
-- =============================================================================

-- 1. Base privileges for the authenticated role (idempotent).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deadlines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sops TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claims TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- 2. RLS enabled (idempotent; runs even if the table already had it).
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- 3. Explicit per-command policies for applications. The original migration
--    001 "FOR ALL" policy is replaced by the four scoped policies below; each
--    is pinned to the owning user.
DROP POLICY IF EXISTS "Users can manage their own applications" ON public.applications;

CREATE POLICY "Users can view their own applications"
  ON public.applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own applications"
  ON public.applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own applications"
  ON public.applications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own applications"
  ON public.applications FOR DELETE
  USING (auth.uid() = user_id);

-- documents / deadlines / notifications / sops / claims keep their existing
-- per-user "FOR ALL USING (auth.uid() = user_id)" policies from migrations
-- 001-003; only the base privileges above were missing for them.

-- 4. Validation (results appear in the SQL Editor after running):
--    4a. Must show exactly 4 policies on applications, all scoped to
--        (auth.uid() = user_id), plus the historical policy names on the
--        other user-owned tables.
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'applications'
ORDER BY cmd;

--    4b. Must return true for all three privileged commands.
SELECT has_table_privilege('authenticated', 'public.applications', 'SELECT') AS can_select,
       has_table_privilege('authenticated', 'public.applications', 'INSERT') AS can_insert,
       has_table_privilege('authenticated', 'public.applications', 'UPDATE') AS can_update;