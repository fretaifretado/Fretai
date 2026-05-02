/**
 * Routing Engine — Roteirização por turno com mínimo de 90% de ocupação.
 *
 * Regras:
 * 1. Agrupa funcionários por horário de turno extraído do campo "Turno"
 * 2. Para cada turno, gera rotas preenchendo o veículo até o mínimo de 90%
 *    antes de criar uma nova rota (não divide cedo)
 * 3. Rotas com menos de 90% ao final são fundidas com a rota mais próxima
 * 4. Atribui blocos de veículos reutilizáveis entre turnos (mesmo veículo
 *    cobre a entrada das 06h, das 14h e das 22h — e a saída de cada turno)
 */

export interface GeoPoint { lat: number; lng: number }

export interface EmployeeGeo {
  id: number;
  lat: number;
  lng: number;
  name: string;
  address: string;
  shift?: string | null;
}

export interface VehicleType {
  id: number;
  type: string;
  capacity: number;
  costPerKm: number | null;
  costPerRoute: number | null;
}

export interface BoardingPointResult {
  lat: number;
  lng: number;
  name: string;
  employeeIds: number[];
  passengerCount: number;
}

export interface VehicleAssignmentResult {
  vehicleId: number;
  vehicleType: string;
  capacity: number;
  count: number;
  costPerKm: number | null;
  costPerRoute: number | null;
}

export interface RouteResult {
  name: string;
  shiftTime: string;
  direction: "ida" | "volta";
  vehicleBlockId: number;
  totalPassengers: number;
  totalDistanceKm: number;
  estimatedMinutes: number;
  occupancyPct: number;
  totalCost: number | null;
  vehicleAssignments: VehicleAssignmentResult[];
  boardingPoints: BoardingPointResult[];
}

// ─── Constantes ─────────────────────────────────────────────────────────────

const AVG_SPEED_KMH = 30;
const BOARDING_STOP_MINUTES = 2;
/**
 * Após entregar os passageiros na empresa (turno T_entrada):
 * - O veículo imediatamente embarca os que estão SAINDO (turno T_saída = T_entrada)
 * - Faz a viagem de volta ≈ mesma duração da entrada
 * - Buffer de 15 min para reposicionamento antes do próximo embarque
 * freeAt = shiftStart + routeDuration (entrada) + routeDuration (saída) + 15
 */
const EXIT_TRIP_BUFFER_MINUTES = 15;
/**
 * Mínimo de ocupação POR TIER para qualificar um grupo naquela camada.
 * Se ficar abaixo, o grupo cascateia para o tier menor.
 *
 *   Ônibus     (cap ≥ 40): 88% → mín 39 pax  — veículo caro, exige alta ocupação
 *   Micro-ônibus (cap ~30): 80% → mín 24 pax  — equilíbrio
 *   Van         (cap ~15): 67% → mín 10 pax  — mais flexível; mergeSmallRoutes eleva
 *   Mini-Van    (cap ~6):  50% → mín  3 pax  — último recurso
 *
 * Após o tier routing, rightSizeVehicles + mergeSmallRoutes garantem ≥88% final.
 */
function tierMinOccupancy(capacity: number): number {
  if (capacity >= BUS_MIN_CAPACITY) return 0.88;   // Ônibus
  if (capacity >= 20)               return 0.80;   // Micro-ônibus
  if (capacity >= 10)               return 0.67;   // Van
  return 0.50;                                     // Mini-Van
}
/** Mantido apenas para a detecção de Ônibus em bestVehicleForCount */
const MIN_OCCUPANCY_PCT = 0.88;
/** Mínimo de ocupação alvo (regra de negócio do usuário) */
const TARGET_MIN_OCC = 0.88;
/**
 * Ônibus recebe limite de tempo estendido: até 90 min de rota.
 * Para que um grupo qualifique como "rota de ônibus" precisa ter
 * ao menos BUS_MIN_OCCUPANCY_PCT × capacidade do ônibus passageiros.
 */
const BUS_MAX_ROUTE_MINUTES = 90;
/** Capacidade mínima de um veículo para ser tratado como ônibus (prioridade 1) */
const BUS_MIN_CAPACITY = 40;

// ─── Utilidades de tempo ────────────────────────────────────────────────────

/** "06:00/14:20 SEG/SAB" → 360 (minutos desde meia-noite) */
export function parseShiftStartMinutes(shift: string | null | undefined): number {
  if (!shift) return 0;
  const m = shift.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const mn = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
}

// ─── Geometria ──────────────────────────────────────────────────────────────

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function centroid(pts: GeoPoint[]): GeoPoint {
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
  };
}

// ─── Pontos de embarque ─────────────────────────────────────────────────────

// Máx. passageiros por ponto de embarque = capacidade do maior veículo (Ônibus)
const MAX_BP_PASSENGERS = 44;

function clusterIntoBoardingPoints(
  employees: EmployeeGeo[],
  maxRadiusKm: number,
  destination: GeoPoint,
): BoardingPointResult[] {
  if (employees.length === 0) return [];

  // ── Grade geográfica: células de maxRadiusKm × maxRadiusKm ─────────────────
  // 1° lat ≈ 111 km; 1° lng ≈ 111 × cos(lat) km (a -23°: ~102 km)
  const cosLat = Math.cos(destination.lat * Math.PI / 180);
  const cellLat = maxRadiusKm / 111;
  const cellLng = maxRadiusKm / (111 * cosLat);

  const cellMap = new Map<string, EmployeeGeo[]>();
  for (const emp of employees) {
    const gx = Math.floor(emp.lat / cellLat);
    const gy = Math.floor(emp.lng / cellLng);
    const key = `${gx},${gy}`;
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key)!.push(emp);
  }

  // ── Converte células em pontos, subdividindo quando supera MAX_BP_PASSENGERS ─
  const raw: Omit<BoardingPointResult, 'name'>[] = [];

  for (const [, cellEmps] of cellMap) {
    if (cellEmps.length <= MAX_BP_PASSENGERS) {
      raw.push(makeBoardingPoint(cellEmps));
    } else {
      // Subdivisão: agrupa por proximidade (nearest-neighbor greedy)
      const remaining = [...cellEmps].sort((a, b) => a.id - b.id);
      while (remaining.length > 0) {
        const seed = remaining[0];
        remaining.sort((a, b) => haversineKm(a, seed) - haversineKm(b, seed));
        const chunk = remaining.splice(0, MAX_BP_PASSENGERS);
        raw.push(makeBoardingPoint(chunk));
      }
    }
  }

  // ── Ordena do mais distante ao destino, renomeia ────────────────────────────
  raw.sort((a, b) => haversineKm(b, destination) - haversineKm(a, destination));
  return raw.map((p, i) => ({ ...p, name: `Ponto ${i + 1}` }));
}

