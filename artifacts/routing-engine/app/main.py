from __future__ import annotations

import os
from typing import List, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from pydantic import BaseModel, Field


class Coordinate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class Stop(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    location: Coordinate
    demand: int = Field(gt=0)
    serviceMinutes: int = Field(default=5, ge=0, le=60)


class Vehicle(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    type: str = Field(min_length=1, max_length=120)
    capacity: int = Field(gt=0)
    costPerKm: float = Field(default=0, ge=0)
    fixedCost: float = Field(default=0, ge=0)


class OptimizeRequest(BaseModel):
    start: Coordinate
    end: Coordinate
    openStart: bool = False
    stops: List[Stop] = Field(min_length=1)
    vehicles: List[Vehicle] = Field(min_length=1)
    maxRouteMinutes: int = Field(default=120, gt=0, le=1440)
    targetOccupancyPct: float = Field(default=90, ge=1, le=100)
    solveTimeSeconds: int = Field(default=15, ge=1, le=60)


class OptimizedRoute(BaseModel):
    vehicleId: str
    stopIds: List[str]
    totalDistanceKm: float
    totalDurationMinutes: float
    load: int
    occupancyPct: float
    estimatedCost: float


class OptimizeResponse(BaseModel):
    engine: str = "or-tools+osrm"
    routes: List[OptimizedRoute]
    unassignedStopIds: List[str]
    objectiveValue: int


app = FastAPI(title="Fretai Routing Engine", version="0.1.0")
OSRM_URL = os.getenv("OSRM_URL", "https://router.project-osrm.org").rstrip("/")
ROUTING_ENGINE_TOKEN = os.getenv("ROUTING_ENGINE_TOKEN", "").strip()
OSRM_MAX_LOCATIONS = int(os.getenv("OSRM_MAX_LOCATIONS", "100"))


def authorize(received_token: Optional[str]) -> None:
    if ROUTING_ENGINE_TOKEN and received_token != ROUTING_ENGINE_TOKEN:
        raise HTTPException(status_code=401, detail="Token do roteirizador inválido")


async def osrm_matrices(request: OptimizeRequest) -> tuple[list[list[int]], list[list[int]]]:
    coordinates = [request.start, *[stop.location for stop in request.stops], request.end]
    if len(coordinates) > OSRM_MAX_LOCATIONS:
        raise HTTPException(
            status_code=422,
            detail=f"O OSRM configurado aceita no máximo {OSRM_MAX_LOCATIONS} localizações por otimização",
        )

    encoded = ";".join(f"{point.lng},{point.lat}" for point in coordinates)
    url = f"{OSRM_URL}/table/v1/driving/{encoded}"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, params={"annotations": "distance,duration"})
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Falha ao consultar matriz do OSRM: {exc}") from exc

    if payload.get("code") != "Ok" or not payload.get("distances") or not payload.get("durations"):
        raise HTTPException(status_code=502, detail="OSRM não devolveu uma matriz válida")

    try:
        distances = [[int(round(value)) for value in row] for row in payload["distances"]]
        durations = [[int(round(value)) for value in row] for row in payload["durations"]]
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="OSRM devolveu trechos sem rota disponível") from exc
    return distances, durations


