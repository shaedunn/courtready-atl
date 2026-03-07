

## Playability Forecast — Full Implementation Plan

Three files modified. One new inline component.

---

### 1. Edge Function: `supabase/functions/get-weather/index.ts`

**Change**: After building the `payload` object (line 50), add `hourly` field. Change `payload` from `const payload = {` to `const payload: Record<string, unknown> = {` and append:

```typescript
hourly: (data.hourly || []).slice(0, 6).map((h: any) => ({
  dt: h.dt,
  temp: h.temp,
  humidity: h.humidity,
  wind_speed: h.wind_speed,
  pop: h.pop ?? 0,
  rain_1h: h.rain?.["1h"] ?? 0,
  description: h.weather?.[0]?.description,
})),
```

This data is already returned by the OpenWeather One Call API — we are just exposing it. No new secrets or tables needed.

---

### 2. Type Update: `src/lib/supabase.ts`

Expand the `fetchWeather` return type (line 89-96) to include `hourly`:

```typescript
hourly?: Array<{
  dt: number; temp: number; humidity: number;
  wind_speed: number; pop: number; rain_1h: number;
  description?: string;
}>;
```

---

### 3. Playability Forecast Component: `src/pages/CourtDetail.tsx`

Add a new `PlayabilityForecast` component inline, placed between `StatusCard` (line 589) and the rain-reset banner (line 592). Only renders when `weatherData?.hourly` exists.

**Imports to add**: `ToggleGroup`, `ToggleGroupItem` from `@/components/ui/toggle-group`

#### UI Structure

```
┌─────────────────────────────────────┐
│ PLAYABILITY FORECAST · 3-HR OUTLOOK │
│                                     │
│  [ Now ] [ +1h ] [ +2h ] [ +3h ]   │  ← ToggleGroup
│                                     │
│         ┌───────────┐               │
│         │  SVG Ring  │               │
│         │    78%     │               │
│         └───────────┘               │
│                                     │
│  "Caution: Incoming moisture..."    │  ← Insight text
│                                     │
│  ⓘ Score is a physics estimate...   │  ← Info tooltip
└─────────────────────────────────────┘
```

#### SVG Circular Gauge

- 80px radius, 8px stroke, `stroke-dasharray` / `stroke-dashoffset` technique
- Background ring: `stroke="hsl(var(--secondary))"`
- Foreground ring: color based on score (green ≥70, amber 40-69, red <40) using CSS variables `--court-green`, `--court-amber`, `--court-red`
- Percentage text centered via `<text>` element, `font-mono font-bold text-2xl`
- Smooth transition: `transition: stroke-dashoffset 0.6s ease`

#### Scoring Engine

```
function calculatePlayability(hourly, offset, courtDrainage, latestReport):
  score = 100
  window = hourly.slice(offset, offset + 3)
  if window.length === 0: return 100

  drainageMultiplier = {1: 1.5, 2: 1.2, 3: 1.0, 4: 0.8, 5: 0.6}[courtDrainage] ?? 1.0

  // Zero-moisture tolerance: ANY hour with pop > 0.3 → instant 50pt drop
  if (window.some(h => h.pop > 0.3)):
    score -= 50

  // Per-hour penalties
  for each hour in window:
    if hour.pop > 0.3: score -= Math.round(hour.pop * 20)
    if hour.rain_1h > 0: score -= 15
    if hour.humidity > 90: score -= 10
    if hour.wind_speed > 10: score += 5

  // Apply drainage multiplier to total rain penalties only
  rainPenalty = 100 - score  // total deductions so far
  score = 100 - Math.round(rainPenalty * drainageMultiplier)

  // Ghost of Rain: if offset > 0, check prior hours for rain
  if offset > 0:
    priorHours = hourly.slice(0, offset)
    priorRain = priorHours.some(h => h.rain_1h > 0)
    if priorRain:
      dryMinutesNeeded = 120 * drainageMultiplier
      if dryMinutesNeeded > offset * 60: score -= 40

  // Active report dry time extending past selected start
  if latestReport:
    elapsed = (now - report.created_at) / 60000
    remaining = max(0, report.estimated_dry_minutes - elapsed)
    if remaining > offset * 60: score -= 30

  return clamp(score, 0, 100)
```

#### Insight Text Generation

```
function getInsight(score, windowHours, ghostActive):
  if ghostActive:
    return "Earlier rain still affecting courts — drainage factor applied."
  if score >= 80:
    // find first hour with pop > 0.3 in all 6 hours
    firstRainHour = find in hourly where pop > 0.3
    if firstRainHour:
      time = format(firstRainHour.dt, "h a")
      return `High confidence: No rain expected until ${time}.`
    return "High confidence: Clear skies and no rain expected."
  if score >= 50:
    rainHour = find in window where pop > 0.3
    time = format(rainHour.dt, "h a")
    return `Caution: Incoming moisture at ${time} may cut match short.`
  return "Low confidence: Rain likely. Consider indoor alternatives."
```

#### Info Tooltip

Below the insight text, render a small `Info` icon (already imported) wrapped in `Tooltip`/`TooltipProvider`:

```tsx
<TooltipProvider delayDuration={100}>
  <Tooltip>
    <TooltipTrigger asChild>
      <button className="mx-auto flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors">
        <Info className="w-3 h-3" /> How is this calculated?
      </button>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-[280px] text-xs">
      Score is a physics estimate based on your court's specific drainage/sun ratings + latest local weather. Always check for Captains' live reports for 100% verification.
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

#### Integration Point

In the main `CourtDetail` render, between line 589 and 592, insert:

```tsx
{weatherData?.hourly && weatherData.hourly.length > 0 && (
  <PlayabilityForecast
    weatherData={weatherData}
    court={court}
    latestReport={latestReport}
  />
)}
```

---

### Files Modified
| File | Change |
|------|--------|
| `supabase/functions/get-weather/index.ts` | Add `hourly` array to response payload |
| `src/lib/supabase.ts` | Expand `fetchWeather` return type with `hourly` |
| `src/pages/CourtDetail.tsx` | New `PlayabilityForecast` component with SVG ring, scoring engine, time toggle, insight text, and info tooltip |

