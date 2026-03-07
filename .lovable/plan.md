
Goal: stop the “No courts found” loop and make seeded sub-courts visible under each facility reliably.

What I found
- The `sub_courts` schema is already correct (`facility_id` exists, `court_id` does not for that table).
- The connected backend currently has data: 11 facilities in `courts`, and 4 `sub_courts` rows for Leslie Beach Club (`facility_id = e4e59718...`, courts 1–4).
- The real blocker is connection mismatch, not sub-court naming:
  - Runtime requests are going to `racdnnitrapgqozxctsk...` and returning `401 Invalid API key`.
  - That means URL/key pairing is inconsistent at runtime.
- Code is also still hardcoding the old project domain for weather calls in multiple places, which reinforces environment confusion.

Implementation plan
1) Unify backend client usage (highest priority)
- Remove hardcoded old-project constants/usages in:
  - `src/lib/supabase.ts`
  - `src/components/court/ReportForm.tsx`
  - `src/pages/CourtDetail.tsx`
- Route weather through the same app backend client (use backend function invoke), so one source of truth is used for all DB + function calls.

2) Enforce sub-court querying only by `facility_id`
- Keep/normalize every `sub_courts` read/write to:
  - `.from("sub_courts").select(...).eq("facility_id", facilityId)`
- Keep this in:
  - `CourtDetail`, `FacilityAdmin`, `SubCourtEditor`, `ReportForm`
- Remove `as any` for sub-court payloads where possible so type mismatches surface during build instead of runtime.

3) Fix misleading empty-state UX
- In `Dashboard`, stop showing “No courts found” when query errored.
- Add explicit query-error state (connection/config issue) with actionable message.
- Keep “No courts found” only for true empty successful responses.

4) Keep/create initialization path for sub-courts
- Preserve the “Create Initial Courts” button in Court Detail when sub-courts list is truly empty.
- Ensure insert payload uses `facility_id` and court numbers 1..4 only.

5) Keep humidity safety lock deterministic
- Preserve hard override: humidity > 90% => show saturated status and minimum 180 min estimate in Court Detail.
- Ensure this logic is based on current report + weather result from the unified backend call.

Do you need to change anything in backend?
- No table schema change is required for `sub_courts` linking (already correct).
- You may need one backend configuration sync if runtime still points at old domain after code cleanup:
  - refresh backend environment metadata so URL + publishable key belong to the same project.
- I’ll treat this as a config alignment task, not a schema migration.

Technical details
- `court_id` is still valid for `reports`, `observations`, `court_logs` (do not remove there).
- `facility_id` should be used only in `sub_courts` context.
- Primary bug signature to eliminate:
  - Requests to old domain + `Invalid API key` 401.
- Success criteria:
  1) `/` loads facilities (no false “No courts found”).
  2) Court Detail shows seeded sub-courts via `facility_id`.
  3) “Create Initial Courts” inserts rows tied to current facility.
  4) At >90% humidity, status is saturated with >=180 min timer.
