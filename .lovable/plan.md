
Goal: remove any chance of stale weather responses, expose the exact payload shape, and persist every weather call to a backend cache table.

What I verified in the current code/runtime:
- The app is already calling the live backend function via `supabase.functions.invoke("get-weather")` (no local `/functions/get-weather` route found).
- Current function response shape (live call):
  `{"description":"scattered clouds","humidity":88,"icon":"03n","rain_1h":0,"temp":59.83,"wind_speed":0}`
- There is no `weather_cache` table in the database right now.
- `get-weather` currently does not write to the database at all (no upsert logic exists).

Implementation plan:

1) Add a `weather_cache` table (schema migration)
- Create `public.weather_cache` with fields like:
  - `id` uuid PK
  - `lat` double precision not null
  - `lon` double precision not null
  - `cache_key` text not null unique (derived from normalized lat/lon)
  - `temp`, `humidity`, `wind_speed`, `rain_1h`, `description`, `icon`
  - `raw_payload` jsonb not null
  - `last_requested_at` timestamptz not null default now()
  - `updated_at` timestamptz not null default now()
- Enable RLS and keep table write-protected from clients (no public insert/update policies), so only backend function writes.

2) Update `get-weather` edge function to always write on every request
- Parse cache-bust token from query `t` and/or body `t`.
- Call OpenWeather with an added nonce param (e.g. `&_=${t || Date.now()}`) and `Cache-Control: no-store` request header.
- Build normalized response object (`temp`, `humidity`, `wind_speed`, `rain_1h`, `description`, `icon`).
- Initialize backend client inside function with server credentials and perform `upsert` into `weather_cache` using `cache_key` conflict target.
- Always update `last_requested_at` + `updated_at` so each function call leaves an auditable write.

3) Update frontend invocations to include timestamp cache-bust
- `src/components/court/ReportForm.tsx`:
  - change to `supabase.functions.invoke(\`get-weather?t=${Date.now()}\`, { body: { lat, lon, t: Date.now() } })`
- `src/components/SplashScreen.tsx`:
  - same timestamped invoke pattern for prefetch call
- Keep existing UX behavior (weather badge + error states).

4) Expose exact JSON received for debugging
- Add temporary debug logging in `ReportForm` (or guarded dev-only panel) to print/display the exact JSON returned from the function before any transformation.
- Add function-side `console.log` for request coordinates and normalized payload to make logs useful.

5) Validate end-to-end after implementation
- Trigger weather fetch from `/court/leslie-beach-club`.
- Confirm network requests include `?t=<timestamp>`.
- Confirm function response JSON matches displayed/debugged payload.
- Run read query:
  - `select cache_key, temp, humidity, wind_speed, last_requested_at, updated_at from public.weather_cache order by updated_at desc limit 10;`
- Re-fetch immediately and verify `updated_at` changes on each call.

Technical details:
- No changes to generated Supabase client file (`src/integrations/supabase/client.ts`), per platform constraints.
- This approach keeps weather reads public while restricting cache-table writes to backend logic only.
- If you want per-court cache rows instead of per-lat/lon rows, I can switch `cache_key` to `court_id` in the same implementation pass.
