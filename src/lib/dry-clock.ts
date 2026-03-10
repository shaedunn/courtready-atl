/**
 * Dry-Clock Playability Forecast Engine
 *
 * Computes an action-oriented status string from weather + court data.
 * No new tables — uses existing courts, weather_cache, and reports.
 *
 * NOTE: rain1h from OpenWeather One Call API is in MILLIMETERS.
 * All internal calculations use inches. Conversion: 1mm = 0.0394 inches.
 */

export type DryClockResult = {
  outputString: string;
  weatherEvent: string;
  effortLevel: string;
  action: string;
  estimatedMinutes: number;
  estimatedPlayableTime: string | null;
  isActiveRain: boolean;
  inputs: {
    rainfallInches: number;
    drainageRating: number;
    humidity: number;
    windSpeed: number;
    sunExposure: number;
    description: string;
  };
};

/* mm → inches */
function mmToInches(mm: number): number {
  return mm * 0.0394;
}

/* Step 4 — Drainage modifier */
function drainageModifier(rating: number): number {
  if (rating >= 4.6) return 0.5;
  if (rating >= 3.6) return 0.7;
  if (rating >= 3.0) return 1.0;
  if (rating >= 2.0) return 1.4;
  return 1.8;
}

/* Step 5 — Weather modifiers */
function humidityModifier(h: number): number {
  if (h > 85) return 1.4;
  if (h >= 70) return 1.1;
  return 0.85;
}

function windModifier(w: number): number {
  if (w > 15) return 0.8;
  if (w >= 5) return 1.0;
  return 1.2;
}

function skyModifier(desc: string): number {
  const d = desc.toLowerCase();
  if (d.includes("clear")) return 0.8;
  if (d.includes("overcast")) return 1.2;
  return 1.0;
}

/* Step 6 — Sun exposure modifier */
function sunModifier(rating: number): number {
  if (rating >= 4.0) return 0.85;
  if (rating >= 2.5) return 1.0;
  return 1.2;
}

/* Step 7 — Effort mapping */
function mapEffort(minutes: number): { effort: string; action: string } {
  if (minutes <= 0) return { effort: "", action: "" };
  if (minutes <= 30) return { effort: "Light effort", action: "bring towels" };
  if (minutes <= 60) return { effort: "Moderate effort", action: "squeegees recommended" };
  if (minutes <= 120) return { effort: "Full effort", action: "blowers + squeegees needed" };
  return { effort: "Heavy effort", action: "full court press required" };
}

/* Step 8 — Weather event string (rain1h in mm) */
function weatherEventString(rain1h_mm: number, description: string): string {
  const d = description.toLowerCase();
  const isActive = d.includes("rain") || d.includes("thunderstorm");
  const rain_in = mmToInches(rain1h_mm);

  if (rain1h_mm <= 0) return "Dry conditions.";
  if (rain_in < 0.1) return "Light mist.";

  let event: string;
  if (rain_in <= 0.25) event = `Brief shower (${rain_in.toFixed(2)}″).`;
  else if (rain_in <= 0.5) event = `Steady rain (${rain_in.toFixed(2)}″).`;
  else event = `Heavy rain (${rain_in.toFixed(2)}″).`;

  if (isActive && rain_in > 0.1) return `Active rain — ${event}`;
  return event;
}

/* Format estimated playable time */
function formatPlayableTime(minutesFromNow: number): string {
  const target = new Date(Date.now() + minutesFromNow * 60000);
  return target.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
}

/**
 * Core Dry-Clock calculation.
 *
 * @param rain1h_mm       - rainfall in MILLIMETERS (from OpenWeather)
 * @param humidity        - relative humidity %
 * @param windSpeed       - wind speed mph
 * @param description     - weather description string
 * @param courtDrainage   - drainage rating 1-5
 * @param courtSunExposure - sun exposure rating 1-5
 * @param recentReportRainfall_mm - rainfall from a recent community report, in MM (or null)
 */
export function computeDryClock(
  rain1h_mm: number,
  humidity: number,
  windSpeed: number,
  description: string,
  courtDrainage: number,
  courtSunExposure: number,
  recentReportRainfall_mm: number | null,
): DryClockResult {
  const desc = description || "";
  const isActiveRain =
    (desc.toLowerCase().includes("rain") || desc.toLowerCase().includes("thunderstorm")) &&
    rain1h_mm > 2.54; // 2.54mm = 0.1 inches threshold

  // Step 2 — rainfall source: prefer community report if available
  const rawRainfall_mm =
    recentReportRainfall_mm != null ? recentReportRainfall_mm : rain1h_mm;
  const rainfallInches = mmToInches(rawRainfall_mm);

  // Weather event string
  const weatherEvent = weatherEventString(rain1h_mm, desc);

  // Active rain short-circuit
  if (isActiveRain) {
    return {
      outputString: "Active rain — check back for updated forecast.",
      weatherEvent,
      effortLevel: "",
      action: "",
      estimatedMinutes: -1,
      estimatedPlayableTime: null,
      isActiveRain: true,
      inputs: {
        rainfallInches,
        drainageRating: courtDrainage,
        humidity,
        windSpeed,
        sunExposure: courtSunExposure,
        description: desc,
      },
    };
  }

  // Step 3 — Base dry time from rainfall in inches
  // Empirical baseline: 1 inch of rain on an average court = ~120 minutes to dry
  const baseDryMinutes = rainfallInches * 120;

  // Steps 4-6 — Apply modifiers
  let minutes = baseDryMinutes;
  minutes *= drainageModifier(courtDrainage);
  minutes *= humidityModifier(humidity);
  minutes *= windModifier(windSpeed);
  minutes *= skyModifier(desc);
  minutes *= sunModifier(courtSunExposure);
  minutes = Math.round(Math.max(0, minutes));

  // Step 7 — Effort
  const { effort, action } = mapEffort(minutes);

  // Step 8 — Output string
  let outputString: string;
  if (minutes <= 0) {
    outputString = `${weatherEvent} Courts ready — no prep needed.`;
  } else {
    const timeStr = formatPlayableTime(minutes);
    outputString = `${weatherEvent} Estimated playable by ${timeStr} with ${effort.toLowerCase()} (${action}).`;
  }

  return {
    outputString,
    weatherEvent,
    effortLevel: effort,
    action,
    estimatedMinutes: minutes,
    estimatedPlayableTime: minutes > 0 ? formatPlayableTime(minutes) : null,
    isActiveRain: false,
    inputs: {
      rainfallInches,
      drainageRating: courtDrainage,
      humidity,
      windSpeed,
      sunExposure: courtSunExposure,
      description: desc,
    },
  };
}

/**
 * Determine report tier.
 * Tier 1: report < 2h old (human report primary)
 * Tier 2: no report or > 4h old (Dry-Clock primary)
 * Stale: 2-4h old (show warning)
 */
export type ReportTier = "tier1" | "tier2" | "stale";

export function getReportTier(reportCreatedAt: string | null): ReportTier {
  if (!reportCreatedAt) return "tier2";
  const ageMinutes = (Date.now() - new Date(reportCreatedAt).getTime()) / 60000;
  if (ageMinutes > 240) return "tier2"; // > 4h → ignore
  if (ageMinutes > 120) return "stale"; // 2-4h → stale warning
  return "tier1"; // < 2h → full trust
}

export function getReportAgeText(createdAt: string): string {
  const mins = Math.round((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
}
