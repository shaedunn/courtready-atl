import { useState, useRef, useEffect } from "react";
import { Camera, Cloud, Thermometer, Droplets, Wind } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

  useEffect(() => {
    if (!court.latitude || !court.longitude) {
      setWeatherError("No coordinates for this court");
      return;
    }
    setWeatherLoading(true);
    supabase.functions
      .invoke("get-weather", {
        body: { lat: court.latitude, lon: court.longitude },
      })
      .then(({ data, error }) => {
        if (error || !data?.temp) {
          setWeatherError("Could not fetch weather");
        } else {
          setWeather(data as WeatherData);
        }
      })
      .finally(() => setWeatherLoading(false));
  }, [court.latitude, court.longitude]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const rain = parseFloat(rainfall);
      if (isNaN(rain) || rain < 0) throw new Error("Invalid rainfall");

      const temp = weather?.temp ?? 70;
      const hum = weather?.humidity ?? 50;
      const wind = weather?.wind_speed ?? 0;

      const dryTime = calculateDryTime(
        rain,
        squeegee,
        temp,
        hum,
        wind,
        sunExposure,
        drainage,
        hindrances
      );

      const { error } = await supabase.from("reports").insert({
        court_id: court.id,
        rainfall: rain,
        squeegee_count: squeegee,
        sky_condition: weather?.description ?? "Unknown",
        hindrances: hindrances,
        abstract_observations: observations.trim() || null,
        photo_url: photo || null,
        estimated_dry_minutes: dryTime,
        temperature: weather?.temp ?? null,
        humidity: weather?.humidity ?? null,
        wind_speed: weather?.wind_speed ?? null,
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
    if (h === "none") {
      setHindrances(["none"]);
      return;
    }
    setHindrances((prev) => {
      const without = prev.filter((v) => v !== "none");
      return without.includes(h) ? without.filter((v) => v !== h) : [...without, h];
    });
  };

  // Live preview dry time
  const previewDryTime = (() => {
    const rain = parseFloat(rainfall);
    if (isNaN(rain) || rain <= 0) return null;
    const temp = weather?.temp ?? 70;
    const hum = weather?.humidity ?? 50;
    const wind = weather?.wind_speed ?? 0;
    return calculateDryTime(rain, squeegee, temp, hum, wind, sunExposure, drainage, hindrances);
  })();

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
        {weatherError && (
          <Badge variant="destructive">
            <Cloud className="w-3 h-3 mr-1" /> {weatherError}
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

      {/* Rainfall */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Rainfall (mm)</label>
        <input
          type="number"
          min="0"
          step="0.5"
          value={rainfall}
          onChange={(e) => setRainfall(e.target.value)}
          placeholder="e.g. 5"
          className={inputClasses}
        />
      </div>

      {/* Squeegee */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Squeegee Count</label>
        <select
          value={squeegee}
          onChange={(e) => setSqueegee(Number(e.target.value) as 0 | 1 | 2)}
          className={inputClasses}
        >
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
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleHindrance(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                hindrances.includes(opt.value)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-muted-foreground border-border hover:border-primary/30"
              }`}
            >
              {opt.label} ({opt.multiplier}x)
            </button>
          ))}
        </div>
      </div>

      {/* Sun Exposure slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-muted-foreground">Sun Exposure</label>
          <span className="text-xs font-mono text-muted-foreground">
            {Math.round(sunExposure * 100)}%
          </span>
        </div>
        <Slider
          value={[sunExposure]}
          onValueChange={([v]) => setSunExposure(v)}
          min={0}
          max={1}
          step={0.05}
        />
      </div>

      {/* Drainage slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-muted-foreground">Drainage</label>
          <span className="text-xs font-mono text-muted-foreground">
            {Math.round(drainage * 100)}%
          </span>
        </div>
        <Slider
          value={[drainage]}
          onValueChange={([v]) => setDrainage(v)}
          min={0}
          max={1}
          step={0.05}
        />
      </div>

      {/* Observations */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">
          Abstract Observations
        </label>
        <textarea
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder="Tribal knowledge, specific court notes..."
          rows={3}
          className={`${inputClasses} resize-none`}
        />
      </div>

      {/* Photo */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Photo</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhoto}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          className={`flex items-center gap-2 text-sm text-muted-foreground bg-secondary rounded-lg px-3 py-2.5 border border-border hover:border-primary/30 transition-colors w-full`}
        >
          <Camera className="w-4 h-4" />
          {photo ? "Photo captured ✓" : "Take or upload photo"}
        </button>
        {photo && (
          <img src={photo} alt="Court photo" className="mt-2 rounded-lg w-full h-32 object-cover" />
        )}
      </div>

      {/* Live preview */}
      {previewDryTime !== null && (
        <div className="bg-secondary/50 rounded-lg p-3 text-center">
          <span className="text-xs text-muted-foreground">Estimated dry time: </span>
          <span className="text-sm font-bold font-mono text-primary">
            {previewDryTime} min
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onSubmitted}
          className="flex-1 bg-secondary text-secondary-foreground py-2.5 rounded-lg text-sm font-medium hover:brightness-110 transition-all"
        >
          Cancel
        </button>
        <button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending}
          className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {submitMutation.isPending ? "Submitting..." : "Submit"}
        </button>
      </div>
    </div>
  );
}
