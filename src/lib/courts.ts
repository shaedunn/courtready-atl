export type Hindrance = "none" | "bird_baths" | "surface_cracks" | "debris";

export const HINDRANCE_OPTIONS: { value: Hindrance; label: string; multiplier: number }[] = [
  { value: "none", label: "None", multiplier: 1.0 },
  { value: "bird_baths", label: "Bird Baths / Depressions", multiplier: 1.5 },
  { value: "surface_cracks", label: "Surface Cracks / Seepage", multiplier: 2.0 },
  { value: "debris", label: "Debris / Leaves", multiplier: 1.2 },
];

// Dry time engine
const SKY_FACTOR: Record<string, number> = {
  Clear: 1.0,
  Partial: 1.4,
  Overcast: 2.0,
};

const SQUEEGEE_FACTOR: Record<number, number> = {
  0: 1.0,
  1: 0.2,
  2: 0.1,
};

export function calculateDryTime(
  rainfall: number,
  squeegeeCount: 0 | 1 | 2,
  skyCondition: "Clear" | "Partial" | "Overcast",
  hindrances: Hindrance[] = []
): number {
  const effectiveRain = rainfall * SQUEEGEE_FACTOR[squeegeeCount];
  const baseDryMinutes = effectiveRain * 12;
  const adjustedMinutes = baseDryMinutes * SKY_FACTOR[skyCondition];

  // Apply hindrance multiplier (use highest if multiple selected)
  const hindranceMultiplier = hindrances.length === 0 || hindrances.includes("none")
    ? 1.0
    : Math.max(
        ...hindrances
          .filter((h) => h !== "none")
          .map((h) => HINDRANCE_OPTIONS.find((o) => o.value === h)?.multiplier ?? 1.0)
      );

  return Math.round(Math.max(0, adjustedMinutes * hindranceMultiplier));
}
