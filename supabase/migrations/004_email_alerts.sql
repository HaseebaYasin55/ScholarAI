-- =============================================================================
-- MIGRATION 004: Email Alerts & Preferences
-- =============================================================================

-- 1. EMAIL PREFERENCES TABLE
-- Allows users to opt-in/out of specific email notification types.
CREATE TABLE email_preferences (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  deadline_alerts BOOLEAN DEFAULT TRUE,
  document_alerts BOOLEAN DEFAULT TRUE,
  profile_reminders BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. SENT EMAILS LOG
-- Prevents duplicate emails for the same notification/event.
CREATE TABLE sent_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  type TEXT NOT NULL, -- 'deadline', 'document', 'profile', 'system'
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_sent_emails_user_id ON sent_emails(user_id);
CREATE INDEX idx_sent_emails_notification_id ON sent_emails(notification_id);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own email preferences" ON email_preferences
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own sent email logs" ON sent_emails
  FOR SELECT USING (auth.uid() = user_id);

-- =============================================================================
-- AUTOMATION
-- =============================================================================

CREATE TRIGGER update_email_prefs_modtime
    BEFORE UPDATE ON email_preferences
    FOR EACH ROW
    EXECUTE PROCEDURE update_modified_column();
