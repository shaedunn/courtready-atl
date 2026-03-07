import { useEffect } from "react";
import { ArrowLeft, CheckCircle2, Droplets, Scissors, AlertTriangle, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Instructions() {
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem("courtready-visited-instructions", "true");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border px-4">
        <div className="max-w-lg mx-auto py-3 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-sm">How CourtReady Works</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Towel-Roll Protocol */}
        <section className="bg-card rounded-lg p-5 border border-border card-glow space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-court-green" />
            The Towel-Roll Protocol
          </h2>
          <div className="bg-court-green/10 rounded-lg p-4 border border-court-green/20">
            <p className="text-sm font-semibold text-court-green text-center">
              Playable = Lines Wiped + No Standing Water
            </p>
          </div>
           <p className="text-xs text-muted-foreground leading-relaxed">
             Standing water is the enemy, but dampness is manageable. Once you have pushed standing water off, use the Towel-Roll technique on the surface and wipe the lines. If the lines are dry, the court is marked <span className="font-medium text-foreground">Playable</span> for this pilot.
           </p>
        </section>

        {/* Squeegee Best Practices */}
        <section className="bg-card rounded-lg p-5 border border-border card-glow space-y-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Scissors className="w-4 h-4 text-primary" />
            Squeegee Best Practices
          </h2>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">1.</span>
              Push water toward the edges and low spots — never toward the net.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">2.</span>
              Overlap each pass by 50% to prevent leaving wet streaks.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">3.</span>
              After squeegeeing, tap "I am Squeegeeing This Court" — the dry timer recalculates automatically (≈40% reduction).
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">4.</span>
              One squeegee pass on a standard court takes ≈8–12 minutes.
            </li>
          </ul>
        </section>

        {/* Captain's Report Guide */}
        <section className="bg-card rounded-lg p-5 border border-border card-glow space-y-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Droplets className="w-4 h-4 text-court-amber" />
            Submitting a Captain's Report
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            When you arrive at a wet court, submit a Captain's Report with the rainfall amount and sky conditions. The app calculates an estimated dry time using weather data, court drainage, and sun exposure ratings.
          </p>
          <div className="flex items-start gap-2 bg-secondary/50 rounded-lg p-3 border border-border">
            <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Weather data (temperature, humidity, wind) is fetched automatically when your court has GPS coordinates set.
            </p>
          </div>
        </section>

        {/* Verification System */}
        <section className="bg-card rounded-lg p-5 border border-border card-glow space-y-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-court-green" />
            The Verification System
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Anyone can verify the current status of a court by tapping one of three options:
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-destructive" />
              <span className="font-medium text-foreground">Still Wet</span>
              <span className="text-muted-foreground">— standing water visible</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-court-amber" />
              <span className="font-medium text-foreground">Squeegee Needed</span>
              <span className="text-muted-foreground">— damp but could be helped</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-court-green" />
              <span className="font-medium text-foreground">Playable</span>
              <span className="text-muted-foreground">— passes the Towel-Roll test</span>
            </div>
          </div>
        </section>

        {/* Hazard Warnings */}
        <section className="bg-card rounded-lg p-5 border border-border card-glow space-y-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Safety Hazards
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Facility admins can flag individual courts with safety hazards (e.g., moss on baseline, cracked surface). These appear as red warning banners on the court detail page. Always check before playing.
          </p>
        </section>
      </main>
    </div>
  );
}
