

## Plan: Fix Forecast Tab Logic — Build Errors + Precipitation Probability

### Problem
Two issues:
1. **Build errors**: The last diff changed `court.drainage` → `court.drainage_rating` and `court.sun_exposure` → `court.sun_exposure_rating`, but `SovereignCourt` type uses `drainage` and `sun_exposure`. Need to revert these 14 references.
2. **Wrong active rain detection for future tabs**: Future hourly tabs treat `rain_1h > 0.1` as "active rain," but for forecasted hours this value represents predicted intensity, not confirmed precipitation. The `pop` (precipitation probability 0–1) field from the hourly forecast should drive the logic instead.

### Changes (single file: `src/pages/CourtDetail.tsx`)

**Fix 1 — Revert property names** (lines 441, 460, 480, 498, 524, 567, 946, 947):
- `court.drainage_rating` → `court.drainage`
- `court.sun_exposure_rating` → `court.sun_exposure`

**Fix 2 — Replace future-tab rain detection with probability-based tiers** (lines 435, 456, 965, 969):

For **Now tab** (i === 0): Keep current logic — use actual `rain_1h > 0.5mm` threshold for active rain detection (raise from 0.1 to 0.5 for meaningful threshold).

For **future tabs** (i > 0): Use `pop` (precipitation probability) from hourly data:
- `pop > 0.50` → "Rain likely — forecast updating." (treat as WET, accumulate estimated rain)
- `pop 0.20–0.50` → "Clearing conditions — drying in progress." (treat as transitional/recovery)
- `pop < 0.20` → Normal drying/playability logic (Rule B/C/D)

The `rain_1h` value from the hourly forecast will still be used for accumulated rainfall calculations, but will no longer trigger "Active rain" status for future tabs.

**Specific logic for future tabs:**
```
const pop = h?.pop ?? 0;
const forecastRain = h?.rain_1h ?? 0;

if (pop > 0.50) {
  // Rain likely — accumulate forecast rain, stay WET
  outputString = "Rain likely — forecast updating."
}
else if (pop >= 0.20 && inheritedState === "WET") {
  // Clearing conditions with some probability
  outputString = "Clearing conditions — drying in progress."
}
else {
  // Normal Rule B/C/D logic (recovery or dry)
}
```

This same probability-based approach will be mirrored in both the `forecastChain` (PlayabilityForecast component, ~line 435–564) and the `dryClockFuture` memo (~line 960–1005).

