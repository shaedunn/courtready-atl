export type Hindrance = "none" | "bird_baths" | "surface_cracks" | "debris";

export const HINDRANCE_OPTIONS: { value: Hindrance; label: string; multiplier: number }[] = [
  { value: "none", label: "None", multiplier: 1.0 },
  { value: "bird_baths", label: "Bird Baths / Depressions", multiplier: 1.5 },
  { value: "surface_cracks", label: "Surface Cracks / Seepage", multiplier: 2.0 },
  { value: "debris", label: "Debris / Leaves", multiplier: 1.2 },
];

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
