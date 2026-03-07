import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Plus, AlertTriangle, Sun, Droplets, StickyNote } from "lucide-react";
import { supabase, type SovereignCourt } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import AddCourtModal from "@/components/AddCourtModal";
import type { SubCourtRow as SubCourt } from "@/types/supabase";

const RATING_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Below Avg",
  3: "Average",
  4: "Good",
  5: "Excellent",
};

function RatingSelector({ value, onChange, icon, label }: { value: number; onChange: (v: number) => void; icon: React.ReactNode; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((r) => (
          <button
            key={r}
            onClick={() => onChange(r)}
            className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${
              value === r
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground border border-border hover:border-primary/30"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground text-center">{RATING_LABELS[value]}</p>
    </div>
  );
}

export default function FacilityAdmin() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: court, isLoading: courtLoading } = useQuery<SovereignCourt>({
    queryKey: ["court", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("courts").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as unknown as SovereignCourt;
    },
    enabled: !!id,
  });

  const { data: subCourts = [], isLoading: subCourtsLoading } = useQuery<SubCourt[]>({
    queryKey: ["sub-courts", id],
    queryFn: async () => {
      try {
        console.log("Fetching for Facility:", id);

        const { data, error } = await (supabase.from("sub_courts") as any)
          .select("*")
          .eq("facility_id", id!)
          .order("court_number");

        if (error) throw error;
        console.log("Raw Data Received:", data ?? []);
        return (data ?? []) as SubCourt[];
      } catch (error) {
        console.error("[FacilityAdmin] Failed to fetch sub_courts:", error);
        throw error;
      }
    },
    enabled: !!id,
  });

  // Local editable state
  const [editState, setEditState] = useState<Record<number, { sun: number; drain: number; note: string }>>({});
  const [selectedForBulk, setSelectedForBulk] = useState<Set<number>>(new Set());
  const [bulkSun, setBulkSun] = useState(3);
  const [bulkDrain, setBulkDrain] = useState(3);
  const [newCourtNumbers, setNewCourtNumbers] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  // Sync edit state when subCourts load
  useEffect(() => {
    console.log("Fetching for Facility:", id);
    console.log("Raw Data Received:", subCourts);

    if (subCourts.length > 0) {
      const state: Record<number, { sun: number; drain: number; note: string }> = {};
      for (const sc of subCourts) {
        state[sc.court_number] = { sun: sc.sun_exposure, drain: sc.drainage, note: sc.permanent_note || "" };
      }
      setEditState(state);
    }
  }, [id, subCourts]);

  // Add courts mutation
  const addCourtsMutation = useMutation({
    mutationFn: async (numbers: number[]) => {
      const inserts = numbers.map((n) => ({
        facility_id: id!,
        court_number: n,
        sun_exposure: 3,
        drainage: 3,
      }));

      const { error } = await (supabase.from("sub_courts") as any).insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sub-courts", id] });
      setNewCourtNumbers("");
    },
  });

  // Add single court with ratings via modal
  const addSingleCourtMutation = useMutation({
    mutationFn: async ({ courtNumber, sun, drainage }: { courtNumber: number; sun: number; drainage: number }) => {
      const { error } = await (supabase.from("sub_courts") as any).insert({
        facility_id: id!,
        court_number: courtNumber,
        sun_exposure: sun,
        drainage: drainage,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sub-courts", id] });
      setShowAddModal(false);
    },
  });

  // Save individual court
  const saveMutation = useMutation({
    mutationFn: async ({ courtNumber, sun, drain, note }: { courtNumber: number; sun: number; drain: number; note: string }) => {
      const { error } = await (supabase.from("sub_courts") as any)
        .update({ sun_exposure: sun, drainage: drain, permanent_note: note || null })
        .eq("facility_id", id!)
        .eq("court_number", courtNumber);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sub-courts", id] });
    },
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async () => {
      const numbers = Array.from(selectedForBulk);
      for (const n of numbers) {
        const { error } = await (supabase.from("sub_courts") as any)
          .update({ sun_exposure: bulkSun, drainage: bulkDrain })
          .eq("facility_id", id!)
          .eq("court_number", n);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sub-courts", id] });
      setSelectedForBulk(new Set());
    },
  });

  const handleAddCourts = () => {
    const numbers = newCourtNumbers
      .split(",")
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);
    const existing = new Set(subCourts.map((sc) => sc.court_number));
    const fresh = numbers.filter((n) => !existing.has(n));
    if (fresh.length > 0) addCourtsMutation.mutate(fresh);
  };

  const toggleBulkSelect = (n: number) => {
    setSelectedForBulk((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedForBulk.size === subCourts.length) {
      setSelectedForBulk(new Set());
    } else {
      setSelectedForBulk(new Set(subCourts.map((sc) => sc.court_number)));
    }
  };

  const isLoading = courtLoading || subCourtsLoading;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border px-4">
        <div className="max-w-lg mx-auto py-3 flex items-center gap-3">
          <button onClick={() => navigate(`/court/${id}`)} className="p-1.5 -ml-1.5 rounded-lg hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm truncate">{court?.name || "Loading..."}</h1>
            <p className="text-xs text-muted-foreground">Facility Setup</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ) : (
          <>
            {/* Add Court Modal */}
            <AddCourtModal
              open={showAddModal}
              onOpenChange={setShowAddModal}
              onAdd={(num, sun, drain) => addSingleCourtMutation.mutate({ courtNumber: num, sun, drainage: drain })}
              existingNumbers={subCourts.map((sc) => sc.court_number)}
              isPending={addSingleCourtMutation.isPending}
            />

            {/* Add Courts Section */}
            <div className="bg-card rounded-lg p-4 border border-border card-glow space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Add Court Numbers</h3>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Court
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCourtNumbers}
                  onChange={(e) => setNewCourtNumbers(e.target.value)}
                  placeholder="e.g. 1, 2, 3, 4"
                  className="flex-1 bg-secondary text-foreground rounded-lg px-3 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50"
                />
                <button
                  onClick={handleAddCourts}
                  disabled={addCourtsMutation.isPending || !newCourtNumbers.trim()}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Bulk
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">Use the <button onClick={() => setShowAddModal(true)} className="text-primary font-medium underline">+ Add Court</button> button for individual courts with ratings, or bulk-add with comma-separated numbers above.</p>
            </div>

            {/* Bulk Update */}
            {subCourts.length > 0 && (
              <div className="bg-card rounded-lg p-4 border border-border card-glow space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Bulk Update</h3>
                  <button onClick={selectAll} className="text-[10px] text-primary font-medium hover:underline">
                    {selectedForBulk.size === subCourts.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {subCourts.map((sc) => (
                    <button
                      key={sc.court_number}
                      onClick={() => toggleBulkSelect(sc.court_number)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        selectedForBulk.has(sc.court_number)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-muted-foreground border-border hover:border-primary/30"
                      }`}
                    >
                      Court {sc.court_number}
                    </button>
                  ))}
                </div>
                {selectedForBulk.size > 0 && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <RatingSelector value={bulkSun} onChange={setBulkSun} icon={<Sun className="w-3.5 h-3.5 text-court-amber" />} label="Sun Exposure" />
                    <RatingSelector value={bulkDrain} onChange={setBulkDrain} icon={<Droplets className="w-3.5 h-3.5 text-primary" />} label="Drainage" />
                    <button
                      onClick={() => bulkUpdateMutation.mutate()}
                      disabled={bulkUpdateMutation.isPending}
                      className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {bulkUpdateMutation.isPending ? "Updating..." : `Update ${selectedForBulk.size} Court${selectedForBulk.size > 1 ? "s" : ""}`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Individual Courts */}
            {subCourts.map((sc) => {
              const state = editState[sc.court_number] || { sun: sc.sun_exposure, drain: sc.drainage, note: sc.permanent_note || "" };
              const hasChanges =
                state.sun !== sc.sun_exposure ||
                state.drain !== sc.drainage ||
                (state.note || "") !== (sc.permanent_note || "");

              return (
                <div key={sc.id} className="bg-card rounded-lg p-4 border border-border card-glow space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Court {sc.court_number}</h3>
                    {sc.permanent_note && (
                      <Badge variant="outline" className="text-[10px] gap-1 border-court-amber/30 text-court-amber">
                        <AlertTriangle className="w-3 h-3" /> Has Note
                      </Badge>
                    )}
                  </div>

                  <RatingSelector
                    value={state.sun}
                    onChange={(v) => setEditState((prev) => ({ ...prev, [sc.court_number]: { ...state, sun: v } }))}
                    icon={<Sun className="w-3.5 h-3.5 text-court-amber" />}
                    label="Sun Exposure"
                  />
                  <RatingSelector
                    value={state.drain}
                    onChange={(v) => setEditState((prev) => ({ ...prev, [sc.court_number]: { ...state, drain: v } }))}
                    icon={<Droplets className="w-3.5 h-3.5 text-primary" />}
                    label="Drainage"
                  />

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Permanent Note</span>
                    </div>
                    <textarea
                      value={state.note}
                      onChange={(e) => setEditState((prev) => ({ ...prev, [sc.court_number]: { ...state, note: e.target.value } }))}
                      placeholder='e.g. "Bird bath near baseline, retains water 20% longer"'
                      rows={2}
                      className="w-full bg-secondary text-foreground rounded-lg px-3 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
                    />
                  </div>

                  {hasChanges && (
                    <button
                      onClick={() => saveMutation.mutate({ courtNumber: sc.court_number, sun: state.sun, drain: state.drain, note: state.note })}
                      disabled={saveMutation.isPending}
                      className="w-full flex items-center justify-center gap-1.5 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {saveMutation.isPending ? "Saving..." : "Save Changes"}
                    </button>
                  )}
                </div>
              );
            })}

            {subCourts.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm text-muted-foreground">No individual courts configured yet.</p>
                <p className="text-xs text-muted-foreground">Initialize the first 4 courts to start rating each one.</p>
                <button
                  onClick={() => addCourtsMutation.mutate([1, 2, 3, 4])}
                  disabled={addCourtsMutation.isPending}
                  className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {addCourtsMutation.isPending ? "Initializing..." : "Initialize 4 Courts for this Facility"}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
