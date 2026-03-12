

## Plan: Upgrade Reasoning Line with Backward-Facing Rain Mode

### Current State
The `reasoningLine` memo (lines 678–739) always outputs: `[Rain status] · [Wind] · [Ready time]`. Rain status is forward-facing only.

### Changes (single file: `src/pages/CourtDetail.tsx`)

Replace the `reasoningLine` useMemo (lines 678–739) with three-mode logic:

**1. Backward-facing detection** — scan hourly entries *before* the selected tab's timestamp for any `rain_1h > 0.5`. If found AND current hour has `rain_1h <= 0.5` and `pop < 0.50`:
- Derive descriptor from peak `rain_1h` in backward scan: ≥1.0 → "Heavy rainfall", ≥0.5 → "Moderate rainfall", ≥0.2 → "Light rain"
- Find timestamp of last hour with `rain_1h > 0.5`, format as `h:mma`
- Output: `{descriptor} ended {time} · {wind} · {readyStr}`

**2. Forward-facing** (existing logic) — activate when `pop >= 0.20` for selected tab and backward mode didn't trigger. Output unchanged: `{rainStatus} · {wind} · {readyStr}`

**3. Suppress rain segment** — when fully dry (`pop < 0.20`, no backward trigger). Output: `{wind} · {readyStr}` (drop rain segment entirely)

Wind and ready-time segments remain identical to current implementation. No layout or rendering changes — same `<p>` element at line 795–797.

