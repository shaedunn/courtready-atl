import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const OPENWEATHER_API_KEY = Deno.env.get("OPENWEATHER_API_KEY");
  if (!OPENWEATHER_API_KEY) {
    console.error("OPENWEATHER_API_KEY not set");
    return new Response(JSON.stringify({ error: "OpenWeather API key not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { lat, lon, t } = body;
    console.log(`[get-weather] Request: lat=${lat}, lon=${lon}, t=${t}`);

    if (!lat || !lon) {
      return new Response(JSON.stringify({ error: "lat and lon required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache-bust nonce for OpenWeather
    const nonce = t || Date.now();
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&units=imperial&exclude=minutely,daily,alerts&appid=${OPENWEATHER_API_KEY}&_=${nonce}`;

    const res = await fetch(url, {
      headers: { "Cache-Control": "no-store" },
    });
    const data = await res.json();

    if (!res.ok) {
      console.error(`[get-weather] OpenWeather error [${res.status}]:`, JSON.stringify(data));
      throw new Error(`OpenWeather API error [${res.status}]: ${JSON.stringify(data)}`);
    }

    // Build normalized payload
    const payload = {
      temp: data.current?.temp,
      humidity: data.current?.humidity,
      wind_speed: data.current?.wind_speed,
      rain_1h: data.current?.rain?.["1h"] ?? 0,
      description: data.current?.weather?.[0]?.description,
      icon: data.current?.weather?.[0]?.icon,
    };

    console.log(`[get-weather] Response payload:`, JSON.stringify(payload));

    // Upsert into weather_cache using service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseServiceKey);

    const cacheKey = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
    const now = new Date().toISOString();

    const { error: upsertError } = await sb.from("weather_cache").upsert(
      {
        cache_key: cacheKey,
        lat,
        lon,
        temp: payload.temp,
        humidity: payload.humidity,
        wind_speed: payload.wind_speed,
        rain_1h: payload.rain_1h,
        description: payload.description,
        icon: payload.icon,
        raw_payload: data.current,
        last_requested_at: now,
        updated_at: now,
      },
      { onConflict: "cache_key" }
    );

    if (upsertError) {
      console.error(`[get-weather] Upsert error:`, upsertError.message);
    } else {
      console.log(`[get-weather] Upserted cache_key=${cacheKey}`);
    }

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[get-weather] Error:`, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
