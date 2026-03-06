import { useState, useRef, useEffect } from "react";
import { Camera, Cloud, Thermometer, Droplets, Wind, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { calculateDryTime, HINDRANCE_OPTIONS, type Hindrance } from "@/lib/courts";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import type { Tables } from "@/integrations/supabase/types";

type Court = Tables<"courts">;

type WeatherData = {
  temp: number;
  humidity: number;
  wind_speed: number;
  description?: string;
};

export default function ReportForm({
  court,
  onSubmitted,
}: {
  court: Court;
  onSubmitted: () => void;
}) {
  const [rainfall, setRainfall] = useState("");
  const [squeegee, setSqueegee] = useState<0 | 1 | 2>(0);
  const [hindrances, setHindrances] = useState<Hindrance[]>([]);
  const [observations, setObservations] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Court-level defaults with captain override
  const [sunExposure, setSunExposure] = useState(
    (court as any).sun_exposure ?? 0.75
  );
  const [drainage, setDrainage] = useState(
    (court as any).drainage ?? 0.5
  );

  // Weather auto-fetch
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  // Manual weather entry (fallback when API is down)
  const [manualTemp, setManualTemp] = useState("");
  const [manualHumidity, setManualHumidity] = useState("");
  const [manualWind, setManualWind] = useState("");
  const isManualEntry = !weather && !!weatherError && !weatherLoading;

  useEffect(() => {
    if (!court.latitude || !court.longitude) {
      setWeatherError("No coordinates for this court");
      return;
    }
    setWeatherLoading(true);
    const ts = Date.now();
    fetch(`https://racdnnitrapgqozxctsk.supabase.co/functions/v1/get-weather?t=${ts}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhY2Rubml0cmFwZ3FvenhjdHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3Mjk2ODMsImV4cCI6MjA4ODMwNTY4M30.2gVst0fWw5L6gUlO84cxveqFeZ97cW7_7W4CL00ELsw",
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhY2Rubml0cmFwZ3FvenhjdHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3Mjk2ODMsImV4cCI6MjA4ODMwNTY4M30.2gVst0fWw5L6gUlO84cxveqFeZ97cW7_7W4CL00ELsw",
      },
      body: JSON.stringify({ lat: court.latitude, lon: court.longitude, t: ts }),
    })
      .then(async (res) => {
        const data = await res.json();
        console.log("[ReportForm] get-weather response:", JSON.stringify(data));
        if (!res.ok || !data?.temp) {
          setWeatherError("Could not fetch weather");
        } else {
          setWeather(data as WeatherData);
        }
      })
      .catch(() => setWeatherError("Could not fetch weather"))
      .finally(() => setWeatherLoading(false));
  }, [court.latitude, court.longitude]);

  // Resolve effective weather: live or manual
  const getEffectiveWeather = (): { temp: number; humidity: number; wind_speed: number; description: string; isManual: boolean } | null => {
    if (weather) {
      return { temp: weather.temp, humidity: weather.humidity, wind_speed: weather.wind_speed, description: weather.description ?? "Live", isManual: false };
    }
    if (isManualEntry) {
      const t = parseFloat(manualTemp);
      const h = parseFloat(manualHumidity);
      const w = parseFloat(manualWind);
      if (!isNaN(t) && !isNaN(h) && !isNaN(w)) {
        return { temp: t, humidity: h, wind_speed: w, description: "Manual Entry", isManual: true };
      }
    }
    return null;
  };

  const effectiveWeather = getEffectiveWeather();
  const manualReady = isManualEntry && effectiveWeather !== null;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const rain = parseFloat(rainfall);
      if (isNaN(rain) || rain < 0) throw new Error("Invalid rainfall");

      const ew = getEffectiveWeather();
      if (!ew) throw new Error("Weather data required — enter manually or wait for API");

      const dryTime = calculateDryTime(
        rain, squeegee, ew.temp, ew.humidity, ew.wind_speed,
        sunExposure, drainage, hindrances
      );

      const obs = ew.isManual
        ? `[Manual Entry] ${observations.trim() || ""}`
        : observations.trim() || null;

      const { error } = await supabase.from("reports").insert({
        court_id: court.id,
        rainfall: rain,
        squeegee_count: squeegee,
        sky_condition: ew.description,
        hindrances: hindrances,
        abstract_observations: obs,
        photo_url: photo || null,
        estimated_dry_minutes: dryTime,
        temperature: ew.temp,
        humidity: ew.humidity,
        wind_speed: ew.wind_speed,
        sun_exposure: sunExposure,
        drainage: drainage,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["latest-report", court.slug] });
      queryClient.invalidateQueries({ queryKey: ["latest-reports"] });
      onSubmitted();
    },
  });

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggleHindrance = (h: Hindrance) => {
    if (h === "none") { setHindrances(["none"]); return; }
    setHindrances((prev) => {
      const without = prev.filter((v) => v !== "none");
      return without.includes(h) ? without.filter((v) => v !== h) : [...without, h];
    });
  };

  // Live preview dry time
  const previewDryTime = (() => {
    const rain = parseFloat(rainfall);
    const ew = getEffectiveWeather();
    if (isNaN(rain) || rain <= 0 || !ew) return null;
    return calculateDryTime(rain, squeegee, ew.temp, ew.humidity, ew.wind_speed, sunExposure, drainage, hindrances);
  })();

  const canSubmit = !submitMutation.isPending && (!!weather || manualReady);

  const inputClasses =
    "w-full bg-secondary text-foreground rounded-lg px-3 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50";

  return (
    <div className="bg-card rounded-lg p-5 border border-border space-y-4 card-glow">
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
        Captain's Report
      </h3>

      {/* Weather badge */}
      <div className="flex flex-wrap gap-2">
        {weatherLoading && (
          <Badge variant="secondary" className="animate-pulse">
            <Cloud className="w-3 h-3 mr-1" /> Fetching weather…
          </Badge>
        )}
        {isManualEntry && !manualReady && (
          <Badge variant="destructive">
            <AlertTriangle className="w-3 h-3 mr-1" /> Offline — manual entry below
          </Badge>
        )}
        {isManualEntry && manualReady && (
          <Badge variant="outline" className="border-accent text-accent-foreground">
            <AlertTriangle className="w-3 h-3 mr-1" /> Manual Entry
          </Badge>
        )}
        {weather && (
          <>
            <Badge variant="secondary">
              <Thermometer className="w-3 h-3 mr-1" /> {Math.round(weather.temp)}°F
            </Badge>
            <Badge variant="secondary">
              <Droplets className="w-3 h-3 mr-1" /> {Math.round(weather.humidity)}%
            </Badge>
            <Badge variant="secondary">
              <Wind className="w-3 h-3 mr-1" /> {Math.round(weather.wind_speed)} mph
            </Badge>
          </>
        )}
      </div>

      {/* Manual weather inputs when offline */}
      {isManualEntry && (
        <div className="bg-destructive/10 rounded-lg p-3 space-y-3 border border-destructive/20">
          <p className="text-xs font-medium text-destructive">
            Weather API offline — enter conditions manually
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Temp (°F)</label>
              <input
                type="number"
                value={manualTemp}
                onChange={(e) => setManualTemp(e.target.value)}
                placeholder="73"
                className={inputClasses}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Humidity (%)</label>
              <input
                type="number"
                value={manualHumidity}
                onChange={(e) => setManualHumidity(e.target.value)}
                placeholder="1"
                className={inputClasses}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Wind (mph)</label>
              <input
                type="number"
                value={manualWind}
                onChange={(e) => setManualWind(e.target.value)}
                placeholder="5"
                className={inputClasses}
              />
            </div>
          </div>
        </div>
      )}

      {/* Rainfall */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Rainfall (mm)</label>
        <input
          type="number" min="0" step="0.5"
          value={rainfall} onChange={(e) => setRainfall(e.target.value)}
          placeholder="e.g. 5" className={inputClasses}
        />
      </div>

      {/* Squeegee */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Squeegee Count</label>
        <select value={squeegee} onChange={(e) => setSqueegee(Number(e.target.value) as 0 | 1 | 2)} className={inputClasses}>
          <option value={0}>0 — No squeegee</option>
          <option value={1}>1 — One pass</option>
          <option value={2}>2 — Two passes</option>
        </select>
      </div>

      {/* Hindrances */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Physical Hindrances</label>
        <div className="flex flex-wrap gap-2">
          {HINDRANCE_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" onClick={() => toggleHindrance(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                hindrances.includes(opt.value)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-muted-foreground border-border hover:border-primary/30"
              }`}>
              {opt.label} ({opt.multiplier}x)
            </button>
          ))}
        </div>
      </div>

      {/* Sun Exposure slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-muted-foreground">Sun Exposure</label>
          <span className="text-xs font-mono text-muted-foreground">{Math.round(sunExposure * 100)}%</span>
        </div>
        <Slider value={[sunExposure]} onValueChange={([v]) => setSunExposure(v)} min={0} max={1} step={0.05} />
      </div>

      {/* Drainage slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-muted-foreground">Drainage</label>
          <span className="text-xs font-mono text-muted-foreground">{Math.round(drainage * 100)}%</span>
        </div>
        <Slider value={[drainage]} onValueChange={([v]) => setDrainage(v)} min={0} max={1} step={0.05} />
      </div>

      {/* Observations */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Abstract Observations</label>
        <textarea value={observations} onChange={(e) => setObservations(e.target.value)}
          placeholder="Tribal knowledge, specific court notes..." rows={3}
          className={`${inputClasses} resize-none`} />
      </div>

      {/* Photo */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Photo</label>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary rounded-lg px-3 py-2.5 border border-border hover:border-primary/30 transition-colors w-full">
          <Camera className="w-4 h-4" />
          {photo ? "Photo captured ✓" : "Take or upload photo"}
        </button>
        {photo && <img src={photo} alt="Court photo" className="mt-2 rounded-lg w-full h-32 object-cover" />}
      </div>

      {/* Live preview */}
      {previewDryTime !== null && (
        <div className="bg-secondary/50 rounded-lg p-3 text-center">
          <span className="text-xs text-muted-foreground">Estimated dry time: </span>
          <span className="text-sm font-bold font-mono text-primary">{previewDryTime} min</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={onSubmitted}
          className="flex-1 bg-secondary text-secondary-foreground py-2.5 rounded-lg text-sm font-medium hover:brightness-110 transition-all">
          Cancel
        </button>
        <button onClick={() => submitMutation.mutate()} disabled={!canSubmit}
          className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50">
          {submitMutation.isPending ? "Submitting..." : isManualEntry ? "Submit (Manual Entry)" : "Submit"}
        </button>
      </div>
    </div>
  );
}
