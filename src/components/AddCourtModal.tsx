import { useState } from "react";
import { Plus, Sun, Droplets } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SUN_LABELS: Record<number, string> = {
  1: "Heavy Shade",
  2: "Mostly Shade",
  3: "Partial Sun",
  4: "Mostly Sun",
  5: "Full Sun",
};

const DRAINAGE_LABELS: Record<number, string> = {
  1: "Poor / Pools",
  2: "Slow Drain",
  3: "Average",
  4: "Good",
  5: "Excellent",
};

function RatingPicker({ value, onChange, icon, label, descriptiveLabels }: { value: number; onChange: (v: number) => void; icon: React.ReactNode; label: string; descriptiveLabels: Record<number, string> }) {
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
            type="button"
            onClick={() => onChange(r)}
            className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${
              value === r
                ? "bg-accent text-accent-foreground"
                : "bg-secondary text-muted-foreground border border-border hover:border-navy/30"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground text-center">{descriptiveLabels[value]}</p>
    </div>
  );
}

interface AddCourtModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (courtNumber: number, sun: number, drainage: number) => void;
  existingNumbers: number[];
  isPending: boolean;
}

export default function AddCourtModal({ open, onOpenChange, onAdd, existingNumbers, isPending }: AddCourtModalProps) {
  const [courtNumber, setCourtNumber] = useState("");
  const [sun, setSun] = useState(3);
  const [drainage, setDrainage] = useState(3);
  const [error, setError] = useState("");

  const handleSubmit = () => {
    const num = parseInt(courtNumber);
    if (isNaN(num) || num < 1) {
      setError("Enter a valid court number");
      return;
    }
    if (existingNumbers.includes(num)) {
      setError(`Court ${num} already exists`);
      return;
    }
    setError("");
    onAdd(num, sun, drainage);
    setCourtNumber("");
    setSun(3);
    setDrainage(3);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Add Court</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Court Number</label>
            <input
              type="number"
              min="1"
              value={courtNumber}
              onChange={(e) => { setCourtNumber(e.target.value); setError(""); }}
              placeholder="e.g. 5"
              className="w-full bg-secondary text-foreground rounded-lg px-3 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
            {error && <p className="text-[10px] text-destructive mt-1">{error}</p>}
          </div>

          <RatingPicker value={sun} onChange={setSun} icon={<Sun className="w-3.5 h-3.5 text-court-amber" />} label="Sun Exposure" descriptiveLabels={SUN_LABELS} />
          <RatingPicker value={drainage} onChange={setDrainage} icon={<Droplets className="w-3.5 h-3.5 text-court-green" />} label="Drainage" descriptiveLabels={DRAINAGE_LABELS} />

          <Button onClick={handleSubmit} disabled={isPending || !courtNumber.trim()} className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="w-4 h-4" />
            {isPending ? "Adding..." : "Add Court"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
