import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Sparkles, MapPin, CheckCircle2, Droplets as DropletsIcon, AlertTriangle, Info, Scissors, Settings, ShieldAlert, ChevronDown, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { supabase, fetchWeather, type SovereignCourt, type Observation, getDisplayName, setDisplayName } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";
import { formatDryTime, calculateSqueegeeDryTime, getCourtStatus, STATUS_CONFIG, getVerifiedAgoText } from "@/lib/courts";
import { computeDryClock, getReportTier, getReportAgeText, type DryClockResult, type ReportTier } from "@/lib/dry-clock";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import SubCourtEditor from "@/components/court/SubCourtEditor";
import GuidedTour, { shouldShowTour } from "@/components/GuidedTour";
import CelebrationOverlay from "@/components/CelebrationOverlay";
import type { SubCourtRow } from "@/types/supabase";

type Report = Tables<"reports">;

/* ─── Display Name Prompt ─── */
function DisplayNamePrompt({ onConfirm }: { onConfirm: (name: string) => void }) {
  const [name, setName] = useState(getDisplayName());
  return (
    <div className="bg-secondary/50 rounded-lg p-4 border border-border space-y-3">
      <p className="text-xs font-medium text-foreground">Enter your display name (saved locally)</p>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Captain Dunn"
        className="w-full bg-secondary text-foreground rounded-lg px-3 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50"
      />
      <button
        onClick={() => { if (name.trim()) { setDisplayName(name.trim()); onConfirm(name.trim()); } }}
        disabled={!name.trim()}
        className="w-full bg-accent text-accent-foreground py-2 rounded-lg text-sm font-semibold hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        Confirm
      </button>
    </div>
  );
}

/* ─── Status Verification Section ─── */
function StatusVerification({ courtId, reportId }: { courtId: string; reportId: string | null }) {
  const queryClient = useQueryClient();
  const [needsName, setNeedsName] = useState(false);
  const [pendingAction, setPendingAction] = useState<"still_wet" | "squeegee_needed" | "playable" | null>(null);

  const submitObservation = useMutation({
    mutationFn: async (status: "still_wet" | "squeegee_needed" | "playable") => {
      const name = getDisplayName();
      if (!name) {
        setPendingAction(status);
        setNeedsName(true);
        throw new Error("NEEDS_NAME");
      }
      const { error } = await supabase.from("observations").insert({
        court_id: courtId,
        report_id: reportId,
        status,
        display_name: name,
      } as any);
      if (error) throw error;

      if (status === "squeegee_needed" && reportId) {
        const { data: report } = await supabase.from("reports").select("estimated_dry_minutes, created_at").eq("id", reportId).single();
        if (report) {
          const elapsed = (Date.now() - new Date(report.created_at).getTime()) / 60000;
          const remaining = Math.max(0, report.estimated_dry_minutes - elapsed);
          const newTotal = elapsed + calculateSqueegeeDryTime(remaining);
          await supabase.from("reports").update({ estimated_dry_minutes: Math.round(newTotal) }).eq("id", reportId);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["latest-report", courtId] });
      queryClient.invalidateQueries({ queryKey: ["latest-reports"] });
      queryClient.invalidateQueries({ queryKey: ["latest-observation", courtId] });
    },
    onError: (err) => {
      if (err.message !== "NEEDS_NAME") console.error(err);
    },
  });

  const handleNameConfirmed = (name: string) => {
    setNeedsName(false);
    if (pendingAction) {
      submitObservation.mutate(pendingAction);
      setPendingAction(null);
    }
  };

  if (needsName) return <DisplayNamePrompt onConfirm={handleNameConfirmed} />;

  const btnClass = "flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-2.5 rounded-lg text-xs font-medium border transition-all active:scale-[0.98] disabled:opacity-50";

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Verify Status</p>
      <div className="flex gap-2">
        <button
          onClick={() => submitObservation.mutate("still_wet")}
          disabled={submitObservation.isPending}
          className={`${btnClass} bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20`}
        >
          <DropletsIcon className="w-3.5 h-3.5" /> Still Wet
        </button>
        <button
          onClick={() => submitObservation.mutate("squeegee_needed")}
          disabled={submitObservation.isPending}
          className={`${btnClass} bg-court-amber/10 text-court-amber border-court-amber/20 hover:bg-court-amber/20`}
        >
          <Scissors className="w-3.5 h-3.5" /> Squeegee Needed
        </button>
        <button
          onClick={() => submitObservation.mutate("playable")}
          disabled={submitObservation.isPending}
          className={`${btnClass} bg-court-green/10 text-court-green border-court-green/20 hover:bg-court-green/20`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Playable
        </button>
      </div>
    </div>
  );
}

/* ─── Squeegee Action Button ─── */
function SqueegeeAction({ report, courtId }: { report: Report; courtId: string }) {
  const queryClient = useQueryClient();

  const squeegeeMutation = useMutation({
    mutationFn: async () => {
      const name = getDisplayName() || "Anonymous";
      const elapsed = (Date.now() - new Date(report.created_at).getTime()) / 60000;
      const remaining = Math.max(0, report.estimated_dry_minutes - elapsed);
      const newTotal = elapsed + calculateSqueegeeDryTime(remaining);

      const { error } = await supabase
        .from("reports")
        .update({ estimated_dry_minutes: Math.round(newTotal) })
        .eq("id", report.id);
      if (error) throw error;

      await supabase.from("observations").insert({
        court_id: courtId,
        report_id: report.id,
        status: "squeegee_needed",
        display_name: name,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["latest-report", courtId] });
      queryClient.invalidateQueries({ queryKey: ["latest-reports"] });
      queryClient.invalidateQueries({ queryKey: ["latest-observation", courtId] });
    },
  });

  return (
    <button
      onClick={() => squeegeeMutation.mutate()}
      disabled={squeegeeMutation.isPending}
      className="w-full flex items-center justify-center gap-2 bg-court-green/10 text-court-green border border-court-green/20 rounded-lg py-2.5 text-sm font-medium hover:bg-court-green/20 active:scale-[0.98] transition-all disabled:opacity-50"
    >
      <Scissors className="w-4 h-4" />
      {squeegeeMutation.isPending ? "Updating..." : "I am Squeegeeing This Court"}
    </button>
  );
}

