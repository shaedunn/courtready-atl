

## Dunn Law -- Dry Time Engine Upgrade

### Overview
Replace the current sky-condition-based formula with the physics-driven "Dunn Law" engine. Weather variables (temp, humidity, wind) are auto-fetched from the weather API. Sun exposure and drainage are stored as court-level defaults but can be toggled by the captain in the report form.

### Database Changes

**1. `courts` table -- add two columns:**
- `sun_exposure` (double precision, default 0.75, not null) -- scale 0 to 1
- `drainage` (double precision, default 0.5, not null) -- scale 0 to 1

**2. `reports` table -- add columns for weather snapshot + overrides:**
- `temperature` (double precision, nullable) -- degrees F at report time
- `humidity` (double precision, nullable) -- percentage
- `wind_speed` (double precision, nullable) -- mph
- `sun_exposure` (double precision, nullable) -- override value used
- `drainage` (double precision, nullable) -- override value used

The existing `sky_condition` column stays for backward compatibility but becomes secondary.

### Engine: `src/lib/courts.ts`

Replace `calculateDryTime` with the Dunn Law formula:

```text
effectiveRain = rainfall * squeegee_factor
tempFactor = temp / 70
humidityFactor = (100 - humidity) / 100
windFactor = 1 + (wind / 10)
evapPower = tempFactor * humidityFactor * windFactor * sunExposure * drainage
minutes = (effectiveRain * 45) / evapPower
result = round(minutes * hindranceFactor)
```

Keep `HINDRANCE_OPTIONS` and the max-hindrance-multiplier logic unchanged. Remove `SKY_FACTOR`.

### Report Form (`CourtDetail.tsx`)

**Removed:** Sky Conditions dropdown.

**Auto-fetched on form mount:** Call `get-weather` edge function with the court's `lat`/`lon`. Display a small weather badge showing the fetched temp, humidity, and wind (read-only, for transparency).

**New toggles:** Sun Exposure and Drainage sliders pre-filled from the court's defaults. Captain can adjust if ground conditions differ (e.g., temporary shade from construction, clogged drains).

**On submit:** Pass all values into the new `calculateDryTime`. Store the weather snapshot and overrides in the report row for audit.

### Preview in form

The live "Estimated dry time" preview at the bottom of the form will update using the new formula once weather data loads.

### StatusCard

No changes needed -- it already reads `estimated_dry_minutes` from the report.

### Splash pre-fetch

No changes -- the existing weather pre-fetch warms the edge function cache.

