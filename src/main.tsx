import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Validate env before anything else
if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_URL.startsWith("http")) {
  throw new Error(
    `Network Error: VITE_SUPABASE_URL is missing or invalid ("${import.meta.env.VITE_SUPABASE_URL}"). Cannot reach live backend.`
  );
}

createRoot(document.getElementById("root")!).render(<App />);
