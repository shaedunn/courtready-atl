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
import { Droplets } from "lucide-react";

const ONBOARDED_KEY = "courtready-onboarded";

export default function OnboardingModal() {
  const [open, setOpen] = useState(false);
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

  const goToInstructions = () => {
    localStorage.setItem(ONBOARDED_KEY, "true");
    setOpen(false);
    navigate("/instructions");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="max-w-sm mx-auto rounded-xl">
        <DialogHeader className="items-center text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Droplets className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-base">Welcome to the CourtReady Pilot</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed pt-2">
            We are calibrating the Physics Engine for Atlanta. Please read the Pilot Protocol to understand our new "Playable" standards and the Towel-Roll technique.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={goToInstructions} className="w-full">
            View Instructions
          </Button>
          <Button variant="ghost" onClick={dismiss} className="w-full text-xs text-muted-foreground">
            Got it, let's play
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
