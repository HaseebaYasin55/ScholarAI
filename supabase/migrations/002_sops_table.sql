-- =============================================================================
-- MIGRATION 002: SOPs Table
-- =============================================================================

-- 1. SOPs TABLE
CREATE TABLE sops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  university TEXT NOT NULL,
  program TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_sops_user_id ON sops(user_id);
CREATE INDEX idx_sops_app_id ON sops(application_id);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE sops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own SOPs" ON sops
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- AUTOMATION: Update updated_at timestamp
-- =============================================================================

CREATE TRIGGER update_sops_modtime
    BEFORE UPDATE ON sops
    FOR EACH ROW
    EXECUTE PROCEDURE update_modified_column();
