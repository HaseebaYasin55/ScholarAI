-- =============================================================================
-- Fix preferences RLS policies
-- =============================================================================
-- Symptom: "[Profile] Could not load preferences: permission denied for table
-- preferences". That is the error RLS raises when a table has ROW LEVEL SECURITY
-- enabled but no granting policy applies to the query — i.e. the `preferences`
-- table exists with RLS on, but the policies declared in migration 006 either
-- were never applied or were dropped. This migration installs them idempotently
-- so it is safe to run even when the policies already exist.
--
-- Ownership model: every row is keyed by user_id (FK to auth.users), and every
-- policy is scoped to auth.uid() = user_id. A user can only SELECT / INSERT /
-- UPDATE (and DELETE) their own preferences row; cross-user access stays
-- impossible. The Profile page reads with
--   select('*').eq('user_id', user.id).maybeSingle()
-- and writes with
--   upsert({ user_id, ... }, { onConflict: 'user_id' })
-- which exercises the SELECT, INSERT (WITH CHECK) and UPDATE (USING) paths.
-- =============================================================================

ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own preferences" ON preferences;
CREATE POLICY "Users can view their own preferences"
  ON preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own preferences" ON preferences;
CREATE POLICY "Users can insert their own preferences"
  ON preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own preferences" ON preferences;
CREATE POLICY "Users can update their own preferences"
  ON preferences FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own preferences" ON preferences;
CREATE POLICY "Users can delete their own preferences"
  ON preferences FOR DELETE
  USING (auth.uid() = user_id);