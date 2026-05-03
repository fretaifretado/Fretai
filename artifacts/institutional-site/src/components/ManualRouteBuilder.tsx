import { useState, useEffect, useMemo, useCallback, Fragment, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface MapWorker {
  id: number; name: string; lat: number; lng: number;
  shift: string | null; boardingPointId: number | null;
}

export interface ManualBP {
  id: number; name: string; lat: number; lng: number;
  radiusKm: number; shiftTime: string | null; direction: string | null;
  passengerCount: number; sequenceOrder: number | null;
  workerIds: number[];
}

interface Props {
  budgetId: number; token: string | null;
  workers: MapWorker[]; companyLat: number; companyLng: number;
  onFinalize: () => void;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* Parse both entry (start) and exit (end) times from a shift string.
   Supports formats: "06:00/14:20 SEG/SAB", "06:00", "MANHÃ", etc. */
function parseShiftTimes(shift: string | null): { entry: string | null; exit: string | null } {
  if (!shift) return { entry: null, exit: null };
  const times = shift.match(/\d{1,2}:\d{2}/g);
  if (times && times.length >= 2) {
    return { entry: times[0]!.padStart(5, "0"), exit: times[1]!.padStart(5, "0") };
  }
  if (times && times.length === 1) {
    return { entry: times[0]!.padStart(5, "0"), exit: null };
  }
  const s = shift.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (s.startsWith("man")) return { entry: "06:00", exit: "14:20" };
  if (s.startsWith("tar")) return { entry: "14:20", exit: "22:30" };
  if (s.startsWith("noi")) return { entry: "22:30", exit: "06:00" };
  return { entry: shift.trim().substring(0, 5) || null, exit: null };
}

/* Backward compat: extract just the start time */
function parseShiftStart(shift: string | null): string | null {
  return parseShiftTimes(shift).entry;
}

/* Shift option key format: "${time}|${direction}"  e.g. "06:00|ida", "06:00|volta" */
type ShiftKey = string;

interface ShiftOption {
  key: ShiftKey;
  time: string;
  direction: "ida" | "volta";
  count: number;
}

const SHIFT_COLORS: Record<string, string> = { "06:00": "#3b82f6", "14:20": "#f59e0b", "22:30": "#8b5cf6" };

function getShiftColor(timeOrKey: string | null): string {
  if (!timeOrKey) return "#6b7280";
  const time = timeOrKey.includes("|") ? timeOrKey.split("|")[0]! : timeOrKey;
  return SHIFT_COLORS[time] ?? "#10b981";
}

function parseShiftKey(key: ShiftKey): { time: string; direction: "ida" | "volta" } {
  const parts = key.split("|");
  return { time: parts[0] ?? "", direction: (parts[1] ?? "ida") as "ida" | "volta" };
}

const companyIcon = L.divIcon({
  html: `<div style="width:26px;height:26px;background:#16a34a;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:7px;height:7px;background:white;border-radius:50%;"></div></div>`,
  className: "", iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -15],
});

function makeWorkerIcon(color: string, inRadius: boolean, assigned: boolean): L.DivIcon {
  const sz = inRadius ? 28 : 20;
  const opacity = assigned && !inRadius ? 0.3 : 1;
  const border = inRadius ? `3px solid white` : `2px solid white`;
  const shadow = inRadius ? `box-shadow:0 2px 8px rgba(0,0,0,0.35),0 0 0 3px ${color}50;` : `box-shadow:0 1px 4px rgba(0,0,0,0.25);`;
  const personSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white' width='${Math.round(sz * 0.58)}' height='${Math.round(sz * 0.58)}'><circle cx='12' cy='7' r='4'/><path d='M12 14c-5.33 0-8 2.67-8 4v1h16v-1c0-1.33-2.67-4-8-4z'/></svg>`;
  return L.divIcon({
    html: `<div style="width:${sz}px;height:${sz}px;background:${color};border:${border};border-radius:50%;opacity:${opacity};${shadow}display:flex;align-items:center;justify-content:center;transition:all 0.15s;">${personSvg}</div>`,
    className: "", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2], popupAnchor: [0, -sz / 2 - 2],
  });
}

function makeBPIcon(seq: number, color: string, selected: boolean, direction: string | null): L.DivIcon {
  const arrow = direction === "volta" ? "←" : "→";
  return L.divIcon({
    html: `<div style="width:32px;height:32px;background:${selected ? "#1d4ed8" : color};border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.4);display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-weight:800;font-size:11px;line-height:1;">${seq}<span style="font-size:8px;opacity:0.85;">${arrow}</span></div>`,
    className: "", iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -20],
  });
}

