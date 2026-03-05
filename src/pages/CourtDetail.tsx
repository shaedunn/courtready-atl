import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Clock, Send, CloudRain, Sparkles } from "lucide-react";
import {
  COURTS,
  getLatestReport,
  addReport,
  getLogs,
  addLog,
  calculateDryTime,
  type CourtReport,
  type LogEntry,
} from "@/lib/courts";

export default function CourtDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const court = COURTS.find((c) => c.id === id);

  const [showForm, setShowForm] = useState(false);
  const [rainfall, setRainfall] = useState("");
  const [squeegee, setSqueegee] = useState<0 | 1 | 2>(0);
  const [sky, setSky] = useState<"Clear" | "Partial" | "Overcast">("Clear");
  const [photo, setPhoto] = useState<string | null>(null);
  const [logText, setLogText] = useState("");
  const [logAuthor, setLogAuthor] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>(() => getLogs(id || ""));
  const [latestReport, setLatestReport] = useState<CourtReport | undefined>(() =>
    getLatestReport(id || "")
  );
  const fileRef = useRef<HTMLInputElement>(null);

  if (!court) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Court not found</p>
      </div>
    );
  }

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const submitReport = () => {
    const rain = parseFloat(rainfall);
    if (isNaN(rain) || rain < 0) return;
    const dryTime = calculateDryTime(rain, squeegee, sky);
    const report: CourtReport = {
      id: crypto.randomUUID(),
      courtId: court.id,
      timestamp: Date.now(),
      rainfall: rain,
      squeegeeCount: squeegee,
      skyCondition: sky,
      photoUrl: photo || undefined,
      estimatedDryMinutes: dryTime,
    };
    addReport(report);
    setLatestReport(report);
    setShowForm(false);
    setRainfall("");
    setSqueegee(0);
    setSky("Clear");
    setPhoto(null);
  };

  const submitLog = () => {
    if (!logText.trim()) return;
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      courtId: court.id,
      timestamp: Date.now(),
      author: logAuthor.trim() || "Anonymous",
      message: logText.trim(),
    };
    addLog(entry);
    setLogs([entry, ...logs]);
    setLogText("");
  };

  const dryTime = latestReport
    ? Math.max(0, latestReport.estimatedDryMinutes - (Date.now() - latestReport.timestamp) / 60000)
    : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border px-4">
        <div className="max-w-lg mx-auto py-3 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm truncate">{court.name}</h1>
            <p className="text-xs text-muted-foreground">{court.location}</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Status Card */}
        <div className="bg-card rounded-lg p-5 border border-border card-glow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Current Status</span>
            {latestReport && (
              <span className="text-[11px] text-muted-foreground font-mono">
                {new Date(latestReport.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          {dryTime !== null && dryTime > 0 ? (
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <Clock className="w-5 h-5 text-court-amber" />
                <span className="text-3xl font-bold font-mono text-court-amber">{Math.round(dryTime)}</span>
                <span className="text-sm text-muted-foreground">min</span>
              </div>
              <p className="text-xs text-muted-foreground">Estimated time to playable</p>
              <div className="flex gap-3 text-[11px] text-muted-foreground justify-center pt-1">
                <span>Rain: {latestReport!.rainfall}mm</span>
                <span>·</span>
                <span>Squeegees: {latestReport!.squeegeeCount}</span>
                <span>·</span>
                <span>{latestReport!.skyCondition}</span>
              </div>
            </div>
          ) : dryTime !== null && dryTime <= 0 ? (
            <div className="text-center space-y-1">
              <Sparkles className="w-6 h-6 text-primary mx-auto" />
              <p className="text-lg font-bold text-primary text-glow">Courts are Dry</p>
              <p className="text-xs text-muted-foreground">Ready to play</p>
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-2">No recent reports</p>
          )}
        </div>

        {/* Captain Button */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-lg text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <CloudRain className="w-4 h-4" />
            Captain's Report
          </button>
        )}

        {/* Report Form */}
        {showForm && (
          <div className="bg-card rounded-lg p-5 border border-border space-y-4 card-glow">
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Captain's Report</h3>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Rainfall (mm)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={rainfall}
                onChange={(e) => setRainfall(e.target.value)}
                placeholder="e.g. 5"
                className="w-full bg-secondary text-foreground rounded-lg px-3 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Squeegee Count</label>
              <select
                value={squeegee}
                onChange={(e) => setSqueegee(Number(e.target.value) as 0 | 1 | 2)}
                className="w-full bg-secondary text-foreground rounded-lg px-3 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50"
              >
                <option value={0}>0 — No squeegee</option>
                <option value={1}>1 — One pass</option>
                <option value={2}>2 — Two passes</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Sky Conditions</label>
              <select
                value={sky}
                onChange={(e) => setSky(e.target.value as typeof sky)}
                className="w-full bg-secondary text-foreground rounded-lg px-3 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50"
              >
                <option>Clear</option>
                <option>Partial</option>
                <option>Overcast</option>
              </select>
            </div>

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
                className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary rounded-lg px-3 py-2.5 border border-border hover:border-primary/30 transition-colors w-full"
              >
                <Camera className="w-4 h-4" />
                {photo ? "Photo captured ✓" : "Take or upload photo"}
              </button>
              {photo && (
                <img src={photo} alt="Court photo" className="mt-2 rounded-lg w-full h-32 object-cover" />
              )}
            </div>

            {rainfall && parseFloat(rainfall) > 0 && (
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <span className="text-xs text-muted-foreground">Estimated dry time: </span>
                <span className="text-sm font-bold font-mono text-primary">
                  {calculateDryTime(parseFloat(rainfall), squeegee, sky)} min
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 bg-secondary text-secondary-foreground py-2.5 rounded-lg text-sm font-medium hover:brightness-110 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={submitReport}
                className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition-all"
              >
                Submit
              </button>
            </div>
          </div>
        )}

        {/* Captain's Log */}
        <div className="bg-card rounded-lg p-5 border border-border card-glow">
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-4">Captain's Log</h3>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={logAuthor}
              onChange={(e) => setLogAuthor(e.target.value)}
              placeholder="Name"
              className="w-24 bg-secondary text-foreground rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
            <input
              type="text"
              value={logText}
              onChange={(e) => setLogText(e.target.value)}
              placeholder="Leave a note..."
              onKeyDown={(e) => e.key === "Enter" && submitLog()}
              className="flex-1 bg-secondary text-foreground rounded-lg px-3 py-2 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
            <button
              onClick={submitLog}
              className="p-2 bg-primary text-primary-foreground rounded-lg hover:brightness-110 active:scale-95 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No notes yet</p>
            ) : (
              logs.map((entry) => (
                <div key={entry.id} className="text-sm border-l-2 border-border pl-3 py-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-xs">{entry.author}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(entry.timestamp).toLocaleDateString()} {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{entry.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