function makeBoardingPoint(employees: EmployeeGeo[]): Omit<BoardingPointResult, 'name'> {
  const lat = employees.reduce((s, e) => s + e.lat, 0) / employees.length;
  const lng = employees.reduce((s, e) => s + e.lng, 0) / employees.length;
  return { lat, lng, name: '', employeeIds: employees.map(e => e.id), passengerCount: employees.length };
}

// ─── Construção de rota (TSP nearest-neighbor) ──────────────────────────────

function buildRoute(
  bps: BoardingPointResult[],
  destination: GeoPoint
): { orderedPoints: BoardingPointResult[]; totalDistanceKm: number; estimatedMinutes: number } {
  if (bps.length === 0) return { orderedPoints: [], totalDistanceKm: 0, estimatedMinutes: 0 };

  const remaining = [...bps];
  const ordered: BoardingPointResult[] = [];

  let startIdx = 0, maxDist = 0;
  for (let i = 0; i < remaining.length; i++) {
    const d = haversineKm(remaining[i], destination);
    if (d > maxDist) { maxDist = d; startIdx = i; }
  }
  let current: GeoPoint = remaining[startIdx];
  ordered.push(remaining[startIdx]);
  remaining.splice(startIdx, 1);

  while (remaining.length > 0) {
    let nearestIdx = 0, nearestDist = haversineKm(current, remaining[0]);
    for (let i = 1; i < remaining.length; i++) {
      const d = haversineKm(current, remaining[i]);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    ordered.push(remaining[nearestIdx]);
    current = remaining[nearestIdx];
    remaining.splice(nearestIdx, 1);
  }

  let totalDist = 0;
  for (let i = 0; i < ordered.length - 1; i++) totalDist += haversineKm(ordered[i], ordered[i + 1]);
  totalDist += haversineKm(ordered[ordered.length - 1], destination);

  return {
    orderedPoints: ordered,
    totalDistanceKm: Math.round(totalDist * 10) / 10,
    estimatedMinutes: Math.round((totalDist / AVG_SPEED_KMH) * 60 + ordered.length * BOARDING_STOP_MINUTES),
  };
}

// ─── Atribuição de veículos ─────────────────────────────────────────────────

/**
 * Seleciona o melhor veículo para transportar `count` passageiros.
 *
 * Prioridade fixa (independente de estratégia):
 *   1º Ônibus  (maior capacidade) → usa 1 ônibus se count ≤ cap_onibus
 *   2º Micro-ônibus
 *   3º Van
 *   4º Mini-Van
 *
 * Regra: sempre usa o maior veículo que cabe TODOS os passageiros em
 * uma única unidade. Só usa múltiplas unidades se count > maior capacidade.
 *
 * Estratégia min_cost é a única exceção: prefere o veículo de menor custo
 * por km×passageiro dentre os que cabem todos.
 */
function bestVehicleForCount(count: number, vehicles: VehicleType[], strategy: string): VehicleType {
  if (vehicles.length === 0) {
    return { id: 0, type: "Indefinido", capacity: 15, costPerKm: null, costPerRoute: null };
  }

  // Ordena por capacidade DESC: Ônibus → Micro-ônibus → Van → Mini-Van
  const byCapDesc = vehicles.slice().sort((a, b) => b.capacity - a.capacity);

  // Veículos que acomodam todos em 1 unidade (capacidade ≥ passageiros)
  const fitting = byCapDesc.filter((v) => v.capacity >= count);

  if (strategy === "min_cost" && fitting.length > 0) {
    // Menor custo total por km dentre os que cabem todos
    return fitting.reduce((a, b) => {
      const ca = (a.costPerKm ?? 0) + (a.costPerRoute ?? 0);
      const cb = (b.costPerKm ?? 0) + (b.costPerRoute ?? 0);
      if (ca === 0 && cb === 0) return a; // empate → mantém maior (primeiro na lista)
      return ca <= cb ? a : b;
    });
  }

  // Para max_occupancy: prefere o MENOR veículo que cabe todos → maximiza % de ocupação
  // Ex: 18 pax → Micro-ônibus(30) em vez de Ônibus(44); 12 pax → Van(15) em vez de Micro(30)
  if (fitting.length > 0) return fitting[fitting.length - 1]; // menor fitting (último na lista DESC)

  // Nenhum veículo individual cobre todos → usa o maior (precisará de múltiplas unidades)
  return byCapDesc[0];
}

/**
 * Retorna o limite de tempo (minutos) para uma rota com `pax` passageiros.
 * Ônibus (grupos com pax ≥ 90% da capacidade do maior veículo) recebem
 * até 90 minutos; demais veículos usam o limite padrão.
 */
function routeTimeLimit(pax: number, vehicles: VehicleType[], defaultLimit: number): number {
  const largest = vehicles.reduce((a, b) => b.capacity > a.capacity ? b : a, vehicles[0]);
  if (largest && largest.capacity >= BUS_MIN_CAPACITY && pax >= largest.capacity * MIN_OCCUPANCY_PCT) {
    return Math.max(defaultLimit, BUS_MAX_ROUTE_MINUTES);
  }
  return defaultLimit;
}

function assignVehicles(
  passengerCount: number,
  vehicles: VehicleType[],
  strategy: string,
  distanceKm: number
): VehicleAssignmentResult[] {
  const best = bestVehicleForCount(passengerCount, vehicles, strategy);
  return [{
    vehicleId: best.id,
    vehicleType: best.type,
    capacity: best.capacity,
    count: Math.max(1, Math.ceil(passengerCount / best.capacity)),
    costPerKm: best.costPerKm,
    costPerRoute: best.costPerRoute,
  }];
}

function calcRouteCost(assignments: VehicleAssignmentResult[], distanceKm: number): number | null {
  let hasCost = false, total = 0;
  for (const a of assignments) {
    if (a.costPerKm !== null || a.costPerRoute !== null) {
      hasCost = true;
      total += (a.costPerKm ?? 0) * distanceKm * a.count + (a.costPerRoute ?? 0) * a.count;
    }
  }
  return hasCost ? Math.round(total * 100) / 100 : null;
}

// ─── Roteamento por camada de veículo ───────────────────────────────────────

/**
 * Constrói rotas para uma camada específica de veículo (ex: apenas Ônibus).
 *
 * Regras:
 * - Adiciona pontos de embarque até atingir a capacidade do tier OU o limite de tempo
 * - O limite de tempo é SEMPRE aplicado (não depende de ocupação mínima)
 * - Rotas com totalPassengers >= minPax são confirmadas
 * - Rotas abaixo de minPax retornam seus pontos como "unrouted" para a próxima camada
 *
 * Prioridade de uso: Ônibus(44,90min) → Micro-ônibus(30,75min) → Van(15,75min) → Mini-Van(6,75min)
 */
function buildRoutesForTier(
  boardingPoints: BoardingPointResult[],
  destination: GeoPoint,
  tier: VehicleType,
  maxMinutes: number,
  shiftTime: string,
  routeStartNumber: number,
  minPax: number,
): { routes: Omit<RouteResult, "vehicleBlockId">[]; unrouted: BoardingPointResult[] } {
  if (boardingPoints.length === 0) return { routes: [], unrouted: [] };

  // Ordena: mais distante primeiro; desempate por lat→lng para determinismo
  const sortedBPs = [...boardingPoints].sort((a, b) => {
    const diff = haversineKm(b, destination) - haversineKm(a, destination);
    if (Math.abs(diff) > 1e-9) return diff;
    return a.lat - b.lat || a.lng - b.lng;
  });

  const routes: Omit<RouteResult, "vehicleBlockId">[] = [];
  const unrouted: BoardingPointResult[] = [];
  // Todos os BPs visitados nesta camada (cada BP pertence a exatamente 1 grupo)
  const assigned = new Set<number>();

  while (true) {
    const seedIdx = sortedBPs.findIndex((_, i) => !assigned.has(i));
    if (seedIdx === -1) break;

    const groupIndices: number[] = [seedIdx];
    assigned.add(seedIdx);
    let groupPax = sortedBPs[seedIdx].passengerCount;

    // Cresce o grupo com vizinhos mais próximos
    while (true) {
      const lastPt = sortedBPs[groupIndices[groupIndices.length - 1]];
      let nearestIdx = -1, nearestDist = Infinity;
      for (let i = 0; i < sortedBPs.length; i++) {
        if (assigned.has(i)) continue;
        const d = haversineKm(lastPt, sortedBPs[i]);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      }
      if (nearestIdx === -1) break;

      const newPax = groupPax + sortedBPs[nearestIdx].passengerCount;
      if (newPax > tier.capacity) break; // limite de capacidade

      const { estimatedMinutes } = buildRoute(
        [...groupIndices.map(i => sortedBPs[i]), sortedBPs[nearestIdx]],
        destination
      );
      if (estimatedMinutes > maxMinutes) break; // limite de tempo sempre aplicado

      groupIndices.push(nearestIdx);
      assigned.add(nearestIdx);
      groupPax = newPax;
    }

    const bps = groupIndices.map(i => sortedBPs[i]);

    if (groupPax >= minPax) {
      // Rota válida para esta camada
      const { orderedPoints, totalDistanceKm, estimatedMinutes } = buildRoute(bps, destination);
      const count = Math.max(1, Math.ceil(groupPax / tier.capacity));
      const vehicleAssignments: VehicleAssignmentResult[] = [{
        vehicleId: tier.id,
        vehicleType: tier.type,
        capacity: tier.capacity,
        count,
        costPerKm: tier.costPerKm,
        costPerRoute: tier.costPerRoute,
      }];
      routes.push({
        name: `Rota ${routeStartNumber + routes.length} — ${shiftTime}`,
        shiftTime,
        direction: "ida",
        totalPassengers: groupPax,
        totalDistanceKm,
        estimatedMinutes,
        occupancyPct: Math.round((groupPax / (count * tier.capacity)) * 100),
        totalCost: calcRouteCost(vehicleAssignments, totalDistanceKm),
        vehicleAssignments,
        boardingPoints: orderedPoints,
      });
    } else {
      // Abaixo do mínimo: TODOS os BPs deste grupo cascateiam para a próxima camada
      unrouted.push(...bps);
    }
  }

  return { routes, unrouted };
}

// ─── Pós-preenchimento: eleva ocupação para 98–100% ─────────────────────────

/**
 * Após roteamento por camadas, tenta absorver rotas pequenas (baixa ocupação)
 * em rotas maiores que ainda têm assentos livres — sem ultrapassar o tempo limite.
 *
 * Objetivo: elevar ocupação média de ~86% → 98%+.
 * Critério: rota receptora deve ter assentos sobrando E o merge não ultrapassa
 * seu limite de tempo (90 min para ônibus, maxRouteMinutes para outros).
 *
 * Itera até estabilizar (nenhuma fusão possível).
 */
function topUpRoutes(
  routes: Omit<RouteResult, "vehicleBlockId">[],
  destination: GeoPoint,
  maxRouteMinutes: number,
): Omit<RouteResult, "vehicleBlockId">[] {
  const TARGET_OCC = 0.98;
  const result = [...routes];
  let changed = true;

  while (changed) {
    changed = false;
    // Ordena menor ocupação primeiro (doadores) → maior (receptores no final)
    result.sort((a, b) => a.occupancyPct - b.occupancyPct);

    for (let i = 0; i < result.length; i++) {
      const donor = result[i];
      const dV = donor.vehicleAssignments[0];
      const dCap = dV.count * dV.capacity;

      // Rota receptora ideal: mesmo turno, com vagas sobrando para absorver o doador
      let bestJ = -1, bestDist = Infinity;

      for (let j = 0; j < result.length; j++) {
        if (j === i) continue;
        const recv = result[j];
        if (recv.shiftTime !== donor.shiftTime) continue;

        const rV = recv.vehicleAssignments[0];
        const rCap = rV.count * rV.capacity;
        const spare = rCap - recv.totalPassengers;

        // Receptor precisa ter vagas suficientes para o doador inteiro
        if (donor.totalPassengers > spare) continue;

        // Limite de tempo do receptor (+ 15 min de bônus quando fusão enche o veículo)
        const baseTimeLimit = rV.capacity >= BUS_MIN_CAPACITY
          ? Math.max(maxRouteMinutes, BUS_MAX_ROUTE_MINUTES)
          : maxRouteMinutes;
        const totalAfterMerge = recv.totalPassengers + donor.totalPassengers;
        const fillBonus = totalAfterMerge / rCap >= 0.95 ? 15 : 0;
        const rTimeLimit = baseTimeLimit + fillBonus;

        // Verifica tempo após fusão
        const merged = [...recv.boardingPoints, ...donor.boardingPoints];
        const { estimatedMinutes } = buildRoute(merged, destination);
        if (estimatedMinutes > rTimeLimit) continue;

        // Prefere o receptor geograficamente mais próximo do doador
        const dist = haversineKm(centroid(donor.boardingPoints), centroid(recv.boardingPoints));
        if (dist < bestDist) { bestDist = dist; bestJ = j; }
      }

      if (bestJ >= 0) {
        const recv = result[bestJ];
        const rV = recv.vehicleAssignments[0];
        const rCap = rV.count * rV.capacity;
        const totalPax = recv.totalPassengers + donor.totalPassengers;
        const mergedBPs = [...recv.boardingPoints, ...donor.boardingPoints];
        const { orderedPoints, totalDistanceKm, estimatedMinutes } = buildRoute(mergedBPs, destination);

        result[bestJ] = {
          ...recv,
          boardingPoints: orderedPoints,
          totalPassengers: totalPax,
          totalDistanceKm,
          estimatedMinutes,
          occupancyPct: Math.round((totalPax / rCap) * 100),
          totalCost: calcRouteCost(recv.vehicleAssignments, totalDistanceKm),
        };
        result.splice(i, 1);
        changed = true;
        break;
      }

      // Se o doador já está acima do target, não precisa ser absorvido
      const donorOcc = donor.totalPassengers / dCap;
      if (donorOcc >= TARGET_OCC) continue;
    }
  }

  return result;
}

// ─── Fusão de rotas com baixa ocupação ────────────────────────────────────────

/** Aplica a fusão física de rotas e devolve a rota resultante */
function applyMerge(
  routes: Omit<RouteResult, "vehicleBlockId">[],
  indices: number[],
  fit: VehicleType,
  destination: GeoPoint,
): Omit<RouteResult, "vehicleBlockId"> {
  const base = routes[indices[0]];
  const allBPs = indices.flatMap((i) => routes[i].boardingPoints);
  const totalPax = indices.reduce((s, i) => s + routes[i].totalPassengers, 0);
  const { orderedPoints, totalDistanceKm, estimatedMinutes } = buildRoute(allBPs, destination);
  const newAssignment: VehicleAssignmentResult = {
    vehicleId: fit.id, vehicleType: fit.type, capacity: fit.capacity,
    count: 1, costPerKm: fit.costPerKm, costPerRoute: fit.costPerRoute,
  };
  return {
    ...base,
    boardingPoints: orderedPoints,
    totalPassengers: totalPax,
    totalDistanceKm,
    estimatedMinutes,
    vehicleAssignments: [newAssignment],
    occupancyPct: Math.round((totalPax / fit.capacity) * 100),
    totalCost: calcRouteCost([newAssignment], totalDistanceKm),
  };
}

/**
 * Tenta fundir rotas do mesmo turno para maximizar ocupação e ELIMINAR Mini-Vans.
 *
 * Estratégia em 3 passos (itera até estabilizar):
 *   1. Fusões de qualidade (pares/trios) que atingem ≥ 88% → elimina rotas baixas
 *   2. Eliminação de Mini-Van: funde Mini-Vans entre si atingindo ≥ 80% em Van/Micro
 *      (1 Van com 80% > 2-3 Mini-Vans, mesmo abaixo de 88%)
 *   3. Fusões de trio: 3 rotas pequenas → 1 veículo ≥ 88%
 *
 * Ao final, Mini-Vans devem ser apenas 1-2 rotas de sobras insolúveis.
 */
function mergeSmallRoutes(
  routes: Omit<RouteResult, "vehicleBlockId">[],
  vehicles: VehicleType[],
  destination: GeoPoint,
  maxRouteMinutes: number,
): Omit<RouteResult, "vehicleBlockId">[] {
  const byCapAsc = vehicles.slice().sort((a, b) => a.capacity - b.capacity);
  const miniVanCap = byCapAsc[0]?.capacity ?? 6; // menor tier = Mini-Van

  const isMiniVan = (r: Omit<RouteResult, "vehicleBlockId">) =>
    r.vehicleAssignments[0]?.capacity === miniVanCap;

  const occupancy = (r: Omit<RouteResult, "vehicleBlockId">) => {
    const a = r.vehicleAssignments[0];
    return a ? r.totalPassengers / (a.count * a.capacity) : 0;
  };

  const timeOk = (bps: typeof routes[0]["boardingPoints"], fit: VehicleType, totalPax: number) => {
    const base = fit.capacity >= BUS_MIN_CAPACITY
      ? Math.max(maxRouteMinutes, BUS_MAX_ROUTE_MINUTES)
      : maxRouteMinutes;
    // Bônus de +15 min quando fusão enche o veículo (≥95%) — vale a pena a rota um pouco maior
    const fillBonus = totalPax / fit.capacity >= 0.95 ? 15 : 0;
    return buildRoute(bps, destination).estimatedMinutes <= base + fillBonus;
  };

  const result = [...routes];
  let changed = true;

  while (changed) {
    changed = false;

    // ── Passo 1: Fusão de qualidade — par que atinge ≥ 88% num veículo melhor ──
    outer1: for (let i = 0; i < result.length; i++) {
      if (occupancy(result[i]) >= TARGET_MIN_OCC) continue;
      for (let j = 0; j < result.length; j++) {
        if (j === i || result[j].shiftTime !== result[i].shiftTime) continue;
        const total = result[i].totalPassengers + result[j].totalPassengers;
        const fit = byCapAsc.find((v) => v.capacity >= total && total / v.capacity >= TARGET_MIN_OCC);
        if (!fit) continue;
        const allBPs = [...result[i].boardingPoints, ...result[j].boardingPoints];
        if (!timeOk(allBPs, fit, total)) continue;
        const merged = applyMerge(result, [i, j], fit, destination);
        result.splice(Math.max(i, j), 1);
        result.splice(Math.min(i, j), 1);
        result.push(merged);
        changed = true;
        break outer1;
      }
    }
    if (changed) continue;

    // ── Passo 2: Fusão de trio — 3 rotas que juntas atingem ≥ 88% ─────────────
    outer2: for (let i = 0; i < result.length; i++) {
      if (occupancy(result[i]) >= TARGET_MIN_OCC) continue;
      for (let j = i + 1; j < result.length; j++) {
        if (result[j].shiftTime !== result[i].shiftTime) continue;
        for (let k = j + 1; k < result.length; k++) {
          if (result[k].shiftTime !== result[i].shiftTime) continue;
          const total = result[i].totalPassengers + result[j].totalPassengers + result[k].totalPassengers;
          const fit = byCapAsc.find((v) => v.capacity >= total && total / v.capacity >= TARGET_MIN_OCC);
          if (!fit) continue;
          const allBPs = [...result[i].boardingPoints, ...result[j].boardingPoints, ...result[k].boardingPoints];
          if (!timeOk(allBPs, fit, total)) continue;
          const merged = applyMerge(result, [i, j, k], fit, destination);
          // Remove em ordem reversa para não deslocar índices
          [k, j, i].sort((a, b) => b - a).forEach((idx) => result.splice(idx, 1));
          result.push(merged);
          changed = true;
          break outer2;
        }
      }
    }
    if (changed) continue;

    // ── Passo 3: Eliminação de Mini-Van — funde Mini-Vans entre si a ≥ 80% ────
    // Objetivo: 1 Van(80%) > 2 Mini-Vans separadas mesmo abaixo de 88%
    outer3: for (let i = 0; i < result.length; i++) {
      if (!isMiniVan(result[i])) continue;
      for (let j = i + 1; j < result.length; j++) {
        if (!isMiniVan(result[j]) || result[j].shiftTime !== result[i].shiftTime) continue;
        const total = result[i].totalPassengers + result[j].totalPassengers;
        // Aceita veículo MAIOR que Mini-Van com ≥ 80% (elimina 2 Mini-Vans)
        const fit = byCapAsc.find((v) => v.capacity > miniVanCap && v.capacity >= total && total / v.capacity >= 0.80);
        if (!fit) continue;
        const allBPs = [...result[i].boardingPoints, ...result[j].boardingPoints];
        if (!timeOk(allBPs, fit, total)) continue;
        const merged = applyMerge(result, [i, j], fit, destination);
        result.splice(Math.max(i, j), 1);
        result.splice(Math.min(i, j), 1);
        result.push(merged);
        changed = true;
        break outer3;
      }
    }
    if (changed) continue;

    // ── Passo 4: Trio de Mini-Vans → Van a ≥ 80% ──────────────────────────────
    outer4: for (let i = 0; i < result.length; i++) {
      if (!isMiniVan(result[i])) continue;
      for (let j = i + 1; j < result.length; j++) {
        if (!isMiniVan(result[j]) || result[j].shiftTime !== result[i].shiftTime) continue;
        for (let k = j + 1; k < result.length; k++) {
          if (!isMiniVan(result[k]) || result[k].shiftTime !== result[i].shiftTime) continue;
          const total = result[i].totalPassengers + result[j].totalPassengers + result[k].totalPassengers;
          const fit = byCapAsc.find((v) => v.capacity > miniVanCap && v.capacity >= total && total / v.capacity >= 0.80);
          if (!fit) continue;
          const allBPs = [...result[i].boardingPoints, ...result[j].boardingPoints, ...result[k].boardingPoints];
          if (!timeOk(allBPs, fit, total)) continue;
          const merged = applyMerge(result, [i, j, k], fit, destination);
          [k, j, i].sort((a, b) => b - a).forEach((idx) => result.splice(idx, 1));
          result.push(merged);
          changed = true;
          break outer4;
        }
      }
    }
  }

  return result;
}

// ─── Redimensionamento de veículos pós-roteamento ────────────────────────────

/**
 * Para cada rota, seleciona o MENOR veículo capaz de transportar todos os
 * passageiros em uma única unidade e que atinja ao menos TARGET_MIN_OCC (88%).
 *
 * Regra: Micro-ônibus → Van → Mini-Van se o grupo for menor.
 *   Ex: 18 pax só cabe em Micro-ônibus (30) → sem opção menor → mantém.
 *   Ex: 12 pax cabe em Van (15) → troca de Micro-ônibus para Van (80% → melhor que 40%).
 *   Ex: 5 pax cabe em Mini-Van (6) → troca para Mini-Van.
 *
 * Aplicado APÓS topUpRoutes para corrigir atribuições super-dimensionadas.
 */
function rightSizeVehicles(
  routes: Omit<RouteResult, "vehicleBlockId">[],
  vehicles: VehicleType[],
): Omit<RouteResult, "vehicleBlockId">[] {
  // Ordena por capacidade ASC: Mini-Van(6) → Van(15) → Micro-ônibus(30) → Ônibus(44)
  const byCapAsc = vehicles.slice().sort((a, b) => a.capacity - b.capacity);

  return routes.map((route) => {
    const pax = route.totalPassengers;
    const currentV = route.vehicleAssignments[0];
    if (!currentV) return route;

    // Menor veículo que cabe todos em 1 unidade
    const smallestFit = byCapAsc.find((v) => v.capacity >= pax);
    if (!smallestFit) return route; // só o maior resolve → mantém

    // Nenhuma mudança se já está no veículo menor possível
    if (smallestFit.id === currentV.vehicleId) return route;

    const currentOcc = pax / (currentV.count * currentV.capacity);
    const newOcc = pax / smallestFit.capacity;

    // Sempre prefere 1 veículo único quando a ocupação ≥ mínimo do tier.
    // Evita 2× Mini-Van (100%) quando 1× Van (80%) já atende o mínimo do tier.
    const singleIsBetter = currentV.count > 1 && newOcc >= tierMinOccupancy(smallestFit.type);
    if (!singleIsBetter && newOcc < currentOcc) return route; // não piora sem motivo

    const newAssignment: VehicleAssignmentResult = {
      vehicleId: smallestFit.id,
      vehicleType: smallestFit.type,
      capacity: smallestFit.capacity,
      count: 1,
      costPerKm: smallestFit.costPerKm,
      costPerRoute: smallestFit.costPerRoute,
    };
    return {
      ...route,
      vehicleAssignments: [newAssignment],
      occupancyPct: Math.round(newOcc * 100),
      totalCost: calcRouteCost([newAssignment], route.totalDistanceKm),
    };
  });
}

// ─── Atribuição de blocos de veículos entre turnos ─────────────────────────

/**
 * Bloco de veículo = veículo físico que cobre múltiplos turnos.
 *
 * Após entregar passageiros (entrada do turno T), o veículo:
 * - Faz a viagem de volta com os que saem do turno anterior (≈ mesma duração)
 * - Fica livre em: T + routeDuration + RETURN_BUFFER_MINUTES
 *
 * Se o próximo turno T2 começa depois disso, o mesmo veículo é reutilizado.
 */
function assignVehicleBlocks(routes: Omit<RouteResult, "vehicleBlockId">[]): RouteResult[] {
  // CRÍTICO: processa em ordem cronológica de turno para maximizar reaproveitamento.
  // O topUpRoutes pode ter embaralhado a ordem por ocupação — aqui restauramos.
  // Dentro do mesmo turno, processa as rotas mais longas primeiro (liberam mais tarde,
  // abrindo espaço para rotas mais curtas reusarem slots mais cedo nos próximos turnos).
  const sorted = [...routes].sort((a, b) => {
    const shiftDiff = parseShiftStartMinutes(a.shiftTime) - parseShiftStartMinutes(b.shiftTime);
    if (shiftDiff !== 0) return shiftDiff;
    return b.estimatedMinutes - a.estimatedMinutes; // mais longa primeiro no mesmo turno
  });

  // slots[i] = { freeAt } — horário (em minutos) em que o veículo i estará disponível
  const slots: { freeAt: number }[] = [];
  const blockIds = new Map<Omit<RouteResult, "vehicleBlockId">, number>();

  for (const route of sorted) {
    const startMin = parseShiftStartMinutes(route.shiftTime);
    // Viagem de entrada + viagem de saída imediata + buffer de reposicionamento
    const finishMin = startMin + route.estimatedMinutes * 2 + EXIT_TRIP_BUFFER_MINUTES;
    const vehiclesNeeded = route.vehicleAssignments.reduce((s, a) => s + a.count, 0);

    // Candidatos: slots livres antes do início do turno
    const available: number[] = [];
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].freeAt <= startMin) available.push(i);
    }

    // Prefere o slot que ficou livre MAIS RECENTEMENTE (maximiza encadeamento de turnos):
    // um slot recém-liberado significa que o veículo está "perto" no tempo, ideal para
    // cobrir o próximo turno sem longa espera ociosa.
    available.sort((a, b) => slots[b].freeAt - slots[a].freeAt);

    const chosen: number[] = available.slice(0, vehiclesNeeded);
    const newNeeded = vehiclesNeeded - chosen.length;
    for (let i = 0; i < newNeeded; i++) {
      chosen.push(slots.length);
      slots.push({ freeAt: 0 });
    }
    for (const idx of chosen) slots[idx].freeAt = finishMin;

    blockIds.set(route, (chosen[0] ?? 0) + 1);
  }

  // Retorna rotas na ordem original com vehicleBlockId atribuído
  return routes.map(r => ({ ...r, vehicleBlockId: blockIds.get(r) ?? 1 }));
}

