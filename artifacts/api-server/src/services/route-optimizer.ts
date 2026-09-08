export type RouteOptimizerCoordinate = {
  lat: number;
  lng: number;
};

export type RouteOptimizerStop = {
  id: string;
  location: RouteOptimizerCoordinate;
  demand: number;
  serviceMinutes: number;
};

export type RouteOptimizerVehicle = {
  id: string;
  type: string;
  capacity: number;
  costPerKm: number;
  fixedCost: number;
};

export type RouteOptimizerInput = {
  start: RouteOptimizerCoordinate;
  end: RouteOptimizerCoordinate;
  openStart?: boolean;
  stops: RouteOptimizerStop[];
  vehicles: RouteOptimizerVehicle[];
  maxRouteMinutes: number;
  targetOccupancyPct: number;
  solveTimeSeconds?: number;
};

export type RouteOptimizerRoute = {
  vehicleId: string;
  stopIds: string[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  load: number;
  occupancyPct: number;
  estimatedCost: number;
};

export type RouteOptimizerResult = {
  engine: "or-tools+osrm";
  routes: RouteOptimizerRoute[];
  unassignedStopIds: string[];
  objectiveValue: number;
};

const optimizerUrl = process.env["ROUTING_ENGINE_URL"]?.trim().replace(/\/$/, "") ?? "";
const optimizerToken = process.env["ROUTING_ENGINE_TOKEN"]?.trim() ?? "";

export function isRouteOptimizerConfigured(): boolean {
  return optimizerUrl.length > 0;
}

function validateResult(input: RouteOptimizerInput, value: unknown): RouteOptimizerResult {
  if (!value || typeof value !== "object") throw new Error("Resposta vazia do roteirizador");
  const result = value as Partial<RouteOptimizerResult>;
  if (result.engine !== "or-tools+osrm" || !Array.isArray(result.routes) || !Array.isArray(result.unassignedStopIds)) {
    throw new Error("Resposta inválida do roteirizador");
  }

  const stopIds = new Set(input.stops.map(stop => stop.id));
  const stopById = new Map(input.stops.map(stop => [stop.id, stop]));
  const vehicleById = new Map(input.vehicles.map(vehicle => [vehicle.id, vehicle]));
  const assigned = new Set<string>();

  for (const route of result.routes) {
    const vehicle = vehicleById.get(route.vehicleId);
    if (!vehicle || !Array.isArray(route.stopIds) || route.stopIds.length === 0) {
      throw new Error("Rota retornada com veículo ou paradas inválidas");
    }
    for (const stopId of route.stopIds) {
      if (!stopIds.has(stopId) || assigned.has(stopId)) {
        throw new Error("Roteirizador retornou ponto inexistente ou duplicado");
      }
      assigned.add(stopId);
    }
    const expectedLoad = route.stopIds.reduce((total, stopId) => total + stopById.get(stopId)!.demand, 0);
    if (!Number.isFinite(route.load) || route.load !== expectedLoad || route.load <= 0 || route.load > vehicle.capacity) {
      throw new Error("Roteirizador excedeu a capacidade do veículo");
    }
    if (
      !Number.isFinite(route.totalDistanceKm) || route.totalDistanceKm < 0 ||
      !Number.isFinite(route.totalDurationMinutes) || route.totalDurationMinutes < 0 || route.totalDurationMinutes > input.maxRouteMinutes ||
      !Number.isFinite(route.occupancyPct) || route.occupancyPct < 0 || route.occupancyPct > 100 ||
      !Number.isFinite(route.estimatedCost) || route.estimatedCost < 0
    ) {
      throw new Error("Roteirizador retornou métricas inválidas");
    }
  }

  const unassigned = new Set(result.unassignedStopIds);
  if (unassigned.size !== result.unassignedStopIds.length) {
    throw new Error("Roteirizador retornou pontos não atendidos duplicados");
  }
  for (const stopId of unassigned) {
    if (!stopIds.has(stopId) || assigned.has(stopId)) {
      throw new Error("Roteirizador retornou ponto não atendido inválido");
    }
  }
  if (assigned.size + unassigned.size !== stopIds.size) {
    throw new Error("Roteirizador não devolveu todos os pontos");
  }
  if (typeof result.objectiveValue !== "number" || !Number.isFinite(result.objectiveValue) || result.objectiveValue < 0) {
    throw new Error("Roteirizador retornou objetivo inválido");
  }

  return result as RouteOptimizerResult;
}

export async function optimizeRoutes(input: RouteOptimizerInput): Promise<RouteOptimizerResult | null> {
  if (!optimizerUrl) return null;

  const headers = new Headers({ "Content-Type": "application/json", Accept: "application/json" });
  if (optimizerToken) headers.set("X-Routing-Token", optimizerToken);

  const response = await fetch(`${optimizerUrl}/optimize`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(70_000),
  });
  const body = await response.json().catch(() => ({})) as { detail?: string };
  if (!response.ok) {
    throw new Error(body.detail ?? `Roteirizador respondeu HTTP ${response.status}`);
  }
  return validateResult(input, body);
}
