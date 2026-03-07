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
 *
 * Base:       60 mins per 0.1" rain → 600 × effectiveRain
 * Humidity:   ×1.5 if 70–85%, ×2.0 if 85-90%, ×3.0 if >90% (saturated air)
 * Humidity Floor: if >90%, minimum 120 minutes (evaporation effectively zero)
 * Wind:       ×1.3 if wind < 3 mph
 * Drainage:   divide by normalized drainage (1-5 → 0.2-1.0)
 * Sun:        divide by normalized sun exposure (1-5 → 0.2-1.0)
 * Shade Penalty: sun_exposure=1 adds 50% time penalty
 * Hindrance:  multiply by highest hindrance factor
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

  // Humidity penalty — 90%+ caps natural evaporation speed at ~33% (×3.0, saturated air)
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

  // Drainage & sun exposure as divisors (1-5 scale → normalized)
  const drainageFactor = normalizeRating(drainage);
  const sunFactor = normalizeRating(sunExposure);
  minutes = minutes / drainageFactor / sunFactor;

  // Shade penalty: sun_exposure=1 adds 50% time
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

  // Humidity Floor: if >90%, minimum 120 minutes
  if (humidity > 90 && effectiveRain > 0) {
    return Math.max(120, result);
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
 * < 60 → "X minutes"
 * ≥ 60 → "X hours and Y minutes" (omits "and 0 minutes" if exact)
 */
export function formatDryTime(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} hour${h > 1 ? "s" : ""}`;
  return `${h} hour${h > 1 ? "s" : ""} and ${m} minute${m > 1 ? "s" : ""}`;
}

/**
 * Traffic-light status from a report row + optional latest observation + current humidity.
 *
 * Verified: playable observation < 45 min old (AND humidity ≤ 90)
 * Playable: no report in 12h OR dry time elapsed (AND humidity ≤ 90 if rain report exists)
 * Drying:   report exists, dry time not yet finished, OR humidity > 90% with rain
 * Wet:      report < 60 min old with > 0.25" rain
 *
 * PERSISTENCE RULE: Never show "Dry" based on weather alone.
 * Only "Dry" if calculateDryTime from most recent report has reached zero.
 *
 * HUMIDITY FLOOR: If humidity > 90% and a rain report exists with remaining dry time,
 * status CANNOT be "playable" — stays "drying" with minimum 120 min.
 */
export type CourtStatus = "playable" | "drying" | "wet" | "verified" | "caution";

export function getCourtStatus(
  report: { created_at: string; estimated_dry_minutes: number; rainfall: number } | null,
  latestObservation?: { status: string; created_at: string } | null,
  currentHumidity?: number | null,
  recentRain?: boolean
): CourtStatus {
  const highHumidity = (currentHumidity ?? 0) > 90;

  // Check for verified playable within last 45 minutes
  // BUT not if humidity > 90% (evaporation stalled)
  if (latestObservation?.status === "playable" && !highHumidity) {
    const obsAge = (Date.now() - new Date(latestObservation.created_at).getTime()) / 60000;
    if (obsAge <= 45) return "verified";
  }

  // High humidity + recent rain but no report → caution (not "dry")
  if (!report && highHumidity && recentRain) return "caution";

  if (!report) return "playable";

  const ageMinutes = (Date.now() - new Date(report.created_at).getTime()) / 60000;

  // No report in 12 hours → playable (only if not high humidity with meaningful rain)
  if (ageMinutes > 720) {
    if (highHumidity && report.rainfall > 0.1) return "caution";
    return "playable";
  }

  // Humidity Floor: if > 90% and rain exists, CANNOT be dry — stays drying
  if (highHumidity && report.rainfall > 0) {
    return ageMinutes < 60 && report.rainfall > 0.25 ? "wet" : "drying";
  }

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
  caution: { color: "bg-court-amber", label: "Caution" },
  drying: { color: "bg-court-amber", label: "Drying" },
  wet: { color: "bg-court-red", label: "Wet" },
};
