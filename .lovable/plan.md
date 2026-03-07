

## Root Cause: Stale PWA Service Worker Cache

The `.env` file is correct (`VITE_SUPABASE_URL=https://xtpaffpgcadincafkgnz.supabase.co`), and the source code has zero references to the old `racdnnitrapgqozxctsk` domain. Yet every runtime request goes to that old domain -- because the **PWA service worker is serving a cached bundle** from before the migration. The old URL was baked into a previous build's JavaScript and the service worker keeps serving it.

## Implementation Plan

### 1. Force service worker + cache bust (fixes the "No courts found" blocker)
- In `src/main.tsx`, add a one-time cache-clearing routine that:
  - Unregisters all service workers
  - Clears all Cache Storage entries
  - Sets a localStorage flag (`courtready-cache-busted-v2`) so it only runs once
  - Reloads the page after clearing
- In `vite.config.ts`, temporarily switch PWA `registerType` to `"prompt"` or add a `skipWaiting` strategy so the new build takes over immediately

### 2. Dashboard error state + Pilot Ticker
- In `Dashboard.tsx`, use `isError` from the courts query to show a "Connection error" message (not "No courts found") when the fetch fails
- Add a live scrolling ticker below the header showing recent activity (last 3 reports/observations) once data loads successfully

### 3. Moss Alert (Red Warning Banner) on CourtDetail
- In `CourtDetail.tsx`, after fetching `subCourts`, render a prominent red banner for any sub-court with a non-null `hazard_description`
- Display the hazard text (e.g., "Slippery when damp - Moss on baseline") with a `ShieldAlert` icon
- This supplements the existing hazard display in `SubCourtEditor` and `SubCourtSelector`

### 4. Instructions Page (`/instructions`)
- Create `src/pages/Instructions.tsx` with the Towel-Roll Protocol:
  - "Playable = Lines Wiped + No Standing Water"
  - Include squeegee best practices, reporting guidelines, and the verification system explanation
- Add route in `App.tsx`: `<Route path="/instructions" element={<Instructions />} />`
- Add navigation link on Dashboard header

### 5. Keep existing sovereignty features intact
- All `sub_courts` queries already use `facility_id` -- no changes needed
- Humidity > 90% hard lock to "Saturated Air - Drying Paused" with 180-min floor -- already in place
- `hazard_description` field already exists in `SubCourtEditor` and `SubCourtSelector` -- just needs the CourtDetail-level banner

### Files to create/modify
- `src/main.tsx` -- add service worker + cache clearing
- `vite.config.ts` -- PWA skip-waiting behavior
- `src/pages/Dashboard.tsx` -- error state handling + pilot ticker
- `src/pages/CourtDetail.tsx` -- moss alert red banner from sub-courts
- `src/pages/Instructions.tsx` -- new page with Towel-Roll Protocol
- `src/App.tsx` -- add `/instructions` route

