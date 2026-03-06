import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { QueryClient } from "@tanstack/react-query";

interface SplashScreenProps {
  onComplete: () => void;
  queryClient: QueryClient;
}

export default function SplashScreen({ onComplete, queryClient }: SplashScreenProps) {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    // Pre-fetch weather data for Leslie Beach Club (pilot phase)
    // TODO: Metro View - loop through anchor clubs (Buckhead, Decatur, Marietta)
    supabase.functions.invoke("get-weather", {
      body: { lat: 33.8195, lon: -84.3397 },
    });

    // Pre-warm React Query cache
    queryClient.prefetchQuery({
      queryKey: ["courts"],
      queryFn: async () => {
        const { data, error } = await supabase.from("courts").select("*").order("name");
        if (error) throw error;
        return data;
      },
    });

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
    });

    const fadeTimer = setTimeout(() => setFadingOut(true), 3000);
    const unmountTimer = setTimeout(() => onComplete(), 3500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
    };
  }, [onComplete, queryClient]);

  return (
    <div
      className={`fixed inset-0 z-50 bg-black transition-opacity duration-500 ${
        fadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <img
        src="/splash-bg.jpeg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src="/cr-logo.png"
          alt="CourtReady"
          className="w-48 h-48 object-contain opacity-0"
          style={{
            animation: "splash-logo-in 1s ease-out 0.3s forwards",
          }}
        />
      </div>
    </div>
  );
}
