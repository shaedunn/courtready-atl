

## Analysis

The user asked to confirm that the Dry-Clock engine reads `drainage_rating` and `sun_exposure_rating` from the production database. However, after checking both the **actual database schema** and the **codebase**:

**The production `courts` table columns are `drainage` and `sun_exposure`** — there is NO `_rating` suffix. The code already correctly references `court.drainage` and `court.sun_exposure` everywhere (CourtDetail.tsx, Dashboard.tsx, ReportForm.tsx). The `SovereignCourt` type in `supabase.ts` also uses `drainage` and `sun_exposure`, matching the schema.

**No changes are needed.** The column names in code already match the production database schema exactly. If I were to add `_rating` suffixes, it would **break** the app since those columns don't exist.

## Recommendation

No code changes required for column name mapping — `court.drainage` and `court.sun_exposure` are correct. The real issues from the previous request (weather not rendering, forecast not showing) are caused by the weather edge function fetch failing silently, which hides all weather-dependent UI. The plan from the previous message (adding diagnostic logging to the weather fetch, surfacing errors instead of swallowing them) remains the correct next step.

