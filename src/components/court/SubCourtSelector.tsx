import { AlertTriangle, ShieldAlert } from "lucide-react";

export type SubCourt = {
  id: string;
  court_id: string;
  court_number: number;
  sun_exposure: number;
  drainage: number;
  permanent_note: string | null;
  hazard_description: string | null;
};

export default function SubCourtSelector({
  subCourts,
  selectedNumber,
  onSelect,
}: {
  subCourts: SubCourt[];
  selectedNumber: number | null;
  onSelect: (n: number | null) => void;
}) {
  if (subCourts.length === 0) return null;

  const selected = selectedNumber !== null ? subCourts.find((sc) => sc.court_number === selectedNumber) : null;

  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground block mb-1.5">Specific Court</label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            selectedNumber === null
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-secondary text-muted-foreground border-border hover:border-primary/30"
          }`}
        >
          Facility Default
        </button>
        {subCourts.map((sc) => (
          <button
            key={sc.court_number}
            type="button"
            onClick={() => onSelect(sc.court_number)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              selectedNumber === sc.court_number
                ? "bg-primary text-primary-foreground border-primary"
                : sc.hazard_description
                ? "bg-destructive/10 text-destructive border-destructive/20 hover:border-destructive/40"
                : "bg-secondary text-muted-foreground border-border hover:border-primary/30"
            }`}
          >
            Court {sc.court_number}
            {sc.hazard_description && " 🔴"}
            {!sc.hazard_description && sc.permanent_note && " ⚠"}
          </button>
        ))}
      </div>

      {/* Hazard warning (red) */}
      {selected?.hazard_description && (
        <div className="flex items-start gap-2 bg-destructive/10 rounded-lg p-3 border border-destructive/20">
          <ShieldAlert className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-destructive">Safety Hazard</p>
            <p className="text-xs text-destructive/80">{selected.hazard_description}</p>
          </div>
        </div>
      )}

      {/* Permanent note warning (amber) */}
      {selected?.permanent_note && !selected?.hazard_description && (
        <div className="flex items-start gap-2 bg-court-amber/10 rounded-lg p-3 border border-court-amber/20">
          <AlertTriangle className="w-4 h-4 text-court-amber flex-shrink-0 mt-0.5" />
          <p className="text-xs text-court-amber">{selected.permanent_note}</p>
        </div>
      )}
    </div>
  );
}
export default function SubCourtSelector({
  subCourts,
  selectedNumber,
  onSelect,
}: {
  subCourts: SubCourt[];
  selectedNumber: number | null;
  onSelect: (n: number | null) => void;
}) {
  if (subCourts.length === 0) return null;

  const selected = selectedNumber !== null ? subCourts.find((sc) => sc.court_number === selectedNumber) : null;

  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground block mb-1.5">Specific Court</label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            selectedNumber === null
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-secondary text-muted-foreground border-border hover:border-primary/30"
          }`}
        >
          Facility Default
        </button>
        {subCourts.map((sc) => (
          <button
            key={sc.court_number}
            type="button"
            onClick={() => onSelect(sc.court_number)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              selectedNumber === sc.court_number
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary text-muted-foreground border-border hover:border-primary/30"
            }`}
          >
            Court {sc.court_number}
            {sc.permanent_note && " ⚠"}
          </button>
        ))}
      </div>

      {/* Show permanent note warning */}
      {selected?.permanent_note && (
        <div className="flex items-start gap-2 bg-court-amber/10 rounded-lg p-3 border border-court-amber/20">
          <AlertTriangle className="w-4 h-4 text-court-amber flex-shrink-0 mt-0.5" />
          <p className="text-xs text-court-amber">{selected.permanent_note}</p>
        </div>
      )}
    </div>
  );
}