/* ─── Infer current condition from weather/report ─── */
type NowCondition = "dry" | "damp" | "wet" | "active_rain";

function inferNowCondition(dryClockResult: DryClockResult, latestReport: Report | null): NowCondition {
  // If there's a recent anon report, use it
  if (latestReport) {
    const ageMs = Date.now() - new Date(latestReport.created_at).getTime();
    if (ageMs < 2 * 60 * 60 * 1000) {
      return inferAnonCondition(latestReport);
    }
  }
  // Fall back to algorithm
  if (dryClockResult.isActiveRain) return "active_rain";
  if (dryClockResult.estimatedMinutes > 60) return "wet";
  if (dryClockResult.estimatedMinutes > 0) return "damp";
  return "dry";
}

const CONDITION_DISPLAY: Record<NowCondition, { label: string; color: string; dotColor: string }> = {
  dry: { label: "Courts Dry — Ready to Play", color: "text-court-green", dotColor: "bg-court-green" },
  damp: { label: "Courts Damp — Drying in Progress", color: "text-court-amber", dotColor: "bg-court-amber" },
  wet: { label: "Standing Water — Not Playable", color: "text-destructive", dotColor: "bg-destructive" },
  active_rain: { label: "Active Rain", color: "text-destructive", dotColor: "bg-destructive" },
};

