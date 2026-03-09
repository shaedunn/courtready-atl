import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { queryClient } from "@/App";
import { CheckCircle2 } from "lucide-react";

const PINNED_KEY = "courtready-pinned";
function getPinnedIds(): string[] {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY) || "[]"); } catch { return []; }
}

const EFFORT_OPTIONS = [
  "Squeegeeing",
  "Blowers Active",
  "Debris Removal",
  "Waiting on Sun",
] as const;

const STATUS_BUTTONS: { value: string; label: string; color: string }[] = [
  { value: "green", label: "MATCH IS A GO — On-Time Start", color: "hsl(142, 71%, 45%)" },
  { value: "yellow", label: "DELAYED — Captain's Call Pending", color: "hsl(48, 96%, 53%)" },
  { value: "red", label: "MATCH POSTPONED", color: "hsl(0, 84%, 60%)" },
];

const ACTION_LABELS: Record<string, string> = {
  green: "MATCH IS A GO — On-Time Start",
  yellow: "DELAYED — Captain's Call Pending",
  red: "MATCH POSTPONED",
};

function generateSlug(): string {
  return Math.random().toString(36).substring(2, 10);
}

// Hardcoded: captain sees all facilities until user profiles are built
const CAPTAIN_USER_ID = "placeholder-all-access";

export default function CaptainDashboard() {
  const [selectedCourt, setSelectedCourt] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [effortTags, setEffortTags] = useState<string[]>([]);
  const [captainNote, setCaptainNote] = useState("");
  const [captainName, setCaptainName] = useState(
    () => localStorage.getItem("courtready-display-name") || "Captain"
  );
  const [homeTeam, setHomeTeam] = useState(() => captainName);
  const [awayTeam, setAwayTeam] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Captain sees all facilities (hardcoded for now)
  const { data: courts } = useQuery({
    queryKey: ["captain-courts", CAPTAIN_USER_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courts")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Auto-select first facility
  const activeCourt = selectedCourt || courts?.[0]?.id || "";

  const toggleEffort = (tag: string) => {
    setEffortTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const toggleStatus = (status: string) => {
    setSelectedStatus((prev) => (prev === status ? null : status));
  };

  const publishStatus = async () => {
    if (!selectedStatus) {
      toast({ title: "Select a status first", variant: "destructive" });
      return;
    }
    if (!activeCourt) {
      toast({ title: "No facility available", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("court_status").insert({
        court_id: activeCourt,
        status: selectedStatus,
        action_label: ACTION_LABELS[selectedStatus],
        captain_note: captainNote || null,
        effort_tags: effortTags,
        created_by: captainName,
      });
      if (error) throw error;
      toast({ title: `Status: ${ACTION_LABELS[selectedStatus]}` });
      setCaptainNote("");
      setSelectedStatus(null);
      setEffortTags([]);
      queryClient.invalidateQueries({ queryKey: ["beacon-status"] });
      queryClient.invalidateQueries({ queryKey: ["beacon-timeline"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const createMatch = async () => {
    if (!activeCourt || !homeTeam || !awayTeam || !matchTime) {
      toast({ title: "Fill in all match fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const slug = generateSlug();
      const { error } = await supabase.from("matches").insert({
        court_id: activeCourt,
        home_team: homeTeam,
        away_team: awayTeam,
        match_time: new Date(matchTime).toISOString(),
        share_slug: slug,
      });
      if (error) throw error;
      const url = `${window.location.origin}/status/${slug}`;
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!", description: url });
      setAwayTeam("");
      setMatchTime("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground font-heading">Captain's Trigger</h1>

      {/* Facility (auto-assigned, tap to switch) */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
          Your Facilities
        </label>
        <div className="flex flex-wrap gap-2">
          {courts?.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCourt(c.id)}
              className={`px-4 py-2.5 min-h-[44px] rounded-full text-sm font-medium border transition-colors ${
                activeCourt === c.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Captain Name */}
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-1 block">
          Your Name
        </label>
        <Input
          value={captainName}
          onChange={(e) => {
            setCaptainName(e.target.value);
            localStorage.setItem("courtready-display-name", e.target.value);
            // Also update home team if it matches old name
            setHomeTeam(e.target.value);
          }}
          placeholder="Captain name"
        />
      </div>

      <Separator />

      {/* Match Status Section */}
      <div className="space-y-3">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
          Match Status
        </label>
        {STATUS_BUTTONS.map((btn) => {
          const isSelected = selectedStatus === btn.value;
          const isDisabled = selectedStatus !== null && !isSelected;
          return (
            <button
              key={btn.value}
              disabled={submitting}
              onClick={() => toggleStatus(btn.value)}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all border-2 ${
                isSelected
                  ? "text-white shadow-lg scale-[1.02]"
                  : isDisabled
                  ? "opacity-30 cursor-not-allowed text-muted-foreground bg-muted border-border"
                  : "text-white hover:scale-[1.01]"
              }`}
              style={
                isDisabled
                  ? {}
                  : {
                      backgroundColor: btn.color,
                      borderColor: isSelected ? "hsl(var(--foreground))" : btn.color,
                    }
              }
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      {/* Captain Note */}
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-1 block">
          Note (optional)
        </label>
        <Textarea
          value={captainNote}
          onChange={(e) => setCaptainNote(e.target.value)}
          placeholder="e.g. Courts 1-2 are ready, 3-4 still drying"
          rows={2}
        />
      </div>

      {/* Publish Button */}
      <Button
        className="w-full"
        size="lg"
        disabled={submitting || !selectedStatus}
        onClick={publishStatus}
      >
        Publish Status
      </Button>

      <Separator />

      {/* Home Team Prep Section */}
      <div className="space-y-3">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
          Home Team Prep
        </label>
        <div className="flex flex-wrap gap-2">
          {EFFORT_OPTIONS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleEffort(tag)}
              className={`px-4 py-2.5 min-h-[44px] rounded-full text-sm font-medium border transition-colors ${
                effortTags.includes(tag)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Create Match + Share Link */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground font-heading">
          Create Match + Share Link
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Home Team
            </label>
            <Input
              placeholder="Home team"
              value={homeTeam}
              onChange={(e) => setHomeTeam(e.target.value)}
            />
          </div>
          <Input
            placeholder="Away team"
            value={awayTeam}
            onChange={(e) => setAwayTeam(e.target.value)}
          />
          <Input
            type="datetime-local"
            value={matchTime}
            onChange={(e) => setMatchTime(e.target.value)}
          />
          <Button
            className="w-full"
            disabled={submitting || !activeCourt}
            onClick={createMatch}
          >
            Create Match + Copy Share Link
          </Button>
        </div>
      </div>
    </div>
  );
}
