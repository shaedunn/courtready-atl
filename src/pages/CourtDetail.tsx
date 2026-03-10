import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Sparkles, MapPin, CheckCircle2, Droplets as DropletsIcon, AlertTriangle, Info, Scissors, Settings, ShieldAlert, ChevronDown, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ConditionReportFlow from "@/components/ConditionReportFlow";
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
type HourlyEntry = { dt: number; temp: number; humidity: number; wind_speed: number; pop: number; rain_1h: number; description?: string };

type WeatherWithHourly = {
  temp: number; humidity: number; wind_speed: number; rain_1h?: number;
  description?: string; icon?: string;
  hourly?: HourlyEntry[];
};

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
  const hourly = weatherData.hourly ?? [];

  const recentReportRainfall = useMemo(() => {
    if (!latestReport) return null;
    const ageH = (Date.now() - new Date(latestReport.created_at).getTime()) / 3600000;
    if (ageH > 6) return null;
    return latestReport.rainfall;
  }, [latestReport]);

  const dryClockResult = useMemo(() => {
    const off = parseInt(offset);
    if (off === 0 || !hourly.length) {
      return computeDryClock(
        weatherData.rain_1h ?? 0,
        weatherData.humidity ?? 50,
        weatherData.wind_speed ?? 5,
        weatherData.description ?? "",
        court.drainage,
        court.sun_exposure,
        off === 0 ? recentReportRainfall : null,
      );
    }
    const h = hourly[off];
    const futureHumidity = h?.humidity ?? weatherData.humidity ?? 50;
    const futureWind = h?.wind_speed ?? weatherData.wind_speed ?? 5;
    const futureDesc = h?.description ?? weatherData.description ?? "";
    const futureRain = h?.rain_1h ?? 0;

    // Compute the base result for this hour's own conditions
    const baseResult = computeDryClock(
      futureRain,
      futureHumidity,
      futureWind,
      futureDesc,
      court.drainage,
      court.sun_exposure,
      null,
    );

    // If this hour itself shows active rain, return as-is
    if (baseResult.isActiveRain) {
      return baseResult;
    }

    // Check what the preceding hour looks like to enforce transition rules
    const prevOff = off - 1;
    const prevResult = prevOff === 0
      ? computeDryClock(
          weatherData.rain_1h ?? 0,
          weatherData.humidity ?? 50,
          weatherData.wind_speed ?? 5,
          weatherData.description ?? "",
          court.drainage,
          court.sun_exposure,
          prevOff === 0 ? recentReportRainfall : null,
        )
      : (() => {
          const ph = hourly[prevOff];
          return computeDryClock(
            ph?.rain_1h ?? 0,
            ph?.humidity ?? weatherData.humidity ?? 50,
            ph?.wind_speed ?? weatherData.wind_speed ?? 5,
            ph?.description ?? weatherData.description ?? "",
            court.drainage,
            court.sun_exposure,
            null,
          );
        })();

    // Check prior hours for accumulated rainfall that needs drainage recovery
    const priorHours = hourly.slice(0, off);
    const nowRain = weatherData.rain_1h ?? 0;
    const totalPriorRain = priorHours.reduce((sum, ph) => sum + (ph.rain_1h ?? 0), nowRain);
    const priorHadRain = totalPriorRain > 0.05; // more than mist

    // Enforce transition: cannot go from Active Rain → Courts Ready without intermediate state
    const prevIsActiveRain = prevResult.isActiveRain;
    const prevIsWet = prevResult.estimatedMinutes > 60;

    if (priorHadRain || prevIsActiveRain || prevIsWet) {
      // Compute full recovery time from the accumulated rainfall
      const rainForRecovery = prevIsActiveRain
        ? Math.max(totalPriorRain, 0.25) // Minimum rain assumption after active rain
        : totalPriorRain;

      const recoveryResult = computeDryClock(
        rainForRecovery,
        futureHumidity,
        futureWind,
        futureDesc,
        court.drainage,
        court.sun_exposure,
        null,
      );

      // Subtract elapsed time (offset hours have passed since rain started)
      const elapsedMinutes = off * 60;
      const remainingMinutes = Math.max(0, recoveryResult.estimatedMinutes - elapsedMinutes);

      if (remainingMinutes > 0 || prevIsActiveRain) {
        // Still recovering or transitioning from active rain
        const effectiveMinutes = Math.max(remainingMinutes, prevIsActiveRain ? 30 : 0);
        const formatPlayableTime = (mins: number) => {
          const target = new Date(Date.now() + mins * 60000);
          return target.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
        };
        const effort = effectiveMinutes <= 30 ? "Light effort"
          : effectiveMinutes <= 60 ? "Moderate effort"
          : effectiveMinutes <= 120 ? "Full effort"
          : "Heavy effort";
        const action = effectiveMinutes <= 30 ? "bring towels"
          : effectiveMinutes <= 60 ? "squeegees recommended"
          : effectiveMinutes <= 120 ? "blowers + squeegees needed"
          : "full court press required";
        const playableTime = formatPlayableTime(effectiveMinutes);

        const outputString = prevIsActiveRain
          ? `Rain clearing. Estimated playable by ${playableTime} with ${effort.toLowerCase()} — conditions improving.`
          : `Post-rain recovery. Estimated playable by ${playableTime} with ${effort.toLowerCase()} (${action}).`;

        return {
          ...recoveryResult,
          estimatedMinutes: effectiveMinutes,
          estimatedPlayableTime: playableTime,
          effortLevel: effort,
          action,
          outputString,
          isActiveRain: false,
        };
      }
    }

    return baseResult;
  }, [offset, hourly, weatherData, court.drainage, court.sun_exposure, recentReportRainfall]);

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
          </div>
          <ToggleGroup type="single" value={offset} onValueChange={(v) => v && setOffset(v)} className="bg-secondary rounded-lg p-0.5">
            <ToggleGroupItem value="0" className="text-xs px-4 min-h-[44px] py-2 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground rounded-md">Now</ToggleGroupItem>
            <ToggleGroupItem value="1" className="text-xs px-4 min-h-[44px] py-2 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground rounded-md">+1h</ToggleGroupItem>
            <ToggleGroupItem value="2" className="text-xs px-4 min-h-[44px] py-2 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground rounded-md">+2h</ToggleGroupItem>
            <ToggleGroupItem value="3" className="text-xs px-4 min-h-[44px] py-2 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground rounded-md">+3h</ToggleGroupItem>
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

  const { data: weatherData } = useQuery({
    queryKey: ["weather-check", court?.latitude, court?.longitude],
    queryFn: async () => {
      if (!court?.latitude || !court?.longitude) return null;
      try {
        return await fetchWeather(court.latitude, court.longitude);
      } catch {
        return null;
      }
    },
    enabled: !!court?.latitude && !!court?.longitude,
    refetchInterval: 300000,
    staleTime: 240000,
  });

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
      court?.drainage ?? 3,
      court?.sun_exposure ?? 3,
      recentReportRainfall,
    );
  }, [weatherData, court?.drainage, court?.sun_exposure, recentReportRainfall]);

  const dryClockFuture = useMemo(() => {
    if (!weatherData) return [];
    const hourly = (weatherData as WeatherWithHourly).hourly ?? [];
    return [1, 2, 3].map(off => {
      const h = hourly[off];
      const result = computeDryClock(
        h?.rain_1h ?? weatherData.rain_1h ?? 0,
        h?.humidity ?? weatherData.humidity ?? 50,
        h?.wind_speed ?? weatherData.wind_speed ?? 5,
        h?.description ?? weatherData.description ?? "",
        court?.drainage ?? 3,
        court?.sun_exposure ?? 3,
        null,
      );
      return { offset: off, result };
    });
  }, [weatherData, court?.drainage, court?.sun_exposure]);

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
              <p className="text-xs text-accent-foreground/70 truncate">{court.location}</p>
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

          {/* Button 2: Reporter action — report conditions */}
          <ConditionReportFlow courtId={court.id} variant="secondary" />
          <p className="text-xs text-muted-foreground text-center">
            For players — share your real-time on-court assessment with the community.
          </p>
        </div>

        {/* Today's report count */}
        <TodayReportCount courtId={court.id} />

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
