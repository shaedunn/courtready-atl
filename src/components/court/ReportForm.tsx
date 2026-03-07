import { useState, useRef, useEffect } from "react";
import { Camera, Cloud, Thermometer, Droplets, Wind, AlertTriangle, Info, Leaf } from "lucide-react";
import { supabase, SOVEREIGN_ANON, type SovereignCourt } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  calculateDryTime,
  formatDryTime,
  HINDRANCE_OPTIONS,
  RAINFALL_CATEGORIES,
  type Hindrance,
  type RainfallCategory,
} from "@/lib/courts";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

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
  court: SovereignCourt;
  onSubmitted: () => void;
}) {
  // Rainfall categorical picker
  const [rainfallCategory, setRainfallCategory] = useState<RainfallCategory | null>(null);
  const [customRainfall, setCustomRainfall] = useState("");

  const [squeegee, setSqueegee] = useState<0 | 1 | 2>(0);
  const [hindrances, setHindrances] = useState<Hindrance[]>([]);
  const [debrisOnCourt, setDebrisOnCourt] = useState(false);
  const [observations, setObservations] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const [manualTemp, setManualTemp] = useState("");
  const [manualHumidity, setManualHumidity] = useState("");
  const [manualWind, setManualWind] = useState("");
  const isManualEntry = !weather && !!weatherError && !weatherLoading;

  useEffect(() => {
    if (!court.lat || !court.lon) {
      setWeatherError("No coordinates for this court");
      return;
    }
    setWeatherLoading(true);
    const ts = Date.now();
    fetch(`https://racdnnitrapgqozxctsk.supabase.co/functions/v1/get-weather?t=${ts}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SOVEREIGN_ANON,
        Authorization: `Bearer ${SOVEREIGN_ANON}`,
      },
      body: JSON.stringify({ lat: court.lat, lon: court.lon, t: ts }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data?.temp) {
          setWeatherError("Could not fetch weather");
        } else {
          setWeather(data as WeatherData);
        }
      })
      .catch(() => setWeatherError("Could not fetch weather"))
      .finally(() => setWeatherLoading(false));
  }, [court.lat, court.lon]);

  // Derive effective rainfall from category
  const getEffectiveRainfall = (): number | null => {
    if (!rainfallCategory) return null;
    if (rainfallCategory === "custom") {
      const v = parseFloat(customRainfall);
      return isNaN(v) || v < 0 ? null : v;
    }
    const cat = RAINFALL_CATEGORIES.find((c) => c.value === rainfallCategory);
    return cat?.amount ?? null;
  };

  const getEffectiveWeather = (): {
    temp: number;
    humidity: number;
    wind_speed: number;
    description: string;
    isManual: boolean;
  } | null => {
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
  const effectiveRainfall = getEffectiveRainfall();
  const manualReady = isManualEntry && effectiveWeather !== null;

  // Sovereign court values — debris applies 20% drainage penalty
  const sunExposure = court.sun_exposure;
  const effectiveDrainage = debrisOnCourt ? court.drainage * 0.8 : court.drainage;

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (effectiveRainfall === null || effectiveRainfall < 0) throw new Error("Invalid rainfall");
      const ew = getEffectiveWeather();
      if (!ew) throw new Error("Weather data required");

      const dryTime = calculateDryTime(
        effectiveRainfall, squeegee, ew.temp, ew.humidity, ew.wind_speed,
        sunExposure, effectiveDrainage, hindrances
      );

      const obs = [
        ew.isManual ? "[Manual Entry]" : "",
        debrisOnCourt ? "[Debris on Court]" : "",
        observations.trim(),
      ].filter(Boolean).join(" ") || null;

      const { error } = await supabase.from("reports").insert({
        court_id: court.id,
        rainfall: effectiveRainfall,
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
        drainage: effectiveDrainage,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["latest-report", court.id] });
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

  const previewDryTime = (() => {
    const rain = effectiveRainfall;
    const ew = getEffectiveWeather();
    if (rain === null || rain <= 0 || !ew) return null;
    return calculateDryTime(rain, squeegee, ew.temp, ew.humidity, ew.wind_speed, sunExposure, effectiveDrainage, hindrances);
  })();

  const canSubmit = !submitMutation.isPending && (!!weather || manualReady) && effectiveRainfall !== null && effectiveRainfall > 0;

  const inputClasses =
    "w-full bg-secondary text-foreground rounded-lg px-3 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50";

  const humidityTooltip = (humidity: number) => {
    if (humidity >= 80) return `Calculated for hyper-local humidity (${Math.round(humidity)}%). High moisture in the air significantly slows natural evaporation.`;
    if (humidity >= 60) return `Humidity at ${Math.round(humidity)}%. Moderate moisture — expect standard drying times.`;
    return `Humidity at ${Math.round(humidity)}%. Low moisture aids faster evaporation.`;
  };

  return (
    <div className="bg-card rounded-lg p-5 border border-border space-y-4 card-glow">
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Captain's Report</h3>

      {/* Weather badges */}
      <TooltipProvider delayDuration={100}>
        <div className="flex flex-wrap gap-2 items-center">
          {weatherLoading && (
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          )}
          {isManualEntry && !manualReady && <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" /> Offline — manual entry below</Badge>}
          {isManualEntry && manualReady && <Badge variant="outline" className="border-accent text-accent-foreground"><AlertTriangle className="w-3 h-3 mr-1" /> Manual Entry</Badge>}
          {weather && (
            <>
              <Badge variant="secondary"><Thermometer className="w-3 h-3 mr-1" /> {Math.round(weather.temp)}°F</Badge>
              <Badge variant="secondary"><Droplets className="w-3 h-3 mr-1" /> {Math.round(weather.humidity)}%</Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] text-xs">
                  {humidityTooltip(weather.humidity)}
                </TooltipContent>
              </Tooltip>
              <Badge variant="secondary"><Wind className="w-3 h-3 mr-1" /> {Math.round(weather.wind_speed)} mph</Badge>
            </>
          )}
        </div>
      </TooltipProvider>

      {/* Manual weather entry fallback */}
      {isManualEntry && (
        <div className="bg-destructive/10 rounded-lg p-3 space-y-3 border border-destructive/20">
          <p className="text-xs font-medium text-destructive">Weather API offline — enter conditions manually</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Temp (°F)</label>
              <input type="number" value={manualTemp} onChange={(e) => setManualTemp(e.target.value)} placeholder="73" className={inputClasses} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Humidity (%)</label>
              <input type="number" value={manualHumidity} onChange={(e) => setManualHumidity(e.target.value)} placeholder="1" className={inputClasses} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Wind (mph)</label>
              <input type="number" value={manualWind} onChange={(e) => setManualWind(e.target.value)} placeholder="5" className={inputClasses} />
            </div>
          </div>
        </div>
      )}

      {/* Rainfall categorical picker */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Rainfall</label>
        <div className="flex flex-wrap gap-2">
          {RAINFALL_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setRainfallCategory(cat.value)}
              className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
                rainfallCategory === cat.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-muted-foreground border-border hover:border-primary/30"
              }`}
            >
              <span className="font-medium">{cat.label}</span>
              {cat.amount !== null && <span className="block text-[10px] opacity-70">{cat.amount}"</span>}
              {"description" in cat && cat.description && (
                <span className="block text-[10px] opacity-60">{cat.description}</span>
              )}
            </button>
          ))}
        </div>
        {rainfallCategory === "custom" && (
          <input
            type="number"
            min="0"
            step="0.01"
            value={customRainfall}
            onChange={(e) => setCustomRainfall(e.target.value)}
            placeholder='e.g. 0.15"'
            className={`${inputClasses} mt-2`}
          />
        )}
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

      {/* Debris toggle */}
      <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-3 border border-border">
        <div className="flex items-center gap-2">
          <Leaf className="w-4 h-4 text-muted-foreground" />
          <div>
            <span className="text-xs font-medium">Debris on Court?</span>
            <span className="text-[10px] text-muted-foreground block">Leaves/pine needles (−20% drainage)</span>
          </div>
        </div>
        <Switch checked={debrisOnCourt} onCheckedChange={setDebrisOnCourt} />
      </div>

      {/* Physical hindrances */}
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

      {/* Dry time preview */}
      {previewDryTime !== null && (
        <div className="bg-secondary/50 rounded-lg p-3 text-center">
          <span className="text-xs text-muted-foreground">Estimated dry time: </span>
          <span className="text-sm font-bold font-mono text-primary">{formatDryTime(previewDryTime)}</span>
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
          {submitMutation.isPending ? "Submitting..." : isManualEntry ? "Submit (Manual)" : "Submit"}
        </button>
      </div>
    </div>
  );
}
