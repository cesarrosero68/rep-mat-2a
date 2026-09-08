
CREATE POLICY "week_pdfs_read" ON storage.objects FOR SELECT USING (bucket_id = 'week-pdfs');
CREATE POLICY "week_pdfs_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'week-pdfs');
CREATE POLICY "week_pdfs_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'week-pdfs') WITH CHECK (bucket_id = 'week-pdfs');
CREATE POLICY "week_pdfs_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'week-pdfs');
