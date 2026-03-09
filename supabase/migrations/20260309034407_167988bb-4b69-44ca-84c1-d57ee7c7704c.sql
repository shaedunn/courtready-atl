-- Add columns to courts
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS dna_note text;
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS drainage_profile text;
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS debris_factor text;

-- Create court_status table (append-only)
CREATE TABLE public.court_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id uuid NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('green','yellow','red')),
  action_label text,
  captain_note text,
  effort_tags text[] DEFAULT '{}'::text[],
  created_by text DEFAULT 'Captain',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.court_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Court status is viewable by everyone" ON public.court_status FOR SELECT USING (true);
CREATE POLICY "Anyone can insert court status" ON public.court_status FOR INSERT WITH CHECK (true);

-- Create matches table
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id uuid NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  match_time timestamptz NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  share_slug text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Matches are viewable by everyone" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Anyone can insert matches" ON public.matches FOR INSERT WITH CHECK (true);