def solve(request: OptimizeRequest, distances: list[list[int]], durations: list[list[int]]) -> OptimizeResponse:
    stop_count = len(request.stops)
    start_node = 0
    end_node = stop_count + 1
    manager = pywrapcp.RoutingIndexManager(
        stop_count + 2,
        len(request.vehicles),
        [start_node] * len(request.vehicles),
        [end_node] * len(request.vehicles),
    )
    routing = pywrapcp.RoutingModel(manager)

    def duration_callback(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        travel = 0 if request.openStart and from_node == start_node else durations[from_node][to_node]
        service = request.stops[from_node - 1].serviceMinutes * 60 if 1 <= from_node <= stop_count else 0
        return travel + service

    duration_index = routing.RegisterTransitCallback(duration_callback)
    routing.AddDimension(
        duration_index,
        0,
        request.maxRouteMinutes * 60,
        True,
        "Time",
    )

    demands = [0, *[stop.demand for stop in request.stops], 0]

    def demand_callback(index: int) -> int:
        return demands[manager.IndexToNode(index)]

    demand_index = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_index,
        0,
        [vehicle.capacity for vehicle in request.vehicles],
        True,
        "Capacity",
    )

    for vehicle_index, vehicle in enumerate(request.vehicles):
        def cost_callback(from_index: int, to_index: int, item: Vehicle = vehicle) -> int:
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            if request.openStart and from_node == start_node:
                return 0
            distance_cost_cents = distances[from_node][to_node] * item.costPerKm / 10
            return int(round(distance_cost_cents))

        cost_index = routing.RegisterTransitCallback(cost_callback)
        routing.SetArcCostEvaluatorOfVehicle(cost_index, vehicle_index)
        # The capacity component favors smaller well-filled vehicles without making
        # the 90% target a hard constraint for unavoidable remainder passengers.
        occupancy_pressure = vehicle.capacity * max(1, int(round(request.targetOccupancyPct / 10)))
        routing.SetFixedCostOfVehicle(int(round(vehicle.fixedCost * 100)) + occupancy_pressure, vehicle_index)

    # Serving everybody is strongly preferred, but returning an explicit list of
    # impossible stops is safer than producing no diagnostic at all.
    for stop_index, stop in enumerate(request.stops, start=1):
        routing.AddDisjunction([manager.NodeToIndex(stop_index)], 10_000_000 * stop.demand)

    search = pywrapcp.DefaultRoutingSearchParameters()
    search.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
    search.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    search.time_limit.seconds = request.solveTimeSeconds
    search.log_search = False

    solution = routing.SolveWithParameters(search)
    if solution is None:
        raise HTTPException(status_code=422, detail="Não foi encontrada uma solução viável")

    assigned_nodes: set[int] = set()
    routes: list[OptimizedRoute] = []
    for vehicle_index, vehicle in enumerate(request.vehicles):
        index = routing.Start(vehicle_index)
        next_index = solution.Value(routing.NextVar(index))
        if routing.IsEnd(next_index):
            continue

        route_nodes: list[int] = []
        distance_meters = 0
        duration_seconds = 0
        while not routing.IsEnd(index):
            next_index = solution.Value(routing.NextVar(index))
            from_node = manager.IndexToNode(index)
            to_node = manager.IndexToNode(next_index)
            if 1 <= from_node <= stop_count:
                route_nodes.append(from_node)
                assigned_nodes.add(from_node)
            if not (request.openStart and from_node == start_node):
                distance_meters += distances[from_node][to_node]
                duration_seconds += durations[from_node][to_node]
            if 1 <= from_node <= stop_count:
                duration_seconds += request.stops[from_node - 1].serviceMinutes * 60
            index = next_index

        load = sum(request.stops[node - 1].demand for node in route_nodes)
        distance_km = distance_meters / 1000
        routes.append(OptimizedRoute(
            vehicleId=vehicle.id,
            stopIds=[request.stops[node - 1].id for node in route_nodes],
            totalDistanceKm=round(distance_km, 2),
            totalDurationMinutes=round(duration_seconds / 60, 1),
            load=load,
            occupancyPct=round(load / vehicle.capacity * 100, 2),
            estimatedCost=round(vehicle.fixedCost + distance_km * vehicle.costPerKm, 2),
        ))

    unassigned = [
        stop.id for node, stop in enumerate(request.stops, start=1)
        if node not in assigned_nodes
    ]
    return OptimizeResponse(
        routes=routes,
        unassignedStopIds=unassigned,
        objectiveValue=int(solution.ObjectiveValue()),
    )


@app.get("/healthz")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": "or-tools+osrm"}


@app.post("/optimize", response_model=OptimizeResponse)
async def optimize(
    request: OptimizeRequest,
    x_routing_token: Optional[str] = Header(default=None),
) -> OptimizeResponse:
    authorize(x_routing_token)
    if len({stop.id for stop in request.stops}) != len(request.stops):
        raise HTTPException(status_code=422, detail="IDs de pontos duplicados")
    if len({vehicle.id for vehicle in request.vehicles}) != len(request.vehicles):
        raise HTTPException(status_code=422, detail="IDs de veículos duplicados")
    if max(stop.demand for stop in request.stops) > max(vehicle.capacity for vehicle in request.vehicles):
        raise HTTPException(status_code=422, detail="Existe ponto com mais passageiros que a capacidade máxima")

    distances, durations = await osrm_matrices(request)
    return solve(request, distances, durations)
