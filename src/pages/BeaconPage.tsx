import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow, format } from "date-fns";

const STATUS_MAP: Record<string, { bg: string; label: string }> = {
  green: { bg: "#22c55e", label: "MATCH IS A GO — On-Time Start" },
  yellow: { bg: "#eab308", label: "DELAYED — Captain's Call Pending" },
  red: { bg: "#ef4444", label: "MATCH POSTPONED" },
};

const HELP_LABELS: Record<string, string> = {
  none: "We've got it — no help needed",
  towels: "Extra hands welcome — bring towels",
  all: "All hands needed — bring everything",
};

function formatCaptainAttribution(name: string | null): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return `Captain ${parts[0]}`;
  return `Captain ${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export default function BeaconPage() {
  const { share_slug } = useParams<{ share_slug: string }>();

  const { data: match, isLoading: matchLoading } = useQuery({
    queryKey: ["beacon-match", share_slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("*, courts(*)")
        .eq("share_slug", share_slug!)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!share_slug,
  });

  const courtId = match?.court_id as string | undefined;

  const { data: latestStatus } = useQuery({
    queryKey: ["beacon-status", courtId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("court_status")
        .select("*")
        .eq("court_id", courtId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data as any | null;
    },
    enabled: !!courtId,
  });

  const { data: timeline } = useQuery({
    queryKey: ["beacon-timeline", courtId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("court_status")
        .select("*")
        .eq("court_id", courtId!)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!courtId,
  });

  if (matchLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground animate-pulse">Loading beacon…</p>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Match not found.</p>
      </div>
    );
  }

  const court = match.courts;
  const statusKey = (latestStatus?.status as string) || "yellow";
  const cfg = STATUS_MAP[statusKey] || STATUS_MAP.yellow;

  const captainAttr = latestStatus
    ? `Updated ${format(new Date(latestStatus.created_at), "h:mma").toLowerCase()}${
        latestStatus.captain_name
          ? ` · by ${formatCaptainAttribution(latestStatus.captain_name)}`
          : ""
      }`
    : null;

  const helpNeeded = latestStatus?.help_needed as string | null;
  const reportToValue = latestStatus?.report_to as string | null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Opponent-facing section ── */}

      {/* Hero Banner */}
      <div
        className="w-full py-16 px-4 flex flex-col items-center justify-center text-center"
        style={{ backgroundColor: cfg.bg }}
      >
        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight drop-shadow-lg leading-tight font-heading">
          {cfg.label}
        </h1>
        <p className="mt-3 text-lg text-white/80 font-medium">
          {court?.name} — {match.home_team} vs {match.away_team}
        </p>
        {match.match_time && (
          <p className="mt-1 text-sm text-white/60">
            {new Date(match.match_time).toLocaleString()}
          </p>
        )}
        {captainAttr && (
          <p className="mt-2 text-xs text-white/60">{captainAttr}</p>
        )}
      </div>

      {/* Home Team Prep Card */}
      {(latestStatus?.effort_tags?.length > 0 || latestStatus?.captain_note) && (
        <div className="px-4 py-5 max-w-lg mx-auto w-full">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Home Team Prep
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">
              Live coordination from the home team.
            </p>
            {latestStatus.effort_tags?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {latestStatus.effort_tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="px-4 py-2.5 min-h-[44px] rounded-full bg-muted text-muted-foreground text-xs font-medium inline-flex items-center"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {latestStatus.captain_note && (
              <p className="text-sm text-card-foreground">
                {latestStatus.captain_note}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Status Timeline
        </h2>
        {timeline && timeline.length > 0 ? (
          <div className="space-y-3">
            {timeline.map((entry: any) => {
              const entryCfg = STATUS_MAP[entry.status] || STATUS_MAP.yellow;
              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 rounded-lg border bg-card p-3"
                >
                  <div
                    className="mt-1 h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: entryCfg.bg }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-card-foreground">
                      {entry.action_label || entryCfg.label}
                    </p>
                    {entry.captain_note && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {entry.captain_note}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No status updates yet.</p>
        )}
      </div>

      {/* ── Teammate-facing section ── */}
      {helpNeeded && (
        <div className="w-full bg-muted/50 border-t border-border">
          <div className="px-4 py-8 max-w-lg mx-auto w-full space-y-4">
            <h2 className="text-lg font-bold text-foreground font-heading">
              Your team needs you
            </h2>
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold text-card-foreground">
                {HELP_LABELS[helpNeeded] || helpNeeded}
              </p>
              {reportToValue && (
                <p className="text-sm text-muted-foreground">
                  Report to: {reportToValue}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DNA Note */}
      {court?.dna_note && (
        <div className="px-4 pb-8 max-w-lg mx-auto w-full">
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Court DNA
            </h3>
            <p className="text-sm text-card-foreground">{court.dna_note}</p>
          </div>
        </div>
      )}

      {/* Footer CTA */}
      <div className="px-4 py-6 max-w-lg mx-auto w-full text-center border-t border-border">
        <p className="text-sm text-muted-foreground">Running your own matches?</p>
        <Link
          to="/captain"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Get this for your courts →
        </Link>
      </div>
    </div>
  );
}
