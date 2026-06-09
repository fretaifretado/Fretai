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
  /** Coords da garagem do parceiro transportador — mostrada no mapa e usada no cálculo de KM */
  garageLat?: number | null; garageLng?: number | null; garageAddress?: string | null;
  onFinalize: () => void;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchOsrmRoute(coords: [number, number][]): Promise<{ coordinates: [number, number][]; distance: number; duration: number } | null> {
  if (coords.length < 2) return null;
  const coordStr = coords.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json() as { 
      code: string; 
      routes?: Array<{ 
        distance: number; 
        duration: number; 
        geometry: { coordinates: [number, number][] } 
      }> 
    };
    if (data.code !== "Ok" || !data.routes?.[0]?.geometry?.coordinates) return null;
    return {
      coordinates: data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]),
      distance: data.routes[0].distance / 1000, // em km
      duration: data.routes[0].duration / 60, // em minutos
    };
  } catch {
    return null;
  }
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

// Garage icon — purple truck marker
const garageIcon = L.divIcon({
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  html: `<div style="
    width:32px;height:32px;background:#7c3aed;border:2px solid #fff;
    border-radius:50% 50% 50% 0;transform:rotate(-45deg);
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 2px 6px rgba(0,0,0,0.35);">
    <span style="transform:rotate(45deg);font-size:14px;">🏠</span>
  </div>`,
});

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
    if (fitted.current || !workers) return;
    const pts: [number, number][] = [...workers.map(w => [w.lat, w.lng] as [number, number]), [companyLat, companyLng]];
    if (pts.length > 1) { map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] }); fitted.current = true; }
  }, [workers, companyLat, companyLng, map]);
  return null;
}

