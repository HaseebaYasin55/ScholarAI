-- =============================================================================
-- MIGRATION 016: Deadline-reminder dedup logging
-- =============================================================================
-- The email automation reuses the existing `sent_emails` log (the same
-- "email_alerts" system as `/api/cron/send-alerts`): dedup is recorded per
-- (user_id, type, notification_id).
--
-- 1. `notification_id` is treated by the existing code as a generic source id
--    (deadline/document ids are inserted by send-alerts too), NOT a real
--    `notifications` row. The FK to notifications(id) made those inserts fail;
--    relax it so reminder logging is reliable.
-- 2. A composite index speeds up the duplicate check that the cron runs daily.
-- =============================================================================

ALTER TABLE public.sent_emails
  DROP CONSTRAINT IF EXISTS sent_emails_notification_id_fkey;

CREATE INDEX IF NOT EXISTS idx_sent_emails_dedupe
  ON public.sent_emails(user_id, type, notification_id);