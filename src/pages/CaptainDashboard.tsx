import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { queryClient } from "@/App";

const EFFORT_OPTIONS = [
  "Squeegeeing",
  "Blowers Active",
  "Debris Removal",
  "Waiting on Sun",
] as const;

const STATUS_BUTTONS: { value: string; label: string; color: string }[] = [
  { value: "green", label: "GREEN — Playable", color: "#22c55e" },
  { value: "yellow", label: "YELLOW — Captain's Call", color: "#eab308" },
  { value: "red", label: "RED — Stay Home", color: "#ef4444" },
];

const ACTION_LABELS: Record<string, string> = {
  green: "Courts are playable",
  yellow: "Captain making the call",
  red: "Courts unplayable",
};

function generateSlug(): string {
  return Math.random().toString(36).substring(2, 10);
}

export default function CaptainDashboard() {
  const [selectedCourt, setSelectedCourt] = useState<string>("");
  const [effortTags, setEffortTags] = useState<string[]>([]);
  const [captainNote, setCaptainNote] = useState("");
  const [captainName, setCaptainName] = useState(
    () => localStorage.getItem("courtready-display-name") || "Captain"
  );
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: courts } = useQuery({
    queryKey: ["captain-courts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courts")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const toggleEffort = (tag: string) => {
    setEffortTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const insertStatus = async (status: string) => {
    if (!selectedCourt) {
      toast({ title: "Select a facility first", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("court_status").insert({
        court_id: selectedCourt,
        status,
        action_label: ACTION_LABELS[status],
        captain_note: captainNote || null,
        effort_tags: effortTags,
        created_by: captainName,
      });
      if (error) throw error;
      toast({ title: `Status set to ${status.toUpperCase()}` });
      setCaptainNote("");
      queryClient.invalidateQueries({ queryKey: ["beacon-status"] });
      queryClient.invalidateQueries({ queryKey: ["beacon-timeline"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const createMatch = async () => {
    if (!selectedCourt || !homeTeam || !awayTeam || !matchTime) {
      toast({ title: "Fill in all match fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const slug = generateSlug();
      const { error } = await supabase.from("matches").insert({
        court_id: selectedCourt,
        home_team: homeTeam,
        away_team: awayTeam,
        match_time: new Date(matchTime).toISOString(),
        share_slug: slug,
      });
      if (error) throw error;
      const url = `${window.location.origin}/status/${slug}`;
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!", description: url });
      setHomeTeam("");
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
      <h1 className="text-2xl font-bold text-foreground">Captain's Trigger</h1>

      {/* Facility Selector */}
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-1 block">
          Facility
        </label>
        <Select value={selectedCourt} onValueChange={setSelectedCourt}>
          <SelectTrigger>
            <SelectValue placeholder="Select a facility" />
          </SelectTrigger>
          <SelectContent>
            {courts?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          }}
          placeholder="Captain name"
        />
      </div>

      {/* Effort Tags */}
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-2 block">
          Effort Tags
        </label>
        <div className="flex flex-wrap gap-2">
          {EFFORT_OPTIONS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleEffort(tag)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
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

      {/* Status Buttons */}
      <div className="space-y-3">
        {STATUS_BUTTONS.map((btn) => (
          <button
            key={btn.value}
            disabled={submitting || !selectedCourt}
            onClick={() => insertStatus(btn.value)}
            className="w-full py-4 rounded-xl text-white font-bold text-lg transition-opacity disabled:opacity-40"
            style={{ backgroundColor: btn.color }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t pt-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Create Match + Share Link
        </h2>
        <div className="space-y-3">
          <Input
            placeholder="Home team"
            value={homeTeam}
            onChange={(e) => setHomeTeam(e.target.value)}
          />
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
            disabled={submitting || !selectedCourt}
            onClick={createMatch}
          >
            Create Match + Copy Share Link
          </Button>
        </div>
      </div>
    </div>
  );
}
