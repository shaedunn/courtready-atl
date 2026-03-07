import { useState } from "react";
import { Search, Droplets, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase, type SovereignCourt } from "@/lib/supabase";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";
import { Skeleton } from "@/components/ui/skeleton";

type Report = Tables<"reports">;

function getStatusColor(report: Report | null) {
  if (!report) return "bg-muted-foreground/30";
  const age = (Date.now() - new Date(report.created_at).getTime()) / 60000;
  if (age > 180) return "bg-muted-foreground/30";
  if (report.estimated_dry_minutes <= 0) return "bg-court-green";
  const remaining = report.estimated_dry_minutes - age;
  if (remaining <= 0) return "bg-court-green";
  if (remaining <= 30) return "bg-court-amber";
  return "bg-court-red";
}

function getStatusText(report: Report | null) {
  if (!report) return "No report";
  const age = (Date.now() - new Date(report.created_at).getTime()) / 60000;
  if (age > 180) return "No report";
  if (report.estimated_dry_minutes <= 0) return "Dry";
  const remaining = Math.max(0, report.estimated_dry_minutes - age);
  if (remaining <= 0) return "Dry";
  return `~${Math.round(remaining)}m to dry`;
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
          <Skeleton className="w-2.5 h-2.5 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

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

  const filtered = courts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.location.toLowerCase().includes(search.toLowerCase())
  );

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
          filtered.map((court) => {
            const report = latestReports[court.id] || null;
            return (
              <button
                key={court.id}
                onClick={() => navigate(`/court/${court.id}`)}
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
                    <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(report)} status-pulse`} />
                    <span className="text-[11px] font-mono text-muted-foreground">{getStatusText(report)}</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </main>
    </div>
  );
}
