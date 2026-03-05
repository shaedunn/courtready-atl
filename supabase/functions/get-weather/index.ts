import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const OPENWEATHER_API_KEY = Deno.env.get("OPENWEATHER_API_KEY");
  if (!OPENWEATHER_API_KEY) {
    return new Response(JSON.stringify({ error: "OpenWeather API key not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { lat, lon } = await req.json();
    if (!lat || !lon) {
      return new Response(JSON.stringify({ error: "lat and lon required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&units=imperial&exclude=minutely,daily,alerts&appid=${OPENWEATHER_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(`OpenWeather API error [${res.status}]: ${JSON.stringify(data)}`);
    }

    return new Response(JSON.stringify({
      temp: data.current?.temp,
      humidity: data.current?.humidity,
      wind_speed: data.current?.wind_speed,
      rain_1h: data.current?.rain?.["1h"] ?? 0,
      description: data.current?.weather?.[0]?.description,
      icon: data.current?.weather?.[0]?.icon,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
