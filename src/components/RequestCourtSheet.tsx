import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export default function RequestCourtSheet() {
  const [open, setOpen] = useState(false);
  const [facilityName, setFacilityName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = facilityName.trim().length > 0 && address.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("facility_requests").insert({
        facility_name: facilityName.trim().slice(0, 200),
        address: address.trim().slice(0, 300),
        requester_email: email.trim().length > 0 ? email.trim().slice(0, 255) : null,
      });
      if (error) throw error;
      toast.success("Thanks — we'll review your request and add it to the network soon.");
      setFacilityName("");
      setAddress("");
      setEmail("");
      setOpen(false);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors py-3 min-h-[44px]">
          Don't see your court? <span className="underline underline-offset-2">Request it →</span>
        </button>
      </DrawerTrigger>
      <DrawerContent className="px-4 pb-8">
        <DrawerHeader className="px-0">
          <DrawerTitle className="text-base font-heading">Request a Court</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="req-name" className="text-sm">Facility name *</Label>
            <Input
              id="req-name"
              placeholder="e.g. Piedmont Park Tennis Center"
              value={facilityName}
              onChange={(e) => setFacilityName(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="req-addr" className="text-sm">Approximate address or intersection *</Label>
            <Input
              id="req-addr"
              placeholder="e.g. Piedmont Ave & 14th St"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={300}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="req-email" className="text-sm text-muted-foreground">
              Optional — we'll notify you when it's added
            </Label>
            <Input
              id="req-email"
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full min-h-[44px]"
          >
            {submitting ? "Submitting…" : "Submit Request"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
