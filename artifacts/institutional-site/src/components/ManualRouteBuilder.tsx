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
  radiusKm: number; shiftTime: string | null;
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

function parseShiftStart(shift: string | null): string | null {
  if (!shift) return null;
  const m = shift.match(/^(\d{1,2}:\d{2})/);
  if (m) return m[1]!.padStart(5, "0");
  const s = shift.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (s.startsWith("man")) return "06:00";
  if (s.startsWith("tar")) return "14:20";
  if (s.startsWith("noi")) return "22:30";
  return shift.trim().substring(0, 5);
}

const SHIFT_COLORS: Record<string, string> = { "06:00": "#3b82f6", "14:20": "#f59e0b", "22:30": "#8b5cf6" };
function getShiftColor(shift: string | null): string {
  if (!shift) return "#6b7280";
  return SHIFT_COLORS[shift] ?? "#10b981";
}

const companyIcon = L.divIcon({
  html: `<div style="width:26px;height:26px;background:#16a34a;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:7px;height:7px;background:white;border-radius:50%;"></div></div>`,
  className: "", iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -15],
});

function makeWorkerIcon(color: string, inRadius: boolean, assigned: boolean): L.DivIcon {
  const sz = inRadius ? 12 : 7;
  return L.divIcon({
    html: `<div style="width:${sz}px;height:${sz}px;background:${color};border:${inRadius ? "2px" : "1.5px"} solid white;border-radius:50%;opacity:${assigned && !inRadius ? 0.3 : 1};${inRadius ? `box-shadow:0 0 0 2px ${color}40;` : ""}transition:all 0.1s;"></div>`,
    className: "", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2], popupAnchor: [0, -8],
  });
}

function makeBPIcon(seq: number, color: string, selected: boolean): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:30px;height:30px;background:${selected ? "#1d4ed8" : color};border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:13px;">${seq}</div>`,
    className: "", iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -18],
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
  const [selectedShift, setSelectedShift] = useState("all");
  const [tempBP, setTempBP] = useState<{ lat: number; lng: number } | null>(null);
  const [tempBPShift, setTempBPShift] = useState("");
  const [selectedBpId, setSelectedBpId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const hdrs = useMemo(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }), [token]);

  const shifts = useMemo(() => {
    const s = new Set<string>();
    for (const w of workers) { const st = parseShiftStart(w.shift); if (st) s.add(st); }
    return [...s].sort();
  }, [workers]);

  useEffect(() => { if (shifts.length > 0 && !tempBPShift) setTempBPShift(shifts[0]!); }, [shifts, tempBPShift]);

  const loadBPs = useCallback(async () => {
    const r = await fetch(`/api/admin/budgets/${budgetId}/boarding-points`, { headers: hdrs });
    setBps(await r.json() as ManualBP[]);
  }, [budgetId, hdrs]);

  useEffect(() => { void loadBPs(); }, [loadBPs]);

  const displayWorkers = useMemo(() =>
    selectedShift === "all" ? workers : workers.filter(w => parseShiftStart(w.shift) === selectedShift),
    [workers, selectedShift]);

  const assignedIds = useMemo(() => new Set(bps.flatMap(b => b.workerIds)), [bps]);

  const tempWorkerIds = useMemo(() => {
    if (!tempBP || !tempBPShift) return new Set<number>();
    const eligible = workers.filter(w => parseShiftStart(w.shift) === tempBPShift && !assignedIds.has(w.id));
    return new Set(eligible.filter(w => haversineKm(w.lat, w.lng, tempBP.lat, tempBP.lng) <= radiusKm).map(w => w.id));
  }, [tempBP, radiusKm, tempBPShift, workers, assignedIds]);

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
    try {
      await fetch(`/api/admin/budgets/${budgetId}/boarding-points`, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ lat: tempBP.lat, lng: tempBP.lng, radiusKm, shiftTime: tempBPShift, workerIds: [...tempWorkerIds], name: `Ponto ${bps.length + 1}` }),
      });
      await loadBPs();
      setTempBP(null);
      setMode("view");
    } finally { setSaving(false); }
  };

  const doMoveBP = async (bpId: number, newLat: number, newLng: number) => {
    const bp = bps.find(b => b.id === bpId);
    if (!bp) return;
    const eligible = workers.filter(w => parseShiftStart(w.shift) === bp.shiftTime);
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
            <button onClick={() => setSelectedShift("all")}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${selectedShift === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              Todos
            </button>
            {shifts.map(s => (
              <button key={s} onClick={() => setSelectedShift(s)}
                style={selectedShift === s ? { backgroundColor: getShiftColor(s) } : undefined}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${selectedShift === s ? "text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {s}
              </button>
            ))}
          </div>
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
        <div className="p-3 border-b min-h-[120px]">
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
              <p className="text-xs text-muted-foreground">O raio capturará funcionários do turno selecionado</p>
              <button onClick={() => setMode("view")} className="w-full border rounded-lg py-1.5 text-sm text-muted-foreground hover:bg-muted/50">Cancelar</button>
            </div>
          )}

          {mode === "draw" && tempBP && (
            <div className="space-y-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Novo Ponto de Embarque</p>
              <div>
                <label className="text-xs text-muted-foreground">Turno dos passageiros</label>
                <select value={tempBPShift} onChange={e => setTempBPShift(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background mt-1 focus:outline-none focus:ring-1 focus:ring-primary">
                  {shifts.map(s => <option key={s} value={s}>{s}</option>)}
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
              {tempWorkerIds.size === 0 && <p className="text-xs text-destructive text-center">Nenhum funcionário nesse raio/turno</p>}
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
                  <p className="text-xs text-muted-foreground">Turno {selectedBP.shiftTime}</p>
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
                        <span className="text-xs font-semibold">{bp.shiftTime}</span>
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

          {displayWorkers.map(w => (
            <Marker key={w.id} position={[w.lat, w.lng]}
              icon={makeWorkerIcon(getShiftColor(parseShiftStart(w.shift)), tempBP ? tempWorkerIds.has(w.id) : false, !!w.boardingPointId)}>
              <Popup><strong>{w.name}</strong><br /><span style={{ color: "#6b7280" }}>{w.shift ?? "—"}</span></Popup>
            </Marker>
          ))}

          {bps.map(bp => (
            <Fragment key={bp.id}>
              <Circle center={[bp.lat, bp.lng]} radius={bp.radiusKm * 1000}
                pathOptions={{ color: getShiftColor(bp.shiftTime), fillColor: getShiftColor(bp.shiftTime), fillOpacity: selectedBpId === bp.id ? 0.15 : 0.07, weight: selectedBpId === bp.id ? 2.5 : 1.5 }}
                eventHandlers={{ click: (e) => { e.originalEvent.stopPropagation(); setSelectedBpId(bp.id === selectedBpId ? null : bp.id); setMode("view"); setTempBP(null); } }} />
              <Marker position={[bp.lat, bp.lng]} icon={makeBPIcon(bp.sequenceOrder ?? 0, getShiftColor(bp.shiftTime), selectedBpId === bp.id)}
                eventHandlers={{ click: (e) => { e.originalEvent.stopPropagation(); setSelectedBpId(bp.id === selectedBpId ? null : bp.id); setMode("view"); setTempBP(null); } }}>
                <Popup><strong>{bp.name}</strong><br />Turno: {bp.shiftTime} · {bp.passengerCount} passageiros</Popup>
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