export function ManualRouteBuilder({ budgetId, token, workers, companyLat, companyLng, garageLat, garageLng, garageAddress, onFinalize }: Props) {
  const [bps, setBps] = useState<ManualBP[]>([]);
  const [mode, setMode] = useState<"view" | "draw" | "move">("view");
  const [radiusKm, setRadiusKm] = useState(1.0);
  const [selectedShiftKey, setSelectedShiftKey] = useState<ShiftKey>("all");
  const [tempBP, setTempBP] = useState<{ lat: number; lng: number } | null>(null);
  const [tempBPKey, setTempBPKey] = useState<ShiftKey>("");
  const [selectedBpId, setSelectedBpId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [realMetrics, setRealMetrics] = useState<Map<number, { km: number; min: number }>>(new Map());
  const [tempMetrics, setTempMetrics] = useState<{ km: number; min: number } | null>(null);

  const hdrs = useMemo(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }), [token]);

  /* Generate shift options from worker data — one entry per (time, direction) combination */
  const shiftOptions = useMemo((): ShiftOption[] => {
    const counts = new Map<ShiftKey, number>();
    if (!workers) return [];
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

  // Recalcular métricas de todos os pontos quando a lista de BPs mudar
  useEffect(() => {
    const fetchAllRealMetrics = async () => {
      const newMetrics = new Map<number, { km: number; min: number }>();
      const hasGarage = garageLat != null && garageLng != null;
      
      // Separar BPs por turno e direção para calcular a rota acumulada
      const routes = new Map<string, ManualBP[]>();
      for (const bp of bps) {
        const key = `${bp.shiftTime}|${bp.direction}`;
        if (!routes.has(key)) routes.set(key, []);
        routes.get(key)!.push(bp);
      }

      for (const [key, routeBps] of routes.entries()) {
        const sorted = [...routeBps].sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
        const { direction } = parseShiftKey(key);
        
        let currentCoords: [number, number][] = [];
        if (direction === "ida") {
          // Ida: Garagem -> BP1 -> BP2 -> ... -> Empresa
          if (hasGarage) currentCoords.push([garageLat!, garageLng!]);
          for (let i = 0; i < sorted.length; i++) {
            currentCoords.push([sorted[i]!.lat, sorted[i]!.lng]);
            const result = await fetchOsrmRoute([...currentCoords]);
            if (result) {
              newMetrics.set(sorted[i]!.id, { km: result.distance, min: result.duration });
            }
          }
        } else {
          // Volta: Empresa -> BP1 -> BP2 -> ... -> Garagem
          currentCoords.push([companyLat, companyLng]);
          for (let i = 0; i < sorted.length; i++) {
            currentCoords.push([sorted[i]!.lat, sorted[i]!.lng]);
            const result = await fetchOsrmRoute([...currentCoords]);
            if (result) {
              newMetrics.set(sorted[i]!.id, { km: result.distance, min: result.duration });
            }
          }
        }
      }
      setRealMetrics(newMetrics);
    };

    if (bps.length > 0) void fetchAllRealMetrics();
  }, [bps, garageLat, garageLng, companyLat, companyLng]);

  // Métricas para o ponto temporário (preview)
  useEffect(() => {
    if (!tempBP) {
      setTempMetrics(null);
      return;
    }
    const fetchTempMetrics = async () => {
      const hasGarage = garageLat != null && garageLng != null;
      const { time, direction } = parseShiftKey(tempBPKey);
      
      // Pegar pontos já existentes para este mesmo turno/direção
      const existing = bps.filter(bp => bp.shiftTime === time && bp.direction === direction)
                         .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
      
      let coords: [number, number][] = [];
      if (direction === "ida") {
        if (hasGarage) coords.push([garageLat!, garageLng!]);
        for (const bp of existing) coords.push([bp.lat, bp.lng]);
        coords.push([tempBP.lat, tempBP.lng]);
      } else {
        coords.push([companyLat, companyLng]);
        for (const bp of existing) coords.push([bp.lat, bp.lng]);
        coords.push([tempBP.lat, tempBP.lng]);
      }
      
      const result = await fetchOsrmRoute(coords);
      if (result) {
        setTempMetrics({ km: result.distance, min: result.duration });
      }
    };
    void fetchTempMetrics();
  }, [tempBP, tempBPKey, bps, garageLat, garageLng, companyLat, companyLng]);

  /* Filter workers shown on map based on selected shift+direction */
  const displayWorkers = useMemo(() => {
    if (!workers) return [];
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
    if (!tempBP || !tempBPKey || !workers) return new Set<number>();
    const { time, direction } = parseShiftKey(tempBPKey);
    const eligible = workers.filter(w => {
      const { entry, exit } = parseShiftTimes(w.shift);
      const matches = direction === "volta" ? exit === time : entry === time;
      return matches && !assignedIds.has(w.id);
    });
    return new Set(eligible.filter(w => haversineKm(w.lat, w.lng, tempBP.lat, tempBP.lng) <= radiusKm).map(w => w.id));
  }, [tempBP, radiusKm, tempBPKey, workers, assignedIds]);

  const selectedBP = useMemo(() => bps.find(b => b.id === selectedBpId) ?? null, [bps, selectedBpId]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (mode === "draw") setTempBP({ lat, lng });
    else if (mode === "move" && selectedBpId) void doMoveBP(selectedBpId, lat, lng);
  }, [mode, selectedBpId]);

  async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
        { headers: { "Accept-Language": "pt-BR" } }
      );
      const data = await r.json() as {
        address?: {
          road?: string; pedestrian?: string; path?: string;
          suburb?: string; neighbourhood?: string;
          city?: string; town?: string; village?: string;
          house_number?: string;
        };
      };
      const a = data.address ?? {};
      const road = a.road ?? a.pedestrian ?? a.path ?? "";
      const number = a.house_number ? `, ${a.house_number}` : "";
      const district = a.suburb ?? a.neighbourhood ?? "";
      const city = a.city ?? a.town ?? a.village ?? "";
      if (road) return `${road}${number}${district ? ` - ${district}` : ""}${city ? `, ${city}` : ""}`;
      return district && city ? `${district}, ${city}` : city || road || `Ponto ${bps.length + 1}`;
    } catch {
      return `Ponto ${bps.length + 1}`;
    }
  }

  const doSaveBP = async () => {
    if (!tempBP) return;
    setSaving(true);
    const { time, direction } = parseShiftKey(tempBPKey);
    try {
      const bpName = await reverseGeocode(tempBP.lat, tempBP.lng);
      await fetch(`/api/admin/budgets/${budgetId}/boarding-points`, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({
          lat: tempBP.lat, lng: tempBP.lng, radiusKm,
          shiftTime: time, direction,
          workerIds: [...tempWorkerIds],
          name: bpName,
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
    const eligible = (workers || []).filter(w => {
      const { entry, exit } = parseShiftTimes(w.shift);
      return bpDir === "volta" ? exit === bpTime : entry === bpTime;
    });
    const newWorkerIds = eligible.filter(w => haversineKm(w.lat, w.lng, newLat, newLng) <= bp.radiusKm).map(w => w.id);
    const newName = await reverseGeocode(newLat, newLng);
    await fetch(`/api/admin/budgets/${budgetId}/boarding-points/${bpId}`, {
      method: "PUT", headers: hdrs,
      body: JSON.stringify({ lat: newLat, lng: newLng, radiusKm: bp.radiusKm, workerIds: newWorkerIds, name: newName }),
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
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Filtrar Mapa</p>
          <select value={selectedShiftKey} onChange={e => setSelectedShiftKey(e.target.value)}
            className="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20">
            <option value="all">Todos os funcionários</option>
            {shiftOptions.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.time} · {opt.direction === "ida" ? "Ida" : "Volta"} ({opt.count})</option>
            ))}
          </select>
        </div>

        {/* Action / List area */}
        <div className="flex-1 overflow-y-auto p-3">
          {mode === "draw" ? (
            <div className="space-y-4">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3.5">
                <p className="text-xs font-bold text-primary mb-1">Novo Ponto de Embarque</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">Clique no mapa para posicionar o ponto.</p>
              </div>

              {tempBP && (
                <div className="space-y-3 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">Raio de Captura</label>
                      <span className="text-xs font-bold tabular-nums">{radiusKm.toFixed(1)} km</span>
                    </div>
                    <input type="range" min="0.1" max="3.0" step="0.1" value={radiusKm}
                      onChange={e => setRadiusKm(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary" />
                    <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                      <span>100 m</span><span>3 km</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-y">
                    <div><p className="text-[10px] text-muted-foreground">Funcionários</p><p className="text-sm font-bold text-primary">{tempWorkerIds.size}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Dist. Acumulada</p><p className="text-sm font-bold">{tempMetrics ? tempMetrics.km.toFixed(1) : "..."} km</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Tempo real</p><p className="text-sm font-bold">{tempMetrics ? Math.round(tempMetrics.min) : "..."} min</p></div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setTempBP(null); setMode("view"); }}
                      className="flex-1 px-3 py-2 border rounded-lg text-xs font-semibold hover:bg-muted transition-colors">Cancelar</button>
                    <button onClick={doSaveBP} disabled={saving || tempWorkerIds.size === 0}
                      className="flex-[1.5] bg-primary text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm">
                      {saving ? "Salvando..." : "Salvar Ponto"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pontos Criados ({bps.length})</p>
                <button onClick={() => { setMode("draw"); setTempBP(null); setSelectedBpId(null); }}
                  className="bg-primary/10 text-primary hover:bg-primary/20 p-1.5 rounded-lg transition-colors" title="Novo Ponto">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                </button>
              </div>

              {bps.length === 0 && (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3 opacity-40">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <p className="text-xs text-muted-foreground">Nenhum ponto criado ainda.</p>
                </div>
              )}

              {bps.map(bp => (
                <button key={bp.id} onClick={() => { setSelectedBpId(bp.id); setMode("view"); setTempBP(null); }}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${selectedBpId === bp.id ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20" : "hover:border-muted-foreground/30 hover:bg-muted/30"}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {bp.sequenceOrder ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-xs font-bold truncate pr-1">{bp.name}</span>
                        <span className="flex items-center gap-1 shrink-0">
                          <span className={`text-[9px] font-bold px-1 rounded-sm ${bp.direction === "volta" ? "bg-violet-100 text-violet-600" : "bg-blue-100 text-blue-500"}`}>
                            {bp.direction === "volta" ? "←" : "→"}
                          </span>
                        </span>
                        <span className="text-xs font-bold flex-shrink-0">{bp.passengerCount} pas</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {(() => {
                      const real = realMetrics.get(bp.id);
                      if (real) {
                        return `${real.km.toFixed(1)} km acumulados`;
                      }
                      return "... km";
                    })()}
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
          {garageLat != null && garageLng != null && (
            <Marker position={[garageLat, garageLng]} icon={garageIcon}>
              <Popup>
                <strong>🏠 Garagem do Parceiro</strong>
                {garageAddress && <><br /><span style={{ color: "#6b7280", fontSize: "12px" }}>{garageAddress}</span></>}
              </Popup>
            </Marker>
          )}
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
