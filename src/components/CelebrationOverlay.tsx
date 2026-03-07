import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";

const FIRST_REPORT_KEY = "courtready-first-report-celebrated";

export function shouldCelebrate(): boolean {
  return !localStorage.getItem(FIRST_REPORT_KEY);
}

export function markCelebrated() {
  localStorage.setItem(FIRST_REPORT_KEY, "true");
}

export default function CelebrationOverlay({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 100);
    const t2 = setTimeout(() => setPhase("exit"), 2800);
    const t3 = setTimeout(onDone, 3400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center pointer-events-none transition-opacity duration-500 ${
        phase === "exit" ? "opacity-0" : phase === "enter" ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Particles */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              left: `${10 + Math.random() * 80}%`,
              top: `${10 + Math.random() * 80}%`,
              backgroundColor: i % 3 === 0
                ? "hsl(var(--primary))"
                : i % 3 === 1
                ? "hsl(var(--court-amber))"
                : "hsl(var(--foreground) / 0.3)",
              animation: `celebration-particle ${1.5 + Math.random() * 1.5}s ease-out ${Math.random() * 0.5}s forwards`,
              opacity: 0,
            }}
          />
        ))}
      </div>

      {/* Central badge */}
      <div
        className={`flex flex-col items-center gap-3 transition-all duration-700 ${
          phase === "hold" ? "scale-100 opacity-100" : "scale-75 opacity-0"
        }`}
      >
        <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center shadow-[0_0_40px_hsl(var(--primary)/0.4)]">
          <Sparkles className="w-10 h-10 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">Data Quality Improved!</p>
          <p className="text-xs text-muted-foreground mt-1">Your first report helps calibrate the physics engine.</p>
        </div>
      </div>
    </div>
  );
}
