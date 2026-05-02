import { useEffect, useState, useMemo, useRef, Fragment } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const companyIcon = L.divIcon({
  html: `<div style="width:22px;height:22px;background:#16a34a;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
    <div style="width:6px;height:6px;background:white;border-radius:50%;"></div>
  </div>`,
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -14],
});

const makeArrowIcon = (color: string) =>
  L.divIcon({
    html: `<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:13px solid ${color};filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));"></div>`,
    className: "",
    iconSize: [14, 13],
    iconAnchor: [7, 6],
  });

const makeBoardingIcon = (color: string, size = 12) =>
  L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });

const empDotIcon = L.divIcon({
  html: `<div style="width:7px;height:7px;background:#374151;border:1.5px solid white;border-radius:50%;opacity:0.85;"></div>`,
  className: "",
  iconSize: [7, 7],
  iconAnchor: [3.5, 3.5],
  popupAnchor: [0, -6],
});

const BLOCK_COLORS: string[] = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6",
  "#ef4444", "#06b6d4", "#f97316", "#14b8a6",
  "#ec4899", "#84cc16", "#6366f1", "#0ea5e9",
];

function blockColorHex(vehicleBlockId: number) {
  return BLOCK_COLORS[(vehicleBlockId - 1) % BLOCK_COLORS.length];
}

export interface MapEmployee {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  boardingPointId: number | null;
}

export interface MapBoardingPoint {
  id: number;
  name: string;
  lat: number;
  lng: number;
  passengerCount: number;
  sequenceOrder?: number | null;
}

export interface MapRoute {
  id: number;
  name: string;
  shiftTime?: string | null;
  vehicleBlockId?: number | null;
  totalPassengers: number;
  boardingPoints: MapBoardingPoint[];
  vehicleAssignments: Array<{ vehicleType: string; count: number; capacity: number }>;
}

interface RouteMapProps {
  routes: MapRoute[];
  employees?: MapEmployee[];
  companyLat: number;
  companyLng: number;
  maxRadiusKm?: number;
  vehicleLabel: (blockId: number) => string;
}

type Direction = "ida" | "volta";

async function fetchOsrmRoute(coords: [number, number][]): Promise<[number, number][] | null> {
  if (coords.length < 2) return null;
  const coordStr = coords.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json() as { code: string; routes?: Array<{ geometry: { coordinates: [number, number][] } }> };
    if (data.code !== "Ok" || !data.routes?.[0]?.geometry?.coordinates) return null;
    return data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
  } catch {
    return null;
  }
}

function FitBounds({ routes, companyLat, companyLng }: { routes: MapRoute[]; companyLat: number; companyLng: number }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [[companyLat, companyLng]];
    for (const r of routes) {
      for (const bp of r.boardingPoints) pts.push([bp.lat, bp.lng]);
    }
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [32, 32] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes.length, companyLat, companyLng]);
  return null;
}

/** Extracts mid-route point for direction arrow placement */
function midPoint(coords: [number, number][]): [number, number] | null {
  if (coords.length < 2) return null;
  const mid = Math.floor(coords.length / 2);
  return coords[mid] ?? null;
}

