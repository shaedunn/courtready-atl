import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { QueryClient } from "@tanstack/react-query";

interface SplashScreenProps {
  onComplete: () => void;
  queryClient: QueryClient;
}

export default function SplashScreen({ onComplete, queryClient }: SplashScreenProps) {
  const [fadingOut, setFadingOut] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [minTimeReached, setMinTimeReached] = useState(false);
  const [showCTA, setShowCTA] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    // Prefetch courts and reports
    const prefetch = async () => {
      try {
        await Promise.all([
          queryClient.prefetchQuery({
            queryKey: ["courts"],
            queryFn: async () => {
              const { data, error } = await supabase.from("courts").select("*").order("name");
              if (error) throw error;
              return data;
            },
          }),
          queryClient.prefetchQuery({
            queryKey: ["latest-reports"],
            queryFn: async () => {
              const { data, error } = await supabase
                .from("reports")
                .select("*")
                .order("created_at", { ascending: false });
              if (error) throw error;
              const map: Record<string, (typeof data)[number]> = {};
              for (const r of data) {
                if (!map[r.court_id]) map[r.court_id] = r;
              }
              return map;
            },
          }),
        ]);
      } catch (e) {
        console.warn("Prefetch failed:", e);
      }
      setDataReady(true);
    };

    prefetch();

    // Minimum 6 seconds
    const minTimer = setTimeout(() => setMinTimeReached(true), 6000);
    // Show CTA after 4 seconds
    const ctaTimer = setTimeout(() => setShowCTA(true), 4000);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(ctaTimer);
    };
  }, [queryClient]);

  // Auto-exit when both min time and data are ready
  useEffect(() => {
    if (minTimeReached && dataReady && !completedRef.current) {
      setShowCTA(true);
    }
  }, [minTimeReached, dataReady]);

  const handleStart = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setFadingOut(true);
    setTimeout(() => onComplete(), 1000);
  };

  // Auto-dismiss after CTA shows for a while (if user doesn't tap)
  useEffect(() => {
    if (minTimeReached && dataReady && !completedRef.current) {
      const auto = setTimeout(handleStart, 3000);
      return () => clearTimeout(auto);
    }
  }, [minTimeReached, dataReady]);

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-1000 ${
        fadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Background image — boosted saturation via CSS filter */}
      <img
        src="/splash-bg.jpeg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center"
        style={{ filter: "saturate(1.25)" }}
      />

      {/* Content overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
        {/* Title text */}
        <div
          className="text-center opacity-0"
          style={{ animation: "splash-logo-in 1s ease-out 0.5s forwards" }}
        >
          <h1 className="text-4xl font-extrabold tracking-tight text-white drop-shadow-lg">
            Court<span style={{ color: "#DFFF00" }}>Ready</span>
          </h1>
          <p className="text-sm font-medium text-white/80 mt-2 tracking-wide drop-shadow">
            Atlanta Court Conditions
          </p>
        </div>

        {/* CTA Button */}
        {showCTA && (
          <button
            onClick={handleStart}
            className="opacity-0 px-8 py-3 rounded-xl font-bold text-base tracking-wide transition-all active:scale-95 shadow-lg"
            style={{
              backgroundColor: "#002366",
              color: "#DFFF00",
              animation: "splash-logo-in 0.6s ease-out 0.1s forwards",
            }}
          >
            Start
          </button>
        )}
      </div>
    </div>
  );
}
