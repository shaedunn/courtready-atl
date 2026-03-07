import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, CloudRain, Send, Sparkles, MapPin, CheckCircle2, Droplets as DropletsIcon, AlertTriangle, Info, Scissors, Settings } from "lucide-react";
import { supabase, type SovereignCourt, type Observation, SOVEREIGN_ANON, getDisplayName, setDisplayName } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";
import { formatDryTime, calculateSqueegeeDryTime, getCourtStatus, STATUS_CONFIG } from "@/lib/courts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import ReportForm from "@/components/court/ReportForm";
import SubCourtEditor from "@/components/court/SubCourtEditor";
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
        className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
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

      // If squeegeeing, apply 40% reduction to the current report
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

      // Log observation
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
      className="w-full flex items-center justify-center gap-2 bg-primary/10 text-primary border border-primary/20 rounded-lg py-2.5 text-sm font-medium hover:bg-primary/20 active:scale-[0.98] transition-all disabled:opacity-50"
    >
      <Scissors className="w-4 h-4" />
      {squeegeeMutation.isPending ? "Updating..." : "I am Squeegeeing This Court"}
    </button>
  );
}

/* ─── Status Card ─── */
function StatusCard({ report, courtId, latestObservation, currentHumidity, recentRain }: { report: Report | null; courtId: string; latestObservation: Observation | null; currentHumidity?: number | null; recentRain?: boolean }) {
  const status = getCourtStatus(report, latestObservation, currentHumidity, recentRain);
  const config = STATUS_CONFIG[status];
  const highHumidity = (currentHumidity ?? 0) > 90;
  const saturatedAirHardLock = highHumidity;
  const displayLabel = saturatedAirHardLock ? "Saturated Air - UNPLAYABLE" : config.label;
  const displayColor = saturatedAirHardLock ? "bg-destructive" : config.color;

  const dryTime = report
    ? Math.max(0, report.estimated_dry_minutes - (Date.now() - new Date(report.created_at).getTime()) / 60000)
    : null;
  const roundedDry = dryTime !== null ? Math.round(dryTime) : null;
  const squeegeeDry = roundedDry !== null && roundedDry > 0 ? calculateSqueegeeDryTime(roundedDry) : null;
  const saturatedAirEstimate = Math.max(180, roundedDry ?? 180);

  // Find verifier info
  const verifierName = latestObservation?.status === "playable" ? latestObservation.display_name : null;
  const verifierTime = latestObservation?.status === "playable"
    ? new Date(latestObservation.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  // Rain reset note
  const showRainResetNote = report && latestObservation?.status === "playable" && status !== "verified";

  const showActiveStatus = !saturatedAirHardLock && (status === "drying" || status === "wet");

  return (
    <div className="bg-card rounded-lg p-5 border border-border card-glow space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Current Status</span>
        <div className="flex items-center gap-2">
          {report && (
            <span className="text-[11px] text-muted-foreground font-mono">
              {new Date(report.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 gap-1.5 border-border">
            <span className={`w-2 h-2 rounded-full ${displayColor} inline-block`} />
            {displayLabel}
          </Badge>
        </div>
      </div>

      {/* Verified Playable */}
      {status === "verified" && (
        <div className="text-center space-y-1">
          <CheckCircle2 className="w-7 h-7 text-court-green mx-auto" />
          <p className="text-lg font-bold text-court-green">Verified Playable</p>
          {verifierName && verifierTime && (
            <p className="text-xs text-muted-foreground">
              by <span className="font-medium text-foreground">{verifierName}</span> at {verifierTime}
            </p>
          )}
        </div>
      )}

      {/* Hard safety lock: saturated air is unplayable */}
      {saturatedAirHardLock && (
        <div className="text-center space-y-2">
          <AlertTriangle className="w-6 h-6 text-destructive mx-auto" />
          <p className="text-lg font-bold text-destructive">Status: Saturated Air - UNPLAYABLE</p>
          <p className="text-xs text-muted-foreground">Humidity &gt;90%. Minimum dry timer is locked.</p>
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-5 h-5 text-destructive" />
            <span className="text-xl font-bold font-mono text-destructive">{formatDryTime(saturatedAirEstimate)}</span>
          </div>
        </div>
      )}

      {/* Active drying/wet status */}
      {showActiveStatus && roundedDry !== null && roundedDry > 0 && (
        <div className="text-center space-y-3">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Natural Dry Time</p>
            <div className="flex items-center justify-center gap-2">
              <Clock className="w-5 h-5 text-court-amber" />
              <span className="text-2xl font-bold font-mono text-court-amber">{formatDryTime(roundedDry)}</span>
            </div>
          </div>
          {squeegeeDry !== null && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Squeegee Assisted</p>
              <span className="text-lg font-bold font-mono text-primary">{formatDryTime(squeegeeDry)}</span>
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

      {/* Caution: high humidity + saturated air */}
      {!saturatedAirHardLock && status === "caution" && (
        <div className="text-center space-y-1">
          <DropletsIcon className="w-6 h-6 text-court-amber mx-auto" />
          <p className="text-lg font-bold text-court-amber">High Humidity – Saturated Air</p>
          <p className="text-xs text-muted-foreground">Humidity &gt;90% with recent moisture. Estimated minimum dry time: <span className="font-semibold">{formatDryTime(saturatedAirEstimate)}</span>.</p>
        </div>
      )}

      {/* Dry / no reports */}
      {!saturatedAirHardLock && status === "playable" && (
        <div className="text-center space-y-1">
          <Sparkles className="w-6 h-6 text-primary mx-auto" />
          <p className="text-lg font-bold text-primary text-glow">Courts are Dry</p>
          <p className="text-xs text-muted-foreground">Ready to play</p>
        </div>
      )}

      {/* No reports at all */}
      {!report && status === "playable" && (
        <p className="text-center text-sm text-muted-foreground py-2">No recent reports</p>
      )}

      {/* Rain reset note */}
      {showRainResetNote && (
        <div className="flex items-start gap-2 bg-destructive/10 rounded-lg p-3 border border-destructive/20">
          <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">Previous Playable status voided due to new rainfall.</p>
        </div>
      )}

      {/* Squeegee action */}
      {showActiveStatus && report && <SqueegeeAction report={report} courtId={courtId} />}

      {/* Status Verification */}
      {!saturatedAirHardLock && (showActiveStatus || status === "playable") && report && (
        <StatusVerification courtId={courtId} reportId={report?.id ?? null} />
      )}

      {/* V1 footer */}
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
          className="p-2 bg-primary text-primary-foreground rounded-lg hover:brightness-110 active:scale-95 transition-all">
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
                <span className="text-[10px] text-muted-foreground font-mono">
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

  const { data: subCourts = [] } = useQuery<SubCourtRow[]>({
    queryKey: ["sub-courts", id],
    queryFn: async () => {
      console.log("Fetching for Facility:", id);
      const { data, error } = await (supabase.from("sub_courts") as any)
        .select("*")
        .eq("facility_id", id!)
        .order("court_number");
      if (error) throw error;
      console.log("Raw Data Received:", data ?? []);
      return (data ?? []) as SubCourtRow[];
    },
    enabled: !!id,
  });

  const forceCreateSubCourtsMutation = useMutation({
    mutationFn: async () => {
      const rows = Array.from({ length: 4 }, (_, index) => ({
        facility_id: id!,
        court_number: index + 1,
        sun_exposure_rating: 3,
        drainage_rating: 3,
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

  // Rain reset guardrail: check weather for new precipitation
  const { data: weatherData } = useQuery({
    queryKey: ["weather-check", court?.latitude, court?.longitude],
    queryFn: async () => {
      if (!court?.latitude || !court?.longitude) return null;
      const ts = Date.now();
      const res = await fetch(`https://racdnnitrapgqozxctsk.supabase.co/functions/v1/get-weather?t=${ts}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SOVEREIGN_ANON,
          Authorization: `Bearer ${SOVEREIGN_ANON}`,
        },
        body: JSON.stringify({ lat: court.latitude, lon: court.longitude, t: ts }),
      });
      return res.ok ? await res.json() : null;
    },
    enabled: !!court?.latitude && !!court?.longitude,
    refetchInterval: 300000,
    staleTime: 240000,
  });

  // Determine if rain reset applies: latest obs is playable but weather shows rain
  const rainResetActive = latestObservation?.status === "playable" && weatherData?.rain_1h > 0;

  // Override observation if rain detected after playable verification
  const effectiveObservation = rainResetActive ? null : latestObservation;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border px-4">
          <div className="max-w-lg mx-auto py-3 flex items-center gap-3">
            <button onClick={() => navigate("/")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-secondary transition-colors">
              <ArrowLeft className="w-5 h-5" />
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
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border px-4">
        <div className="max-w-lg mx-auto py-3 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm truncate">{court.name}</h1>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground truncate">{court.location}</p>
            </div>
          </div>
          <button onClick={() => navigate(`/court/${id}/admin`)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" aria-label="Facility Setup">
            <Settings className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <StatusCard report={latestReport} courtId={court.id} latestObservation={effectiveObservation} currentHumidity={weatherData?.humidity} recentRain={weatherData?.rain_1h > 0} />

        {/* Rain reset banner */}
        {rainResetActive && (
          <div className="flex items-start gap-2 bg-destructive/10 rounded-lg p-3 border border-destructive/20">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">Previous Playable status voided due to new rainfall detected by weather API.</p>
          </div>
        )}

        {subCourts.length === 0 && (
          <button
            onClick={() => forceCreateSubCourtsMutation.mutate()}
            disabled={forceCreateSubCourtsMutation.isPending}
            className="w-full bg-primary text-primary-foreground border border-primary/40 font-extrabold py-4 rounded-xl text-sm tracking-wide shadow-lg shadow-primary/35 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {forceCreateSubCourtsMutation.isPending
              ? "Creating Sub-Courts..."
              : "Force-Create 4 Sub-Courts for This Facility"}
          </button>
        )}

        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-lg text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
            <CloudRain className="w-4 h-4" />
            Captain's Report
          </button>
        )}

        {showForm && <ReportForm court={court} onSubmitted={() => setShowForm(false)} />}

        {/* Inline Sub-Court Editor */}
        <SubCourtEditor courtId={court.id} courtCount={court.court_count} />

        <CaptainsLog court={court} />
      </main>
    </div>
  );
}
