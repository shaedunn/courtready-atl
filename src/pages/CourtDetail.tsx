import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, CloudRain, Send, Sparkles, MapPin, CheckCircle2, Droplets as DropletsIcon, AlertTriangle, Info, Scissors, Settings, ShieldAlert } from "lucide-react";
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
import ReportForm from "@/components/court/ReportForm";
import SubCourtEditor from "@/components/court/SubCourtEditor";
import GuidedTour, { shouldShowTour } from "@/components/GuidedTour";
import CelebrationOverlay, { shouldCelebrate, markCelebrated } from "@/components/CelebrationOverlay";
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

  const btnClass = "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium border transition-all active:scale-[0.98] disabled:opacity-50";

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

/* ─── Status Card ─── */
function StatusCard({ report, courtId, latestObservation, currentHumidity, recentRain, forecastScore, currentRain1h }: { report: Report | null; courtId: string; latestObservation: Observation | null; currentHumidity?: number | null; recentRain?: boolean; forecastScore?: number | null; currentRain1h?: number | null }) {
  const status = getCourtStatus(report, latestObservation, currentHumidity, recentRain, forecastScore, currentRain1h);
  const config = STATUS_CONFIG[status];
  const highHumidity = (currentHumidity ?? 0) > 90;
  const saturatedAirHardLock = highHumidity;
  const isGoldOverride = status === "human_verified";
  const displayLabel = saturatedAirHardLock ? "Saturated Air - Drying Paused" : config.label;
  const displayColor = saturatedAirHardLock ? "bg-destructive" : isGoldOverride ? "bg-amber-400" : config.color;

  const dryTime = report
    ? Math.max(0, report.estimated_dry_minutes - (Date.now() - new Date(report.created_at).getTime()) / 60000)
    : null;
  const roundedDry = dryTime !== null ? Math.round(dryTime) : null;
  const squeegeeDry = roundedDry !== null && roundedDry > 0 ? calculateSqueegeeDryTime(roundedDry) : null;
  const saturatedAirEstimate = Math.max(180, roundedDry ?? 180);

  const verifierName = latestObservation?.status === "playable" ? latestObservation.display_name : null;
  const verifiedAgo = latestObservation?.status === "playable" ? getVerifiedAgoText(latestObservation.created_at) : null;

  const showRainResetNote = report && latestObservation?.status === "playable" && !isGoldOverride && status !== "verified";
  const showActiveStatus = !saturatedAirHardLock && !isGoldOverride && (status === "drying" || status === "wet");

  return (
    <div className="bg-card rounded-lg p-5 border border-border card-glow space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Current Status</span>
        <div className="flex items-center gap-2">
          {report && (
            <span className="text-[11px] text-muted-foreground">
              {new Date(report.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 gap-1.5 border-border">
            <span className={`w-2 h-2 rounded-full ${displayColor} inline-block`} />
            {displayLabel}
          </Badge>
        </div>
      </div>

      {isGoldOverride && (
        <div className="text-center space-y-1">
          <CheckCircle2 className="w-7 h-7 text-amber-500 mx-auto" />
          <p className="text-lg font-bold text-amber-500">Human Verified</p>
          {verifierName && verifiedAgo && (
            <p className="text-xs text-muted-foreground">
              Verified by <span className="font-medium text-foreground">{verifierName}</span> · {verifiedAgo}
            </p>
          )}
        </div>
      )}

      {status === "verified" && !isGoldOverride && (
        <div className="text-center space-y-1">
          <CheckCircle2 className="w-7 h-7 text-court-green mx-auto" />
          <p className="text-lg font-bold text-court-green">Verified Playable</p>
          {verifierName && verifiedAgo && (
            <p className="text-xs text-muted-foreground">
              by <span className="font-medium text-foreground">{verifierName}</span> · {verifiedAgo}
            </p>
          )}
        </div>
      )}

      {saturatedAirHardLock && (
        <div className="text-center space-y-2">
          <AlertTriangle className="w-6 h-6 text-destructive mx-auto" />
          <p className="text-lg font-bold text-destructive">Status: Saturated Air - Drying Paused</p>
          <p className="text-xs text-muted-foreground">Humidity &gt;90%. Natural drying is paused.</p>
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-5 h-5 text-destructive" />
            <span className="text-xl font-bold text-destructive">{formatDryTime(saturatedAirEstimate)}</span>
          </div>
        </div>
      )}

      {showActiveStatus && roundedDry !== null && roundedDry > 0 && (
        <div className="text-center space-y-3">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Natural Dry Time</p>
            <div className="flex items-center justify-center gap-2">
              <Clock className="w-5 h-5 text-court-amber" />
              <span className="text-2xl font-bold text-court-amber">{formatDryTime(roundedDry)}</span>
            </div>
          </div>
          {squeegeeDry !== null && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Squeegee Assisted</p>
              <span className="text-lg font-bold text-court-green">{formatDryTime(squeegeeDry)}</span>
            </div>
          )}
          <div className="flex gap-3 text-[11px] text-muted-foreground justify-center flex-wrap">
            <span>Rain: {report!.rainfall}"</span>
            <span>·</span>
            <span>Squeegees: {report!.squeegee_count}</span>
          </div>
          {highHumidity && (
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-court-amber">
              <DropletsIcon className="w-3.5 h-3.5" />
              <span>Humidity &gt;90% — saturated air, 3× dry time (min 180 min)</span>
            </div>
          )}
        </div>
      )}

      {!saturatedAirHardLock && !isGoldOverride && status === "caution" && (
        <div className="text-center space-y-1">
          <DropletsIcon className="w-6 h-6 text-court-amber mx-auto" />
          <p className="text-lg font-bold text-court-amber">High Humidity – Saturated Air</p>
          <p className="text-xs text-muted-foreground">Humidity &gt;90% with recent moisture. Estimated minimum dry time: <span className="font-semibold">{formatDryTime(saturatedAirEstimate)}</span>.</p>
        </div>
      )}

      {!saturatedAirHardLock && !isGoldOverride && status === "playable" && (
        <div className="text-center space-y-1">
          <Sparkles className="w-6 h-6 text-court-green mx-auto" />
          <p className="text-lg font-bold text-court-green text-glow">Courts are Dry</p>
          <p className="text-xs text-muted-foreground">Ready to play</p>
        </div>
      )}

      {!report && status === "playable" && (
        <p className="text-center text-sm text-muted-foreground py-2">No recent reports</p>
      )}

      {showRainResetNote && (
        <div className="flex items-start gap-2 bg-destructive/10 rounded-lg p-3 border border-destructive/20">
          <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">Previous Playable status voided due to new rainfall.</p>
        </div>
      )}

      {showActiveStatus && report && <SqueegeeAction report={report} courtId={courtId} />}

      {!saturatedAirHardLock && (showActiveStatus || status === "playable" || isGoldOverride) && report && (
        <StatusVerification courtId={courtId} reportId={report?.id ?? null} />
      )}

      <TooltipProvider delayDuration={100}>
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[10px] text-muted-foreground/50 cursor-help flex items-center gap-1">
                <Info className="w-3 h-3" /> V1 Predictor Model
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px] text-xs">
              Dry time estimates use a Step-Multiplier formula calibrated with weather, drainage, and sun exposure data. Community verifications help improve accuracy.
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
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

/* ─── Dry-Clock Forecast Component ─── */
function DryClockForecast({ weatherData, court, latestReport }: {
  weatherData: WeatherWithHourly;
  court: SovereignCourt;
  latestReport: Report | null;
}) {
  const [offset, setOffset] = useState("0");
  const [showDetails, setShowDetails] = useState(false);
  const hourly = weatherData.hourly ?? [];

  // Get recent report (< 6h) rainfall for step 2
  const recentReportRainfall = useMemo(() => {
    if (!latestReport) return null;
    const ageH = (Date.now() - new Date(latestReport.created_at).getTime()) / 3600000;
    if (ageH > 6) return null;
    return latestReport.rainfall; // already in inches from reports table
  }, [latestReport]);

  const dryClockResult = useMemo(() => {
    const off = parseInt(offset);
    if (off === 0 || !hourly.length) {
      // Use current weather
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
    // Use hourly data for offset
    const h = hourly[off];
    if (!h) {
      return computeDryClock(
        weatherData.rain_1h ?? 0,
        weatherData.humidity ?? 50,
        weatherData.wind_speed ?? 5,
        weatherData.description ?? "",
        court.drainage,
        court.sun_exposure,
        null,
      );
    }
    return computeDryClock(
      h.rain_1h ?? 0,
      h.humidity ?? 50,
      h.wind_speed ?? 5,
      h.description ?? weatherData.description ?? "",
      court.drainage,
      court.sun_exposure,
      null,
    );
  }, [offset, hourly, weatherData, court.drainage, court.sun_exposure, recentReportRainfall]);

  // Report tier
  const reportTier = getReportTier(latestReport?.created_at ?? null);

  // Determine colors
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

  return (
    <div className="space-y-3">
      {/* Tier indicator */}
      {reportTier === "tier1" && latestReport && (
        <div className="bg-card rounded-lg p-3 border border-border">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">Forecast context</p>
          <p className="text-xs text-muted-foreground">
            Reported {getReportAgeText(latestReport.created_at)}
          </p>
        </div>
      )}

      {reportTier === "stale" && latestReport && (
        <div className="bg-court-amber/5 rounded-lg p-3 border border-court-amber/20">
          <p className="text-xs text-court-amber">
            Last reported — {getReportAgeText(latestReport.created_at)}. Conditions may have changed.
          </p>
        </div>
      )}

      {reportTier === "tier2" && (
        <div className="bg-card rounded-lg p-3 border border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Forecast — no recent reports</p>
          <a href="/captain" className="text-[11px] text-primary hover:underline font-medium">
            On site? Update in 3 taps →
          </a>
        </div>
      )}

      {/* Main Dry-Clock card */}
      <div className={`rounded-lg p-5 border space-y-4 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
            Dry-Clock Forecast
          </span>
          <ToggleGroup type="single" value={offset} onValueChange={(v) => v && setOffset(v)} className="bg-secondary rounded-lg p-0.5">
            <ToggleGroupItem value="0" className="text-xs px-3 py-1 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground rounded-md">Now</ToggleGroupItem>
            <ToggleGroupItem value="1" className="text-xs px-3 py-1 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground rounded-md">+1h</ToggleGroupItem>
            <ToggleGroupItem value="2" className="text-xs px-3 py-1 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground rounded-md">+2h</ToggleGroupItem>
            <ToggleGroupItem value="3" className="text-xs px-3 py-1 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground rounded-md">+3h</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Large action-oriented status line */}
        <p className={`text-lg font-bold font-heading leading-snug ${textColor}`}>
          {dryClockResult.outputString}
        </p>

        {dryClockResult.isActiveRain && (
          <p className="text-xs text-destructive/80">
            Active rain detected. Forecast will update as conditions change.
          </p>
        )}

        {/* Conditional slip risk warning */}
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

        {/* Expandable calculation details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          <Info className="w-3 h-3" />
          {showDetails ? "Hide details" : "How is this calculated?"}
        </button>

        {showDetails && (
          <div className="bg-secondary/50 rounded-lg p-3 space-y-1.5 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Rainfall</span>
              <span className="font-medium text-foreground">{dryClockResult.inputs.rainfallInches.toFixed(2)}″</span>
            </div>
            <div className="flex justify-between">
              <span>Drainage rating</span>
              <span className="font-medium text-foreground">{dryClockResult.inputs.drainageRating}/5</span>
            </div>
            <div className="flex justify-between">
              <span>Humidity</span>
              <span className="font-medium text-foreground">{dryClockResult.inputs.humidity}%</span>
            </div>
            <div className="flex justify-between">
              <span>Wind speed</span>
              <span className="font-medium text-foreground">{dryClockResult.inputs.windSpeed} mph</span>
            </div>
            <div className="flex justify-between">
              <span>Sun exposure</span>
              <span className="font-medium text-foreground">{dryClockResult.inputs.sunExposure}/5</span>
            </div>
            <div className="flex justify-between">
              <span>Conditions</span>
              <span className="font-medium text-foreground capitalize">{dryClockResult.inputs.description || "—"}</span>
            </div>
            {dryClockResult.estimatedMinutes > 0 && (
              <div className="flex justify-between pt-1 border-t border-border">
                <span>Estimated dry time</span>
                <span className="font-medium text-foreground">{formatDryTime(dryClockResult.estimatedMinutes)}</span>
              </div>
            )}
          </div>
        )}
      </div>
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

/* ─── Captain's Log ─── */
function CaptainsLog({ court }: { court: SovereignCourt }) {
  const [logText, setLogText] = useState("");
  const [logAuthor, setLogAuthor] = useState(getDisplayName() || "");
  const queryClient = useQueryClient();

  const { data: logs = [] } = useQuery({
    queryKey: ["court-logs", court.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("court_logs")
        .select("*")
        .eq("court_id", court.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const submitLog = useMutation({
    mutationFn: async () => {
      if (!logText.trim()) return;
      const author = logAuthor.trim() || "Anonymous";
      if (logAuthor.trim()) setDisplayName(logAuthor.trim());
      const { error } = await supabase.from("court_logs").insert({
        court_id: court.id,
        author,
        message: logText.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["court-logs", court.id] });
      setLogText("");
    },
  });

  return (
    <div className="bg-card rounded-lg p-5 border border-border card-glow">
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-4">Captain's Log</h3>
      <div className="flex gap-2 mb-4">
        <input type="text" value={logAuthor} onChange={(e) => setLogAuthor(e.target.value)} placeholder="Name"
          className="w-24 bg-secondary text-foreground rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50" />
        <input type="text" value={logText} onChange={(e) => setLogText(e.target.value)} placeholder="Leave a note..."
          onKeyDown={(e) => e.key === "Enter" && submitLog.mutate()}
          className="flex-1 bg-secondary text-foreground rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50" />
        <button onClick={() => submitLog.mutate()}
          className="p-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 active:scale-95 transition-all">
          <Send className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No notes yet</p>
        ) : (
          logs.map((entry) => (
            <div key={entry.id} className="text-sm border-l-2 border-border pl-3 py-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-xs">{entry.author}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{entry.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function CourtDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showTour, setShowTour] = useState(false);
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

  const forceCreateSubCourtsMutation = useMutation({
    mutationFn: async () => {
      const rows = Array.from({ length: 4 }, (_, index) => ({
        facility_id: id!,
        court_number: index + 1,
        sun_exposure: 3,
        drainage: 3,
      }));
      const { error } = await (supabase.from("sub_courts") as any).insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sub-courts", id] });
    },
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

  // Compute forecastNowScore for Unified Truth
  const forecastNowScore = useMemo(() => {
    if (!weatherData?.hourly || weatherData.hourly.length === 0) return null;
    const { score } = calculatePlayability(weatherData.hourly as HourlyEntry[], 0, court?.drainage ?? 3, latestReport);
    return score;
  }, [weatherData?.hourly, court?.drainage, latestReport]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 bg-accent border-b border-accent/20 px-4">
          <div className="max-w-lg mx-auto py-3 flex items-center gap-3">
            <button onClick={() => navigate("/")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-accent/80 transition-colors">
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
          <button onClick={() => navigate("/")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-accent/80 transition-colors">
            <ArrowLeft className="w-5 h-5 text-accent-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm truncate text-accent-foreground">{court.name}</h1>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-accent-foreground/60 flex-shrink-0" />
              <p className="text-xs text-accent-foreground/70 truncate">{court.location}</p>
            </div>
          </div>
          <button onClick={() => navigate(`/court/${id}/admin`)} className="p-1.5 rounded-lg hover:bg-accent/80 transition-colors" aria-label="Facility Setup">
            <Settings className="w-5 h-5 text-accent-foreground/70" />
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">

        <div data-tour="pulse">
          <StatusCard report={latestReport} courtId={court.id} latestObservation={effectiveObservation} currentHumidity={weatherData?.humidity} recentRain={currentRain1h > 0} forecastScore={forecastNowScore} currentRain1h={currentRain1h} />
        </div>

        {weatherData && (
          <DryClockForecast weatherData={weatherData as WeatherWithHourly} court={court} latestReport={latestReport} />
        )}

        {/* Anonymous Condition Report */}
        <ConditionReportFlow courtId={court.id} />

        {/* Today's report count */}
        <TodayReportCount courtId={court.id} />

        {rainResetActive && (
          <div className="flex items-start gap-2 bg-destructive/10 rounded-lg p-3 border border-destructive/20">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">Previous Playable status voided due to new rainfall detected by weather API.</p>
          </div>
        )}

        {(!subCourts || subCourts.length === 0) && (
          <button
            onClick={() => forceCreateSubCourtsMutation.mutate()}
            disabled={forceCreateSubCourtsMutation.isPending}
            className="w-full bg-accent text-accent-foreground border border-accent/40 font-extrabold py-4 rounded-xl text-sm tracking-wide shadow-lg hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {forceCreateSubCourtsMutation.isPending
              ? "Creating Initial Courts..."
              : "Create Initial Courts"}
          </button>
        )}

        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="w-full font-semibold py-3 rounded-lg text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            style={{ backgroundColor: "#002366", color: "#DFFF00" }}
          >
            <CloudRain className="w-4 h-4" />
            Captain's Report
          </button>
        )}

        {showForm && (
          <ReportForm
            court={court}
            onSubmitted={() => {
              setShowForm(false);
              if (shouldCelebrate()) {
                markCelebrated();
                setShowCelebration(true);
              }
            }}
          />
        )}

        <div data-tour="sub-court-editor">
          <SubCourtEditor courtId={court.id} courtCount={court.court_count} />
        </div>

        {/* Court Profile (DNA note) */}
        {court.dna_note && (
          <div className="bg-card rounded-lg p-5 border border-border">
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-2">Court Profile</h3>
            <p className="text-sm text-foreground/80 leading-relaxed">{court.dna_note}</p>
          </div>
        )}

        <div data-tour="hazard-button">
          <CaptainsLog court={court} />
        </div>
      </main>

      {showTour && <GuidedTour onComplete={() => setShowTour(false)} />}
      {showCelebration && <CelebrationOverlay onDone={() => setShowCelebration(false)} />}
    </div>
  );
}
