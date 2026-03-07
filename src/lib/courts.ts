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
 * Step-Multiplier dry time engine (V1).
 *
 * Base:       60 mins per 0.1" rain → 600 × effectiveRain
 * Humidity:   ×1.5 if 70–85%, ×2.5 if >85%
 * Wind:       ×1.3 if wind < 3 mph
 * Drainage:   divide by drainage_rating (0–1 scale, higher = better)
 * Sun:        divide by sun_exposure_rating (0–1 scale, higher = better)
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

  // Humidity penalty
  if (humidity > 85) {
    minutes *= 2.5;
  } else if (humidity >= 70) {
    minutes *= 1.5;
  }

  // Wind penalty (low wind slows drying)
  if (windSpeed < 3) {
    minutes *= 1.3;
  }

  // Drainage & sun exposure as divisors (guard against zero)
  const drainageFactor = Math.max(drainage, 0.1);
  const sunFactor = Math.max(sunExposure, 0.1);
  minutes = minutes / drainageFactor / sunFactor;

  // Hindrance multiplier
  const hindranceMultiplier =
    hindrances.length === 0 || hindrances.includes("none")
      ? 1.0
      : Math.max(
          ...hindrances
            .filter((h) => h !== "none")
            .map((h) => HINDRANCE_OPTIONS.find((o) => o.value === h)?.multiplier ?? 1.0)
        );

  return Math.round(Math.max(0, minutes * hindranceMultiplier));
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
 * Traffic-light status from a report row.
 * Green: no report in 12h OR dry time elapsed.
 * Yellow: report exists, dry time not yet finished.
 * Red: report < 60 min old with > 0.25" rain.
 */
export type CourtStatus = "playable" | "drying" | "wet";

export function getCourtStatus(report: { created_at: string; estimated_dry_minutes: number; rainfall: number } | null): CourtStatus {
  if (!report) return "playable";

  const ageMinutes = (Date.now() - new Date(report.created_at).getTime()) / 60000;

  // No report in 12 hours → playable
  if (ageMinutes > 720) return "playable";

  // Dry time has elapsed → playable
  if (ageMinutes >= report.estimated_dry_minutes) return "playable";

  // Report < 60 min old with heavy rain → wet
  if (ageMinutes < 60 && report.rainfall > 0.25) return "wet";

  // Otherwise → drying
  return "drying";
}

export const STATUS_CONFIG: Record<CourtStatus, { color: string; label: string }> = {
  playable: { color: "bg-court-green", label: "Playable" },
  drying: { color: "bg-court-amber", label: "Drying" },
  wet: { color: "bg-court-red", label: "Wet" },
};
