export interface Court {
  id: string;
  name: string;
  location: string;
  surface: "Hard" | "Clay" | "Grass";
  courts: number;
}

export interface CourtReport {
  id: string;
  courtId: string;
  timestamp: number;
  rainfall: number;
  squeegeeCount: 0 | 1 | 2;
  skyCondition: "Clear" | "Partial" | "Overcast";
  photoUrl?: string;
  estimatedDryMinutes: number;
}

export interface LogEntry {
  id: string;
  courtId: string;
  timestamp: number;
  author: string;
  message: string;
}

export const COURTS: Court[] = [
  { id: "bitsy-grant", name: "Bitsy Grant Tennis Center", location: "Northside Dr NW", surface: "Hard", courts: 13 },
  { id: "piedmont-park", name: "Piedmont Park Courts", location: "Piedmont Ave NE", surface: "Hard", courts: 12 },
  { id: "mcgill-park", name: "McGill Park", location: "Boulevard NE", surface: "Hard", courts: 4 },
  { id: "chastain-park", name: "Chastain Park Tennis", location: "Powers Ferry Rd NW", surface: "Hard", courts: 9 },
  { id: "blackburn-park", name: "Blackburn Park Tennis", location: "Blackburn Park Dr", surface: "Hard", courts: 6 },
  { id: "dekalb-tennis", name: "DeKalb Tennis Center", location: "Mason Mill Rd", surface: "Hard", courts: 17 },
  { id: "south-fulton", name: "South Fulton Tennis Center", location: "Mason Rd", surface: "Hard", courts: 12 },
  { id: "lost-corners", name: "Lost Corners Park", location: "Lost Corners Cir", surface: "Hard", courts: 4 },
  { id: "garden-hills", name: "Garden Hills Tennis", location: "Pinetree Dr NE", surface: "Hard", courts: 4 },
  { id: "adams-park", name: "Adams Park Tennis", location: "Delowe Dr SW", surface: "Hard", courts: 6 },
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
  skyCondition: "Clear" | "Partial" | "Overcast"
): number {
  const effectiveRain = rainfall * SQUEEGEE_FACTOR[squeegeeCount];
  const baseDryMinutes = effectiveRain * 12; // ~12 min per mm in clear sun
  const adjustedMinutes = baseDryMinutes * SKY_FACTOR[skyCondition];
  return Math.round(Math.max(0, adjustedMinutes));
}

// Local storage helpers
const REPORTS_KEY = "courtready_reports";
const LOGS_KEY = "courtready_logs";

export function getReports(): CourtReport[] {
  try {
    return JSON.parse(localStorage.getItem(REPORTS_KEY) || "[]");
  } catch { return []; }
}

export function addReport(report: CourtReport) {
  const reports = getReports();
  reports.unshift(report);
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports.slice(0, 200)));
}

export function getLatestReport(courtId: string): CourtReport | undefined {
  return getReports().find((r) => r.courtId === courtId);
}

export function getLogs(courtId: string): LogEntry[] {
  try {
    const all: LogEntry[] = JSON.parse(localStorage.getItem(LOGS_KEY) || "[]");
    return all.filter((l) => l.courtId === courtId).slice(0, 50);
  } catch { return []; }
}

export function addLog(entry: LogEntry) {
  try {
    const all: LogEntry[] = JSON.parse(localStorage.getItem(LOGS_KEY) || "[]");
    all.unshift(entry);
    localStorage.setItem(LOGS_KEY, JSON.stringify(all.slice(0, 500)));
  } catch { /* noop */ }
}
