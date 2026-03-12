
-- 1. council_members table for pilot captain roster
CREATE TABLE public.council_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.council_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Council members readable by everyone"
  ON public.council_members FOR SELECT TO public USING (true);

-- 2. New columns on court_status
ALTER TABLE public.court_status
  ADD COLUMN IF NOT EXISTS help_needed text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS report_to text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS captain_name text DEFAULT NULL;

-- 3. Make match_time nullable
ALTER TABLE public.matches
  ALTER COLUMN match_time DROP NOT NULL;
