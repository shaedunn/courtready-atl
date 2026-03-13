
Goal: make /captain reliably use the active self-healing backend client for council member lookup, remove any ambiguous client usage, and ensure “Your Name” renders as a dropdown whenever rows exist.

What I found from code + runtime evidence:
- The fetch is already inside `useEffect(..., [])` in `src/pages/CaptainDashboard.tsx`, so mount execution is intended.
- `CaptainDashboard` already imports `supabase` from `@/lib/supabase` (the derived/active client), not the generated env client.
- There is no early `return` before the fetch hook.
- Current network snapshot shows `GET /rest/v1/council_members?...` hitting the active host and returning `[]`.
- Direct backend read query on current test backend also returns `[]` for `public.council_members`.

Implementation plan:
1) Eliminate client ambiguity app-wide
- Keep `CaptainDashboard` on `@/lib/supabase`.
- Audit and replace remaining `@/integrations/supabase/client` imports in app code (where safe) with `@/lib/supabase` so no screens can silently use a different base URL.
- Do not edit auto-generated integration files.

2) Harden captain fetch + rendering logic
- Refactor council-member loading to explicit query state (`loading`, `success`, `error`) so fallback input is shown only after fetch completes with `0` rows or errors.
- Render states:
  - Loading: disabled field/skeleton (“Loading captains…”)
  - Success + rows: dropdown (`Select`)
  - Success + empty OR error: text input fallback (“Captain name”)

3) Add high-signal diagnostics for this bug
- Log once on mount:
  - env URL
  - derived active URL
  - council query row count + names
- Log explicit fetch errors.
- Add a temporary small debug line under the field in non-production/dev preview: `Active backend: <host> • council_members: <count>`.

4) Verify in preview (end-to-end)
- Open `/captain?court=...`.
- Confirm logs appear for mount + row payload.
- Confirm request host matches derived active URL.
- Confirm dropdown renders and shows expected names alphabetically.
- Confirm submitting status still stores selected value in `court_status.captain_name`.

5) If dropdown still does not populate after code unification
- Treat as backend-environment mismatch (test vs live data) rather than UI/render bug.
- Use the debug host/count line + query result to identify which backend preview is reading from, then align preview backend data/source accordingly.
