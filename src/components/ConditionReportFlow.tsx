import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

type Condition = "dry" | "damp" | "wet" | "active_rain";
type EffortTag = "Squeegees out" | "Blowers active" | "Debris on court" | "All clear";

const CONDITIONS: { value: Condition; emoji: string; label: string; description: string }[] = [
  { value: "dry", emoji: "🟢", label: "Dry", description: "courts are playable" },
  { value: "damp", emoji: "🟡", label: "Damp", description: "drying in progress" },
  { value: "wet", emoji: "🔴", label: "Wet", description: "standing water present" },
  { value: "active_rain", emoji: "🌧️", label: "Active rain", description: "still coming down" },
];

const EFFORT_TAGS: EffortTag[] = ["Squeegees out", "Blowers active", "Debris on court", "All clear"];

const CONDITION_DEFAULTS: Record<Condition, { rainfall: number; dryMinutes: number; sky: string }> = {
  dry: { rainfall: 0, dryMinutes: 0, sky: "clear" },
  damp: { rainfall: 0, dryMinutes: 30, sky: "cloudy" },
  wet: { rainfall: 0.24, dryMinutes: 90, sky: "rain" },       // 6mm
  active_rain: { rainfall: 0.47, dryMinutes: 180, sky: "rain" }, // 12mm
};

const COOLDOWN_KEY = "courtready-anon-report";
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

function getCooldownEnd(courtId: string): number {
  try {
    const data = JSON.parse(localStorage.getItem(COOLDOWN_KEY) || "{}");
    return data[courtId] ?? 0;
  } catch {
    return 0;
  }
}

function setCooldownEnd(courtId: string) {
  try {
    const data = JSON.parse(localStorage.getItem(COOLDOWN_KEY) || "{}");
    data[courtId] = Date.now() + COOLDOWN_MS;
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export default function ConditionReportFlow({ courtId }: { courtId: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState<Condition | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<EffortTag>>(new Set());
  const [phase, setPhase] = useState<"pick" | "followup" | "done">("pick");
  const [onCooldown, setOnCooldown] = useState(false);
  const queryClient = useQueryClient();

  // Check cooldown on mount and periodically
  useEffect(() => {
    const check = () => setOnCooldown(Date.now() < getCooldownEnd(courtId));
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [courtId]);

  const submitMutation = useMutation({
    mutationFn: async ({ condition, tags }: { condition: Condition; tags: EffortTag[] }) => {
      const defaults = CONDITION_DEFAULTS[condition];
      const { error } = await supabase.from("reports").insert({
        court_id: courtId,
        rainfall: defaults.rainfall,
        estimated_dry_minutes: defaults.dryMinutes,
        sky_condition: defaults.sky,
        hindrances: tags.length > 0 ? tags : [],
        squeegee_count: tags.includes("Squeegees out") ? 1 : 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCooldownEnd(courtId);
      setOnCooldown(true);
      setPhase("done");
      queryClient.invalidateQueries({ queryKey: ["latest-report", courtId] });
      queryClient.invalidateQueries({ queryKey: ["latest-reports"] });
      queryClient.invalidateQueries({ queryKey: ["today-report-counts"] });
      queryClient.invalidateQueries({ queryKey: ["today-report-count", courtId] });
    },
  });

  // Auto-submit timer for followup phase
  useEffect(() => {
    if (phase !== "followup" || !selectedCondition) return;
    const timer = setTimeout(() => {
      submitMutation.mutate({ condition: selectedCondition, tags: Array.from(selectedTags) });
    }, 3000);
    return () => clearTimeout(timer);
  }, [phase, selectedTags, selectedCondition]);

  const handleConditionTap = useCallback((condition: Condition) => {
    setSelectedCondition(condition);
    setDrawerOpen(false);
    setPhase("followup");
  }, []);

  const handleTagTap = useCallback((tag: EffortTag) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
    // Submit immediately on any tag tap
    if (selectedCondition) {
      const updatedTags = new Set(selectedTags);
      if (updatedTags.has(tag)) updatedTags.delete(tag); else updatedTags.add(tag);
      submitMutation.mutate({ condition: selectedCondition, tags: Array.from(updatedTags) });
    }
  }, [selectedCondition, selectedTags, submitMutation]);

  const reset = useCallback(() => {
    setSelectedCondition(null);
    setSelectedTags(new Set());
    setPhase("pick");
  }, []);

  // Cooldown shows confirmation
  if (onCooldown) {
    return (
      <p className="text-center text-sm text-court-green font-medium py-2">
        ✓ Report submitted — you're helping the community.
      </p>
    );
  }

  // Followup phase - inline tags
  if (phase === "followup" && selectedCondition) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground text-center">
          Anything else? <span className="text-muted-foreground/60">(optional — one tap)</span>
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {EFFORT_TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => handleTagTap(tag)}
              disabled={submitMutation.isPending}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all active:scale-95
                ${selectedTags.has(tag)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-secondary-foreground border-border hover:border-primary/40"
                }`}
            >
              {tag}
            </button>
          ))}
        </div>
        {submitMutation.isPending && (
          <p className="text-[10px] text-muted-foreground text-center">Submitting…</p>
        )}
      </div>
    );
  }

  // Done phase (briefly shown before cooldown kicks in)
  if (phase === "done") {
    return (
      <p className="text-center text-sm text-court-green font-medium py-2">
        ✓ Report submitted — you're helping the community.
      </p>
    );
  }

  return (
    <>
      <button
        onClick={() => { reset(); setDrawerOpen(true); }}
        className="w-full py-3 rounded-full text-sm font-bold tracking-wide active:scale-[0.98] transition-all flex items-center justify-center gap-2 bg-primary text-primary-foreground"
      >
        📍 I'm here — report conditions
      </button>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="font-heading text-base">Report Court Conditions</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-3">
            {CONDITIONS.map(c => (
              <button
                key={c.value}
                onClick={() => handleConditionTap(c.value)}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-secondary active:scale-[0.98] transition-all text-left"
              >
                <span className="text-2xl">{c.emoji}</span>
                <div>
                  <span className="font-semibold text-sm text-card-foreground">{c.label}</span>
                  <span className="text-xs text-muted-foreground ml-1.5">— {c.description}</span>
                </div>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
