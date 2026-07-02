-- Insert a storage bucket called lead_documents if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead_documents', 'lead_documents', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for public reading
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'lead_documents');

-- Policies for authenticated inserts
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lead_documents');

-- Policies for authenticated updates/deletes
CREATE POLICY "Authenticated users can update documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'lead_documents');

CREATE POLICY "Authenticated users can delete documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'lead_documents');