/* ─── Status Card (Condition + Outlook) ─── */
function StatusCard({ dryClockNow, dryClockFuture, latestReport, courtId, latestObservation, weatherData }: {
  dryClockNow: DryClockResult | null;
  dryClockFuture: { offset: number; result: DryClockResult }[];
  latestReport: Report | null;
  courtId: string;
  latestObservation: Observation | null;
  weatherData: { temp?: number | null; humidity?: number | null; wind_speed?: number | null } | null;
}) {
  const [outlookExpanded, setOutlookExpanded] = useState(false);

  // Determine "Now" condition
  const nowCondition: NowCondition = dryClockNow
    ? inferNowCondition(dryClockNow, latestReport)
    : (latestReport ? inferAnonCondition(latestReport) : "dry");

  const display = CONDITION_DISPLAY[nowCondition];

  // Determine future conditions for outlook
  const futureConditions = dryClockFuture.map(f => {
    const cond: NowCondition = f.result.isActiveRain ? "active_rain"
      : f.result.estimatedMinutes > 60 ? "wet"
      : f.result.estimatedMinutes > 0 ? "damp"
      : "dry";
    return { offset: f.offset, condition: cond };
  });

  // Outlook logic
  let outlookText: string | null = null;
  let outlookEmoji = "🟡";
  let outlookDetail: string | null = null;

  const nowIsDry = nowCondition === "dry";
  const nowIsWetOrDamp = nowCondition === "wet" || nowCondition === "damp" || nowCondition === "active_rain";
  const futureHasRain = futureConditions.some(f => f.condition === "wet" || f.condition === "active_rain");
  const futureClearing = futureConditions.some(f => f.condition === "dry" || f.condition === "damp");
  const futureAllSame = futureConditions.every(f => f.condition === nowCondition);

  if (nowIsDry && futureHasRain) {
    const rainOffset = futureConditions.find(f => f.condition === "wet" || f.condition === "active_rain");
    outlookText = "Rain expected — see forecast";
    outlookDetail = `Current conditions are dry, but rain is expected within ${rainOffset ? rainOffset.offset : 3} hours. Check the Playability Forecast for your window.`;
  } else if (nowIsWetOrDamp && futureClearing && !futureAllSame) {
    outlookText = "Clearing soon — see forecast";
    outlookDetail = "Courts are currently wet, but clearing conditions suggest playability soon with prep. See Playability Forecast below.";
  }

  return (
    <div className="bg-card rounded-lg p-5 border border-border card-glow space-y-3">
      <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Current Condition</span>

      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${display.dotColor} inline-block`} />
        <p className={`text-lg font-bold font-heading ${display.color}`}>{display.label}</p>
      </div>

      {/* Inline weather strip */}
      {weatherData && (
        <p className="text-xs text-muted-foreground">
          {weatherData.temp != null && <>{Math.round(weatherData.temp)}°F · </>}
          {weatherData.humidity != null && (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={weatherData.humidity > 90 ? "text-court-amber font-medium" : ""}>
                    {weatherData.humidity}% humidity
                  </span>
                </TooltipTrigger>
                {weatherData.humidity > 90 && (
                  <TooltipContent side="top" className="max-w-[200px] text-xs">
                    High humidity slows drying significantly and may create slippery surfaces.
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
          {weatherData.wind_speed != null && <> · {Math.round(weatherData.wind_speed)} mph wind</>}
        </p>
      )}

      {/* Outlook line */}
      {outlookText && (
        <div className="space-y-1">
          <button
            onClick={() => setOutlookExpanded(p => !p)}
            className="flex items-center gap-1.5 text-xs text-court-amber min-h-[36px]"
          >
            <span>{outlookEmoji}</span>
            <span>{outlookText}</span>
            <Info className="w-3 h-3 text-muted-foreground" />
          </button>
          {outlookExpanded && outlookDetail && (
            <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 border border-border">
              {outlookDetail}
            </p>
          )}
        </div>
      )}

      {/* Squeegee action for wet/damp */}
      {(nowCondition === "wet" || nowCondition === "damp") && latestReport && (
        <SqueegeeAction report={latestReport} courtId={courtId} />
      )}

      {/* Verify status */}
      {latestReport && (
        <StatusVerification courtId={courtId} reportId={latestReport.id} />
      )}
    </div>
  );
}

/* ─── Playability Forecast ─── */
type HourlyEntry = { dt: number; temp: number; humidity: number; wind_speed: number; wind_deg?: number | null; pop: number; rain_1h: number; description?: string };

type WeatherWithHourly = {
  temp: number; humidity: number; wind_speed: number; wind_deg?: number | null; rain_1h?: number;
  description?: string; icon?: string;
  hourly?: HourlyEntry[];
};

/* ─── Cardinal direction helper ─── */
function degToCardinal(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function calculatePlayability(
  hourly: HourlyEntry[],
  offset: number,
  courtDrainage: number,
  latestReport: Report | null,
): { score: number; ghostActive: boolean } {
  const window = hourly.slice(offset, offset + 3);
  if (window.length === 0) return { score: 100, ghostActive: false };

  const drainageMap: Record<number, number> = { 1: 1.5, 2: 1.2, 3: 1.0, 4: 0.8, 5: 0.6 };
  const dm = drainageMap[courtDrainage] ?? 1.0;

  let rainPenalty = 0;
  if (window.some(h => h.pop > 0.3)) rainPenalty += 50;
  for (const h of window) {
    if (h.pop > 0.3) rainPenalty += Math.round(h.pop * 20);
    if (h.rain_1h > 0) rainPenalty += 15;
    if (h.humidity > 90) rainPenalty += 10;
    if (h.wind_speed > 10) rainPenalty -= 5;
  }
  rainPenalty = Math.max(0, rainPenalty);
  let score = 100 - Math.round(rainPenalty * dm);

  let ghostActive = false;
  if (offset > 0) {
    const priorHours = hourly.slice(0, offset);
    const priorRain = priorHours.some(h => h.rain_1h > 0);
    if (priorRain) {
      const dryMinutesNeeded = 120 * dm;
      if (dryMinutesNeeded > offset * 60) {
        score -= 40;
        ghostActive = true;
      }
    }
  }

  if (latestReport) {
    const elapsed = (Date.now() - new Date(latestReport.created_at).getTime()) / 60000;
    const remaining = Math.max(0, latestReport.estimated_dry_minutes - elapsed);
    if (remaining > offset * 60) score -= 30;
  }

  return { score: Math.max(0, Math.min(100, score)), ghostActive };
}

/* ─── Infer anonymous report condition ─── */
type AnonCondition = "dry" | "damp" | "wet" | "active_rain";

function inferAnonCondition(report: Report): AnonCondition {
  if (report.sky_condition === "clear" && report.rainfall === 0) return "dry";
  if (report.sky_condition === "cloudy" && report.rainfall === 0) return "damp";
  if (report.sky_condition === "rain" && report.estimated_dry_minutes >= 180) return "active_rain";
  if (report.sky_condition === "rain") return "wet";
  if (report.rainfall >= 0.4) return "active_rain";
  if (report.rainfall >= 0.2) return "wet";
  if (report.estimated_dry_minutes > 0) return "damp";
  return "dry";
}

function isRecentAnonReport(report: Report | null): boolean {
  if (!report) return false;
  const ageMs = Date.now() - new Date(report.created_at).getTime();
  return ageMs < 2 * 60 * 60 * 1000;
}

/* ─── Playability Forecast Component ─── */
function PlayabilityForecast({ weatherData, court, latestReport }: {
  weatherData: WeatherWithHourly;
  court: SovereignCourt;
  latestReport: Report | null;
}) {
  const [offset, setOffset] = useState("0");
  const [showDetails, setShowDetails] = useState(false);
  const [devMockRain, setDevMockRain] = useState(false);

  // In dev: inject past-rain hourly entries to test backward-facing reasoning line
  const hourly = useMemo(() => {
    const real = weatherData.hourly ?? [];
    if (!devMockRain || real.length === 0) return real;

    const now = Math.floor(Date.now() / 1000);
    const mockPast: HourlyEntry[] = [
      { dt: now - 10800, temp: 62, humidity: 90, wind_speed: 22, wind_deg: 315, pop: 0.80, rain_1h: 1.2, description: "heavy rain" },
      { dt: now - 7200, temp: 63, humidity: 85, wind_speed: 20, wind_deg: 320, pop: 0.60, rain_1h: 0.7, description: "moderate rain" },
      { dt: now - 3600, temp: 64, humidity: 80, wind_speed: 18, wind_deg: 330, pop: 0.30, rain_1h: 0.3, description: "light rain" },
    ];
    // Ensure real entries have low rain so backward mode triggers
    const dryReal = real.map((e, i) => i < 4 ? { ...e, rain_1h: 0, pop: 0.05 } : e);
    return [...mockPast, ...dryReal];
  }, [weatherData.hourly, devMockRain]);

  // Dev toggle (only in development)
  const devToggle = import.meta.env.DEV ? (
    <button
      onClick={() => setDevMockRain(v => !v)}
      className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted/50 transition-colors"
    >
      {devMockRain ? "🧪 Mock rain ON" : "🧪 Mock rain OFF"}
    </button>
  ) : null;

  // Generate clock-time labels for tabs
  const tabLabels = useMemo(() => {
    const now = new Date();
    return [0, 1, 2, 3].map(off => {
      if (off === 0) return "Now";
      const future = new Date(now.getTime() + off * 3600000);
      return future.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
    });
  }, []);

  const recentReportRainfall = useMemo(() => {
    if (!latestReport) return null;
    const ageH = (Date.now() - new Date(latestReport.created_at).getTime()) / 3600000;
    if (ageH > 6) return null;
    return latestReport.rainfall;
  }, [latestReport]);

  // Build a stateful chain of court conditions across all 4 tabs
  const forecastChain = useMemo(() => {
    type CourtState = "DRY" | "WET";
    type TabResult = DryClockResult & { courtState: CourtState; accumulatedRain: number };

    const results: TabResult[] = [];

    for (let i = 0; i <= 3; i++) {
      // Get weather conditions for this tab
      let rain: number, humidity: number, wind: number, desc: string;
      if (i === 0) {
        rain = weatherData.rain_1h ?? 0;
        humidity = weatherData.humidity ?? 50;
        wind = weatherData.wind_speed ?? 5;
        desc = weatherData.description ?? "";
      } else {
        const h = hourly[i];
        rain = h?.rain_1h ?? 0;
        humidity = h?.humidity ?? weatherData.humidity ?? 50;
        wind = h?.wind_speed ?? weatherData.wind_speed ?? 5;
        desc = h?.description ?? weatherData.description ?? "";
      }

      // For Now tab: use actual rain intensity. For future tabs: use precipitation probability.
      const pop = (i > 0) ? ((hourly[i] as any)?.pop ?? 0) : 0;

      if (i === 0) {
        // Step 1: Now tab — use actual current conditions + community reports
        const nowResult = computeDryClock(
          rain, humidity, wind, desc,
          court.drainage, court.sun_exposure,
          recentReportRainfall,
        );
        // Active rain only if actual intensity > 0.5mm/hr
        const isActiveNow = (desc.toLowerCase().includes("rain") || desc.toLowerCase().includes("thunderstorm")) && rain > 0.5;
        const courtState: CourtState = (isActiveNow || nowResult.estimatedMinutes > 0 || rain > 0.05) ? "WET" : "DRY";
        const accRain = courtState === "WET" ? Math.max(rain, recentReportRainfall ?? 0) : 0;
        if (isActiveNow) {
          results.push({
            ...nowResult,
            isActiveRain: true,
            outputString: "Active rain — check back as conditions develop.",
            estimatedMinutes: -1,
            estimatedPlayableTime: null,
            effortLevel: "",
            action: "",
            courtState: "WET",
            accumulatedRain: accRain,
          });
        } else {
          results.push({ ...nowResult, courtState, accumulatedRain: accRain });
        }
        continue;
      }

      // Step 2: Inherit state from previous tab
      const prev = results[i - 1];
      const inheritedState = prev.courtState;
      const inheritedRain = prev.accumulatedRain;

      // Future tabs: use precipitation probability (pop) instead of rain intensity
      // Rule A-pop: pop > 50% → rain likely, accumulate forecast rain, stay WET
      if (pop > 0.50) {
        const accRain = inheritedRain + rain;
        const baseResult = computeDryClock(
          rain, humidity, wind, desc,
          court.drainage_rating, court.sun_exposure_rating, null,
        );
        results.push({
          ...baseResult,
          isActiveRain: false,
          outputString: "Rain likely — forecast updating.",
          estimatedMinutes: -1,
          estimatedPlayableTime: null,
          effortLevel: "",
          action: "",
          courtState: "WET",
          accumulatedRain: accRain,
        });
        continue;
      }

      // Rule A-clearing: pop 20-50% and inherited WET → clearing conditions
      if (pop >= 0.20 && inheritedState === "WET") {
        const baseResult = computeDryClock(
          inheritedRain, humidity, wind, desc,
          court.drainage_rating, court.sun_exposure_rating, null,
        );
        results.push({
          ...baseResult,
          isActiveRain: false,
          outputString: "Clearing conditions — drying in progress.",
          estimatedMinutes: baseResult.estimatedMinutes,
          estimatedPlayableTime: baseResult.estimatedPlayableTime,
          effortLevel: baseResult.effortLevel,
          action: baseResult.action,
          courtState: "WET",
          accumulatedRain: inheritedRain,
        });
        continue;
      }

      // Rule C: No rain this hour AND inherited state is DRY
      if (inheritedState === "DRY") {
        const baseResult = computeDryClock(
          0, humidity, wind, desc,
          court.drainage_rating, court.sun_exposure_rating, null,
        );
        results.push({
          ...baseResult,
          outputString: "Courts dry — ready to play.",
          estimatedMinutes: 0,
          estimatedPlayableTime: null,
          isActiveRain: false,
          courtState: "DRY",
          accumulatedRain: 0,
        });
        continue;
      }

      // Rule B: No rain this hour BUT inherited state is WET (post-rain recovery)
      // Calculate recovery time from accumulated rainfall using Dry-Clock formula
      const recoveryResult = computeDryClock(
        inheritedRain, humidity, wind, desc,
        court.drainage_rating, court.sun_exposure_rating, null,
      );

      // How many hours since rain could have stopped? Find the last rainy tab before this one
      let hoursSinceRainStopped = 0;
      for (let j = i - 1; j >= 0; j--) {
        if (results[j].isActiveRain || (j === 0 && (weatherData.rain_1h ?? 0) > 0.1)) {
          hoursSinceRainStopped = i - j;
          break;
        }
        // If prev tab was WET but not actively raining, rain stopped before that
        if (results[j].courtState === "WET" && !results[j].isActiveRain) {
          // Keep searching backwards
          continue;
        }
      }
      // If we never found active rain, assume rain was at tab 0
      if (hoursSinceRainStopped === 0) hoursSinceRainStopped = i;

      const elapsedMinutes = hoursSinceRainStopped * 60;
      const remainingMinutes = Math.max(0, recoveryResult.estimatedMinutes - elapsedMinutes);

      // Rule D: Recovery complete → courts dry
      if (remainingMinutes <= 0) {
        const baseResult = computeDryClock(
          0, humidity, wind, desc,
          court.drainage_rating, court.sun_exposure_rating, null,
        );
        results.push({
          ...baseResult,
          outputString: "Courts dry — ready to play.",
          estimatedMinutes: 0,
          estimatedPlayableTime: null,
          isActiveRain: false,
          courtState: "DRY",
          accumulatedRain: 0,
        });
        continue;
      }

      // Still recovering
      const effort = remainingMinutes <= 30 ? "light effort"
        : remainingMinutes <= 60 ? "moderate effort"
        : remainingMinutes <= 120 ? "full effort"
        : "heavy effort";
      const durationStr = remainingMinutes <= 60
        ? `within ${remainingMinutes} minutes`
        : `within ${Math.round(remainingMinutes / 60)} hour${Math.round(remainingMinutes / 60) > 1 ? "s" : ""}`;

      // Determine if rain JUST stopped (previous tab was active rain)
      const prevWasActiveRain = prev.isActiveRain;
      const outputString = prevWasActiveRain
        ? `Rain clearing — playable ${durationStr} with ${effort} once rain stops.`
        : `Post-rain recovery — playable ${durationStr} with ${effort}.`;

      results.push({
        ...recoveryResult,
        estimatedMinutes: remainingMinutes,
        estimatedPlayableTime: null,
        effortLevel: effort,
        action: "",
        outputString,
        isActiveRain: false,
        courtState: "WET",
        accumulatedRain: inheritedRain, // no new rain, carry forward
      });
    }

    return results;
  }, [hourly, weatherData, court.drainage_rating, court.sun_exposure_rating, recentReportRainfall]);

  const dryClockResult = forecastChain[parseInt(offset)] ?? forecastChain[0];

  const reportTier = getReportTier(latestReport?.created_at ?? null);

  const cardBg = dryClockResult.isActiveRain
    ? "bg-destructive/10 border-destructive/30"
    : dryClockResult.estimatedMinutes <= 0
      ? "bg-court-green/5 border-court-green/20"
      : dryClockResult.estimatedMinutes <= 60
        ? "bg-court-amber/5 border-court-amber/20"
        : "bg-destructive/5 border-destructive/20";

  const textColor = dryClockResult.isActiveRain
    ? "text-destructive"
    : dryClockResult.estimatedMinutes <= 0
      ? "text-court-green"
      : dryClockResult.estimatedMinutes <= 60
        ? "text-court-amber"
        : "text-destructive";

  const hasRecentReport = isRecentAnonReport(latestReport);
  const anonCondition = hasRecentReport && latestReport ? inferAnonCondition(latestReport) : null;
  const reportAgeText = hasRecentReport && latestReport ? getReportAgeText(latestReport.created_at) : null;

  const overrideCardBg = anonCondition === "active_rain"
    ? "bg-destructive/10 border-destructive/30"
    : anonCondition === "wet"
      ? "bg-destructive/5 border-destructive/20"
      : anonCondition === "damp"
        ? "bg-court-amber/5 border-court-amber/20"
        : anonCondition === "dry"
          ? "bg-court-green/5 border-court-green/20"
          : null;

  const overrideTextColor = anonCondition === "active_rain" || anonCondition === "wet"
    ? "text-destructive"
    : anonCondition === "damp"
      ? "text-court-amber"
      : anonCondition === "dry"
        ? "text-court-green"
        : null;

  const finalCardBg = (hasRecentReport && parseInt(offset) === 0 && overrideCardBg) ? overrideCardBg : cardBg;
  const finalTextColor = (hasRecentReport && parseInt(offset) === 0 && overrideTextColor) ? overrideTextColor : textColor;

  const overrideOutput = useMemo(() => {
    if (!hasRecentReport || !latestReport || parseInt(offset) !== 0) return null;
    const condition = inferAnonCondition(latestReport);
    const age = getReportAgeText(latestReport.created_at);
    switch (condition) {
      case "dry":
        return `Courts confirmed dry — reported ${age}`;
      case "damp":
        return `Courts damp — drying in progress. ${dryClockResult.estimatedMinutes > 0 ? `Estimated ${formatDryTime(dryClockResult.estimatedMinutes)} to dry.` : "Algorithm estimate still applies."}`;
      case "wet":
        return `Standing water reported ${age}. ${dryClockResult.estimatedMinutes > 0 ? `Estimated playable by ${dryClockResult.estimatedPlayableTime ?? "—"} with ${dryClockResult.effortLevel.toLowerCase() || "effort"}${dryClockResult.action ? ` (${dryClockResult.action})` : ""}.` : ""}`;
      case "active_rain":
        return `Active rain reported ${age}. Forecast will update as rain clears.`;
      default:
        return null;
    }
  }, [hasRecentReport, latestReport, offset, dryClockResult]);

  const showOutput = overrideOutput ?? dryClockResult.outputString;

  // Reasoning line: three-mode — backward-facing / forward-facing / suppress rain
  const reasoningLine = useMemo(() => {
    const idx = parseInt(offset);
    const h = idx === 0 ? null : (hourly[idx] ?? null);

    // Wind segment (unchanged)
    const windSpeed = idx === 0 ? (weatherData.wind_speed ?? 0) : (h?.wind_speed ?? weatherData.wind_speed ?? 0);
    const windDeg = idx === 0 ? (weatherData as any).wind_deg : (h as any)?.wind_deg;
    const windStr = windDeg != null
      ? `${Math.round(windSpeed)} mph ${degToCardinal(windDeg)} wind`
      : `${Math.round(windSpeed)} mph wind`;

    // Ready time segment (unchanged)
    let readyStr: string;
    const result = dryClockResult;
    if (result.isActiveRain || result.outputString.includes("Rain likely")) {
      readyStr = "Check back as conditions develop";
    } else if (result.estimatedMinutes <= 0) {
      readyStr = "Courts dry — no prep needed";
    } else {
      const time = result.estimatedPlayableTime ?? "—";
      const effort = result.effortLevel ? ` with ${result.effortLevel.toLowerCase()}` : "";
      readyStr = `Estimated ready by ${time}${effort}`;
    }

    // Determine selected hour's rain state
    const currentRain1h = idx === 0 ? (weatherData.rain_1h ?? 0) : ((h as any)?.rain_1h ?? 0);
    const currentPop = idx === 0 ? 0 : ((h as any)?.pop ?? 0);
    const selectedDt = idx === 0 ? (Date.now() / 1000) : ((h as any)?.dt ?? Date.now() / 1000);

    // --- Backward-facing scan ---
    let backwardMode = false;
    let backwardSegment = "";
    if (currentRain1h <= 0.5 && currentPop < 0.50) {
      let peakRain = 0;
      let lastRainDt = 0;
      for (let j = 0; j < hourly.length; j++) {
        const entry = hourly[j] as any;
        if (!entry?.dt || entry.dt >= selectedDt) break;
        const r1h = entry.rain_1h ?? 0;
        if (r1h > 0.5) {
          if (r1h > peakRain) peakRain = r1h;
          lastRainDt = entry.dt;
        }
      }
      if (lastRainDt > 0) {
        backwardMode = true;
        const descriptor = peakRain >= 1.0 ? "Heavy rainfall" : peakRain >= 0.5 ? "Moderate rainfall" : "Light rain";
        const endedTime = new Date(lastRainDt * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
        backwardSegment = `${descriptor} ended ${endedTime}`;
      }
    }

    if (backwardMode) {
      return `${backwardSegment} · ${windStr} · ${readyStr}`;
    }

    // --- Forward-facing mode ---
    let rainStatus: string | null = null;
    if (idx === 0) {
      const desc = (weatherData.description ?? "").toLowerCase();
      const isActive = (desc.includes("rain") || desc.includes("thunderstorm")) && (weatherData.rain_1h ?? 0) > 0.5;
      if (isActive) {
        rainStatus = "Active rain";
      } else if ((weatherData.rain_1h ?? 0) > 0.05) {
        rainStatus = "Light rain";
      }
    } else {
      const pop = (h as any)?.pop ?? 0;
      if (pop > 0.50) {
        rainStatus = "Rain likely";
      } else if (pop >= 0.20) {
        let clearHourLabel: string | null = null;
        for (let j = idx + 1; j < hourly.length; j++) {
          if (((hourly[j] as any)?.pop ?? 0) < 0.20) {
            const dt = hourly[j]?.dt;
            if (dt) {
              clearHourLabel = new Date(dt * 1000).toLocaleTimeString([], { hour: "numeric", hour12: true }).toLowerCase();
            }
            break;
          }
        }
        rainStatus = clearHourLabel ? `Rain clearing by ${clearHourLabel}` : "Rain clearing";
      }
    }

    // If rain segment exists, include it; otherwise suppress (fully dry)
    if (rainStatus) {
      return `${rainStatus} · ${windStr} · ${readyStr}`;
    }
    return `${windStr} · ${readyStr}`;
  }, [offset, hourly, weatherData, dryClockResult]);

  const contextLabel = hasRecentReport && reportAgeText
    ? `Community report — ${reportAgeText}`
    : reportTier === "tier2"
      ? "Forecast — no recent reports"
      : null;

  return (
    <div className="space-y-3">
      {!hasRecentReport && reportTier === "tier1" && latestReport && (
        <div className="bg-card rounded-lg p-3 border border-border">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">Forecast context</p>
          <p className="text-xs text-muted-foreground">
            Reported {getReportAgeText(latestReport.created_at)}
          </p>
        </div>
      )}

      {!hasRecentReport && reportTier === "stale" && latestReport && (
        <div className="bg-court-amber/5 rounded-lg p-3 border border-court-amber/20">
          <p className="text-xs text-court-amber">
            Last reported — {getReportAgeText(latestReport.created_at)}. Conditions may have changed.
          </p>
        </div>
      )}

      {/* Main Playability Forecast card */}
      <div className={`rounded-lg p-5 border space-y-4 ${finalCardBg}`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium block">
              Playability Forecast
            </span>
            <span className="text-[10px] italic text-muted-foreground/60">
              Powered by Dry-Clock™
            </span>
            {devToggle}
          </div>
          <ToggleGroup type="single" value={offset} onValueChange={(v) => v && setOffset(v)} className="bg-secondary rounded-lg p-0.5">
            {tabLabels.map((label, i) => (
              <ToggleGroupItem key={i} value={String(i)} className="text-xs px-3 min-h-[44px] py-2 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground rounded-md">
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {contextLabel && parseInt(offset) === 0 && (
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            {contextLabel}
          </p>
        )}

        <p className={`text-lg font-bold font-heading leading-snug ${finalTextColor}`}>
          {showOutput}
        </p>
        <p className="text-sm text-muted-foreground leading-snug">
          {reasoningLine}
        </p>

        {!overrideOutput && dryClockResult.isActiveRain && (
          <p className="text-xs text-destructive/80">
            Active rain detected. Forecast will update as conditions change.
          </p>
        )}

        {(() => {
          const dnaNote = court.dna_note ?? "";
          const slipKeywords = /slip|hazard|moss|algae|caution/i;
          const hasSlipRisk = slipKeywords.test(dnaNote);
          const isDamp = (weatherData.humidity ?? 0) > 70 || (weatherData.rain_1h ?? 0) > 0 || (latestReport && latestReport.rainfall > 0);
          if (hasSlipRisk && isDamp) {
            return (
              <p className="text-xs text-court-amber flex items-center gap-1.5">
                ⚠️ {court.name}: Known slip risk when damp — use caution.
              </p>
            );
          }
          return null;
        })()}

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors min-h-[44px] py-2"
        >
          <Info className="w-3 h-3" />
          {showDetails ? "Hide details" : "How is this calculated?"}
        </button>

        {showDetails && (
          <div className="bg-secondary/50 rounded-lg p-3 text-xs text-muted-foreground">
            <p className="leading-relaxed">
              CourtReady's Dry-Clock™ model combines hyperlocal weather data, court drainage profiles, and community reports to estimate when your court will be playable. Forecasts improve as community members submit condition reports from the court.
            </p>
          </div>
        )}
      </div>

      {/* Home Team Prep — effort tags from anonymous report */}
      {hasRecentReport && latestReport && latestReport.hindrances && latestReport.hindrances.length > 0 && latestReport.hindrances[0] !== "" && parseInt(offset) === 0 && (
        <div className="bg-card rounded-lg p-4 border border-border space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Home Team Prep</p>
          <div className="flex flex-wrap gap-2">
            {latestReport.hindrances.map((tag: string) => (
              <Badge key={tag} variant="outline" className="text-xs px-3 py-1 border-border">
                {tag}
              </Badge>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">Community report — {reportAgeText}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Today's Report Count ─── */
function TodayReportCount({ courtId }: { courtId: string }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: count = 0 } = useQuery({
    queryKey: ["today-report-count", courtId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("reports")
        .select("*", { count: "exact", head: true })
        .eq("court_id", courtId)
        .gte("created_at", today.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  const text =
    count === 0
      ? "No reports yet today — be the first"
      : count === 1
        ? "1 player reported conditions today"
        : `${count} players reported conditions today`;

  return (
    <p className="text-xs text-muted-foreground text-center py-1">{text}</p>
  );
}

function StatusCardSkeleton() {
  return (
    <div className="bg-card rounded-lg p-5 border border-border card-glow space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-12" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function CourtDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showTour, setShowTour] = useState(false);
  const [showDnaSheet, setShowDnaSheet] = useState(false);

  // Realtime subscriptions for reports & court_status
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`court-${id}-realtime`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reports', filter: `court_id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["latest-report", id] });
          queryClient.invalidateQueries({ queryKey: ["latest-reports"] });
          queryClient.invalidateQueries({ queryKey: ["today-report-count", id] });
          queryClient.invalidateQueries({ queryKey: ["today-report-counts"] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'court_status', filter: `court_id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["latest-report", id] });
          queryClient.invalidateQueries({ queryKey: ["beacon-status"] });
          queryClient.invalidateQueries({ queryKey: ["beacon-timeline"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, queryClient]);
  const [showCelebration, setShowCelebration] = useState(false);

  const { data: subCourts } = useQuery<SubCourtRow[]>({
    queryKey: ["sub-courts", id],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase.from("sub_courts") as any)
          .select("*")
          .eq("facility_id", id!)
          .order("court_number");
        if (error) throw error;
        return (data ?? []) as SubCourtRow[];
      } catch (error) {
        console.error("[CourtDetail] Failed to fetch sub_courts:", error);
        throw error;
      }
    },
    enabled: !!id,
  });

  const { data: court, isLoading } = useQuery<SovereignCourt>({
    queryKey: ["court", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("courts").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as unknown as SovereignCourt;
    },
    enabled: !!id,
  });

  // Show tour after data loads
  useEffect(() => {
    if (shouldShowTour() && !isLoading) {
      const t = setTimeout(() => setShowTour(true), 800);
      return () => clearTimeout(t);
    }
  }, [isLoading]);

  const { data: latestReport = null } = useQuery({
    queryKey: ["latest-report", id],
    queryFn: async () => {
      if (!court) return null;
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .eq("court_id", court.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!court,
    refetchInterval: 30000,
  });

  const { data: latestObservation = null } = useQuery<Observation | null>({
    queryKey: ["latest-observation", id],
    queryFn: async () => {
      if (!court) return null;
      const { data, error } = await supabase
        .from("observations")
        .select("*")
        .eq("court_id", court.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Observation | null;
    },
    enabled: !!court,
    refetchInterval: 30000,
  });

  const { data: weatherData, isLoading: weatherLoading, error: weatherError } = useQuery({
    queryKey: ["weather-check", court?.latitude, court?.longitude],
    queryFn: async () => {
      if (!court?.latitude || !court?.longitude) return null;
      console.log("[CourtDetail] Fetching weather for", court.latitude, court.longitude);
      const result = await fetchWeather(court.latitude, court.longitude);
      console.log("[CourtDetail] Weather result:", result);
      return result;
    },
    enabled: !!court?.latitude && !!court?.longitude,
    refetchInterval: 300000,
    staleTime: 240000,
    retry: 2,
  });

  // Log weather errors for debugging
  if (weatherError) {
    console.error("[CourtDetail] Weather fetch failed:", weatherError);
  }

  const currentRain1h = weatherData?.rain_1h ?? 0;
  const rainResetActive = latestObservation?.status === "playable" && currentRain1h > 0;
  const effectiveObservation = rainResetActive ? null : latestObservation;

  // Compute Dry-Clock results for Now and future offsets
  const recentReportRainfall = useMemo(() => {
    if (!latestReport) return null;
    const ageH = (Date.now() - new Date(latestReport.created_at).getTime()) / 3600000;
    if (ageH > 6) return null;
    return latestReport.rainfall;
  }, [latestReport]);

  const dryClockNow = useMemo(() => {
    if (!weatherData) return null;
    return computeDryClock(
      weatherData.rain_1h ?? 0,
      weatherData.humidity ?? 50,
      weatherData.wind_speed ?? 5,
      weatherData.description ?? "",
      court?.drainage_rating ?? 3,
      court?.sun_exposure_rating ?? 3,
      recentReportRainfall,
    );
  }, [weatherData, court?.drainage_rating, court?.sun_exposure_rating, recentReportRainfall]);

  const dryClockFuture = useMemo(() => {
    if (!weatherData || !court) return [];
    const hourly = (weatherData as WeatherWithHourly).hourly ?? [];

    // Build a stateful chain mirroring PlayabilityForecast logic
    type CourtState = "DRY" | "WET";
    const drain = court.drainage_rating ?? 3;
    const sun = court.sun_exposure_rating ?? 3;
    const nowRain = weatherData.rain_1h ?? 0;
    const nowResult = computeDryClock(
      nowRain, weatherData.humidity ?? 50, weatherData.wind_speed ?? 5,
      weatherData.description ?? "", drain, sun, recentReportRainfall,
    );
    let courtState: CourtState = (nowResult.isActiveRain || nowResult.estimatedMinutes > 0 || nowRain > 0.05) ? "WET" : "DRY";
    let accRain = courtState === "WET" ? Math.max(nowRain, recentReportRainfall ?? 0) : 0;

    type TabEntry = { isActiveRain: boolean; courtState: CourtState; accRain: number };
    const tabs: TabEntry[] = [{ isActiveRain: nowResult.isActiveRain, courtState, accRain }];

    return [1, 2, 3].map(off => {
      const h = hourly[off];
      const rain = h?.rain_1h ?? 0;
      const humidity = h?.humidity ?? weatherData.humidity ?? 50;
      const wind = h?.wind_speed ?? weatherData.wind_speed ?? 5;
      const desc = h?.description ?? weatherData.description ?? "";
      const pop = (h as any)?.pop ?? 0;
      const prev = tabs[tabs.length - 1];

      // Future tabs: use precipitation probability
      if (pop > 0.50) {
        accRain = prev.accRain + rain;
        courtState = "WET";
        tabs.push({ isActiveRain: false, courtState, accRain });
        const r = computeDryClock(rain, humidity, wind, desc, drain, sun, null);
        return { offset: off, result: { ...r, isActiveRain: false, estimatedMinutes: -1, outputString: "Rain likely — forecast updating." } };
      }

      if (pop >= 0.20 && prev.courtState === "WET") {
        courtState = "WET";
        tabs.push({ isActiveRain: false, courtState, accRain: prev.accRain });
        const r = computeDryClock(prev.accRain, humidity, wind, desc, drain, sun, null);
        return { offset: off, result: { ...r, outputString: "Clearing conditions — drying in progress." } };
      }

      if (prev.courtState === "DRY") {
        courtState = "DRY";
        accRain = 0;
        tabs.push({ isActiveRain: false, courtState, accRain });
        const r = computeDryClock(0, humidity, wind, desc, drain, sun, null);
        return { offset: off, result: { ...r, estimatedMinutes: 0, outputString: "Courts dry — ready to play." } };
      }

      // WET inherited, compute recovery
      const recoveryResult = computeDryClock(prev.accRain, humidity, wind, desc, drain, sun, null);
      let hoursSinceStop = 0;
      for (let j = tabs.length - 1; j >= 0; j--) {
        if (tabs[j].isActiveRain) { hoursSinceStop = tabs.length - j; break; }
      }
      if (hoursSinceStop === 0) hoursSinceStop = tabs.length;
      const remaining = Math.max(0, recoveryResult.estimatedMinutes - hoursSinceStop * 60);

      if (remaining <= 0) {
        courtState = "DRY";
        accRain = 0;
        tabs.push({ isActiveRain: false, courtState, accRain });
        const r = computeDryClock(0, humidity, wind, desc, drain, sun, null);
        return { offset: off, result: { ...r, estimatedMinutes: 0, outputString: "Courts dry — ready to play." } };
      }

      courtState = "WET";
      tabs.push({ isActiveRain: false, courtState, accRain: prev.accRain });
      return { offset: off, result: { ...recoveryResult, estimatedMinutes: remaining } };
    });
  }, [weatherData, court?.drainage_rating, court?.sun_exposure_rating, recentReportRainfall]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 bg-accent border-b border-accent/20 px-4">
          <div className="max-w-lg mx-auto py-3 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2.5 -ml-2.5 rounded-lg hover:bg-accent/80 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
              <ArrowLeft className="w-5 h-5 text-accent-foreground" />
            </button>
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
          <StatusCardSkeleton />
        </main>
      </div>
    );
  }

  if (!court) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Court not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-accent border-b border-accent/20 px-4">
        <div className="max-w-lg mx-auto py-3 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2.5 -ml-2.5 rounded-lg hover:bg-accent/80 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 text-accent-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm truncate text-accent-foreground">{court.name}</h1>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-accent-foreground/60 flex-shrink-0" />
              <p className="text-xs text-accent-foreground/70 truncate">{court.address}</p>
            </div>
          </div>
          <button onClick={() => setShowDnaSheet(true)} className="p-2.5 rounded-lg hover:bg-accent/80 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Facility Setup">
            <Settings className="w-5 h-5 text-accent-foreground/70" />
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">

        <div data-tour="pulse">
          <StatusCard
            dryClockNow={dryClockNow}
            dryClockFuture={dryClockFuture}
            latestReport={latestReport}
            courtId={court.id}
            latestObservation={effectiveObservation}
            weatherData={weatherData}
          />
        </div>

        {weatherLoading && !weatherData && (
          <div className="bg-card rounded-lg p-5 border border-border space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        )}
        {weatherError && !weatherData && (
          <div className="bg-card rounded-lg p-4 border border-border flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">Weather data temporarily unavailable. Playability forecast will appear when weather loads.</p>
          </div>
        )}
        {weatherData && (
          <PlayabilityForecast weatherData={weatherData as WeatherWithHourly} court={court} latestReport={latestReport} />
        )}

        {/* Action Buttons — stacked vertically */}
        <div className="space-y-1">
          {/* Button 1: Captain's action — Send the Call */}
          <button
            onClick={() => navigate(`/captain?court=${court.id}`)}
            className="w-full py-3 rounded-lg text-sm font-bold tracking-wide active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            style={{ backgroundColor: "#0A2342", color: "#C9F000" }}
          >
            Send the Call →
          </button>
          <p className="text-xs text-muted-foreground text-center pb-3">
            For captains — broadcast live status to your team and opponents in 3 taps.
          </p>

        </div>

        {/* Report count removed — button CTA is sufficient */}

        {rainResetActive && (
          <div className="flex items-start gap-2 bg-destructive/10 rounded-lg p-3 border border-destructive/20">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">Previous Playable status voided due to new rainfall detected by weather API.</p>
          </div>
        )}


        {/* Court Profile (DNA note) */}
        {court.dna_note && (
          <div className="bg-card rounded-lg p-5 border border-border">
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-2">Court Profile</h3>
            <p className="text-sm text-foreground/80 leading-relaxed">{court.dna_note}</p>
          </div>
        )}

      </main>

      {/* DNA Editing Sheet */}
      <Sheet open={showDnaSheet} onOpenChange={setShowDnaSheet}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-sm font-bold">{court.name} — Court Ratings</SheetTitle>
          </SheetHeader>
          <div className="mt-4" data-tour="sub-court-editor">
            <SubCourtEditor courtId={court.id} courtCount={court.court_count} />
          </div>
        </SheetContent>
      </Sheet>

      {showTour && <GuidedTour onComplete={() => setShowTour(false)} />}
      {showCelebration && <CelebrationOverlay onDone={() => setShowCelebration(false)} />}
    </div>
  );
}
