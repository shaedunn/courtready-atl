import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Pencil, Sun, Droplets, Save, X, Plus, AlertTriangle, ShieldAlert } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import type { SubCourt } from "@/components/court/SubCourtSelector";

const SUN_LABELS: Record<number, string> = { 1: "Full Shade", 2: "Mostly Shade", 3: "Mixed", 4: "Mostly Sun", 5: "Full Sun" };
const DRAIN_LABELS: Record<number, string> = { 1: "Poor", 2: "Below Avg", 3: "Average", 4: "Good", 5: "Excellent" };

export default function SubCourtEditor({ courtId, courtCount }: { courtId: string; courtCount: number }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editingCourt, setEditingCourt] = useState<SubCourt | null>(null);
  const [sunVal, setSunVal] = useState(3);
  const [drainVal, setDrainVal] = useState(3);
  const [noteVal, setNoteVal] = useState("");
  const [hazardVal, setHazardVal] = useState("");

  const { data: subCourts = [] } = useQuery<SubCourt[]>({
    queryKey: ["sub-courts", courtId],
    queryFn: async () => {
      console.log("Fetching for Facility:", courtId);
      const facilityQuery = await (supabase.from("sub_courts") as any)
        .select("*")
        .eq("facility_id", courtId)
        .order("court_number");

      if (!facilityQuery.error) {
        console.log("Raw Data Received:", facilityQuery.data ?? []);
        return (facilityQuery.data ?? []) as SubCourt[];
      }

      const { data, error } = await supabase
        .from("sub_courts")
        .select("*")
        .eq("court_id", courtId)
        .order("court_number");
      if (error) {
        console.error(`[SubCourtEditor] Query error:`, error);
        throw error;
      }
      console.log("Raw Data Received:", data ?? []);
      return data as unknown as SubCourt[];
    },
  });

  useEffect(() => {
    console.log("Fetching for Facility:", courtId);
    console.log("Raw Data Received:", subCourts);
  }, [courtId, subCourts]);

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!editingCourt) return;
      const { error } = await supabase
        .from("sub_courts")
        .update({
          sun_exposure: sunVal,
          drainage: drainVal,
          permanent_note: noteVal.trim() || null,
          hazard_description: hazardVal.trim() || null,
        } as any)
        .eq("id", editingCourt.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sub-courts", courtId] });
      setEditingCourt(null);
    },
  });

  const addCourtMutation = useMutation({
    mutationFn: async (courtNumber: number) => {
      const facilityInsert = await (supabase.from("sub_courts") as any).insert({
        facility_id: courtId,
        court_number: courtNumber,
        sun_exposure: 3,
        drainage: 3,
      });
      if (!facilityInsert.error) return;

      const { error } = await supabase.from("sub_courts").insert({
        court_id: courtId,
        court_number: courtNumber,
        sun_exposure: 3,
        drainage: 3,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sub-courts", courtId] });
    },
  });

  const startEdit = (sc: SubCourt) => {
    setEditingCourt(sc);
    setSunVal(sc.sun_exposure);
    setDrainVal(sc.drainage);
    setNoteVal(sc.permanent_note || "");
    setHazardVal(sc.hazard_description || "");
  };

  const seedAllMutation = useMutation({
    mutationFn: async () => {
      const rowsFacility = Array.from({ length: courtCount }, (_, i) => ({
        facility_id: courtId,
        court_number: i + 1,
        sun_exposure: 3,
        drainage: 3,
      }));

      const facilityInsert = await (supabase.from("sub_courts") as any).insert(rowsFacility);
      if (!facilityInsert.error) return;

      const rowsCourt = Array.from({ length: courtCount }, (_, i) => ({
        court_id: courtId,
        court_number: i + 1,
        sun_exposure: 3,
        drainage: 3,
      }));

      const { error } = await supabase.from("sub_courts").insert(rowsCourt as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sub-courts", courtId] });
    },
  });

  const existingNumbers = subCourts.map((sc) => sc.court_number);
  const missingNumbers = Array.from({ length: courtCount }, (_, i) => i + 1).filter(
    (n) => !existingNumbers.includes(n)
  );

  if (!editing) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit Court Ratings
        </button>
        {subCourts.length === 0 && courtCount > 0 && (
          <button
            onClick={() => seedAllMutation.mutate()}
            disabled={seedAllMutation.isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            {seedAllMutation.isPending ? "Adding..." : `Add Courts 1–${courtCount}`}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg p-4 border border-border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          Court Ratings & Notes
        </h3>
        <button onClick={() => { setEditing(false); setEditingCourt(null); }} className="p-1 rounded hover:bg-secondary transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* List existing sub-courts */}
      <div className="space-y-2">
        {subCourts.map((sc) =>
          editingCourt?.id === sc.id ? (
            <div key={sc.id} className="bg-secondary/50 rounded-lg p-3 space-y-3 border border-primary/20">
              <p className="text-xs font-medium">Court {sc.court_number}</p>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Sun className="w-3 h-3" /> Sun Exposure
                  </span>
                  <span className="text-[10px] font-medium">{sunVal} — {SUN_LABELS[sunVal]}</span>
                </div>
                <Slider value={[sunVal]} onValueChange={([v]) => setSunVal(v)} min={1} max={5} step={1} className="w-full" />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Droplets className="w-3 h-3" /> Drainage
                  </span>
                  <span className="text-[10px] font-medium">{drainVal} — {DRAIN_LABELS[drainVal]}</span>
                </div>
                <Slider value={[drainVal]} onValueChange={([v]) => setDrainVal(v)} min={1} max={5} step={1} className="w-full" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Court Notes (Tribal Knowledge)</label>
                <Textarea
                  value={noteVal}
                  onChange={(e) => setNoteVal(e.target.value)}
                  placeholder="e.g. Bird bath on deuce side, retains water 20% longer"
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-destructive flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> Safety Hazard
                </label>
                <Textarea
                  value={hazardVal}
                  onChange={(e) => setHazardVal(e.target.value)}
                  placeholder="e.g. Moss on deuce side - slip risk when damp"
                  rows={2}
                  className="text-xs resize-none border-destructive/30"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setEditingCourt(null)}
                  className="flex-1 text-xs py-1.5 rounded-lg bg-secondary text-secondary-foreground border border-border hover:brightness-110 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => upsertMutation.mutate()}
                  disabled={upsertMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <Save className="w-3 h-3" />
                  {upsertMutation.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <button
              key={sc.id}
              onClick={() => startEdit(sc)}
              className="w-full text-left bg-secondary/30 rounded-lg p-3 border border-border hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Court {sc.court_number}</span>
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </div>
              <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                <span>☀ {sc.sun_exposure}/5</span>
                <span>💧 {sc.drainage}/5</span>
              </div>
              {sc.hazard_description && (
                <div className="flex items-start gap-1 mt-1.5">
                  <ShieldAlert className="w-3 h-3 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-destructive line-clamp-2">{sc.hazard_description}</p>
                </div>
              )}
              {sc.permanent_note && !sc.hazard_description && (
                <div className="flex items-start gap-1 mt-1.5">
                  <AlertTriangle className="w-3 h-3 text-court-amber flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-court-amber line-clamp-2">{sc.permanent_note}</p>
                </div>
              )}
            </button>
          )
        )}
      </div>

      {/* Add missing courts */}
      {missingNumbers.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground">Add courts:</p>
          <div className="flex flex-wrap gap-1.5">
            {missingNumbers.map((n) => (
              <button
                key={n}
                onClick={() => addCourtMutation.mutate(n)}
                disabled={addCourtMutation.isPending}
                className="text-[10px] px-2.5 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors flex items-center gap-1"
              >
                <Plus className="w-2.5 h-2.5" /> Court {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