function MapClickHandler({ mode, onMapClick }: { mode: string; onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => { if (mode === "draw" || mode === "move") onMapClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function MapCursorController({ mode }: { mode: string }) {
  const map = useMap();
  useEffect(() => {
    map.getContainer().style.cursor = (mode === "draw" || mode === "move") ? "crosshair" : "";
  }, [mode, map]);
  return null;
}

function FitWorkersBounds({ workers, companyLat, companyLng }: { workers: MapWorker[]; companyLat: number; companyLng: number }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    const pts: [number, number][] = [...workers.map(w => [w.lat, w.lng] as [number, number]), [companyLat, companyLng]];
    if (pts.length > 1) { map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] }); fitted.current = true; }
  }, [workers, companyLat, companyLng, map]);
  return null;
}

export function ManualRouteBuilder({ budgetId, token, workers, companyLat, companyLng, onFinalize }: Props) {
  const [bps, setBps] = useState<ManualBP[]>([]);
  const [mode, setMode] = useState<"view" | "draw" | "move">("view");
  const [radiusKm, setRadiusKm] = useState(1.0);
  const [selectedShiftKey, setSelectedShiftKey] = useState<ShiftKey>("all");
  const [tempBP, setTempBP] = useState<{ lat: number; lng: number } | null>(null);
  const [tempBPKey, setTempBPKey] = useState<ShiftKey>("");
  const [selectedBpId, setSelectedBpId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const hdrs = useMemo(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }), [token]);

  /* Generate shift options from worker data — one entry per (time, direction) combination */
  const shiftOptions = useMemo((): ShiftOption[] => {
    const counts = new Map<ShiftKey, number>();
    for (const w of workers) {
      const { entry, exit } = parseShiftTimes(w.shift);
      if (entry) {
        const k = `${entry}|ida`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      if (exit) {
        const k = `${exit}|volta`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([key, count]) => {
        const { time, direction } = parseShiftKey(key);
        return { key, time, direction, count };
      })
      .sort((a, b) => a.time.localeCompare(b.time) || (a.direction === "ida" ? -1 : 1));
  }, [workers]);

  useEffect(() => {
    if (shiftOptions.length > 0 && !tempBPKey) setTempBPKey(shiftOptions[0]!.key);
  }, [shiftOptions, tempBPKey]);

  const loadBPs = useCallback(async () => {
    const r = await fetch(`/api/admin/budgets/${budgetId}/boarding-points`, { headers: hdrs });
    setBps(await r.json() as ManualBP[]);
  }, [budgetId, hdrs]);

  useEffect(() => { void loadBPs(); }, [loadBPs]);

  /* Filter workers shown on map based on selected shift+direction */
  const displayWorkers = useMemo(() => {
    if (selectedShiftKey === "all") return workers;
    const { time, direction } = parseShiftKey(selectedShiftKey);
    return workers.filter(w => {
      const { entry, exit } = parseShiftTimes(w.shift);
      return direction === "volta" ? exit === time : entry === time;
    });
  }, [workers, selectedShiftKey]);

  const assignedIds = useMemo(() => new Set(bps.flatMap(b => b.workerIds)), [bps]);

  /* Workers captured by the temp boarding point preview circle */
  const tempWorkerIds = useMemo(() => {
    if (!tempBP || !tempBPKey) return new Set<number>();
    const { time, direction } = parseShiftKey(tempBPKey);
    const eligible = workers.filter(w => {
      const { entry, exit } = parseShiftTimes(w.shift);
      const matches = direction === "volta" ? exit === time : entry === time;
      return matches && !assignedIds.has(w.id);
    });
    return new Set(eligible.filter(w => haversineKm(w.lat, w.lng, tempBP.lat, tempBP.lng) <= radiusKm).map(w => w.id));
  }, [tempBP, radiusKm, tempBPKey, workers, assignedIds]);

  const tempEstKm = useMemo(() =>
    tempBP ? parseFloat((haversineKm(tempBP.lat, tempBP.lng, companyLat, companyLng) * 1.4).toFixed(1)) : 0,
    [tempBP, companyLat, companyLng]);

  const selectedBP = useMemo(() => bps.find(b => b.id === selectedBpId) ?? null, [bps, selectedBpId]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (mode === "draw") setTempBP({ lat, lng });
    else if (mode === "move" && selectedBpId) void doMoveBP(selectedBpId, lat, lng);
  }, [mode, selectedBpId]);

  const doSaveBP = async () => {
    if (!tempBP) return;
    setSaving(true);
    const { time, direction } = parseShiftKey(tempBPKey);
    try {
      await fetch(`/api/admin/budgets/${budgetId}/boarding-points`, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({
          lat: tempBP.lat, lng: tempBP.lng, radiusKm,
          shiftTime: time, direction,
          workerIds: [...tempWorkerIds],
          name: `Ponto ${bps.length + 1}`,
        }),
      });
      await loadBPs();
      setTempBP(null);
      setMode("view");
    } finally { setSaving(false); }
  };

  const doMoveBP = async (bpId: number, newLat: number, newLng: number) => {
    const bp = bps.find(b => b.id === bpId);
    if (!bp) return;
    const bpDir = bp.direction ?? "ida";
    const bpTime = bp.shiftTime ?? "";
    const eligible = workers.filter(w => {
      const { entry, exit } = parseShiftTimes(w.shift);
      return bpDir === "volta" ? exit === bpTime : entry === bpTime;
    });
    const newWorkerIds = eligible.filter(w => haversineKm(w.lat, w.lng, newLat, newLng) <= bp.radiusKm).map(w => w.id);
    await fetch(`/api/admin/budgets/${budgetId}/boarding-points/${bpId}`, {
      method: "PUT", headers: hdrs,
      body: JSON.stringify({ lat: newLat, lng: newLng, radiusKm: bp.radiusKm, workerIds: newWorkerIds }),
    });
    await loadBPs();
    setMode("view");
    setSelectedBpId(null);
  };

  const doDeleteBP = async (bpId: number) => {
    if (!confirm("Excluir este ponto de embarque?")) return;
    await fetch(`/api/admin/budgets/${budgetId}/boarding-points/${bpId}`, { method: "DELETE", headers: hdrs });
    await loadBPs();
    setSelectedBpId(null);
  };

  const totalPax = bps.reduce((s, b) => s + b.passengerCount, 0);

  return (
    <div className="flex border rounded-xl overflow-hidden" style={{ height: "calc(100vh - 220px)", minHeight: "540px" }}>

      {/* ── LEFT PANEL ── */}
      <div className="w-72 flex-shrink-0 flex flex-col bg-card border-r overflow-hidden">

        {/* Shift filter */}
        <div className="p-3 border-b bg-muted/20">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Turno visível no mapa</p>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setSelectedShiftKey("all")}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${selectedShiftKey === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              Todos
            </button>
            {shiftOptions.map(opt => {
              const isSelected = selectedShiftKey === opt.key;
              const color = getShiftColor(opt.time);
              const arrow = opt.direction === "volta" ? "←" : "→";
              return (
                <button key={opt.key} onClick={() => setSelectedShiftKey(opt.key)}
                  style={isSelected ? { backgroundColor: color } : undefined}
                  title={`${opt.time} ${opt.direction === "volta" ? "Volta (saída do trabalho)" : "Ida (entrada no trabalho)"} · ${opt.count} funcionários`}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors flex items-center gap-1 ${isSelected ? "text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                  <span>{opt.time}</span>
                  <span className="opacity-90">{arrow}</span>
                </button>
              );
            })}
          </div>
          {selectedShiftKey !== "all" && (() => {
            const { direction } = parseShiftKey(selectedShiftKey);
            return (
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {direction === "volta"
                  ? "← Volta: funcionários que saem do trabalho nesse horário"
                  : "→ Ida: funcionários que entram no trabalho nesse horário"}
              </p>
            );
          })()}
        </div>

        {/* Radius slider */}
        <div className="p-3 border-b">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-muted-foreground font-medium">Raio do Ponto</span>
            <span className="text-sm font-bold tabular-nums">{radiusKm.toFixed(1)} km</span>
          </div>
          <input type="range" min="0.1" max="3.0" step="0.1" value={radiusKm}
            onChange={e => setRadiusKm(parseFloat(e.target.value))}
            className="w-full accent-primary h-1.5 cursor-pointer" />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>100 m</span><span>3 km</span>
          </div>
        </div>

        {/* Mode panel */}
        <div className="p-3 border-b min-h-[130px]">
          {mode === "view" && !selectedBP && (
            <button onClick={() => { setMode("draw"); setTempBP(null); }}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 px-3 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
              <span className="text-base leading-none font-bold">+</span> Adicionar Ponto
            </button>
          )}

          {mode === "draw" && !tempBP && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-primary font-medium">
                <span className="w-2 h-2 bg-primary rounded-full animate-pulse inline-block flex-shrink-0" />
                Clique no mapa para posicionar
              </div>
              <p className="text-xs text-muted-foreground">O raio capturará funcionários do turno e sentido selecionados</p>
              <button onClick={() => setMode("view")} className="w-full border rounded-lg py-1.5 text-sm text-muted-foreground hover:bg-muted/50">Cancelar</button>
            </div>
          )}

          {mode === "draw" && tempBP && (
            <div className="space-y-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Novo Ponto de Embarque</p>
              <div>
                <label className="text-xs text-muted-foreground">Turno e sentido</label>
                <select value={tempBPKey} onChange={e => setTempBPKey(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background mt-1 focus:outline-none focus:ring-1 focus:ring-primary">
                  {shiftOptions.map(opt => (
                    <option key={opt.key} value={opt.key}>
                      {opt.time} {opt.direction === "volta" ? "← Volta" : "→ Ida"} ({opt.count} func.)
                    </option>
                  ))}
                </select>
              </div>
              <div className="bg-muted/30 rounded-lg p-2.5 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[10px] text-muted-foreground">Passageiros</p><p className="text-sm font-bold">{tempWorkerIds.size}</p></div>
                <div><p className="text-[10px] text-muted-foreground">Distância</p><p className="text-sm font-bold">{tempEstKm} km</p></div>
                <div><p className="text-[10px] text-muted-foreground">Tempo est.</p><p className="text-sm font-bold">{Math.round(tempEstKm / 40 * 60 + 3)} min</p></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => void doSaveBP()} disabled={saving || tempWorkerIds.size === 0}
                  className="bg-primary text-primary-foreground py-2 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">
                  {saving ? "…" : "✓ Salvar"}
                </button>
                <button onClick={() => { setTempBP(null); setMode("view"); }} className="border rounded-lg py-2 text-sm hover:bg-muted/50">✕ Cancelar</button>
              </div>
              {tempWorkerIds.size === 0 && <p className="text-xs text-destructive text-center">Nenhum funcionário nesse raio/turno/sentido</p>}
              <button onClick={() => setTempBP(null)} className="w-full text-xs text-muted-foreground hover:text-foreground text-center">Reposicionar →</button>
            </div>
          )}

          {mode === "view" && selectedBP && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: getShiftColor(selectedBP.shiftTime) }}>
                  {selectedBP.sequenceOrder}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{selectedBP.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedBP.shiftTime}
                    {selectedBP.direction && (
                      <span className={`ml-1 font-semibold ${selectedBP.direction === "volta" ? "text-violet-600" : "text-blue-600"}`}>
                        {selectedBP.direction === "volta" ? "← Volta" : "→ Ida"}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="bg-muted/30 rounded-lg p-2.5 grid grid-cols-3 gap-1 text-center">
                <div><p className="text-[10px] text-muted-foreground">Pax</p><p className="text-sm font-bold">{selectedBP.passengerCount}</p></div>
                <div><p className="text-[10px] text-muted-foreground">Raio</p><p className="text-sm font-bold">{selectedBP.radiusKm}km</p></div>
                <div><p className="text-[10px] text-muted-foreground">Dist.</p><p className="text-sm font-bold">{(haversineKm(selectedBP.lat, selectedBP.lng, companyLat, companyLng) * 1.4).toFixed(1)}km</p></div>
              </div>
              <button onClick={() => setMode("move")} className="w-full border rounded-lg py-1.5 text-sm font-medium hover:bg-muted/50">↕ Mover Ponto</button>
              <button onClick={() => void doDeleteBP(selectedBP.id)} className="w-full border border-destructive/60 text-destructive rounded-lg py-1.5 text-sm font-medium hover:bg-destructive/10">✕ Excluir</button>
              <button onClick={() => setSelectedBpId(null)} className="w-full text-[10px] text-muted-foreground hover:text-foreground text-center pt-1">Fechar seleção</button>
            </div>
          )}

          {mode === "move" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-amber-600 font-medium">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse inline-block flex-shrink-0" />
                Clique na nova localização do ponto
              </div>
              <button onClick={() => setMode("view")} className="w-full border rounded-lg py-1.5 text-sm text-muted-foreground hover:bg-muted/50">Cancelar</button>
            </div>
          )}
        </div>

        {/* BP list */}
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Sequência de Embarque ({bps.length} pontos)
          </p>
          {bps.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8 px-4 leading-relaxed">
              Adicione pontos de embarque. A ordem de criação será a sequência de embarque.
            </p>
          ) : (
            <div className="space-y-1.5">
              {[...bps].sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0)).map(bp => (
                <button key={bp.id} onClick={() => { setSelectedBpId(bp.id === selectedBpId ? null : bp.id); setMode("view"); setTempBP(null); }}
                  className={`w-full text-left p-2.5 rounded-lg transition-all ${selectedBpId === bp.id ? "ring-1 ring-primary bg-primary/5" : "bg-muted/30 hover:bg-muted/50"}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
                      style={{ backgroundColor: getShiftColor(bp.shiftTime) }}>
                      {bp.sequenceOrder}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center gap-1">
                        <span className="text-xs font-semibold flex items-center gap-1">
                          {bp.shiftTime}
                          <span className={`text-[10px] font-bold ${bp.direction === "volta" ? "text-violet-500" : "text-blue-500"}`}>
                            {bp.direction === "volta" ? "←" : "→"}
                          </span>
                        </span>
                        <span className="text-xs font-bold flex-shrink-0">{bp.passengerCount} pax</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {(haversineKm(bp.lat, bp.lng, companyLat, companyLng) * 1.4).toFixed(1)} km · {Math.round(haversineKm(bp.lat, bp.lng, companyLat, companyLng) * 1.4 / 40 * 60 + 3)} min est.
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Finalize */}
        <div className="p-3 border-t bg-muted/10">
          <button onClick={onFinalize} disabled={bps.length === 0}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors">
            Finalizar Pontos →
          </button>
          {bps.length > 0 && (
            <p className="text-[10px] text-muted-foreground text-center mt-1.5">
              {totalPax} passageiros · {bps.length} {bps.length === 1 ? "ponto" : "pontos"}
            </p>
          )}
        </div>
      </div>

      {/* ── MAP ── */}
      <div className="flex-1">
        <MapContainer center={[companyLat, companyLng]} zoom={13} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          <MapClickHandler mode={mode} onMapClick={handleMapClick} />
          <MapCursorController mode={mode} />
          <FitWorkersBounds workers={displayWorkers} companyLat={companyLat} companyLng={companyLng} />

          <Marker position={[companyLat, companyLng]} icon={companyIcon}>
            <Popup><strong>Empresa / Destino</strong></Popup>
          </Marker>

          {displayWorkers.map(w => {
            const { entry } = parseShiftTimes(w.shift);
            return (
              <Marker key={w.id} position={[w.lat, w.lng]}
                icon={makeWorkerIcon(getShiftColor(entry), tempBP ? tempWorkerIds.has(w.id) : false, !!w.boardingPointId)}>
                <Popup><strong>{w.name}</strong><br /><span style={{ color: "#6b7280" }}>{w.shift ?? "—"}</span></Popup>
              </Marker>
            );
          })}

          {bps.map(bp => (
            <Fragment key={bp.id}>
              <Circle center={[bp.lat, bp.lng]} radius={bp.radiusKm * 1000}
                pathOptions={{ color: getShiftColor(bp.shiftTime), fillColor: getShiftColor(bp.shiftTime), fillOpacity: selectedBpId === bp.id ? 0.15 : 0.07, weight: selectedBpId === bp.id ? 2.5 : 1.5 }}
                eventHandlers={{ click: (e) => { e.originalEvent.stopPropagation(); setSelectedBpId(bp.id === selectedBpId ? null : bp.id); setMode("view"); setTempBP(null); } }} />
              <Marker position={[bp.lat, bp.lng]} icon={makeBPIcon(bp.sequenceOrder ?? 0, getShiftColor(bp.shiftTime), selectedBpId === bp.id, bp.direction)}
                eventHandlers={{ click: (e) => { e.originalEvent.stopPropagation(); setSelectedBpId(bp.id === selectedBpId ? null : bp.id); setMode("view"); setTempBP(null); } }}>
                <Popup>
                  <strong>{bp.name}</strong><br />
                  Turno: {bp.shiftTime} {bp.direction === "volta" ? "← Volta" : "→ Ida"}<br />
                  {bp.passengerCount} passageiros
                </Popup>
              </Marker>
            </Fragment>
          ))}

          {tempBP && (
            <Circle center={[tempBP.lat, tempBP.lng]} radius={radiusKm * 1000}
              pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.13, weight: 2, dashArray: "8 5" }} />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
