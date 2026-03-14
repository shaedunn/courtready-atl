import { useState, useCallback, useMemo } from "react";
import { Search, Droplets, MapPin, Pin, BookOpen, AlertTriangle, Shield, ChevronDown } from "lucide-react";
import OnboardingModal, { isContributor } from "@/components/OnboardingModal";
import { useNavigate } from "react-router-dom";
import { supabase, fetchWeather, type SovereignCourt, type Observation } from "@/lib/supabase";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";
import { Skeleton } from "@/components/ui/skeleton";
import { getCourtStatus, getVerifiedAgoText, STATUS_CONFIG } from "@/lib/courts";
import { Badge } from "@/components/ui/badge";
import RequestCourtSheet from "@/components/RequestCourtSheet";

type Report = Tables<"reports">;

const PINNED_KEY = "courtready-pinned";

function getPinnedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PINNED_KEY) || "[]");
  } catch {
    return [];
  }
}

function setPinnedIds(ids: string[]) {
  localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
}

function CourtCardSkeleton() {
  return (
    <div className="bg-card rounded-lg p-4 border border-border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Skeleton className="w-16 h-5 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/* ─── Split-Status Helper ─── */
function getSplitStatusBadge(
  court: SovereignCourt,
  subCourts: Tables<"sub_courts">[] | undefined,
  allObservations: Observation[],
  currentRain1h: number,
  latestReport: Report | null,
) {
  if (!subCourts || subCourts.length === 0) return null;

  const courtObservations = allObservations.filter((o) => o.court_id === court.id && o.status === "playable");
  if (courtObservations.length === 0) return null;

  // Get the latest playable observation
  const latestPlayable = courtObservations[0]; // already sorted desc
  // Check if it's invalidated by actual rain or newer report
  const invalidated =
    currentRain1h > 0 ||
    (latestReport && latestReport.rainfall > 0 && new Date(latestReport.created_at) > new Date(latestPlayable.created_at));
  if (invalidated) return null;

  // Count verified sub-courts (simplified: if captain verified the facility, count based on observation)
  // For now, one playable observation covers all courts unless sub-court-level observations exist
  const totalCourts = subCourts.length;
  // Count distinct sub-court verifications — for MVP, a facility-level observation counts as all
  const verifiedCount = totalCourts; // Captain verified the whole facility

  return {
    verified: verifiedCount,
    total: totalCourts,
    verifierName: latestPlayable.display_name,
    verifiedAgo: getVerifiedAgoText(latestPlayable.created_at),
    allVerified: verifiedCount >= totalCourts,
  };
}

function CourtCard({
  court,
  report,
  observation,
  isPinned,
  onTogglePin,
  onNavigate,
  forecastScore,
  currentRain1h,
  splitStatus,
  todayReportCount,
}: {
  court: SovereignCourt;
  report: Report | null;
  observation: Observation | null;
  isPinned: boolean;
  onTogglePin: (id: string) => void;
  onNavigate: (id: string) => void;
  forecastScore?: number | null;
  currentRain1h?: number;
  splitStatus?: { verified: number; total: number; verifierName: string; verifiedAgo: string; allVerified: boolean } | null;
  todayReportCount?: number;
}) {
  const status = getCourtStatus(report, observation, null, undefined, forecastScore, currentRain1h);
  const config = STATUS_CONFIG[status];
  const isGold = status === "human_verified";

  // Determine badge display
  let badgeLabel = config.label;
  let badgeColor = config.color;

  if (isGold && splitStatus && !splitStatus.allVerified) {
    badgeLabel = `${splitStatus.verified}/${splitStatus.total} Courts Playable`;
    badgeColor = "bg-amber-400";
  } else if (isGold) {
    badgeColor = "bg-amber-400";
  }

  return (
    <div className="relative">
      <button
        onClick={() => onNavigate(court.id)}
        className="w-full text-left bg-card rounded-lg p-4 border border-border hover:border-navy/30 transition-all active:scale-[0.98] card-glow"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm text-card-foreground truncate font-heading">{court.name}</h2>
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground truncate">{court.address}</span>
            </div>
            {todayReportCount !== undefined && todayReportCount > 0 && (
              <p className="text-[10px] text-muted-foreground mt-0.5">{todayReportCount} {todayReportCount === 1 ? "report" : "reports"} today</p>
            )}
            {isGold && splitStatus && (
              <p className="text-[10px] text-amber-600 mt-1">
                Verified by {splitStatus.verifierName} · {splitStatus.verifiedAgo}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 gap-1.5 border-border">
              <span className={`w-2 h-2 rounded-full ${badgeColor} inline-block`} />
              {badgeLabel}
            </Badge>
          </div>
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onTogglePin(court.id); }}
        className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-secondary transition-colors z-[1]"
        aria-label={isPinned ? "Unpin court" : "Pin court"}
      >
        <Pin className={`w-3.5 h-3.5 transition-colors ${isPinned ? "text-navy fill-navy" : "text-muted-foreground/40"}`} />
      </button>
    </div>
  );
}

/* ─── Collapsible Court List ─── */
function CollapsibleCourtList({
  pinnedCourts,
  unpinnedCourts,
  renderCard,
}: {
  pinnedCourts: SovereignCourt[];
  unpinnedCourts: SovereignCourt[];
  renderCard: (court: SovereignCourt, isPinned: boolean) => React.ReactNode;
}) {
  const hasPinned = pinnedCourts.length > 0;
  const [showAll, setShowAll] = useState(!hasPinned);

  if (!hasPinned) {
    return (
      <>
        <p className="text-xs text-muted-foreground py-2 text-center">
          📌 Pin your home courts for quick access.
        </p>
        {unpinnedCourts.map((court) => renderCard(court, false))}
      </>
    );
  }

  return (
    <>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium pt-1">Pinned</p>
      {pinnedCourts.map((court) => renderCard(court, true))}

      {unpinnedCourts.length > 0 && (
        <>
          <button
            onClick={() => setShowAll((p) => !p)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 mt-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm font-medium text-muted-foreground"
          >
            {showAll ? "Hide all courts" : `Show all courts (${unpinnedCourts.length})`}
            <ChevronDown className={`w-4 h-4 transition-transform ${showAll ? "rotate-180" : ""}`} />
          </button>
          {showAll && unpinnedCourts.map((court) => renderCard(court, false))}
        </>
      )}
    </>
  );
}

function getTimeAgo(dateStr: string): string {
  const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [pinnedIds, _setPinnedIds] = useState<string[]>(getPinnedIds);
  const hasVisitedInstructions = localStorage.getItem("courtready-visited-instructions") === "true";
  const isCaptain = isContributor();
  const navigate = useNavigate();

  const togglePin = useCallback((id: string) => {
    _setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      setPinnedIds(next);
      return next;
    });
  }, []);

  const { data: courts = [], isLoading: courtsLoading, isError: courtsError } = useQuery<SovereignCourt[]>({
    queryKey: ["courts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courts").select("*").order("name");
      if (error) throw error;
      console.log("[Dashboard] First court raw:", JSON.stringify(data?.[0]));
      // Map production DB column names to SovereignCourt type
      return (data ?? []).map((row: any) => ({
        id: row.id,
        created_at: row.created_at,
        name: row.name,
        address: row.location ?? row.address ?? "",
        slug: row.slug,
        surface: row.surface,
        court_count: row.court_count,
        latitude: row.latitude,
        longitude: row.longitude,
        sun_exposure_rating: row.sun_exposure ?? row.sun_exposure_rating ?? 3,
        drainage_rating: row.drainage ?? row.drainage_rating ?? 3,
        dna_note: row.dna_note,
      })) as SovereignCourt[];
    },
    placeholderData: keepPreviousData,
    retry: 2,
  });

  const { data: latestReports = {} } = useQuery({
    queryKey: ["latest-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map: Record<string, Report> = {};
      for (const r of data) {
        if (!map[r.court_id]) map[r.court_id] = r;
      }
      return map;
    },
    refetchInterval: courtsError ? false : 30000,
    placeholderData: keepPreviousData,
  });

  const { data: latestObservations = {} } = useQuery({
    queryKey: ["latest-observations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("observations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map: Record<string, Observation> = {};
      for (const o of data as unknown as Observation[]) {
        if (!map[o.court_id]) map[o.court_id] = o;
      }
      return map;
    },
    refetchInterval: courtsError ? false : 30000,
    placeholderData: keepPreviousData,
  });

  // All observations for split-status
  const { data: allObservations = [] } = useQuery({
    queryKey: ["all-observations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("observations")
        .select("*")
        .eq("status", "playable")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Observation[];
    },
    refetchInterval: courtsError ? false : 30000,
    placeholderData: keepPreviousData,
  });

  // Sub-courts for split-status
  const { data: allSubCourts = [] } = useQuery({
    queryKey: ["all-sub-courts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sub_courts").select("*");
      if (error) throw error;
      return data;
    },
    placeholderData: keepPreviousData,
  });

  // Today's report counts per court
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const { data: todayReportCounts = {} } = useQuery({
    queryKey: ["today-report-counts", todayStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("court_id")
        .gte("created_at", todayStart);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of data) {
        counts[r.court_id] = (counts[r.court_id] || 0) + 1;
      }
      return counts;
    },
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
  });

  // Shared weather query for Atlanta (use first court with coords)
  const weatherCoord = courts.find((c) => c.latitude && c.longitude);
  const { data: sharedWeather } = useQuery({
    queryKey: ["shared-weather", weatherCoord?.latitude, weatherCoord?.longitude],
    queryFn: async () => {
      if (!weatherCoord?.latitude || !weatherCoord?.longitude) return null;
      try {
        return await fetchWeather(weatherCoord.latitude, weatherCoord.longitude);
      } catch {
        return null;
      }
    },
    enabled: !!weatherCoord?.latitude && !!weatherCoord?.longitude,
    refetchInterval: 300000,
    staleTime: 240000,
  });

  const currentRain1h = sharedWeather?.rain_1h ?? 0;

  // Compute forecast score per court
  const forecastScores = useMemo(() => {
    const hourly = sharedWeather?.hourly;
    if (!hourly || hourly.length === 0) return {};

    const scores: Record<string, number> = {};
    for (const court of courts) {
      const drainageMap: Record<number, number> = { 1: 1.5, 2: 1.2, 3: 1.0, 4: 0.8, 5: 0.6 };
      const dm = drainageMap[court.drainage_rating] ?? 1.0;
      const window = hourly.slice(0, 3);

      let rainPenalty = 0;
      if (window.some((h: any) => h.pop > 0.3)) rainPenalty += 50;
      for (const h of window as any[]) {
        if (h.pop > 0.3) rainPenalty += Math.round(h.pop * 20);
        if (h.rain_1h > 0) rainPenalty += 15;
        if (h.humidity > 90) rainPenalty += 10;
        if (h.wind_speed > 10) rainPenalty -= 5;
      }
      rainPenalty = Math.max(0, rainPenalty);
      let score = 100 - Math.round(rainPenalty * dm);

      const report = latestReports[court.id];
      if (report) {
        const elapsed = (Date.now() - new Date(report.created_at).getTime()) / 60000;
        const remaining = Math.max(0, report.estimated_dry_minutes - elapsed);
        if (remaining > 0) score -= 30;
      }

      scores[court.id] = Math.max(0, Math.min(100, score));
    }
    return scores;
  }, [sharedWeather?.hourly, courts, latestReports]);

  // Group sub-courts by facility
  const subCourtsByFacility = useMemo(() => {
    const map: Record<string, Tables<"sub_courts">[]> = {};
    for (const sc of allSubCourts) {
      if (!map[sc.facility_id]) map[sc.facility_id] = [];
      map[sc.facility_id].push(sc);
    }
    return map;
  }, [allSubCourts]);

  const filtered = courts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.address.toLowerCase().includes(search.toLowerCase())
  );

  const pinnedCourts = filtered.filter((c) => pinnedIds.includes(c.id));
  const unpinnedCourts = filtered.filter((c) => !pinnedIds.includes(c.id));
  const handleNavigate = (id: string) => navigate(`/court/${id}`);

  const renderCard = (court: SovereignCourt, isPinned: boolean) => {
    const splitStatus = getSplitStatusBadge(
      court,
      subCourtsByFacility[court.id],
      allObservations,
      currentRain1h,
      latestReports[court.id] || null,
    );
    return (
      <CourtCard
        key={court.id}
        court={court}
        report={latestReports[court.id] || null}
        observation={latestObservations[court.id] || null}
        isPinned={isPinned}
        onTogglePin={togglePin}
        onNavigate={handleNavigate}
        forecastScore={forecastScores[court.id] ?? null}
        currentRain1h={currentRain1h}
        splitStatus={splitStatus}
        todayReportCount={todayReportCounts[court.id]}
      />
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <OnboardingModal />
      <header className="sticky top-0 z-10 bg-accent court-texture border-b border-accent/20 px-4 pt-safe">
        <div className="max-w-lg mx-auto py-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-lime" />
              <h1 className="text-lg font-extrabold tracking-tight text-accent-foreground font-heading">
                CourtReady <span className="text-lime">ATL</span>
              </h1>
              {isCaptain && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-lime bg-lime/15 px-2 py-0.5 rounded-full border border-lime/30">
                  <Shield className="w-3 h-3" /> Captain
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isCaptain && (
                <button
                  onClick={() => navigate("/captain")}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition-all active:scale-[0.97]"
                  style={{ backgroundColor: "#0A2342", color: "#C9F000" }}
                >
                  Send the Call →
                </button>
              )}
              <button
                onClick={() => navigate("/instructions")}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-accent/80 transition-colors ${!hasVisitedInstructions ? "animate-pulse" : ""}`}
                aria-label="Instructions"
              >
                <BookOpen className={`w-4 h-4 ${!hasVisitedInstructions ? "text-lime" : "text-accent-foreground/70"}`} />
                {!hasVisitedInstructions && <span className="text-[10px] font-semibold text-lime">Start Here</span>}
              </button>
            </div>
          </div>
          <p className="text-xs text-accent-foreground/70 tracking-wide uppercase mb-4">Atlanta Court Conditions</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-foreground/50" />
            <input
              type="text"
              placeholder="Search courts — e.g., Bitsy Grant"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-accent-foreground/10 text-accent-foreground placeholder:text-accent-foreground/40 rounded-lg pl-10 pr-4 py-2.5 text-sm border border-accent-foreground/10 focus:outline-none focus:ring-2 focus:ring-lime/50 transition-all"
            />
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-2">
        {courtsLoading ? (
          <>
            <CourtCardSkeleton />
            <CourtCardSkeleton />
            <CourtCardSkeleton />
            <CourtCardSkeleton />
          </>
        ) : courtsError ? (
          <div className="text-center py-12 space-y-3">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
            <p className="text-sm font-medium text-destructive">Connection Error</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Unable to reach the server. If this persists, try clearing your browser cache or opening in a private window.
            </p>
            <button
              onClick={() => {
                localStorage.removeItem("courtready-cache-busted-v3");
                location.reload();
              }}
              className="text-xs text-navy underline font-medium"
            >
              Force cache clear & reload
            </button>
          </div>
        ) : courts.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-12">No courts found</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-12">No courts match "{search}"</p>
        ) : (
          <CollapsibleCourtList
            pinnedCourts={pinnedCourts}
            unpinnedCourts={unpinnedCourts}
            renderCard={renderCard}
          />
        )}

        <div className="flex justify-center pt-2 pb-4">
          <RequestCourtSheet />
        </div>
      </main>
    </div>
  );
}
