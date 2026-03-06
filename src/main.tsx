import { createRoot } from "react-dom/client";
import "./index.css";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !url.startsWith("http") || !key) {
  const root = document.getElementById("root")!;
  root.innerHTML = `
    <div style="font-family:monospace;padding:2rem;color:#ff4444;background:#111;min-height:100vh;">
      <h1 style="font-size:1.5rem;margin-bottom:1rem;">⚠️ Configuration Error — No Mock Data</h1>
      <p>The app cannot start because required environment variables are missing or invalid.</p>
      <ul style="margin:1rem 0;line-height:2;">
        <li><strong>VITE_SUPABASE_URL</strong>: "${url ?? "undefined"}"</li>
        <li><strong>VITE_SUPABASE_PUBLISHABLE_KEY</strong>: "${key ? "set ✓" : "undefined ✗"}"</li>
      </ul>
      <p>Check your <code>.env</code> file and restart the dev server.</p>
      <p style="margin-top:1rem;color:#888;">This is a live pilot — no fallback or mock data will be used.</p>
    </div>
  `;
} else {
  import("./App.tsx").then(({ default: App }) => {
    createRoot(document.getElementById("root")!).render(<App />);
  });
}
