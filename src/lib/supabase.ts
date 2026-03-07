// Re-export the Lovable Cloud Supabase client for all DB operations.
// Edge function calls still use the sovereign project URL.
import { supabase } from "@/integrations/supabase/client";

export { supabase };

// Sub-court row type aligned to facility_id schema
export type SubCourtRow = {
  id: string;
  facility_id: string;
  court_number: number;
  sun_exposure_rating: number;
  drainage_rating: number;
  permanent_note: string | null;
  hazard_description: string | null;
  created_at: string;
};

// Sovereign edge function URL (weather API is deployed here)
const SOVEREIGN_URL = "https://racdnnitrapgqozxctsk.supabase.co";
const SOVEREIGN_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhY2Rubml0cmFwZ3FvenhjdHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3Mjk2ODMsImV4cCI6MjA4ODMwNTY4M30.2gVst0fWw5L6gUlO84cxveqFeZ97cW7_7W4CL00ELsw";

export const SOVEREIGN_PROJECT_ID = "racdnnitrapgqozxctsk";
export const SOVEREIGN_ANON = SOVEREIGN_ANON_KEY;
export const SOVEREIGN_FUNCTIONS_URL = `${SOVEREIGN_URL}/functions/v1`;

// Court type — matches Lovable Cloud schema
// DB columns: sun_exposure (1-5), drainage (1-5), location, latitude, longitude
export type SovereignCourt = {
  id: string;
  created_at: string;
  name: string;
  location: string;       // was 'address' on sovereign
  slug: string;
  surface: string;
  court_count: number;
  latitude: number | null; // was 'lat' on sovereign
  longitude: number | null; // was 'lon' on sovereign
  sun_exposure: number;    // 1-5 scale
  drainage: number;        // 1-5 scale
};

// Observation type for status verifications
export type Observation = {
  id: string;
  court_id: string;
  report_id: string | null;
  status: "still_wet" | "squeegee_needed" | "playable";
  display_name: string;
  created_at: string;
};

// localStorage key for user display name
const DISPLAY_NAME_KEY = "courtready-display-name";

export function getDisplayName(): string {
  return localStorage.getItem(DISPLAY_NAME_KEY) || "";
}

export function setDisplayName(name: string) {
  localStorage.setItem(DISPLAY_NAME_KEY, name.trim());
}
