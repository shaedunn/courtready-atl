

## "Leslie Beach Pilot" Executive Build

Five files changed. No database migrations needed.

---

### 1. `src/lib/courts.ts` — Human Verified Gold State + Unified Truth

**Add** `"human_verified"` to `CourtStatus` union type.

**Add** to `STATUS_CONFIG`:
```typescript
human_verified: { color: "bg-amber-400", label: "Human Verified" }
```

**Update** `getCourtStatus` signature to:
```typescript
getCourtStatus(
  report, latestObservation, currentHumidity, recentRain,
  forecastScore?: number,
  currentRain1h?: number
)
```

**New logic flow** (replaces current):
1. **Captain's Gold Override** (no expiry): If `latestObservation?.status === "playable"` AND humidity ≤ 90:
   - Invalidated ONLY if `currentRain1h > 0` (actual rain NOW) OR a report with `rainfall > 0` exists that is newer than the observation
   - If NOT invalidated → return `"human_verified"`
2. Humidity > 90 → `"caution"`
3. **Forecast-driven** (if `forecastScore` provided):
   - `< 40` → `"wet"` (relabeled "Likely Unplayable")
   - `40–69` → `"drying"`
   - `≥ 70` → `"playable"`
4. **Fallback** (no weather data): existing report-age logic unchanged

**Add** helper `getVerifiedAgoText(createdAt: string): string` → returns "Xh Ym ago" or "just now".

Key rule: **PoP (probability) never invalidates a Captain's verification. Only `rain_1h > 0` does.**

---

### 2. `src/pages/Dashboard.tsx` — Unified Truth Badges + Split-Status

**Add queries**:
- Shared weather query using first court's lat/lon (all Atlanta courts share same weather)
- Sub-courts query: `supabase.from("sub_courts").select("*")`
- All observations query (not just latest per court): to count verified sub-courts

**CourtCard changes**:
- Import `calculatePlayability` from CourtDetail logic (will extract to a shared util or inline)
- Compute `forecastNowScore` per court using weather hourly data + court drainage
- Pass `forecastScore` and `currentRain1h` to `getCourtStatus`

**Split-Status logic**:
- For each facility, cross-reference sub_courts with observations
- Count sub-courts with valid "playable" observations (not invalidated by rain)
- If some but not all verified: badge shows `"X/Y Courts Playable"` in gold
- If all verified: `"Human Verified"` gold badge
- If none: standard forecast-derived status
- Show `"Verified by [name] · Xh Ym ago"` subtitle when any verification exists

---

### 3. `src/pages/CourtDetail.tsx` — Pass Forecast Score + Gold Ring

**StatusCard**:
- Compute `forecastNowScore` from `calculatePlayability(hourly, 0, ...)` and pass to `getCourtStatus` along with `currentRain1h`
- Handle `"human_verified"` status: gold CheckCircle2 icon, show "Verified by [name] · Xh Ym ago"

**PlayabilityForecast**:
- When status is `human_verified` and physics score < 40: change ring color to gold (`#F59E0B`), insight text → "Captain verified playable [time] ago — overriding physics model."

**Rain reset logic** (line 697): Already uses `weatherData?.rain_1h > 0` — this stays. PoP no longer invalidates.

---

### 4. `src/components/SplashScreen.tsx` — Cycling Insights

**Add** rotating insight text at bottom, cycling every 2s:
- "Consulting the Ghost of Rain..."
- "Calibrating Atlanta Physics..."
- "Syncing 3-Hour Forecast..."

Implementation: `useState` index + `setInterval`. Style: `text-white/60 text-xs tracking-wide` with opacity crossfade.

**Logo scale**: Update `splash-logo-in` keyframe from `scale(0.9)` to `scale(0.95)` for subtlety.

Splash already has: 6s minimum, 1s fade-out, saturate(1.25), no logo image, high-contrast CTA. Confirmed clean.

---

### 5. `src/index.css` — Keyframe Tweak

Update `splash-logo-in` from `scale(0.9)` → `scale(0.95)`.

---

### Data Confirmation

Dashboard fetches exclusively from the `courts` table (line 168). Zero mock data exists. The 11 facilities showing are the seeded records. If 14 are expected, 3 need to be added to the database separately.

### Files Modified

| File | Change |
|------|--------|
| `src/lib/courts.ts` | `human_verified` status, rain-only invalidation, `forecastScore` param, `getVerifiedAgoText` |
| `src/pages/CourtDetail.tsx` | Pass forecast score + rain to status, gold ring override, verified receipt |
| `src/pages/Dashboard.tsx` | Weather query, forecast-driven badges, split-status "X/Y Courts Playable", gold badge |
| `src/components/SplashScreen.tsx` | Cycling insight texts |
| `src/index.css` | Splash keyframe scale tweak |

