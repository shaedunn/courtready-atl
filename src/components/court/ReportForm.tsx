import { useState, useRef, useEffect } from "react";
import { Camera, Thermometer, Droplets, Wind, AlertTriangle, Info, Leaf } from "lucide-react";
import { supabase, SOVEREIGN_ANON, type SovereignCourt, getDisplayName, setDisplayName } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  calculateDryTime,
  calculateSqueegeeDryTime,
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
import SubCourtSelector, { type SubCourt } from "@/components/court/SubCourtSelector";

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
  const [rainfallCategory, setRainfallCategory] = useState<RainfallCategory | null>(null);
  const [customRainfall, setCustomRainfall] = useState("");
  const [squeegee, setSqueegee] = useState<0 | 1 | 2>(0);
  const [hindrances, setHindrances] = useState<Hindrance[]>([]);
  const [debrisOnCourt, setDebrisOnCourt] = useState(false);
  const [observations, setObservations] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [displayName, setLocalDisplayName] = useState(getDisplayName());
  const [selectedCourtNumber, setSelectedCourtNumber] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch sub-courts for this facility
  const { data: subCourts = [] } = useQuery<SubCourt[]>({
    queryKey: ["sub-courts", court.id],
    queryFn: async () => {
      console.log("Fetching for Facility:", court.id);
      const facilityQuery = await (supabase.from("sub_courts") as any)
        .select("*")
        .eq("facility_id", court.id)
        .order("court_number");

      if (!facilityQuery.error) {
        console.log("Raw Data Received:", facilityQuery.data ?? []);
        return (facilityQuery.data ?? []) as SubCourt[];
      }

      const { data, error } = await supabase
        .from("sub_courts")
        .select("*")
        .eq("court_id", court.id)
        .order("court_number");
      if (error) throw error;
      console.log("Raw Data Received:", data ?? []);
      return data as unknown as SubCourt[];
    },
  });

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

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
        apikey: SOVEREIGN_ANON,
        Authorization: `Bearer ${SOVEREIGN_ANON}`,
      },
      body: JSON.stringify({ lat: court.latitude, lon: court.longitude, t: ts }),
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
  }, [court.latitude, court.longitude]);

  const getEffectiveRainfall = (): number | null => {
    if (!rainfallCategory) return null;
    if (rainfallCategory === "custom") {
      const v = parseFloat(customRainfall);
      return isNaN(v) || v < 0 ? null : v;
    }
    const cat = RAINFALL_CATEGORIES.find((c) => c.value === rainfallCategory);
    return cat?.amount ?? null;
  };

  const getEffectiveWeather = () => {
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

  // Use sub-court ratings if selected, otherwise facility defaults
  const selectedSubCourt = selectedCourtNumber !== null ? subCourts.find((sc) => sc.court_number === selectedCourtNumber) : null;
  const sunExposure = selectedSubCourt ? selectedSubCourt.sun_exposure : court.sun_exposure;
  const baseDrainage = selectedSubCourt ? selectedSubCourt.drainage : court.drainage;
  const effectiveDrainage = debrisOnCourt ? baseDrainage * 0.8 : baseDrainage;

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (effectiveRainfall === null || effectiveRainfall < 0) throw new Error("Invalid rainfall");
      const ew = getEffectiveWeather();
      if (!ew) throw new Error("Weather data required");

      // Save display name
      if (displayName.trim()) setDisplayName(displayName.trim());

      const dryTime = calculateDryTime(
        effectiveRainfall, squeegee, ew.temp, ew.humidity, ew.wind_speed,
        sunExposure, effectiveDrainage, hindrances
      );

      const obs = [
        ew.isManual ? "[Manual Entry]" : "",
        debrisOnCourt ? "[Debris on Court]" : "",
        displayName.trim() ? `[Reporter: ${displayName.trim()}]` : "",
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

  const previewNaturalDryTime = (() => {
    const rain = effectiveRainfall;
    const ew = getEffectiveWeather();
    if (rain === null || rain <= 0 || !ew) return null;
    return calculateDryTime(rain, 0, ew.temp, ew.humidity, ew.wind_speed, sunExposure, effectiveDrainage, hindrances);
  })();

  const previewSqueegeeDryTime = previewNaturalDryTime !== null ? calculateSqueegeeDryTime(previewNaturalDryTime) : null;

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

      {/* Sub-Court Selector */}
      <SubCourtSelector subCourts={subCourts} selectedNumber={selectedCourtNumber} onSelect={setSelectedCourtNumber} />

      {/* Display Name */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Your Display Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setLocalDisplayName(e.target.value)}
          placeholder="e.g. Captain Dunn"
          className={inputClasses}
        />
      </div>

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

      {/* Dual dry time preview */}
      {previewNaturalDryTime !== null && previewNaturalDryTime > 0 && (
        <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Natural Dry Time:</span>
            <span className="text-sm font-bold font-mono text-court-amber">{formatDryTime(previewNaturalDryTime)}</span>
          </div>
          {previewSqueegeeDryTime !== null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Squeegee Assisted:</span>
              <span className="text-sm font-bold font-mono text-primary">{formatDryTime(previewSqueegeeDryTime)}</span>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground text-right italic">V1 Predictor Model</p>
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
