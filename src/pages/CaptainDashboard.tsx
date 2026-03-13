import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { queryClient } from "@/App";
import { CheckCircle2, Search } from "lucide-react";

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

const HELP_OPTIONS = [
  { value: "none", label: "We've got it — no help needed" },
  { value: "towels", label: "Extra hands welcome — bring towels" },
  { value: "all", label: "All hands needed — bring everything" },
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

export default function CaptainDashboard() {
  const [searchParams] = useSearchParams();
  const preselectedCourt = searchParams.get("court") || "";
  const pinnedIds = useMemo(() => getPinnedIds(), []);
  const [selectedCourt, setSelectedCourt] = useState<string>(preselectedCourt);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [publishedStatus, setPublishedStatus] = useState<string | null>(null);
  const [effortTags, setEffortTags] = useState<string[]>([]);
  const [captainNote, setCaptainNote] = useState("");
  const [captainName, setCaptainName] = useState(
    () => localStorage.getItem("courtready-captain-name") || ""
  );
  const [helpNeeded, setHelpNeeded] = useState<string | null>(null);
  const [reportTo, setReportTo] = useState("");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [facilitySearch, setFacilitySearch] = useState("");
  const [councilMembers, setCouncilMembers] = useState<Array<{ id: string; display_name: string }>>([]);
  const [councilLoadState, setCouncilLoadState] = useState<"loading" | "success" | "error">("loading");

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

  useEffect(() => {
    let isMounted = true;

    const fetchCouncilMembers = async () => {
      const envUrl = import.meta.env.VITE_SUPABASE_URL;
      const derivedUrl = (() => {
        try {
          const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
          const payload = JSON.parse(atob(key.split(".")[1]));
          return `https://${payload.ref}.supabase.co`;
        } catch { return "decode-failed"; }
      })();
      console.log("[CaptainDashboard] env URL:", envUrl);
      console.log("[CaptainDashboard] derived/active URL:", derivedUrl);
      console.log("[CaptainDashboard] fetching council_members on mount");

      const { data, error } = await supabase
        .from("council_members")
        .select("id, display_name")
        .order("display_name", { ascending: true });

      if (!isMounted) return;

      if (error) {
        console.error("[CaptainDashboard] council_members fetch error:", error);
        setCouncilMembers([]);
        setCouncilLoadState("error");
        return;
      }

      const rows = data ?? [];
      console.log("[CaptainDashboard] council_members rows:", rows.length, rows.map(r => r.display_name));
      setCouncilMembers(rows);
      setCouncilLoadState("success");
    };

    fetchCouncilMembers();

    return () => { isMounted = false; };
  }, []);

  // Pinned courts only
  const pinnedCourts = useMemo(() => courts?.filter(c => pinnedIds.includes(c.id)) ?? [], [courts, pinnedIds]);

  // Search results (non-pinned)
  const searchResults = useMemo(() => {
    if (!facilitySearch.trim() || !courts) return [];
    return courts
      .filter(c => !pinnedIds.includes(c.id))
      .filter(c => c.name.toLowerCase().includes(facilitySearch.toLowerCase()));
  }, [courts, pinnedIds, facilitySearch]);

  // Selected non-pinned court (for display after search selection)
  const selectedNonPinnedCourt = useMemo(() => {
    if (!selectedCourt || !courts) return null;
    if (pinnedIds.includes(selectedCourt)) return null;
    return courts.find(c => c.id === selectedCourt) ?? null;
  }, [selectedCourt, courts, pinnedIds]);

  // Auto-select: preselected > first pinned > empty
  const activeCourt = selectedCourt || pinnedCourts[0]?.id || "";

  // Auto-populate home team with selected facility name
  const activeCourtName = courts?.find(c => c.id === activeCourt)?.name ?? "";
  const lastAutoRef = useRef("");
  useEffect(() => {
    if (activeCourtName && activeCourtName !== lastAutoRef.current) {
      setHomeTeam(prev => (!prev || prev === lastAutoRef.current) ? activeCourtName : prev);
      lastAutoRef.current = activeCourtName;
    }
  }, [activeCourtName]);

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
        created_by: captainName || "Captain",
        captain_name: captainName || null,
        help_needed: helpNeeded || null,
        report_to: reportTo || null,
      });
      if (error) throw error;
      toast({ title: `Status: ${ACTION_LABELS[selectedStatus]}` });
      setPublishedStatus(selectedStatus);
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
    if (!activeCourt || !homeTeam || !awayTeam) {
      toast({ title: "Fill in home and away teams", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const slug = generateSlug();
      const { error } = await supabase.from("matches").insert({
        court_id: activeCourt,
        home_team: homeTeam,
        away_team: awayTeam,
        match_time: matchTime ? new Date(matchTime).toISOString() : new Date().toISOString(),
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

  const hasPinned = pinnedCourts.length > 0;

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground font-heading">Captain's Trigger</h1>

      {/* Facility selector */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
          Your Facility
        </label>

        {/* Pinned courts as pills */}
        {hasPinned && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pinnedCourts.map((c) => (
              <button
                key={c.id}
                onClick={() => { setSelectedCourt(c.id); setPublishedStatus(null); setSelectedStatus(null); }}
                className={`px-4 py-2.5 min-h-[44px] rounded-full text-sm font-medium border transition-colors ${
                  activeCourt === c.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                📌 {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Show selected non-pinned court */}
        {selectedNonPinnedCourt && !showSearch && (
          <div className="flex items-center gap-2 mb-2">
            <span className="px-4 py-2.5 min-h-[44px] rounded-full text-sm font-medium border bg-primary text-primary-foreground border-primary">
              {selectedNonPinnedCourt.name}
            </span>
            <button
              onClick={() => { setSelectedCourt(""); setShowSearch(true); }}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              Change
            </button>
          </div>
        )}
        {/* Search toggle / field */}
        {hasPinned && !showSearch ? (
          <button
            onClick={() => setShowSearch(true)}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors min-h-[44px] py-2"
          >
            Different facility? Search →
          </button>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input
              type="text"
              placeholder={hasPinned ? "Search for a facility..." : "Search for your facility..."}
              value={facilitySearch}
              onChange={(e) => setFacilitySearch(e.target.value)}
              className="w-full bg-secondary text-foreground placeholder:text-muted-foreground/40 rounded-lg pl-10 pr-4 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all"
              autoFocus={showSearch}
            />
            {searchResults.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {searchResults.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCourt(c.id);
                      setPublishedStatus(null);
                      setSelectedStatus(null);
                      setFacilitySearch("");
                      if (hasPinned) setShowSearch(false);
                    }}
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
            )}
          </div>
        )}
      </div>

      {/* Captain Name — dropdown from council_members */}
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-1 block">
          Your Name
        </label>
        {councilMembers && councilMembers.length > 0 ? (
          <Select
            value={captainName}
            onValueChange={(val) => {
              setCaptainName(val);
              localStorage.setItem("courtready-captain-name", val);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select your name" />
            </SelectTrigger>
            <SelectContent>
              {councilMembers.map((m) => (
                <SelectItem key={m.id} value={m.display_name}>
                  {m.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={captainName}
            onChange={(e) => {
              setCaptainName(e.target.value);
              localStorage.setItem("courtready-captain-name", e.target.value);
            }}
            placeholder="Captain name"
          />
        )}
      </div>

      <Separator />

      {/* Published confirmation */}
      {publishedStatus && (
        <div className="flex items-center gap-2 bg-court-green/10 rounded-lg p-3 border border-court-green/20">
          <CheckCircle2 className="w-5 h-5 text-court-green flex-shrink-0" />
          <p className="text-sm font-medium text-court-green">
            Published: {ACTION_LABELS[publishedStatus]}
          </p>
        </div>
      )}

      {/* Match Status Section */}
      <div className="space-y-3">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
          Match Status
        </label>
        {STATUS_BUTTONS.map((btn) => {
          const isPublished = publishedStatus === btn.value;
          const isSelected = selectedStatus === btn.value || isPublished;
          const isDisabled = (selectedStatus !== null || publishedStatus !== null) && !isSelected;
          return (
            <button
              key={btn.value}
              disabled={submitting || !!publishedStatus}
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

      {/* Publish / Reset Button */}
      {publishedStatus ? (
        <Button
          className="w-full"
          size="lg"
          variant="outline"
          onClick={() => { setPublishedStatus(null); setSelectedStatus(null); setEffortTags([]); }}
        >
          Reset — Publish New Status
        </Button>
      ) : (
        <Button
          className="w-full"
          size="lg"
          disabled={submitting || !selectedStatus}
          onClick={publishStatus}
        >
          Publish Status
        </Button>
      )}

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

      {/* Help Needed Section */}
      <div className="space-y-3">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
          Help Needed
        </label>
        <div className="flex flex-col gap-2">
          {HELP_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setHelpNeeded(prev => prev === opt.value ? null : opt.value)}
              className={`w-full px-4 py-3 min-h-[44px] rounded-lg text-sm font-medium border text-left transition-colors ${
                helpNeeded === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground italic">
          Dry-Clock estimate will appear here once linked.
        </p>

        <div>
          <label className="text-sm font-medium text-muted-foreground mb-1 block">
            Report to:
          </label>
          <Input
            value={reportTo}
            onChange={(e) => setReportTo(e.target.value)}
            placeholder="e.g. Court 3 entrance · Ask for Sarah"
          />
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
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Away Team
            </label>
            <Input
              placeholder="Away team"
              value={awayTeam}
              onChange={(e) => setAwayTeam(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-0.5 block">
              Match time — optional
            </label>
            <p className="text-xs text-muted-foreground mb-1">(Helps opponents know when to leave)</p>
            <Input
              type="datetime-local"
              value={matchTime}
              onChange={(e) => setMatchTime(e.target.value)}
            />
          </div>
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
