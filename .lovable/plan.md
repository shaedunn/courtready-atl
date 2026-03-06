

## Splash Screen Implementation

### Assets
- Copy uploaded `IMG_7968.jpeg` → `public/splash-bg.jpeg`
- Copy uploaded `IMG_2705.png` → `public/cr-logo.png`
- Using `public/` so they're served as static assets without bundling overhead.

### New Component: `src/components/SplashScreen.tsx`
- Fixed full-screen overlay at `z-50` with black background.
- Background: `<img>` with `object-cover object-center w-full h-full` plus a dark overlay div (`bg-black/50 backdrop-blur-sm`) for the premium frosted effect and logo contrast.
- CR logo: centered, animates in with a CSS `fade-in` (opacity 0→1 over ~1s, delayed ~0.3s).
- **Exit strategy**: At 3s mark, trigger fade-out (opacity→0 over 0.5s) AND immediately add `pointer-events-none` to the container so users can interact with the dashboard beneath during the fade.
- Calls `onComplete()` after the fade-out transition ends to unmount.
- **Data pre-fetch on mount**:
  - Invoke `get-weather` edge function with Leslie Beach Club coords (33.8195, -84.3397) — hardcoded for pilot phase.
  - Pre-warm React Query cache by fetching courts and latest reports.
  - Add a `// TODO: Metro View - loop through anchor clubs (Buckhead, Decatur, Marietta)` comment documenting the future multi-location strategy.

### App.tsx Changes
- Add `useState` for `showSplash` (default `true`).
- Export `queryClient` so `SplashScreen` can prefetch into it.
- Render `<SplashScreen onComplete={() => setShowSplash(false)} />` conditionally. Routes render underneath (visible through once splash fades).

### No database or edge function changes needed.