// ─── Renomeação sequencial ──────────────────────────────────────────────────

function renameRoutes(routes: RouteResult[]): RouteResult[] {
  let counter = 1;
  const byShift = new Map<string, RouteResult[]>();
  for (const r of routes) {
    const s = r.shiftTime ?? "00:00";
    if (!byShift.has(s)) byShift.set(s, []);
    byShift.get(s)!.push(r);
  }
  for (const [, shiftRoutes] of [...byShift.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const r of shiftRoutes) {
      r.name = `Rota ${counter++} — ${r.shiftTime}`;
    }
  }
  return routes;
}

// ─── Geração de rotas de Volta ──────────────────────────────────────────────

/**
 * Para cada rota de Ida, gera a rota de Volta correspondente:
 * - Pontos em ordem inversa (empresa → último ponto → ... → primeiro)
 * - shiftTime = horário de SAÍDA do turno
 * - Mesmo veículo / custo / distância
 */
function generateVoltaRoutes(
  idaRoutes: RouteResult[],
  shiftEndMap: Map<string, string>,
): RouteResult[] {
  const voltaRoutes: RouteResult[] = [];
  const byShift = new Map<string, RouteResult[]>();
  for (const r of idaRoutes) {
    if (!byShift.has(r.shiftTime)) byShift.set(r.shiftTime, []);
    byShift.get(r.shiftTime)!.push(r);
  }

  let voltaCounter = 1;
  for (const [startTime, routes] of [...byShift.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const endTime = shiftEndMap.get(startTime);
    if (!endTime) continue;

    for (const r of routes) {
      const reversedBPs = [...r.boardingPoints].reverse().map((bp, i) => ({
        ...bp,
        sequenceOrder: i + 1,
      }));
      voltaRoutes.push({
        ...r,
        name: `Volta ${voltaCounter++} — ${endTime}`,
        direction: "volta",
        shiftTime: endTime,
        boardingPoints: reversedBPs,
      });
    }
  }
  return voltaRoutes;
}

// ─── Ponto de entrada ───────────────────────────────────────────────────────

export interface RoutingConfig {
  maxRadiusKm: number;
  maxRouteMinutes: number;
  companyLat: number;
  companyLng: number;
  strategy: string;
  vehicles: VehicleType[];
}

export function runRoutingEngine(employees: EmployeeGeo[], config: RoutingConfig): RouteResult[] {
  const destination: GeoPoint = { lat: config.companyLat, lng: config.companyLng };

  // ── 1. Agrupa por turno e extrai mapa de horários de saída ──────────────
  const shiftGroups = new Map<string, EmployeeGeo[]>();
  const shiftEndMap = new Map<string, string>(); // startTime → endTime
  for (const emp of employees) {
    const key = minutesToTime(parseShiftStartMinutes(emp.shift));
    if (!shiftGroups.has(key)) shiftGroups.set(key, []);
    shiftGroups.get(key)!.push(emp);
    // Extrai horário de saída: "06:00/14:20 SEG/SAB" → endTime = "14:20"
    if (emp.shift && !shiftEndMap.has(key)) {
      const m = emp.shift.match(/^(\d{1,2}:\d{2})\/(\d{1,2}:\d{2})/);
      if (m) {
        const [eh, em] = m[2].split(":").map(Number);
        shiftEndMap.set(key, minutesToTime(eh * 60 + em));
      }
    }
  }
  const sortedShifts = [...shiftGroups.keys()].sort();

  // ── 2. Ordena camadas por capacidade DESC: Ônibus → Micro → Van → Mini-Van
  const tiers = config.vehicles.slice().sort((a, b) => b.capacity - a.capacity);

  const allRoutes: Omit<RouteResult, "vehicleBlockId">[] = [];
  let routeCounter = 1;

  for (const shiftTime of sortedShifts) {
    const shiftEmployees = shiftGroups.get(shiftTime)!;
    let remainingBPs = clusterIntoBoardingPoints(shiftEmployees, config.maxRadiusKm, destination);

    // ── 3. Roteamento em camadas ─────────────────────────────────────────
    for (const tier of tiers) {
      if (remainingBPs.length === 0) break;

      // Ônibus recebe até 90 min; demais usam o limite configurado
      const timeLimit = tier.capacity >= BUS_MIN_CAPACITY
        ? Math.max(config.maxRouteMinutes, BUS_MAX_ROUTE_MINUTES)
        : config.maxRouteMinutes;

      // Mínimo de passageiros por tier: Ônibus 88%, Micro 80%, Van 67%, Mini-Van 50%
      const minPax = Math.ceil(tier.capacity * tierMinOccupancy(tier.capacity));

      const { routes: tierRoutes, unrouted } = buildRoutesForTier(
        remainingBPs, destination, tier, timeLimit, shiftTime, routeCounter, minPax,
      );

      allRoutes.push(...tierRoutes);
      routeCounter += tierRoutes.length;
      remainingBPs = unrouted;
    }

    // ── 4. Sobras que não atingiram nem 90% da mini-van ──────────────────
    // Aceita qualquer quantidade restante na menor camada disponível
    if (remainingBPs.length > 0 && tiers.length > 0) {
      const smallest = tiers[tiers.length - 1];
      const { routes: leftoverRoutes } = buildRoutesForTier(
        remainingBPs, destination, smallest, config.maxRouteMinutes, shiftTime, routeCounter, 1,
      );
      allRoutes.push(...leftoverRoutes);
      routeCounter += leftoverRoutes.length;
    }
  }

  // ── 5. Consolidação: reúne rotas baixas de mesmo turno em tiers superiores ──
  // Inclui Mini-Van e também rotas Van/Micro com ocupação < 88% que possam
  // ser re-roteadas em conjunto para atingir maior lotação.
  const CONSOLIDATION_MIN_OCC = TARGET_MIN_OCC; // 88%
  const consolidated: Omit<RouteResult, "vehicleBlockId">[] = [];
  const miniVanTier = tiers[tiers.length - 1]; // menor camada

  // Candidatos a consolidação: Mini-Van OU veículos maiores com ocupação < 88%
  const miniVanByShift = new Map<string, Omit<RouteResult, "vehicleBlockId">[]>();
  const nonMiniVan: Omit<RouteResult, "vehicleBlockId">[] = [];

  for (const r of allRoutes) {
    const v = r.vehicleAssignments[0];
    const occ = v ? r.totalPassengers / (v.count * v.capacity) : 1;
    const isMV = v && v.vehicleType === miniVanTier.type;
    // Consolida: Mini-Van SEMPRE, ou qualquer veículo < 88%
    if (isMV || occ < TARGET_MIN_OCC) {
      if (!miniVanByShift.has(r.shiftTime)) miniVanByShift.set(r.shiftTime, []);
      miniVanByShift.get(r.shiftTime)!.push(r);
    } else {
      nonMiniVan.push(r);
    }
  }

  for (const [shiftTime, mvRoutes] of miniVanByShift) {
    if (mvRoutes.length <= 1) {
      consolidated.push(...mvRoutes);
      continue;
    }

    // Junta todos os BPs das mini-vans deste turno e tenta tiers superiores com 60%
    const allBPs = mvRoutes.flatMap(r => r.boardingPoints);
    let remainingBPs = allBPs;
    const consolidatedRoutes: Omit<RouteResult, "vehicleBlockId">[] = [];

    const upperTiers = tiers.slice(0, -1); // tudo menos mini-van
    for (const tier of upperTiers) {
      if (remainingBPs.length === 0) break;
      const minPaxRelaxed = Math.ceil(tier.capacity * CONSOLIDATION_MIN_OCC);
      const timeLimit = tier.capacity >= BUS_MIN_CAPACITY
        ? Math.max(config.maxRouteMinutes, BUS_MAX_ROUTE_MINUTES)
        : config.maxRouteMinutes;

      const { routes: newRoutes, unrouted } = buildRoutesForTier(
        remainingBPs, destination, tier, timeLimit, shiftTime,
        routeCounter, minPaxRelaxed,
      );
      if (newRoutes.length > 0) {
        consolidatedRoutes.push(...newRoutes);
        routeCounter += newRoutes.length;
        remainingBPs = unrouted;
      }
    }

    if (consolidatedRoutes.length === 0) {
      // Nenhum tier superior funcionou: mantém as mini-van originais
      consolidated.push(...mvRoutes);
    } else {
      // Pelo menos 1 tier superior conseguiu formar rota: usa consolidadas + sobras
      consolidated.push(...consolidatedRoutes);
      if (remainingBPs.length > 0) {
        const { routes: leftover } = buildRoutesForTier(
          remainingBPs, destination, miniVanTier, config.maxRouteMinutes,
          shiftTime, routeCounter, 1,
        );
        consolidated.push(...leftover);
        routeCounter += leftover.length;
      }
    }
  }

  const postConsolidation = [...nonMiniVan, ...consolidated];

  // ── 6. Pós-preenchimento: absorve sobras em rotas com assentos livres ───
  const topped = topUpRoutes(postConsolidation, destination, config.maxRouteMinutes);

  // ── 7. Redimensiona veículos: usa o menor que cabe todos → maximiza ocupação ─
  // Garante regra de 88%: ex. 12 pax → Van(15/82%) em vez de Micro-ônibus(30/40%)
  const rightSized = rightSizeVehicles(topped, config.vehicles);

  // ── 8. Funde pares de rotas pequenas (<88%) que juntas atingem ≥88% ────
  // Ex: 7 pax + 8 pax → Van(15) 100%; 9 pax + 5 pax → Van(15) 93%
  const merged = mergeSmallRoutes(rightSized, config.vehicles, destination, config.maxRouteMinutes);

  // ── 9. Segundo passe de pós-preenchimento com veículos já redimensionados ─
  const topped2 = topUpRoutes(merged, destination, config.maxRouteMinutes);

  // ── 10. Atribui blocos de veículos reutilizáveis entre turnos ───────────
  const withBlocks = assignVehicleBlocks(topped2);
  const idaRoutes = renameRoutes(withBlocks);
  const voltaRoutes = generateVoltaRoutes(idaRoutes, shiftEndMap);
  return [...idaRoutes, ...voltaRoutes];
}

// ─── Geocodificação simulada ────────────────────────────────────────────────

// Known addresses → real coordinates (CEP / landmark lookup)
const KNOWN_ADDRESSES: Array<{ pattern: RegExp; lat: number; lng: number }> = [
  // Refrio – R. Wilhelm Winter, 345, Distrito Industrial, Jundiaí
  { pattern: /wilhelm\s*winter|13213[-\s]?000|distrito\s*industrial.*jundiai|jundiai.*distrito\s*industrial/i, lat: -23.2074, lng: -46.9096 },
  // Várzea Paulista centro
  { pattern: /13225|varzea\s*paulista/i, lat: -23.2116, lng: -46.8281 },
  // Campo Limpo Paulista
  { pattern: /13231|campo\s*limpo\s*paulista/i, lat: -23.2291, lng: -46.7877 },
  // Jundiaí geral
  { pattern: /13200|13201|13202|13203|13204|13205|13206|13207|13208|13209|13210|13211|13212|13214|13215|13216|13217|13218|13219|13220|jundiai/i, lat: -23.1864, lng: -46.8956 },
  // Itupeva
  { pattern: /13295|itupeva/i, lat: -23.1546, lng: -47.0584 },
  // Louveira
  { pattern: /13290|louveira/i, lat: -23.0874, lng: -46.9489 },
];

export function geocodeAddress(address: string, index: number): { lat: number; lng: number } {
  // Try known address lookup first
  for (const entry of KNOWN_ADDRESSES) {
    if (entry.pattern.test(address)) {
      // Add a small deterministic jitter (±300 m) so repeated same-pattern addresses spread slightly
      const rngK = (s: number) => { const x = Math.sin(s * 9301 + 49297) * 233280; return x - Math.floor(x); };
      let seed = 0;
      for (let i = 0; i < address.length; i++) seed += address.charCodeAt(i) * (i + 1);
      seed += index * 31;
      return {
        lat: entry.lat + (rngK(seed) - 0.5) * 0.024,      // ±0.012° ≈ ±1.3 km — espalha por bairros da cidade
        lng: entry.lng + (rngK(seed + 1) - 0.5) * 0.024,  // ±0.012° ≈ ±1.1 km
      };
    }
  }

  // Fallback: spread around Jundiaí region (covers Várzea Paulista, Campo Limpo, Jundiaí, Itupeva)
  // Jundiaí center: -23.1864, -46.8956
  const baseLat = -23.1864;
  const baseLng = -46.8956;

  let seed = 0;
  for (let i = 0; i < address.length; i++) seed += address.charCodeAt(i) * (i + 1);
  seed += index * 31;

  const rng = (s: number) => {
    const x = Math.sin(s * 9301 + 49297) * 233280;
    return x - Math.floor(x);
  };

  // ±0.15° lat ≈ ±16 km, ±0.15° lng ≈ ±14 km — cobre toda a região de Jundiaí
  return {
    lat: baseLat + (rng(seed) - 0.5) * 0.30,
    lng: baseLng + (rng(seed + 1) - 0.5) * 0.30,
  };
}