/** Returns approx heading (degrees) between two consecutive points */
function bearing(a: [number, number], b: [number, number]): number {
  const dLng = (b[1] - a[1]) * (Math.PI / 180);
  const lat1 = a[0] * (Math.PI / 180);
  const lat2 = b[0] * (Math.PI / 180);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function RouteMap({ routes, employees = [], companyLat, companyLng, maxRadiusKm = 1, vehicleLabel }: RouteMapProps) {
  const shifts = useMemo(
    () => [...new Set(routes.map((r) => r.shiftTime).filter(Boolean) as string[])].sort(),
    [routes]
  );
  const blocks = useMemo(
    () => [...new Set(routes.map((r) => r.vehicleBlockId).filter((v) => v != null) as number[])].sort((a, b) => a - b),
    [routes]
  );

  const [direction, setDirection] = useState<Direction>("ida");
  const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set());
  const [selectedBlocks, setSelectedBlocks] = useState<Set<number>>(new Set());
  const [showCircles, setShowCircles] = useState(true);
  const [showEmployees, setShowEmployees] = useState(true);
  // Key: "${routeId}-${direction}"
  const [roadGeometries, setRoadGeometries] = useState<Map<string, [number, number][]>>(new Map());
  const [loadingOsrm, setLoadingOsrm] = useState(false);
  const fetchedRef = useRef<Set<string>>(new Set());

  const toggleShift = (s: string) =>
    setSelectedShifts((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const toggleBlock = (b: number) =>
    setSelectedBlocks((prev) => {
      const next = new Set(prev);
      next.has(b) ? next.delete(b) : next.add(b);
      return next;
    });

  const visibleRoutes = useMemo(
    () =>
      routes.filter((r) => {
        if (selectedShifts.size > 0 && r.shiftTime && !selectedShifts.has(r.shiftTime)) return false;
        if (selectedBlocks.size > 0 && r.vehicleBlockId != null && !selectedBlocks.has(r.vehicleBlockId)) return false;
        return true;
      }),
    [routes, selectedShifts, selectedBlocks]
  );

  const visibleBPIds = useMemo(() => {
    const s = new Set<number>();
    for (const r of visibleRoutes) for (const bp of r.boardingPoints) s.add(bp.id);
    return s;
  }, [visibleRoutes]);

  const bpColorMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of routes) {
      const color = blockColorHex(r.vehicleBlockId ?? 1);
      for (const bp of r.boardingPoints) m.set(bp.id, color);
    }
    return m;
  }, [routes]);

  /** Build ordered coordinate list for a route depending on direction */
  function routeCoords(route: MapRoute, dir: Direction): [number, number][] {
    const sorted = [...route.boardingPoints].sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
    const bpCoords = sorted.map((bp) => [bp.lat, bp.lng] as [number, number]);
    const company: [number, number] = [companyLat, companyLng];
    if (dir === "ida") {
      // Boarding points in order → company
      return [...bpCoords, company];
    } else {
      // Company → boarding points in reverse order
      return [company, ...[...bpCoords].reverse()];
    }
  }

  useEffect(() => {
    const toFetch = visibleRoutes.filter((r) => !fetchedRef.current.has(`${r.id}-${direction}`));
    if (toFetch.length === 0) return;
    setLoadingOsrm(true);

    void Promise.all(
      toFetch.map(async (route) => {
        const key = `${route.id}-${direction}`;
        fetchedRef.current.add(key);
        const coords = routeCoords(route, direction);
        const road = await fetchOsrmRoute(coords);
        return { key, road };
      })
    ).then((results) => {
      setRoadGeometries((prev) => {
        const next = new Map(prev);
        for (const { key, road } of results) {
          if (road) next.set(key, road);
        }
        return next;
      });
      setLoadingOsrm(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRoutes.map((r) => r.id).join(","), companyLat, companyLng, direction]);

  const center: [number, number] = [companyLat, companyLng];
  const radiusMeters = maxRadiusKm * 1000;

  return (
    <div className="flex gap-3" style={{ height: 620 }}>
      {/* ── Painel de filtros ── */}
      <div className="w-52 shrink-0 bg-white dark:bg-card border rounded-xl p-4 flex flex-col gap-4 overflow-y-auto shadow-sm">

        {/* Direção Ida / Volta */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Direção</p>
          <div className="flex rounded-lg border overflow-hidden text-sm font-medium">
            <button
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-colors"
              style={{
                background: direction === "ida" ? "#3b82f6" : "transparent",
                color: direction === "ida" ? "white" : undefined,
              }}
              onClick={() => setDirection("ida")}
              title="Ida: pontos de embarque → empresa"
            >
              <span>↗</span> Ida
            </button>
            <button
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-colors border-l"
              style={{
                background: direction === "volta" ? "#8b5cf6" : "transparent",
                color: direction === "volta" ? "white" : undefined,
              }}
              onClick={() => setDirection("volta")}
              title="Volta: empresa → pontos de embarque"
            >
              <span>↙</span> Volta
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground leading-tight">
            {direction === "ida"
              ? "Embarque → Empresa"
              : "Empresa → Embarque"}
          </p>
        </div>

        <div className="border-t pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Turno</p>
          <div className="space-y-1">
            {shifts.map((shift) => (
              <label key={shift} className="flex items-center gap-2 py-1 cursor-pointer select-none">
                <input type="checkbox" checked={selectedShifts.has(shift)} onChange={() => toggleShift(shift)} className="rounded border-border" />
                <span className="text-sm font-medium">{shift}</span>
              </label>
            ))}
          </div>
          {selectedShifts.size > 0 && (
            <button onClick={() => setSelectedShifts(new Set())} className="mt-1 text-[11px] text-muted-foreground hover:text-foreground underline">Limpar</button>
          )}
        </div>

        <div className="border-t pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Veículo</p>
          <div className="space-y-1">
            {blocks.map((blockId) => {
              const color = blockColorHex(blockId);
              return (
                <label key={blockId} className="flex items-center gap-2 py-1 cursor-pointer select-none">
                  <input type="checkbox" checked={selectedBlocks.has(blockId)} onChange={() => toggleBlock(blockId)} className="rounded border-border" />
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-sm font-medium truncate">{vehicleLabel(blockId)}</span>
                </label>
              );
            })}
          </div>
          {selectedBlocks.size > 0 && (
            <button onClick={() => setSelectedBlocks(new Set())} className="mt-1 text-[11px] text-muted-foreground hover:text-foreground underline">Limpar</button>
          )}
        </div>

        <div className="border-t pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Camadas</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={showCircles} onChange={(e) => setShowCircles(e.target.checked)} className="rounded border-border" />
              <span className="text-sm">Raio {maxRadiusKm} km</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={showEmployees} onChange={(e) => setShowEmployees(e.target.checked)} className="rounded border-border" />
              <span className="text-sm">Funcionários</span>
            </label>
          </div>
        </div>

        <div className="mt-auto border-t pt-3 space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-green-600 border-2 border-white shadow-sm shrink-0" />Empresa (destino)</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-sm shrink-0" />Ponto de embarque</div>
          {showEmployees && <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-700 border border-white shadow-sm shrink-0" />Funcionário</div>}
          {showCircles && <div className="flex items-center gap-2"><span className="w-4 h-2 rounded-sm border-2 border-blue-400 bg-blue-100/60 shrink-0" />Raio {maxRadiusKm} km</div>}
          {loadingOsrm && <p className="text-amber-600 font-medium mt-2">Carregando rotas por vias…</p>}
        </div>
      </div>

      {/* ── Mapa ── */}
      <div className="flex-1 rounded-xl overflow-hidden border shadow-sm">
        <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds routes={visibleRoutes} companyLat={companyLat} companyLng={companyLng} />

          <Marker position={center} icon={companyIcon}>
            <Popup><strong>Empresa (Destino)</strong><br /><span className="text-xs text-gray-500">{direction === "ida" ? "Destino final da ida" : "Ponto de partida da volta"}</span></Popup>
          </Marker>

          {visibleRoutes.map((route) => {
            const color = direction === "ida" ? blockColorHex(route.vehicleBlockId ?? 1) : "#8b5cf6";
            const geoKey = `${route.id}-${direction}`;
            const sorted = [...route.boardingPoints].sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
            const straightCoords = routeCoords(route, direction);
            const roadCoords = roadGeometries.get(geoKey);
            const displayCoords = roadCoords ?? straightCoords;
            const bpIcon = makeBoardingIcon(color, 14);

            // Arrow: placed at midpoint of the polyline, rotated to face direction
            const arrowPos = midPoint(displayCoords);
            let arrowRotation = 0;
            if (arrowPos && displayCoords.length >= 2) {
              const mid = Math.floor(displayCoords.length / 2);
              const a = displayCoords[mid - 1] ?? displayCoords[0]!;
              const b2 = displayCoords[mid] ?? displayCoords[displayCoords.length - 1]!;
              arrowRotation = bearing(a, b2);
            }
            const arrowIconEl = L.divIcon({
              html: `<div style="width:14px;height:14px;transform:rotate(${arrowRotation}deg);transform-origin:center;display:flex;align-items:center;justify-content:center;">
                <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:10px solid ${color};filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));"></div>
              </div>`,
              className: "",
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            });

            const bpList = direction === "ida" ? sorted : [...sorted].reverse();

            return (
              <Fragment key={route.id}>
                <Polyline
                  positions={displayCoords}
                  pathOptions={{ color, weight: roadCoords ? 4 : 2, opacity: 0.85, dashArray: roadCoords ? undefined : "6,5" }}
                />
                {arrowPos && (
                  <Marker position={arrowPos} icon={arrowIconEl} interactive={false} />
                )}
                {bpList.map((bp, idx) => (
                  <Fragment key={bp.id}>
                    {showCircles && (
                      <Circle
                        center={[bp.lat, bp.lng]}
                        radius={radiusMeters}
                        pathOptions={{ color, fillColor: color, fillOpacity: 0.08, weight: 1.5, opacity: 0.5, dashArray: "4,4" }}
                      />
                    )}
                    <Marker position={[bp.lat, bp.lng]} icon={bpIcon}>
                      <Popup>
                        <div className="text-sm space-y-1 min-w-[160px]">
                          <p className="font-semibold">{bp.name}</p>
                          <p className="text-muted-foreground">{bp.passengerCount} passageiro{bp.passengerCount !== 1 ? "s" : ""}</p>
                          <p className="text-xs" style={{ color }}>
                            {route.name} · Turno {route.shiftTime}
                            {" · "}{direction === "ida" ? `Parada ${idx + 1}` : `Retorno ${idx + 1}`}
                          </p>
                        </div>
                      </Popup>
                    </Marker>
                  </Fragment>
                ))}
              </Fragment>
            );
          })}

          {showEmployees &&
            employees
              .filter((e) => e.boardingPointId != null && visibleBPIds.has(e.boardingPointId))
              .map((emp) => (
                <Marker key={emp.id} position={[emp.lat, emp.lng]} icon={empDotIcon}>
                  <Popup>
                    <div className="text-xs space-y-0.5 min-w-[180px]">
                      <p className="font-semibold text-sm">{emp.name}</p>
                      <p className="text-muted-foreground">{emp.address}</p>
                      {emp.boardingPointId && (
                        <p style={{ color: bpColorMap.get(emp.boardingPointId) ?? "#555" }}>● Ponto {emp.boardingPointId}</p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
        </MapContainer>
      </div>
    </div>
  );
}
