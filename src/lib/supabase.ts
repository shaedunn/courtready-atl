import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// ---------------------------------------------------------------------------
// Self-healing Supabase client
// Derives the correct project URL from the API key's JWT payload so the app
// is immune to stale VITE_SUPABASE_URL deploy secrets.
// ---------------------------------------------------------------------------

const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function deriveUrlFromKey(key: string): string {
  try {
    const payload = JSON.parse(atob(key.split(".")[1]));
    return `https://${payload.ref}.supabase.co`;
  } catch {
    // Fallback to env var if JWT decode fails (should never happen)
    return import.meta.env.VITE_SUPABASE_URL as string;
  }
}

const derivedUrl = deriveUrlFromKey(supabaseKey);

// Log for verification during pilot
console.info("CourtReady backend (env):", import.meta.env.VITE_SUPABASE_URL);
console.info("CourtReady backend (derived / active):", derivedUrl);

export const supabase = createClient<Database>(derivedUrl, supabaseKey, {
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
  location: string;
  slug: string;
  surface: string;
  court_count: number;
  latitude: number | null;
  longitude: number | null;
  sun_exposure: number;
  drainage: number;
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
    hourly?: Array<{
      dt: number; temp: number; humidity: number;
      wind_speed: number; pop: number; rain_1h: number;
      description?: string;
    }>;
  };
}
