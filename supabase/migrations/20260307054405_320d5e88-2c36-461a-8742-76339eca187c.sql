CREATE TABLE public.observations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  court_id UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('still_wet', 'squeegee_needed', 'playable')),
  display_name TEXT NOT NULL DEFAULT 'Anonymous',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Observations are viewable by everyone" ON public.observations FOR SELECT USING (true);
CREATE POLICY "Anyone can submit observations" ON public.observations FOR INSERT WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.observations;