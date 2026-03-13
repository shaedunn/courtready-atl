
Goal: add diagnostics only (no behavior fixes) so one Publish Status click produces complete, unambiguous logs.

Plan

1) Scope the change to the publish flow only
- File: `src/pages/CaptainDashboard.tsx`
- Only update `publishStatus` diagnostics (no schema changes, no query logic changes, no retries, no fallbacks).
- Keep existing insert payload and insert call as-is.

2) Add a structured “publish attempt” debug block
- On button press, generate an `attemptId` and timestamp.
- Log a grouped block for this single attempt so logs are easy to copy/share.
- Include:
  - current form state snapshot (`selectedStatus`, `activeCourt`, `captainName`, `effortTags`, `helpNeeded`, `reportTo`, `captainNote`)
  - final insert payload object exactly as sent to `court_status`
  - payload key list and expected key list
  - UUID check result for `court_id`

3) Add per-field payload audit (value + null/undefined flags)
- Build a field-by-field diagnostic object for every `court_status` payload field:
  - `value`
  - `type`
  - `isNull`
  - `isUndefined`
- Log a compact summary of:
  - `nullFields`
  - `undefinedFields`
  - `nonNullFields`
This directly answers whether any inserted field is null/undefined.

4) Expand error logging to capture full Supabase error shape
- Keep existing error logs, and add a single consolidated error dump including:
  - raw `error` object
  - `code`, `message`, `details`, `hint`
  - `name`, `stack` (if present)
  - serialized fallback snapshot for non-enumerable properties
  - the exact payload sent in the failed request
- Keep current toast behavior unchanged.

5) Explicitly log publish-flow table usage (including matches check)
- Add an in-function `tablesTouchedInPublishFlow` array.
- Push/log each table right before query execution (`courts` lookup, then `court_status` insert).
- Log final verdict:
  - `tablesTouchedInPublishFlow`
  - `referencesMatchesTableInPublishFlow: false`
This confirms publish flow does not insert into/reference `matches`.

Technical details

- No backend/database migration needed.
- No auth/RLS changes needed.
- No removal of `createMatch` in this step (per your instruction: logging only, no fixes).
- Expected output after one click will include:
  1) exact Supabase error code/message
  2) complete payload + per-field null/undefined audit
  3) explicit publish-flow table trace proving whether `matches` is involved
