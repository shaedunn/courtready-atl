import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, CloudRain, Send, Sparkles, MapPin, AlertTriangle } from "lucide-react";
import { supabase, type SovereignCourt } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";
import { formatDryTime, getCourtStatus, STATUS_CONFIG } from "@/lib/courts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import ReportForm from "@/components/court/ReportForm";

type Report = Tables<"reports">;

function StatusCard({ report, courtId }: { report: Report | null; courtId: string }) {
  const queryClient = useQueryClient();
  const status = getCourtStatus(report);
  const config = STATUS_CONFIG[status];

  const dryTime = report
    ? Math.max(0, report.estimated_dry_minutes - (Date.now() - new Date(report.created_at).getTime()) / 60000)
    : null;
  const roundedDry = dryTime !== null ? Math.round(dryTime) : null;

  const stillWetMutation = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error("No report");
      const { error } = await supabase
        .from("reports")
        .update({ estimated_dry_minutes: report.estimated_dry_minutes + 30 })
        .eq("id", report.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["latest-report", courtId] });
      queryClient.invalidateQueries({ queryKey: ["latest-reports"] });
    },
  });

  const showStillWet = status === "drying" || status === "wet";

  return (
    <div className="bg-card rounded-lg p-5 border border-border card-glow">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Current Status</span>
        <div className="flex items-center gap-2">
          {report && (
            <span className="text-[11px] text-muted-foreground font-mono">
              {new Date(report.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 gap-1.5 border-border">
            <span className={`w-2 h-2 rounded-full ${config.color} inline-block`} />
            {config.label}
          </Badge>
        </div>
      </div>

      {roundedDry !== null && roundedDry > 0 ? (
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-5 h-5 text-court-amber" />
            <span className="text-2xl font-bold font-mono text-court-amber">{formatDryTime(roundedDry)}</span>
          </div>
          <p className="text-xs text-muted-foreground">Estimated time to playable</p>
          <div className="flex gap-3 text-[11px] text-muted-foreground justify-center pt-1 flex-wrap">
            <span>Rain: {report!.rainfall}"</span>
            <span>·</span>
            <span>Squeegees: {report!.squeegee_count}</span>
          </div>
        </div>
      ) : roundedDry !== null && roundedDry <= 0 ? (
        <div className="text-center space-y-1">
          <Sparkles className="w-6 h-6 text-primary mx-auto" />
          <p className="text-lg font-bold text-primary text-glow">Courts are Dry</p>
          <p className="text-xs text-muted-foreground">Ready to play</p>
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-2">No recent reports</p>
      )}

      {/* Still Wet? — Social validation button */}
      {showStillWet && (
        <button
          onClick={() => stillWetMutation.mutate()}
          disabled={stillWetMutation.isPending}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg py-2.5 text-sm font-medium hover:bg-destructive/20 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          <AlertTriangle className="w-4 h-4" />
          {stillWetMutation.isPending ? "Updating..." : "Still Wet? (+30 mins)"}
        </button>
      )}
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

function CaptainsLog({ court }: { court: SovereignCourt }) {
  const [logText, setLogText] = useState("");
  const [logAuthor, setLogAuthor] = useState("");
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
      const { error } = await supabase.from("court_logs").insert({
        court_id: court.id,
        author: logAuthor.trim() || "Anonymous",
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

export default function CourtDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);

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
              <p className="text-xs text-muted-foreground truncate">{court.address}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <StatusCard report={latestReport} courtId={court.id} />

        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-lg text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
            <CloudRain className="w-4 h-4" />
            Captain's Report
          </button>
        )}

        {showForm && <ReportForm court={court} onSubmitted={() => setShowForm(false)} />}

        <CaptainsLog court={court} />
      </main>
    </div>
  );
}
