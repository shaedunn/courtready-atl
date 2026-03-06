// Sovereign Supabase client — points to the user's own project (racdnnitrapgqozxctsk)
// This bypasses the auto-managed Lovable Cloud client.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SOVEREIGN_URL = "https://racdnnitrapgqozxctsk.supabase.co";
const SOVEREIGN_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhY2Rubml0cmFwZ3FvenhjdHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3Mjk2ODMsImV4cCI6MjA4ODMwNTY4M30.2gVst0fWw5L6gUlO84cxveqFeZ97cW7_7W4CL00ELsw";

export const supabase = createClient<Database>(SOVEREIGN_URL, SOVEREIGN_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Export for edge function URL construction
export const SOVEREIGN_PROJECT_ID = "racdnnitrapgqozxctsk";
