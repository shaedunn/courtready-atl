import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight } from "lucide-react";

const TOUR_KEY = "courtready-tour-complete";

interface TourStep {
  selector: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="pulse"]',
    title: "The Pulse",
    description: "Start here for the Playable Protocol. This shows live court status at a glance.",
    position: "bottom",
  },
  {
    selector: '[data-tour="sub-court-editor"]',
    title: "Sub-Court Editor",
    description: "Calibrate your court's physics — Sun exposure & Drainage ratings for each individual court.",
    position: "top",
  },
  {
    selector: '[data-tour="hazard-button"]',
    title: "Safety Hazards",
    description: "Flag safety risks for the community. Hazards appear as alerts for all users.",
    position: "top",
  },
];

export function shouldShowTour(): boolean {
  return !localStorage.getItem(TOUR_KEY);
}

export function markTourComplete() {
  localStorage.setItem(TOUR_KEY, "true");
}

export default function GuidedTour({ onComplete }: { onComplete: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);

  const step = TOUR_STEPS[currentStep];

  const positionTooltip = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      setVisible(true);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      if (currentStep < TOUR_STEPS.length - 1) {
        setCurrentStep((s) => s + 1);
      } else {
        finish();
      }
    }
  }, [step, currentStep]);

  useEffect(() => {
    const timer = setTimeout(positionTooltip, 400);
    return () => clearTimeout(timer);
  }, [positionTooltip]);

  useEffect(() => {
    const handleResize = () => positionTooltip();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [positionTooltip]);

  const finish = () => {
    markTourComplete();
    setVisible(false);
    onComplete();
  };

  const next = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setVisible(false);
      setTimeout(() => setCurrentStep((s) => s + 1), 200);
    } else {
      finish();
    }
  };

  if (!visible || !targetRect || !step) return null;

  const tooltipStyle: React.CSSProperties = {};
  const arrowStyle: React.CSSProperties = {};
  const gap = 12;

  if (step.position === "bottom") {
    tooltipStyle.top = targetRect.bottom + gap;
    tooltipStyle.left = Math.max(16, targetRect.left + targetRect.width / 2 - 140);
    arrowStyle.top = -6;
    arrowStyle.left = Math.min(140, targetRect.left + targetRect.width / 2 - (tooltipStyle.left as number));
  } else if (step.position === "top") {
    tooltipStyle.bottom = window.innerHeight - targetRect.top + gap;
    tooltipStyle.left = Math.max(16, targetRect.left + targetRect.width / 2 - 140);
    arrowStyle.bottom = -6;
    arrowStyle.left = Math.min(140, targetRect.left + targetRect.width / 2 - (tooltipStyle.left as number));
  }

  if (typeof tooltipStyle.left === "number") {
    tooltipStyle.left = Math.min(tooltipStyle.left, window.innerWidth - 296);
  }

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-foreground/40 transition-opacity duration-300" onClick={finish} />

      <div
        className="absolute rounded-lg ring-2 ring-navy transition-all duration-300"
        style={{
          top: targetRect.top - 4,
          left: targetRect.left - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
          backgroundColor: "transparent",
          boxShadow: "0 0 0 9999px hsla(var(--foreground) / 0.4)",
        }}
      />

      <div
        className="absolute w-[280px] bg-card border border-border rounded-xl p-4 shadow-2xl animate-fade-in z-[101]"
        style={tooltipStyle}
      >
        <div
          className="absolute w-3 h-3 bg-card border-l border-t border-border rotate-45"
          style={{
            ...arrowStyle,
            ...(step.position === "bottom" ? { borderBottom: "none", borderRight: "none" } : { borderTop: "none", borderLeft: "none", transform: "rotate(225deg)" }),
          }}
        />

        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="text-sm font-bold text-foreground">{step.title}</h4>
          <button onClick={finish} className="p-0.5 rounded hover:bg-secondary transition-colors flex-shrink-0">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">{step.description}</p>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/60">
            {currentStep + 1}/{TOUR_STEPS.length}
          </span>
          <button
            onClick={next}
            className="flex items-center gap-1 text-xs font-semibold text-navy hover:text-navy/80 transition-colors"
          >
            {currentStep < TOUR_STEPS.length - 1 ? (
              <>Next <ChevronRight className="w-3.5 h-3.5" /></>
            ) : (
              "Done"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
