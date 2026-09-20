-- =============================================================================
-- ONBOARDING: extend profiles + create user preferences
-- =============================================================================

-- Extend profiles with the fields collected during onboarding. The existing
-- `full_name`, `email`, `major`, `university` and `updated_at` columns are
-- reused (field of study maps to `major`) to avoid duplicate data.
ALTER TABLE profiles
  ADD COLUMN first_name TEXT,
  ADD COLUMN last_name TEXT,
  ADD COLUMN phone_number TEXT,
  ADD COLUMN country TEXT,
  ADD COLUMN city TEXT,
  ADD COLUMN education_level TEXT,
  ADD COLUMN graduation_year INTEGER,
  ADD COLUMN gpa NUMERIC,
  ADD COLUMN gpa_scale TEXT,
  ADD COLUMN onboarded_at TIMESTAMP WITH TIME ZONE;

-- -----------------------------------------------------------------------------
-- PREFERENCES
-- Multi-select answers are stored as text[] so the list of options (countries,
-- funding types, degree levels, intakes) can grow without schema changes.
-- -----------------------------------------------------------------------------
CREATE TABLE preferences (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  interests TEXT[] NOT NULL DEFAULT '{}',
  funding_preferences TEXT[] NOT NULL DEFAULT '{}',
  destinations TEXT[] NOT NULL DEFAULT '{}',
  degree_levels TEXT[] NOT NULL DEFAULT '{}',
  preferred_field TEXT,
  tuition_preference TEXT,
  max_tuition_budget NUMERIC,
  ielts_status TEXT,
  ielts_band NUMERIC,
  preferred_intake TEXT[] NOT NULL DEFAULT '{}',
  needs_application_fee_waiver BOOLEAN NOT NULL DEFAULT FALSE,
  open_to_multiple_countries BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_preferences_user_id ON preferences(user_id);

-- =============================================================================
-- RLS: users can only access their own preferences
-- =============================================================================
ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
  ON preferences FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON preferences FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON preferences FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own preferences"
  ON preferences FOR DELETE USING (auth.uid() = user_id);