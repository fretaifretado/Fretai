import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import Coordinate, OptimizeRequest, Stop, Vehicle, app, solve


def square_matrix(size: int, value: int) -> list[list[int]]:
    return [[0 if row == column else value for column in range(size)] for row in range(size)]


class SolverTests(unittest.TestCase):
    def test_chooses_smallest_cost_effective_vehicle(self) -> None:
        request = OptimizeRequest(
            start=Coordinate(lat=-18.91, lng=-48.27),
            end=Coordinate(lat=-18.92, lng=-48.28),
            openStart=True,
            stops=[
                Stop(id="ponto-1", location=Coordinate(lat=-18.90, lng=-48.26), demand=6, serviceMinutes=2),
                Stop(id="ponto-2", location=Coordinate(lat=-18.89, lng=-48.25), demand=4, serviceMinutes=2),
            ],
            vehicles=[
                Vehicle(id="van-1", type="Van", capacity=15, costPerKm=2.1, fixedCost=60),
                Vehicle(id="onibus-1", type="Onibus", capacity=44, costPerKm=4.5, fixedCost=150),
            ],
            maxRouteMinutes=120,
            targetOccupancyPct=90,
            solveTimeSeconds=1,
        )
        matrix = square_matrix(4, 1_000)

        result = solve(request, matrix, matrix)

        self.assertEqual(result.unassignedStopIds, [])
        self.assertEqual(len(result.routes), 1)
        self.assertEqual(result.routes[0].vehicleId, "van-1")
        self.assertEqual(result.routes[0].load, 10)
        self.assertCountEqual(result.routes[0].stopIds, ["ponto-1", "ponto-2"])

    def test_never_exceeds_vehicle_capacity(self) -> None:
        request = OptimizeRequest(
            start=Coordinate(lat=-18.91, lng=-48.27),
            end=Coordinate(lat=-18.92, lng=-48.28),
            stops=[
                Stop(id="ponto-1", location=Coordinate(lat=-18.90, lng=-48.26), demand=10),
                Stop(id="ponto-2", location=Coordinate(lat=-18.89, lng=-48.25), demand=10),
                Stop(id="ponto-3", location=Coordinate(lat=-18.88, lng=-48.24), demand=10),
            ],
            vehicles=[
                Vehicle(id="van-1", type="Van", capacity=15, costPerKm=2.1, fixedCost=60),
                Vehicle(id="van-2", type="Van", capacity=15, costPerKm=2.1, fixedCost=60),
                Vehicle(id="onibus-1", type="Onibus", capacity=44, costPerKm=4.5, fixedCost=150),
            ],
            maxRouteMinutes=120,
            targetOccupancyPct=90,
            solveTimeSeconds=1,
        )
        distance_matrix = square_matrix(5, 1_000)
        duration_matrix = square_matrix(5, 120)

        result = solve(request, distance_matrix, duration_matrix)

        self.assertEqual(result.unassignedStopIds, [])
        self.assertEqual(sum(route.load for route in result.routes), 30)
        capacity_by_vehicle = {vehicle.id: vehicle.capacity for vehicle in request.vehicles}
        self.assertTrue(all(route.load <= capacity_by_vehicle[route.vehicleId] for route in result.routes))

    def test_http_endpoint_returns_solver_contract(self) -> None:
        body = {
            "start": {"lat": -18.91, "lng": -48.27},
            "end": {"lat": -18.92, "lng": -48.28},
            "openStart": True,
            "stops": [
                {"id": "ponto-1", "location": {"lat": -18.90, "lng": -48.26}, "demand": 8, "serviceMinutes": 2}
            ],
            "vehicles": [
                {"id": "van-1", "type": "Van", "capacity": 15, "costPerKm": 2.1, "fixedCost": 60}
            ],
            "maxRouteMinutes": 120,
            "targetOccupancyPct": 90,
            "solveTimeSeconds": 1,
        }
        matrix = square_matrix(3, 1_000)

        with patch("app.main.osrm_matrices", new=AsyncMock(return_value=(matrix, matrix))):
            response = TestClient(app).post("/optimize", json=body)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["engine"], "or-tools+osrm")
        self.assertEqual(payload["unassignedStopIds"], [])
        self.assertEqual(payload["routes"][0]["load"], 8)


if __name__ == "__main__":
    unittest.main()
