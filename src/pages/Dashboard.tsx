import { useState, useMemo } from "react";
import { Search, Droplets, MapPin } from "lucide-react";
import { COURTS, getLatestReport } from "@/lib/courts";
import { useNavigate } from "react-router-dom";

function getStatusColor(report: ReturnType<typeof getLatestReport>) {
  if (!report) return "bg-muted-foreground/30";
  const age = (Date.now() - report.timestamp) / 60000;
  if (age > 180) return "bg-muted-foreground/30"; // stale
  if (report.estimatedDryMinutes <= 0) return "bg-court-green";
  const remaining = report.estimatedDryMinutes - age;
  if (remaining <= 0) return "bg-court-green";
  if (remaining <= 30) return "bg-court-amber";
  return "bg-court-red";
}

function getStatusText(report: ReturnType<typeof getLatestReport>) {
  if (!report) return "No report";
  const age = (Date.now() - report.timestamp) / 60000;
  if (age > 180) return "No report";
  if (report.estimatedDryMinutes <= 0) return "Dry";
  const remaining = Math.max(0, report.estimatedDryMinutes - age);
  if (remaining <= 0) return "Dry";
  return `~${Math.round(remaining)}m to dry`;
}

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  // Force re-render to get fresh reports
  const [, setTick] = useState(0);
  useMemo(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const filtered = COURTS.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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

      {/* Court List */}
      <main className="max-w-lg mx-auto px-4 py-4 space-y-2">
        {filtered.map((court) => {
          const report = getLatestReport(court.id);
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
                  <span className="text-xs text-muted-foreground mt-1 block">{court.courts} courts · {court.surface}</span>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(report)} status-pulse`} />
                  <span className="text-[11px] font-mono text-muted-foreground">{getStatusText(report)}</span>
                </div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-12">No courts found</p>
        )}
      </main>
    </div>
  );
}
