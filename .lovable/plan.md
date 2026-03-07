

## Diagnosis

The source code has **zero references** to the old `racdnnitrapgqozxctsk` domain. The `.env` correctly points to `xtpaffpgcadincafkgnz`. The `client.ts` reads from `import.meta.env` at build time. Yet runtime network requests still go to the old URL.

This means the **Lovable preview is serving a stale build** where the old URL was baked into the JavaScript bundle. No amount of client-side cache busting can fix this — the server-side build artifact itself is outdated.

## Fix

Force a fresh build by making a small meaningful change to the Supabase client initialization. Specifically:

1. **`src/integrations/supabase/client.ts`** — Cannot edit (auto-generated). Already correct.

2. **`src/lib/supabase.ts`** — Add a runtime validation that logs the actual URL being used, so we can confirm the new build takes effect:
   - Add a `console.info("CourtReady backend:", import.meta.env.VITE_SUPABASE_URL)` at module load
   - This forces Vite to re-process the env variable reference in a new code path

3. **`src/main.tsx`** — Bump the cache bust key from `v3` to `v4` so returning users also get the fresh build:
   - Change `courtready-cache-busted-v3` → `courtready-cache-busted-v4`

4. **`src/App.tsx`** — Add a trivial comment change to ensure the main entry point is recompiled

These changes ensure Vite rebuilds the bundle with the correct `.env` values. The existing features (Moss Alert, Pilot Ticker, Instructions page, humidity lock) are already in place and will work once the connection is restored.

