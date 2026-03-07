// Re-export the Lovable Cloud Supabase client for all DB operations.
import { supabase } from "@/integrations/supabase/client";

// Runtime verification — confirms the build has the correct backend URL
console.info("CourtReady backend:", import.meta.env.VITE_SUPABASE_URL);

export { supabase };

// Sub-court row type aligned to facility_id schema
export type SubCourtRow = {
  id: string;
  facility_id: string;
  court_number: number;
  sun_exposure: number;
  drainage: number;
  permanent_note: string | null;
  hazard_description: string | null;
  created_at: string;
};

// Court type — matches Lovable Cloud schema
export type SovereignCourt = {
  id: string;
  created_at: string;
  name: string;
  location: string;
  slug: string;
  surface: string;
  court_count: number;
  latitude: number | null;
  longitude: number | null;
  sun_exposure: number;
  drainage: number;
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

// Helper to call the get-weather edge function via the unified client
export async function fetchWeather(lat: number, lon: number) {
  const { data, error } = await supabase.functions.invoke("get-weather", {
    body: { lat, lon, t: Date.now() },
  });
  if (error) throw error;
  return data as {
    temp: number;
    humidity: number;
    wind_speed: number;
    rain_1h?: number;
    description?: string;
    icon?: string;
  };
}
