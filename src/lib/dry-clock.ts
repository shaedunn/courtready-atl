/**
 * Dry-Clock Playability Forecast Engine
 *
 * Computes an action-oriented status string from weather + court data.
 * No new tables — uses existing courts, weather_cache, and reports.
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
  return 1.0; // includes 'cloud' and anything else
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

/* Step 8 — Weather event string */
function weatherEventString(rain1h: number, description: string): string {
  const d = description.toLowerCase();
  const isActive = d.includes("rain") || d.includes("thunderstorm");

  if (rain1h <= 0) return "Dry conditions.";
  if (rain1h < 0.1) return "Light mist.";

  let event: string;
  if (rain1h <= 0.25) event = `Brief shower (${rain1h.toFixed(1)}″).`;
  else if (rain1h <= 0.5) event = `Steady rain (${rain1h.toFixed(1)}″).`;
  else event = `Heavy rain (${rain1h.toFixed(1)}″).`;

  if (isActive && rain1h > 0.1) return `Active rain — ${event}`;
  return event;
}

/* Format estimated playable time */
function formatPlayableTime(minutesFromNow: number): string {
  const target = new Date(Date.now() + minutesFromNow * 60000);
  return target.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
}

/**
 * Core Dry-Clock calculation.
 */
export function computeDryClock(
  rain1h: number,
  humidity: number,
  windSpeed: number,
  description: string,
  courtDrainage: number,
  courtSunExposure: number,
  recentReportRainfallInches: number | null,
): DryClockResult {
  const desc = description || "";
  const isActiveRain = (desc.toLowerCase().includes("rain") || desc.toLowerCase().includes("thunderstorm")) && rain1h > 0.1;

  // Step 2 — rainfall source
  const rainfallInches = recentReportRainfallInches != null ? recentReportRainfallInches : rain1h;

  // Weather event
  const weatherEvent = weatherEventString(rain1h, desc);

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
      inputs: { rainfallInches, drainageRating: courtDrainage, humidity, windSpeed, sunExposure: courtSunExposure, description: desc },
    };
  }

  // Step 3 — Base dry time
  const baseDryMinutes = rainfallInches * 60;

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
    inputs: { rainfallInches, drainageRating: courtDrainage, humidity, windSpeed, sunExposure: courtSunExposure, description: desc },
  };
}

/**
 * Determine report tier.
 * Tier 1: report < 2h old (human report primary)
 * Tier 2: no report or > 2h old (Dry-Clock primary)
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
