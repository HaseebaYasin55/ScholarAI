-- =============================================================================
-- Document upload infrastructure: storage bucket + RLS + metadata column
-- =============================================================================

-- The upload flow stores the file object in the 'documents' storage bucket and
-- saves the object path on the documents row. Prior to this migration none of
-- that existed: no bucket, no storage.objects policies, and no file_path column.

-- 1. documents.file_path stores the object path inside the 'documents' bucket.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_path TEXT;

-- 2. Private storage bucket for user documents (idempotent; safe if an
--    operator already created the bucket via the Dashboard).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  FALSE,
  5242880,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS policies on storage.objects. Every file is uploaded under a
--    '<user_id>/...' prefix so users can only ever touch their own objects.
DROP POLICY IF EXISTS "documents: view own" ON storage.objects;
CREATE POLICY "documents: view own"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "documents: upload own" ON storage.objects;
CREATE POLICY "documents: upload own"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "documents: update own" ON storage.objects;
CREATE POLICY "documents: update own"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "documents: delete own" ON storage.objects;
CREATE POLICY "documents: delete own"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);