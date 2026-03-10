import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

type Condition = "dry" | "damp" | "wet" | "active_rain";
type EffortTag = "Squeegees out" | "Blowers active" | "Debris on court" | "Bird-bath flooding" | "All clear";

const CONDITIONS: { value: Condition; emoji: string; label: string; description: string }[] = [
  { value: "dry", emoji: "🟢", label: "Dry", description: "courts are playable" },
  { value: "damp", emoji: "🟡", label: "Damp", description: "drying in progress" },
  { value: "wet", emoji: "🔴", label: "Wet", description: "standing water present" },
  { value: "active_rain", emoji: "🌧️", label: "Active rain", description: "still coming down" },
];

const EFFORT_TAGS: EffortTag[] = ["Squeegees out", "Blowers active", "Debris on court", "Bird-bath flooding", "All clear"];

const CONDITION_DEFAULTS: Record<Condition, { rainfall: number; dryMinutes: number; sky: string }> = {
  dry: { rainfall: 0, dryMinutes: 0, sky: "clear" },
  damp: { rainfall: 0, dryMinutes: 30, sky: "cloudy" },
  wet: { rainfall: 0.24, dryMinutes: 90, sky: "rain" },
  active_rain: { rainfall: 0.47, dryMinutes: 180, sky: "rain" },
};

interface ConditionReportFlowProps {
  courtId: string;
  variant?: "primary" | "secondary";
}

export default function ConditionReportFlow({ courtId, variant = "primary" }: ConditionReportFlowProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<EffortTag>>(new Set());
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [buttonLabel, setButtonLabel] = useState("📍 I'm here — report conditions");
  const [tagConfirmation, setTagConfirmation] = useState(false);
  const lastReportId = useRef<string | null>(null);
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (labelTimerRef.current) clearTimeout(labelTimerRef.current);
      if (tagConfirmTimerRef.current) clearTimeout(tagConfirmTimerRef.current);
    };
  }, []);

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["latest-report", courtId] });
    queryClient.invalidateQueries({ queryKey: ["latest-reports"] });
    queryClient.invalidateQueries({ queryKey: ["today-report-counts"] });
    queryClient.invalidateQueries({ queryKey: ["today-report-count", courtId] });
  }, [queryClient, courtId]);

  const submitMutation = useMutation({
    mutationFn: async ({ condition, tags }: { condition: Condition; tags: EffortTag[] }) => {
      const defaults = CONDITION_DEFAULTS[condition];
      const { data, error } = await supabase.from("reports").insert({
        court_id: courtId,
        rainfall: defaults.rainfall,
        estimated_dry_minutes: defaults.dryMinutes,
        sky_condition: defaults.sky,
        hindrances: tags.length > 0 ? tags : [],
        squeegee_count: tags.includes("Squeegees out") ? 1 : 0,
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      lastReportId.current = data.id;
      setHasSubmitted(true);
      setDrawerOpen(false);

      // Temporary label change
      setButtonLabel("✓ Report received — tap to update");
      if (labelTimerRef.current) clearTimeout(labelTimerRef.current);
      labelTimerRef.current = setTimeout(() => {
        setButtonLabel("📍 I'm here — report conditions");
      }, 3000);

      invalidateQueries();
    },
  });

  const tagMutation = useMutation({
    mutationFn: async (tags: EffortTag[]) => {
      if (!lastReportId.current) return;
      const { error } = await supabase.from("reports").update({
        hindrances: tags,
        squeegee_count: tags.includes("Squeegees out") ? 1 : 0,
      }).eq("id", lastReportId.current);
      if (error) throw error;
    },
    onSuccess: () => {
      // Show brief confirmation
      setTagConfirmation(true);
      if (tagConfirmTimerRef.current) clearTimeout(tagConfirmTimerRef.current);
      tagConfirmTimerRef.current = setTimeout(() => setTagConfirmation(false), 2000);
      invalidateQueries();
    },
  });

  const handleConditionTap = useCallback((condition: Condition) => {
    submitMutation.mutate({ condition, tags: [] });
  }, [submitMutation]);

  const handleTagTap = useCallback((tag: EffortTag) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      // Fire update with new set
      tagMutation.mutate(Array.from(next));
      return next;
    });
  }, [tagMutation]);

  const buttonClass = variant === "secondary"
    ? "w-full py-3 rounded-lg text-sm font-bold tracking-wide active:scale-[0.98] transition-all flex items-center justify-center gap-2 border-2 bg-transparent"
    : "w-full py-3 rounded-full text-sm font-bold tracking-wide active:scale-[0.98] transition-all flex items-center justify-center gap-2 bg-primary text-primary-foreground";

  return (
    <div className="space-y-3">
      <button
        onClick={() => setDrawerOpen(true)}
        disabled={submitMutation.isPending}
        className={buttonClass}
        style={variant === "secondary" ? { borderColor: "#C9F000", color: "hsl(var(--foreground))" } : undefined}
      >
        {buttonLabel}
      </button>

      {hasSubmitted && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground text-center">
            Anything else? <span className="text-muted-foreground/60">(optional — one tap)</span>
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {EFFORT_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => handleTagTap(tag)}
                disabled={tagMutation.isPending}
                className={`px-4 py-2.5 min-h-[44px] rounded-full text-xs font-medium border transition-all active:scale-95
                  ${selectedTags.has(tag)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-secondary-foreground border-border hover:border-primary/40"
                  }`}
              >
                {tag}
              </button>
            ))}
          </div>
          {tagConfirmation && (
            <p className="text-[11px] text-center text-court-green font-medium animate-in fade-in duration-200">
              Thanks — your update helps the community.
            </p>
          )}
        </div>
      )}

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
                disabled={submitMutation.isPending}
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
    </div>
  );
}
