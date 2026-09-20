-- =============================================================================
-- MIGRATION 003: AI Claim Checker Table
-- =============================================================================

-- 1. CLAIMS TABLE
-- Stores individual claims extracted from SOPs or manually entered,
-- and their AI-generated verification analysis.
CREATE TABLE claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  claim_text TEXT NOT NULL,
  analysis TEXT NOT NULL,
  strength_score INTEGER CHECK (strength_score >= 0 AND strength_score <= 100),
  status TEXT CHECK (status IN ('Strong', 'Needs Evidence', 'Weak', 'Contradictory')),
  suggestions TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_claims_user_id ON claims(user_id);
CREATE INDEX idx_claims_app_id ON claims(application_id);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own claims" ON claims
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- AUTOMATION: Update updated_at timestamp
-- =============================================================================

CREATE TRIGGER update_claims_modtime
    BEFORE UPDATE ON claims
    FOR EACH ROW
    EXECUTE PROCEDURE update_modified_column();
