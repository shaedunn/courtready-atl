
CREATE TABLE public.sub_courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id uuid NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  court_number integer NOT NULL,
  sun_exposure double precision NOT NULL DEFAULT 3,
  drainage double precision NOT NULL DEFAULT 3,
  permanent_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(court_id, court_number)
);

ALTER TABLE public.sub_courts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sub courts are viewable by everyone" ON public.sub_courts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert sub courts" ON public.sub_courts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update sub courts" ON public.sub_courts FOR UPDATE USING (true) WITH CHECK (true);
