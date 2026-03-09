
CREATE TABLE public.facility_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  facility_name text NOT NULL,
  address text NOT NULL,
  requester_email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
);

ALTER TABLE public.facility_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert facility requests"
  ON public.facility_requests
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Only authenticated users can view facility requests"
  ON public.facility_requests
  FOR SELECT
  TO authenticated
  USING (true);
