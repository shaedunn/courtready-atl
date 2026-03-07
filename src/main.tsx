import { createRoot } from "react-dom/client";
import "./index.css";

// ── PWA Cache Bust: force-clear stale service worker + cache ──
const CACHE_BUST_KEY = "courtready-cache-busted-v3";
if (!localStorage.getItem(CACHE_BUST_KEY)) {
  localStorage.setItem(CACHE_BUST_KEY, "1");

  // Unregister all service workers
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }

  // Clear all caches
  if ("caches" in window) {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }

  // Reload after clearing
  setTimeout(() => location.reload(), 300);
} else {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !url.startsWith("http") || !key) {
    const root = document.getElementById("root")!;
    root.innerHTML = `
      <div style="font-family:monospace;padding:2rem;color:#ff4444;background:#111;min-height:100vh;">
        <h1 style="font-size:1.5rem;margin-bottom:1rem;">⚠️ Configuration Error</h1>
        <p>Required environment variables are missing or invalid.</p>
        <p style="margin-top:1rem;color:#888;">Check your <code>.env</code> file and restart.</p>
      </div>
    `;
  } else {
    import("./App.tsx").then(({ default: App }) => {
      createRoot(document.getElementById("root")!).render(<App />);
    });
  }
}
