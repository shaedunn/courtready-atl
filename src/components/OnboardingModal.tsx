import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Droplets, Shield } from "lucide-react";

const ONBOARDED_KEY = "courtready-onboarded";
const CONTRIBUTOR_KEY = "courtready-is-contributor";

export function isContributor(): boolean {
  return localStorage.getItem(CONTRIBUTOR_KEY) === "true";
}

export default function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"welcome" | "contributor">("welcome");
  const navigate = useNavigate();

  useEffect(() => {
    if (!localStorage.getItem(ONBOARDED_KEY)) {
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(ONBOARDED_KEY, "true");
    setOpen(false);
  };

  const handleContributorChoice = (yes: boolean) => {
    if (yes) {
      localStorage.setItem(CONTRIBUTOR_KEY, "true");
    }
    localStorage.setItem(ONBOARDED_KEY, "true");
    setOpen(false);
    navigate("/instructions");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="max-w-sm mx-auto rounded-xl">
        {step === "welcome" && (
          <>
            <DialogHeader className="items-center text-center">
              <div className="w-12 h-12 rounded-full bg-navy/10 flex items-center justify-center mb-2">
                <Droplets className="w-6 h-6 text-navy" />
              </div>
              <DialogTitle className="text-base">Welcome to the CourtReady Pilot</DialogTitle>
              <DialogDescription className="text-xs leading-relaxed pt-2">
                We are calibrating the Physics Engine for Atlanta. Please read the Pilot Protocol to understand our new "Playable" standards and the Towel-Roll technique.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={() => setStep("contributor")} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                Continue
              </Button>
              <Button variant="ghost" onClick={dismiss} className="w-full text-xs text-muted-foreground">
                Got it, let's play
              </Button>
            </div>
          </>
        )}

        {step === "contributor" && (
          <>
            <DialogHeader className="items-center text-center">
              <div className="w-12 h-12 rounded-full bg-navy/10 flex items-center justify-center mb-2">
                <Shield className="w-6 h-6 text-navy" />
              </div>
              <DialogTitle className="text-base">Will you be contributing?</DialogTitle>
              <DialogDescription className="text-xs leading-relaxed pt-2">
                Will you be contributing court observations? These help calibrate the Atlanta engine for everyone. You'll earn a <span className="font-semibold text-navy">Captain</span> badge.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={() => handleContributorChoice(true)} className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                <Shield className="w-4 h-4" />
                Yes, I'm a Captain
              </Button>
              <Button variant="ghost" onClick={() => handleContributorChoice(false)} className="w-full text-xs text-muted-foreground">
                Just browsing for now
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
