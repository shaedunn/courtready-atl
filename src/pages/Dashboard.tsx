import { useState, useCallback } from "react";
import { Search, Droplets, MapPin, Pin } from "lucide-react";
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
              <span className="text-xs text-muted-foreground truncate">{court.address}</span>
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

  const { data: courts = [], isLoading: courtsLoading } = useQuery<SovereignCourt[]>({
    queryKey: ["courts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courts").select("*").order("name");
      if (error) throw error;
      return data as unknown as SovereignCourt[];
    },
    placeholderData: keepPreviousData,
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
    refetchInterval: 30000,
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
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
  });

  const filtered = courts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.address.toLowerCase().includes(search.toLowerCase())
  );

  const pinnedCourts = filtered.filter((c) => pinnedIds.includes(c.id));
  const unpinnedCourts = filtered.filter((c) => !pinnedIds.includes(c.id));
  const handleNavigate = (id: string) => navigate(`/court/${id}`);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border px-4 pt-safe">
        <div className="max-w-lg mx-auto py-4">
          <div className="flex items-center gap-2 mb-1">
            <Droplets className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold tracking-tight">CourtReady <span className="text-primary">ATL</span></h1>
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

      <main className="max-w-lg mx-auto px-4 py-4 space-y-2">
        {courtsLoading ? (
          <>
            <CourtCardSkeleton />
            <CourtCardSkeleton />
            <CourtCardSkeleton />
            <CourtCardSkeleton />
          </>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-12">No courts found</p>
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
