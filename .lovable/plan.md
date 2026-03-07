

# Add Humidity Info Tooltip to Weather Badge

## What
Add a small `Info` icon next to the humidity weather badge in `ReportForm.tsx`. On tap/hover, it shows a contextual tooltip explaining how the current humidity level affects drying time.

## How

**File: `src/components/court/ReportForm.tsx`**

1. Import `Info` from `lucide-react` and `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` from the existing tooltip component.

2. Next to the humidity `Badge` (line 169), add a `Tooltip`-wrapped `Info` icon (w-3.5 h-3.5, muted color).

3. The tooltip content is dynamic based on the humidity value:
   - `>= 80%`: "Calculated for hyper-local humidity ({humidity}%). High moisture in the air significantly slows natural evaporation."
   - `>= 60%`: "Humidity at {humidity}%. Moderate moisture — expect standard drying times."
   - `< 60%`: "Humidity at {humidity}%. Low moisture aids faster evaporation."

4. Wrap the weather badges section in a `TooltipProvider` with a short `delayDuration` (e.g. 100ms) so it works well on mobile tap.

**Single file change, ~15 lines added.**

