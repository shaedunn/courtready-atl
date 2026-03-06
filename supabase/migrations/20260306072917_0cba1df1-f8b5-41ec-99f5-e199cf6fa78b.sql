
-- Add sun_exposure and drainage defaults to courts
ALTER TABLE public.courts
  ADD COLUMN sun_exposure double precision NOT NULL DEFAULT 0.75,
  ADD COLUMN drainage double precision NOT NULL DEFAULT 0.5;

-- Add weather snapshot and override columns to reports
ALTER TABLE public.reports
  ADD COLUMN temperature double precision,
  ADD COLUMN humidity double precision,
  ADD COLUMN wind_speed double precision,
  ADD COLUMN sun_exposure double precision,
  ADD COLUMN drainage double precision;
