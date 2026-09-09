-- Permite que una misma materia+semana tenga varios documentos (hasta 5),
-- mostrados como pestañas en la vista del estudiante.

CREATE TABLE public.week_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_content_id uuid NOT NULL REFERENCES public.week_content(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Documento',
  pdf_url text,
  pdf_filename text,
  extracted_text text,
  youtube_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  "order" integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX week_documents_week_content_idx ON public.week_documents(week_content_id, "order");

GRANT SELECT ON public.week_documents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.week_documents TO authenticated;
GRANT ALL ON public.week_documents TO service_role;
ALTER TABLE public.week_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "week_documents_public_read" ON public.week_documents FOR SELECT USING (true);
CREATE POLICY "week_documents_auth_write" ON public.week_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER week_documents_updated_at BEFORE UPDATE ON public.week_documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Migra el contenido existente (un pdf por celda) a la nueva tabla como
-- el primer documento de cada semana que ya tenga algo cargado.
INSERT INTO public.week_documents (week_content_id, title, pdf_url, pdf_filename, extracted_text, youtube_links, "order")
SELECT id,
       COALESCE(NULLIF(pdf_filename, ''), 'Documento'),
       pdf_url,
       pdf_filename,
       extracted_text,
       youtube_links,
       1
FROM public.week_content
WHERE pdf_url IS NOT NULL;
