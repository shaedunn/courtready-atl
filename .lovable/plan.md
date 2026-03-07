

## JWT Self-Healing Fix + Pilot-Critical Verification

### Root Cause
The `VITE_SUPABASE_URL` environment variable is being overridden at build time by a stale deploy secret containing the old project URL. The code and `.env` are correct, but the build injects the wrong value.

### Fix: Derive URL from API Key JWT

**`src/lib/supabase.ts`** — Replace the re-export of the auto-generated client with a self-healing client that decodes the `ref` from the JWT API key:
- Decode the middle segment of `VITE_SUPABASE_PUBLISHABLE_KEY` (base64 JWT payload)
- Extract `payload.ref` → construct `https://${ref}.supabase.co`
- Create client with `createClient(derivedUrl, key)` — immune to URL secret drift
- Log both the env URL and derived URL for verification

**`src/components/SplashScreen.tsx`** — Change import from `@/integrations/supabase/client` to `@/lib/supabase` so the splash screen prefetch also uses the self-healing client.

### Pilot-Critical Items — Already Locked In (Verification)

1. **Saturated Air Rule**: `getCourtStatus()` in `courts.ts` returns `"caution"` when humidity >90%. `calculateDryTime()` applies 3.0x multiplier and 180-min floor. `StatusCard` in `CourtDetail.tsx` shows "Saturated Air - Drying Paused" with destructive styling. All confirmed in current code.

2. **Moss Hazard Banner**: `CourtDetail.tsx` lines 579-587 already query `subCourts` filtering on `hazard_description` and render red `ShieldAlert` banners per court number. Will work for Huntley Hills Court 2 once the connection is restored.

3. **Pilot Ticker**: `PilotTicker` component in `Dashboard.tsx` lines 95-138 fetches latest 3 reports + 3 observations, sorts by time, displays with `animate-scroll-x`. Active and pulling from both tables.

4. **`facility_id` Convention**: All `sub_courts` queries in `CourtDetail.tsx` and `SubCourtEditor.tsx` use `.eq("facility_id", ...)`. No deviation.

### Files Modified
- `src/lib/supabase.ts` — self-healing client from JWT
- `src/components/SplashScreen.tsx` — import fix

