

## Plan: Add Reasoning Line Beneath Forecast Output

### Summary
Add a single muted reasoning line below the main Dry-Clock forecast string showing: `[Rain status] · [Wind] mph [Direction] · [Ready time or condition]`. Requires two files changed.

### Changes

**1. Edge Function — Pass `wind_deg` through (`supabase/functions/get-weather/index.ts`)**

Add `wind_deg` to both the current-conditions payload and hourly items:
- Top level: `wind_deg: data.current?.wind_deg ?? null`
- Hourly: `wind_deg: h.wind_deg ?? null`

**2. Frontend — Add `wind_deg` to type + pass through (`src/lib/supabase.ts`)**

Update the `fetchWeather` return type to include `wind_deg` at top level and in hourly items.

**3. CourtDetail.tsx — Build and render reasoning line**

Add a `useMemo` that computes the reasoning string for the selected tab:

**Rain status segment:**
- Now tab with `rain_1h > 0.5`: "Active rain"
- Future tab with `pop > 0.50`: "Rain likely"
- Future tab with `pop 0.20–0.50` and decreasing: "Rain clearing by [hour]" — scan forward through hourly to find first hour where `pop < 0.20`, format that hour
- `pop < 0.20` or dry: "No rain expected"

**Wind segment:**
- `{Math.round(windSpeed)} mph {cardinal(windDeg)}` using a helper that maps degrees to N/NE/E/SE/S/SW/W/NW
- Falls back to just `{speed} mph wind` if `wind_deg` is unavailable

**Ready time segment:**
- Reuse `dryClockResult.estimatedPlayableTime`, `dryClockResult.effortLevel`, and `dryClockResult.action` from the already-computed forecast chain
- Active rain / rain likely → "Check back as conditions develop"
- Dry → "Courts dry — no prep needed"
- Recovery → "Estimated ready by {time} with {effort}"

**Render location:** Directly after line 725 (`<p>` with `showOutput`), before the active-rain secondary text. Styled as `text-sm text-muted-foreground`. Only rendered when weather data is loaded.

### No other changes
- No changes to the Playability Forecast card layout, time tabs, status logic, or any other component.

