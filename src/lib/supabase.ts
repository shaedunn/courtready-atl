import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// ---------------------------------------------------------------------------
// Self-healing Supabase client
// Derives the correct project URL from the API key's JWT payload so the app
// is immune to stale VITE_SUPABASE_URL deploy secrets.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Explicit production backend configuration
// The app always connects to the production Supabase project where all real
// data (courts, council_members, etc.) lives.
// ---------------------------------------------------------------------------

const PRODUCTION_URL = "https://racdnnitrapgqozxctsk.supabase.co";
const PRODUCTION_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

console.info("CourtReady backend (active):", PRODUCTION_URL);

export const supabase = createClient<Database>(PRODUCTION_URL, PRODUCTION_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// ---------------------------------------------------------------------------
// Re-exported types & helpers (unchanged)
// ---------------------------------------------------------------------------

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

export type SovereignCourt = {
  id: string;
  created_at: string;
  name: string;
  address: string;
  slug: string;
  surface: string;
  court_count: number;
  latitude: number | null;
  longitude: number | null;
  sun_exposure_rating: number;
  drainage_rating: number;
  dna_note: string | null;
};

export type Observation = {
  id: string;
  court_id: string;
  report_id: string | null;
  status: "still_wet" | "squeegee_needed" | "playable";
  display_name: string;
  created_at: string;
};

const DISPLAY_NAME_KEY = "courtready-display-name";

export function getDisplayName(): string {
  return localStorage.getItem(DISPLAY_NAME_KEY) || "";
}

export function setDisplayName(name: string) {
  localStorage.setItem(DISPLAY_NAME_KEY, name.trim());
}

export async function fetchWeather(lat: number, lon: number) {
  // Edge functions are deployed on Lovable Cloud, not the production data project.
  // Use the auto-generated client which points to the correct functions host.
  console.log("[fetchWeather] Calling edge function for", lat, lon);
  const { supabase: cloudClient } = await import("@/integrations/supabase/client");
  const { data, error } = await cloudClient.functions.invoke("get-weather", {
    body: { lat, lon, t: Date.now() },
  });
  if (error) {
    console.error("[fetchWeather] Edge function error:", error);
    throw error;
  }
  console.log("[fetchWeather] Success:", JSON.stringify(data));
  return data as {
    temp: number;
    humidity: number;
    wind_speed: number;
    wind_deg?: number | null;
    rain_1h?: number;
    description?: string;
    icon?: string;
    hourly?: Array<{
      dt: number; temp: number; humidity: number;
      wind_speed: number; wind_deg?: number | null;
      pop: number; rain_1h: number;
      description?: string;
    }>;
  };
}
