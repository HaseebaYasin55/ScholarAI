-- =============================================================================
-- MIGRATION 005: Profile Insert RLS Policy
-- Allows an authenticated user to insert only their own profile row.
-- Existing SELECT/UPDATE policies from migration 001 are unchanged.
-- =============================================================================

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);