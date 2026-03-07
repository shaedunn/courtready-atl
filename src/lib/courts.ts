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
 * Dunn Law — physics-driven dry time engine.
 *
 * effectiveRain = rainfall × squeegee_factor
 * evapPower    = (temp/70) × ((100-humidity)/100) × (1 + wind/10) × sunExposure × drainage
 * minutes      = (effectiveRain × 45) / evapPower
 * result       = round(minutes × hindranceFactor)
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

  const tempFactor = temperature / 70;
  const humidityFactor = (100 - humidity) / 100;
  const windFactor = 1 + windSpeed / 10;
  const evapPower = tempFactor * humidityFactor * windFactor * sunExposure * drainage;

  // Guard against zero/negative evapPower (e.g. 100% humidity)
  if (evapPower <= 0) return effectiveRain > 0 ? 9999 : 0;

  const baseDryMinutes = (effectiveRain * 45) / evapPower;

  // Apply hindrance multiplier (use highest if multiple selected)
  const hindranceMultiplier =
    hindrances.length === 0 || hindrances.includes("none")
      ? 1.0
      : Math.max(
          ...hindrances
            .filter((h) => h !== "none")
            .map((h) => HINDRANCE_OPTIONS.find((o) => o.value === h)?.multiplier ?? 1.0)
        );

  return Math.round(Math.max(0, baseDryMinutes * hindranceMultiplier));
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
