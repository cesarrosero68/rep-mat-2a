
CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#6366f1',
  icon text NOT NULL DEFAULT 'BookOpen',
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subjects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subjects_public_read" ON public.subjects FOR SELECT USING (true);
CREATE POLICY "subjects_auth_write" ON public.subjects FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.periods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.periods TO authenticated;
GRANT ALL ON public.periods TO service_role;
ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "periods_public_read" ON public.periods FOR SELECT USING (true);
CREATE POLICY "periods_auth_write" ON public.periods FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_date date,
  end_date date,
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX weeks_period_idx ON public.weeks(period_id, "order");
GRANT SELECT ON public.weeks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weeks TO authenticated;
GRANT ALL ON public.weeks TO service_role;
ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weeks_public_read" ON public.weeks FOR SELECT USING (true);
CREATE POLICY "weeks_auth_write" ON public.weeks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.week_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  week_id uuid NOT NULL REFERENCES public.weeks(id) ON DELETE CASCADE,
  pdf_url text,
  pdf_filename text,
  extracted_text text,
  youtube_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_id, week_id)
);
GRANT SELECT ON public.week_content TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.week_content TO authenticated;
GRANT ALL ON public.week_content TO service_role;
ALTER TABLE public.week_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "week_content_public_read" ON public.week_content FOR SELECT USING (true);
CREATE POLICY "week_content_auth_write" ON public.week_content FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_content_id uuid NOT NULL UNIQUE REFERENCES public.week_content(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progress TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progress TO authenticated;
GRANT ALL ON public.progress TO service_role;
ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress_public_read" ON public.progress FOR SELECT USING (true);
CREATE POLICY "progress_public_insert" ON public.progress FOR INSERT WITH CHECK (true);
CREATE POLICY "progress_public_update" ON public.progress FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "progress_auth_delete" ON public.progress FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_TABLE_NAME = 'progress' THEN
    IF NEW.completed AND (OLD.completed IS DISTINCT FROM NEW.completed) THEN
      NEW.completed_at = now();
    ELSIF NOT NEW.completed THEN
      NEW.completed_at = NULL;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER week_content_updated_at BEFORE UPDATE ON public.week_content
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER progress_updated_at BEFORE UPDATE ON public.progress
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE VIEW public.subject_progress AS
SELECT s.id AS subject_id,
       s.name,
       count(wc.id) AS weeks_with_content,
       count(p.id) FILTER (WHERE p.completed) AS weeks_completed,
       (SELECT count(*) FROM public.weeks) AS total_weeks
FROM public.subjects s
LEFT JOIN public.week_content wc ON wc.subject_id = s.id
LEFT JOIN public.progress p ON p.week_content_id = wc.id
GROUP BY s.id, s.name;
GRANT SELECT ON public.subject_progress TO anon, authenticated, service_role;

INSERT INTO public.subjects (name, color, icon, "order") VALUES
  ('ENGLISH', '#2563eb', 'Languages', 1),
  ('MATEMATICAS', '#dc2626', 'Calculator', 2),
  ('SOCIALES', '#ca8a04', 'Globe2', 3),
  ('LITERATURE', '#7c3aed', 'BookOpen', 4),
  ('CIENCIAS NATURALES', '#16a34a', 'Leaf', 5),
  ('LENGUA CASTELLANA', '#db2777', 'PenLine', 6),
  ('RELIGION, ETICA Y VALORES', '#0891b2', 'HeartHandshake', 7),
  ('MUSICA', '#9333ea', 'Music', 8),
  ('EDUCACION FISICA', '#ea580c', 'Dumbbell', 9),
  ('EXPRESION ARTISTICA', '#e11d48', 'Palette', 10),
  ('STEAM', '#0d9488', 'FlaskConical', 11),
  ('CURRENT EVENTS', '#4f46e5', 'Newspaper', 12),
  ('DANZAS', '#c026d3', 'Sparkles', 13);

INSERT INTO public.periods (name, "order") VALUES ('Period 1', 1), ('Period 2', 2), ('Period 3', 3);

INSERT INTO public.weeks (period_id, label, start_date, end_date, "order")
SELECT p.id, w.label, w.sd, w.ed, w.ord FROM public.periods p
JOIN (VALUES
  ('Period 1','FEBRUARY 2ND - 6TH','2026-02-02'::date,'2026-02-06'::date,1),
  ('Period 1','FEBRUARY 9TH - 13TH','2026-02-09','2026-02-13',2),
  ('Period 1','FEBRUARY 16TH - 20TH','2026-02-16','2026-02-20',3),
  ('Period 1','FEBRUARY 23RD - 27TH','2026-02-23','2026-02-27',4),
  ('Period 1','MARCH 2ND - 6TH','2026-03-02','2026-03-06',5),
  ('Period 1','MARCH 9TH - 13TH','2026-03-09','2026-03-13',6),
  ('Period 1','MARCH 16TH - 20TH','2026-03-16','2026-03-20',7),
  ('Period 1','MARCH 23RD - 27TH','2026-03-23','2026-03-27',8),
  ('Period 1','MARCH 30TH - APRIL 3RD','2026-03-30','2026-04-03',9),
  ('Period 1','APRIL 6TH - 10TH','2026-04-06','2026-04-10',10),
  ('Period 1','APRIL 13TH - 17TH','2026-04-13','2026-04-17',11),
  ('Period 1','APRIL 20TH - 24TH','2026-04-20','2026-04-24',12),
  ('Period 1','APRIL 27TH - MAY 1ST','2026-04-27','2026-05-01',13),
  ('Period 2','MAY 4TH - 8TH','2026-05-04','2026-05-08',1),
  ('Period 2','MAY 11TH - 15TH','2026-05-11','2026-05-15',2),
  ('Period 2','MAY 18TH - 22ND','2026-05-18','2026-05-22',3),
  ('Period 2','MAY 25TH - 29TH','2026-05-25','2026-05-29',4),
  ('Period 2','JUNE 1ST - 5TH','2026-06-01','2026-06-05',5),
  ('Period 2','JUNE 8TH - 12TH','2026-06-08','2026-06-12',6),
  ('Period 2','JUNE 15TH - JULY 6TH','2026-06-15','2026-07-06',7),
  ('Period 2','JULY 6TH - 10TH','2026-07-06','2026-07-10',8),
  ('Period 2','JULY 13TH - 17TH','2026-07-13','2026-07-17',9),
  ('Period 2','JULY 20TH - 24TH','2026-07-20','2026-07-24',10),
  ('Period 2','JULY 27TH - 31ST','2026-07-27','2026-07-31',11),
  ('Period 2','AUGUST 3RD - 7TH','2026-08-03','2026-08-07',12),
  ('Period 2','AUGUST 10TH - 14TH','2026-08-10','2026-08-14',13),
  ('Period 3','AUGUST 17TH - 21ST','2026-08-17','2026-08-21',1),
  ('Period 3','AUGUST 24TH - 28TH','2026-08-24','2026-08-28',2),
  ('Period 3','AUGUST 31ST - SEPTEMBER 4TH','2026-08-31','2026-09-04',3)
) AS w(period_name, label, sd, ed, ord) ON w.period_name = p.name;
