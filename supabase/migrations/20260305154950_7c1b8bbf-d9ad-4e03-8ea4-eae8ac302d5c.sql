
-- Create courts table
CREATE TABLE public.courts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  surface TEXT NOT NULL DEFAULT 'Hard',
  court_count INTEGER NOT NULL DEFAULT 1,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create reports table
CREATE TABLE public.reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  court_id UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  rainfall DOUBLE PRECISION NOT NULL,
  squeegee_count INTEGER NOT NULL DEFAULT 0 CHECK (squeegee_count IN (0, 1, 2)),
  sky_condition TEXT NOT NULL CHECK (sky_condition IN ('Clear', 'Partial', 'Overcast')),
  hindrances TEXT[] NOT NULL DEFAULT '{}',
  abstract_observations TEXT,
  photo_url TEXT,
  estimated_dry_minutes DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create logs table
CREATE TABLE public.court_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  court_id UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  author TEXT NOT NULL DEFAULT 'Anonymous',
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.court_logs ENABLE ROW LEVEL SECURITY;

-- Courts: readable by all
CREATE POLICY "Courts are viewable by everyone" ON public.courts FOR SELECT USING (true);

-- Reports: readable and writable by everyone (community app)
CREATE POLICY "Reports are viewable by everyone" ON public.reports FOR SELECT USING (true);
CREATE POLICY "Anyone can submit reports" ON public.reports FOR INSERT WITH CHECK (true);

-- Logs: readable and writable by everyone
CREATE POLICY "Logs are viewable by everyone" ON public.court_logs FOR SELECT USING (true);
CREATE POLICY "Anyone can add logs" ON public.court_logs FOR INSERT WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_reports_court_id ON public.reports(court_id);
CREATE INDEX idx_reports_created_at ON public.reports(created_at DESC);
CREATE INDEX idx_court_logs_court_id ON public.court_logs(court_id);

-- Insert all courts including Leslie Beach Club
INSERT INTO public.courts (slug, name, location, surface, court_count, latitude, longitude) VALUES
  ('leslie-beach-club', 'Leslie Beach Club', '2539 Leslie Dr NE, Atlanta, GA 30345', 'Hard', 4, 33.8186, -84.3256),
  ('bitsy-grant', 'Bitsy Grant Tennis Center', 'Northside Dr NW', 'Hard', 13, 33.7990, -84.4100),
  ('piedmont-park', 'Piedmont Park Courts', 'Piedmont Ave NE', 'Hard', 12, 33.7866, -84.3740),
  ('mcgill-park', 'McGill Park', 'Boulevard NE', 'Hard', 4, 33.7700, -84.3650),
  ('chastain-park', 'Chastain Park Tennis', 'Powers Ferry Rd NW', 'Hard', 9, 33.8710, -84.3870),
  ('blackburn-park', 'Blackburn Park Tennis', 'Blackburn Park Dr', 'Hard', 6, 33.8840, -84.2640),
  ('dekalb-tennis', 'DeKalb Tennis Center', 'Mason Mill Rd', 'Hard', 17, 33.8060, -84.3130),
  ('south-fulton', 'South Fulton Tennis Center', 'Mason Rd', 'Hard', 12, 33.6300, -84.5700),
  ('lost-corners', 'Lost Corners Park', 'Lost Corners Cir', 'Hard', 4, 33.9400, -84.2100),
  ('garden-hills', 'Garden Hills Tennis', 'Pinetree Dr NE', 'Hard', 4, 33.8200, -84.3700),
  ('adams-park', 'Adams Park Tennis', 'Delowe Dr SW', 'Hard', 6, 33.7000, -84.4700);
