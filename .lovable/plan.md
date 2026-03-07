

## Plan: Onboarding Modal + Copy Update + Pilot Milestone Ticker

### 1. New file: `src/components/OnboardingModal.tsx`
- Dialog that checks `localStorage.getItem("courtready-onboarded")` on mount
- Title: "Welcome to the CourtReady Pilot"
- Body: "We are calibrating the Physics Engine for Atlanta. Please read the Pilot Protocol to understand our new 'Playable' standards and the Towel-Roll technique."
- Primary button: "View Instructions" → navigates to `/instructions`, sets `courtready-onboarded`
- Secondary button: "Got it, let's play" → closes, sets `courtready-onboarded`

### 2. `src/pages/Instructions.tsx`
- Update the Towel-Roll Protocol copy:
  - Tagline stays: "Playable = Lines Wiped + No Standing Water"
  - Replace the description paragraph with: *"Standing water is the enemy, but dampness is manageable. Once you have pushed standing water off, use the Towel-Roll technique on the surface and wipe the lines. If the lines are dry, the court is marked Playable for this pilot."*
- On mount, set `localStorage.setItem("courtready-visited-instructions", "true")`

### 3. `src/pages/Dashboard.tsx`
- Import and render `<OnboardingModal />`
- **Pilot Milestone in Ticker**: Prepend a static item to the ticker array: `"🎯 Pilot Phase: 14 Facilities | Goal: 1,000 Verified Reports"` — always shown, no timestamp
- **Instructions icon prominence**: Check `courtready-visited-instructions` in localStorage. If not visited, add `animate-pulse` class and a "Start Here" text label next to the BookOpen icon
- Update cache-bust key to `v4`

### 4. Files changed
- `src/components/OnboardingModal.tsx` — new
- `src/pages/Dashboard.tsx` — onboarding modal, ticker milestone, icon prominence, cache-bust
- `src/pages/Instructions.tsx` — updated copy, visited flag

