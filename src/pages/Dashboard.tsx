import { useState, useCallback } from "react";
import { Search, Droplets, MapPin, Pin, BookOpen, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase, type SovereignCourt, type Observation } from "@/lib/supabase";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";
import { Skeleton } from "@/components/ui/skeleton";
import { getCourtStatus, STATUS_CONFIG } from "@/lib/courts";
import { Badge } from "@/components/ui/badge";

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

function CourtCard({
  court,
  report,
  observation,
  isPinned,
  onTogglePin,
  onNavigate,
}: {
  court: SovereignCourt;
  report: Report | null;
  observation: Observation | null;
  isPinned: boolean;
  onTogglePin: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  const status = getCourtStatus(report, observation);
  const config = STATUS_CONFIG[status];

  return (
    <div className="relative">
      <button
        onClick={() => onNavigate(court.id)}
        className="w-full text-left bg-card rounded-lg p-4 border border-border hover:border-primary/30 transition-all active:scale-[0.98] card-glow"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm text-card-foreground truncate">{court.name}</h2>
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground truncate">{court.location}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 gap-1.5 border-border">
              <span className={`w-2 h-2 rounded-full ${config.color} inline-block`} />
              {config.label}
            </Badge>
          </div>
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onTogglePin(court.id); }}
        className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-secondary transition-colors z-[1]"
        aria-label={isPinned ? "Unpin court" : "Pin court"}
      >
        <Pin className={`w-3.5 h-3.5 transition-colors ${isPinned ? "text-primary fill-primary" : "text-muted-foreground/40"}`} />
      </button>
    </div>
  );
}

/* ─── Pilot Ticker ─── */
function PilotTicker() {
  const { data: recentActivity = [] } = useQuery({
    queryKey: ["pilot-ticker"],
    queryFn: async () => {
      const [{ data: reports }, { data: observations }] = await Promise.all([
        supabase.from("reports").select("court_id, created_at, rainfall").order("created_at", { ascending: false }).limit(3),
        supabase.from("observations").select("court_id, created_at, status, display_name").order("created_at", { ascending: false }).limit(3),
      ]);
      const items: { text: string; time: string }[] = [];
      for (const r of reports ?? []) {
        const ago = getTimeAgo(r.created_at);
        items.push({ text: `📋 Report: ${r.rainfall}" rain`, time: ago });
      }
      for (const o of observations ?? []) {
        const ago = getTimeAgo(o.created_at);
        const label = o.status === "playable" ? "✅ Playable" : o.status === "still_wet" ? "💧 Still Wet" : "🧹 Squeegee";
        items.push({ text: `${label} — ${o.display_name}`, time: ago });
      }
      items.sort((a, b) => a.time.localeCompare(b.time));
      return items.slice(0, 5);
    },
    refetchInterval: 30000,
  });

  if (recentActivity.length === 0) return null;

  return (
    <div className="overflow-hidden bg-secondary/50 border-b border-border">
      <div className="flex animate-scroll-x gap-8 px-4 py-1.5 whitespace-nowrap">
        {recentActivity.map((item, i) => (
          <span key={i} className="text-[11px] text-muted-foreground flex-shrink-0">
            {item.text} <span className="text-muted-foreground/50">({item.time})</span>
          </span>
        ))}
        {/* Duplicate for seamless scroll */}
        {recentActivity.map((item, i) => (
          <span key={`dup-${i}`} className="text-[11px] text-muted-foreground flex-shrink-0">
            {item.text} <span className="text-muted-foreground/50">({item.time})</span>
          </span>
        ))}
      </div>
    </div>
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
      return data as unknown as SovereignCourt[];
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

  const filtered = courts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.location.toLowerCase().includes(search.toLowerCase())
  );

  const pinnedCourts = filtered.filter((c) => pinnedIds.includes(c.id));
  const unpinnedCourts = filtered.filter((c) => !pinnedIds.includes(c.id));
  const handleNavigate = (id: string) => navigate(`/court/${id}`);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border px-4 pt-safe">
        <div className="max-w-lg mx-auto py-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold tracking-tight">CourtReady <span className="text-primary">ATL</span></h1>
            </div>
            <button
              onClick={() => navigate("/instructions")}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
              aria-label="Instructions"
            >
              <BookOpen className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground tracking-wide uppercase mb-4">Atlanta Court Conditions</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search courts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-secondary text-foreground placeholder:text-muted-foreground rounded-lg pl-10 pr-4 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all"
            />
          </div>
        </div>
      </header>

      {/* Pilot Ticker */}
      {!courtsError && !courtsLoading && <PilotTicker />}

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
              className="text-xs text-primary underline"
            >
              Force cache clear & reload
            </button>
          </div>
        ) : courts.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-12">No courts found</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-12">No courts match "{search}"</p>
        ) : (
          <>
            {pinnedCourts.length > 0 && (
              <>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium pt-1">Pinned</p>
                {pinnedCourts.map((court) => (
                  <CourtCard key={court.id} court={court} report={latestReports[court.id] || null} observation={latestObservations[court.id] || null} isPinned onTogglePin={togglePin} onNavigate={handleNavigate} />
                ))}
                {unpinnedCourts.length > 0 && (
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium pt-3">All Courts</p>
                )}
              </>
            )}
            {unpinnedCourts.map((court) => (
              <CourtCard key={court.id} court={court} report={latestReports[court.id] || null} observation={latestObservations[court.id] || null} isPinned={false} onTogglePin={togglePin} onNavigate={handleNavigate} />
            ))}
          </>
        )}
      </main>
    </div>
  );
}
