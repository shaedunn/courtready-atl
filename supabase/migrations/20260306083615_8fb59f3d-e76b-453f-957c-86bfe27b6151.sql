
CREATE TABLE public.weather_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  cache_key text NOT NULL UNIQUE,
  temp double precision,
  humidity double precision,
  wind_speed double precision,
  rain_1h double precision DEFAULT 0,
  description text,
  icon text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Weather cache is readable by everyone"
  ON public.weather_cache
  FOR SELECT
  USING (true);
