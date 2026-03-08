export type Hindrance = "none" | "bird_baths" | "surface_cracks";

export const HINDRANCE_OPTIONS: { value: Hindrance; label: string; multiplier: number }[] = [
  { value: "none", label: "None", multiplier: 1.0 },
  { value: "bird_baths", label: "Bird Baths / Depressions", multiplier: 1.5 },
  { value: "surface_cracks", label: "Surface Cracks / Seepage", multiplier: 2.0 },
];

// Rainfall categories (inches)
export const RAINFALL_CATEGORIES = [
  { value: "mist", label: "Mist/Drizzle", amount: 0.05 },
  { value: "light", label: "Light Rain", amount: 0.1, description: "Ground wet, no puddles" },
  { value: "steady", label: "Steady Rain", amount: 0.25, description: "Puddles forming" },
  { value: "heavy", label: "Heavy/Downpour", amount: 0.5, description: "Courts flooded" },
  { value: "custom", label: "Custom", amount: null },
] as const;

export type RainfallCategory = (typeof RAINFALL_CATEGORIES)[number]["value"];

// Squeegee reduction factors
const SQUEEGEE_FACTOR: Record<number, number> = {
  0: 1.0,
  1: 0.2,
  2: 0.1,
};

/**
 * Normalize a 1-5 rating to a 0.2–1.0 divisor.
 * 5 = best (1.0), 1 = worst (0.2).
 */
function normalizeRating(rating: number): number {
  return Math.max(0.2, Math.min(1.0, rating / 5));
}

/**
 * Step-Multiplier dry time engine (V1).
 */
export function calculateDryTime(
  rainfall: number,
  squeegeeCount: 0 | 1 | 2,
  temperature: number,
  humidity: number,
  windSpeed: number,
  sunExposure: number,
  drainage: number,
  hindrances: Hindrance[] = []
): number {
  const effectiveRain = rainfall * SQUEEGEE_FACTOR[squeegeeCount];
  if (effectiveRain <= 0) return 0;

  // Base: 60 mins per 0.1 inch
  let minutes = effectiveRain * 600;

  // Humidity penalty
  if (humidity > 90) {
    minutes *= 3.0;
  } else if (humidity > 85) {
    minutes *= 2.0;
  } else if (humidity >= 70) {
    minutes *= 1.5;
  }

  // Wind penalty (low wind slows drying)
  if (windSpeed < 3) {
    minutes *= 1.3;
  }

  // Drainage & sun exposure as divisors
  const drainageFactor = normalizeRating(drainage);
  const sunFactor = normalizeRating(sunExposure);
  minutes = minutes / drainageFactor / sunFactor;

  // Shade penalty
  if (sunExposure <= 1) {
    minutes *= 1.5;
  }

  // Hindrance multiplier
  const hindranceMultiplier =
    hindrances.length === 0 || hindrances.includes("none")
      ? 1.0
      : Math.max(
          ...hindrances
            .filter((h) => h !== "none")
            .map((h) => HINDRANCE_OPTIONS.find((o) => o.value === h)?.multiplier ?? 1.0)
        );

  const result = Math.round(Math.max(0, minutes * hindranceMultiplier));

  // Humidity Floor: if >90%, minimum 180 minutes
  if (humidity > 90 && effectiveRain > 0) {
    return Math.max(180, result);
  }

  return result;
}

/**
 * Calculate squeegee-assisted dry time (40% reduction of remaining natural time).
 */
export function calculateSqueegeeDryTime(naturalMinutes: number): number {
  return Math.round(naturalMinutes * 0.6);
}

/**
 * Format dry time as human-readable string.
 */
export function formatDryTime(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} hour${h > 1 ? "s" : ""}`;
  return `${h} hour${h > 1 ? "s" : ""} and ${m} minute${m > 1 ? "s" : ""}`;
}

/**
 * Format a "verified ago" text from a created_at timestamp.
 */
export function getVerifiedAgoText(createdAt: string): string {
  const mins = Math.round((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
}

/**
 * Traffic-light status from a report row + optional latest observation + current conditions.
 *
 * human_verified: Captain marked playable AND no actual rain invalidating it
 * verified:       (legacy alias — now mapped to human_verified)
 * playable:       forecast >= 70 OR no report in 12h OR dry time elapsed
 * drying:         forecast 40-69 OR report active and drying
 * wet:            forecast < 40 OR heavy recent rain
 * caution:        humidity > 90%
 *
 * PERSISTENCE RULE: Captain's 'Playable' observation persists until:
 *   1. Actual rain recorded (rain_1h > 0) — NOT predicted rain (PoP)
 *   2. A newer report with rainfall > 0 is filed
 *
 * HARD SAFETY RULE: If humidity > 90%, status cannot be "playable".
 */
export type CourtStatus = "playable" | "drying" | "wet" | "verified" | "human_verified" | "caution";

export function getCourtStatus(
  report: { created_at: string; estimated_dry_minutes: number; rainfall: number } | null,
  latestObservation?: { status: string; created_at: string; display_name?: string } | null,
  currentHumidity?: number | null,
  recentRain?: boolean,
  forecastScore?: number | null,
  currentRain1h?: number | null,
): CourtStatus {
  const highHumidity = (currentHumidity ?? 0) > 90;

  // ── Captain's Gold Override (persistent, no expiry) ──
  // Only invalidated by ACTUAL rain (rain_1h > 0) or a newer rain report
  if (latestObservation?.status === "playable" && !highHumidity) {
    const actualRainNow = (currentRain1h ?? 0) > 0;
    const newerRainReport =
      report &&
      report.rainfall > 0 &&
      new Date(report.created_at).getTime() > new Date(latestObservation.created_at).getTime();

    if (!actualRainNow && !newerRainReport) {
      return "human_verified";
    }
  }

  // Hard safety override: humidity > 90%
  if (highHumidity) {
    return "caution";
  }

  // ── Forecast-driven status (Unified Truth) ──
  if (forecastScore != null) {
    if (forecastScore < 40) return "wet";
    if (forecastScore < 70) return "drying";
    return "playable";
  }

  // ── Fallback: report-age-based logic (when no weather data) ──
  if (!report) return "playable";

  const ageMinutes = (Date.now() - new Date(report.created_at).getTime()) / 60000;

  // No report in 12 hours → playable
  if (ageMinutes > 720) return "playable";

  // Report < 60 min old with heavy rain → wet
  if (ageMinutes < 60 && report.rainfall > 0.25) return "wet";

  // Dry time has elapsed → playable
  if (ageMinutes >= report.estimated_dry_minutes) return "playable";

  // Otherwise → drying
  return "drying";
}

export const STATUS_CONFIG: Record<CourtStatus, { color: string; label: string }> = {
  playable: { color: "bg-court-green", label: "Playable" },
  verified: { color: "bg-court-green", label: "Verified Playable" },
  human_verified: { color: "bg-amber-400", label: "Human Verified" },
  caution: { color: "bg-court-amber", label: "Saturated Air" },
  drying: { color: "bg-court-amber", label: "Drying" },
  wet: { color: "bg-court-red", label: "Likely Unplayable" },
};
