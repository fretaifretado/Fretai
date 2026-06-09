import { Router } from "express";
import { db } from "@workspace/db";
import {
  budgetsTable, companiesTable,
  budgetWorkersTable, budgetRoutesTable, budgetBoardingPointsTable,
  vehicleTypesTable, partnersTable,
} from "@workspace/db/schema";
import { sql, eq, desc, inArray } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function deterministicHash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return Math.abs(h);
}

function fakeGeocode(address: string, baseLat = -23.5505, baseLng = -46.6333) {
  const h = deterministicHash(address);
  const r = 0.005 + (h & 0xFF) / 255 * 0.045;
  const angle = ((h >> 8) & 0xFF) / 255 * Math.PI * 2;
  return {
    lat: parseFloat((baseLat + r * Math.cos(angle)).toFixed(7)),
    lng: parseFloat((baseLng + r * Math.sin(angle) * 1.3).toFixed(7)),
  };
}

/* ─── Company address geocoding (single call, used to centre the map) ─────── */
const geoCache = new Map<string, { lat: number; lng: number }>();

async function geocodeNominatim(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null;
  const key = address.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key)!;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=br`;
    const res = await fetch(url, {
      headers: { "User-Agent": "FretaiApp/1.0 (geocoding)" },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (data.length > 0 && data[0]) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geoCache.set(key, result);
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

function parseShiftStart(shift: string | null | undefined): string | null {
  if (!shift) return null;
  const m = shift.match(/^(\d{1,2}:\d{2})/);
  if (m) return m[1].padStart(5, "0");
  const s = shift.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (s.startsWith("man")) return "06:00";
  if (s.startsWith("tar")) return "14:20";
  if (s.startsWith("noi")) return "22:30";
  return shift.trim().substring(0, 10);
}

function parseShiftEnd(shift: string | null | undefined): string | null {
  if (!shift) return null;
  const m = shift.match(/^\d{1,2}:\d{2}\/(\d{1,2}:\d{2})/);
  if (m) return m[1].padStart(5, "0");
  const s = shift.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (s.startsWith("man")) return "14:20";
  if (s.startsWith("tar")) return "22:30";
  if (s.startsWith("noi")) return "06:00";
  return null;
}

function addressKey(address: string): string {
  return address.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 24);
}

/* ─── Geospatial helpers ─────────────────────────────────────────────────── */

/**
 * OSRM Trip API — Traveling Salesman Problem solver.
 *
 * Given N boarding-point centroids + the company destination, asks the OSRM
 * public routing engine to find the shortest road-network path that visits all
 * boarding points exactly once and ends at the company.
 *
 * Returns the optimal visit order as an array of original BP indices, e.g.
 * [2, 0, 1] means "visit cluster[2] first, then cluster[0], then cluster[1],
 * then drive to the company". Also returns the total road distance in km.
 *
 * Falls back gracefully (null) if the API call fails so the original insertion
 * order is kept.
 */
/**
 * Optimise a one-way trip: garage → BPs → company (ida)  or  company → BPs → garage (volta).
 * When garageLat/garageLng are provided the garage is added as the fixed source (ida)
 * or fixed destination (volta). This correctly reflects the real-world scenario where
 * a vehicle departs from the garage, picks up passengers and ends at the company — and
 * the return trip goes company → passengers → garage.
 *
 * direction: "ida"   = source=garage, destination=company
 *            "volta" = source=company, destination=garage
 *            undefined = original behaviour (source=any, destination=company)
 */
async function optimizeTSP(
  bpCentroids: Array<{ lat: number; lng: number }>,
  companyLat: number,
  companyLng: number,
  opts?: { garageLat?: number; garageLng?: number; direction?: "ida" | "volta" }
): Promise<{ order: number[]; distanceKm: number } | null> {
  const garageLat = opts?.garageLat;
  const garageLng = opts?.garageLng;
  const direction = opts?.direction;
  const hasGarage = garageLat != null && garageLng != null;

  if (bpCentroids.length <= 1) {
    // Single stop — haversine fallback
    let d = 0;
    if (bpCentroids.length === 1) {
      const bp = bpCentroids[0]!;
      if (hasGarage && direction === "ida") {
        d = (haversineKm(garageLat!, garageLng!, bp.lat, bp.lng) + haversineKm(bp.lat, bp.lng, companyLat, companyLng)) * 1.4;
      } else if (hasGarage && direction === "volta") {
        d = (haversineKm(companyLat, companyLng, bp.lat, bp.lng) + haversineKm(bp.lat, bp.lng, garageLat!, garageLng!)) * 1.4;
      } else {
        d = haversineKm(bp.lat, bp.lng, companyLat, companyLng) * 1.4;
      }
    }
    return { order: bpCentroids.map((_, i) => i), distanceKm: parseFloat(d.toFixed(2)) };
  }

  // Build coordinate list based on direction and whether garage is known
  let coords: string;
  let sourceParam: string;
  let destParam: string;

  if (hasGarage && direction === "ida") {
    // garage (fixed source) → BPs (any order) → company (fixed dest)
    coords = [
      `${garageLng!},${garageLat!}`,
      ...bpCentroids.map(c => `${c.lng},${c.lat}`),
      `${companyLng},${companyLat}`,
    ].join(";");
    sourceParam = "first";
    destParam   = "last";
  } else if (hasGarage && direction === "volta") {
    // company (fixed source) → BPs (any order) → garage (fixed dest)
    coords = [
      `${companyLng},${companyLat}`,
      ...bpCentroids.map(c => `${c.lng},${c.lat}`),
      `${garageLng!},${garageLat!}`,
    ].join(";");
    sourceParam = "first";
    destParam   = "last";
  } else {
    // Original behaviour: BPs (any order) → company (fixed dest)
    coords = [
      ...bpCentroids.map(c => `${c.lng},${c.lat}`),
      `${companyLng},${companyLat}`,
    ].join(";");
    sourceParam = "any";
    destParam   = "last";
  }

  const url =
    `https://router.project-osrm.org/trip/v1/driving/${coords}` +
    `?roundtrip=false&source=${sourceParam}&destination=${destParam}&overview=false&annotations=false`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "FretaiApp/1.0 (route-optimization)" },
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json() as {
      code: string;
      trips?: Array<{ distance: number }>;
      waypoints?: Array<{ waypoint_index: number }>;
    };
    if (data.code !== "Ok" || !data.waypoints || !data.trips?.[0]) return null;

    // waypoints are in visit order (TSP solution).
    // When garage is provided: first=garage, last=company — drop both endpoints.
    // Without garage: last=company — drop last only.
    const waypointSlice = (hasGarage && direction) 
      ? data.waypoints.slice(1, -1)   // drop garage (first) and company (last)
      : data.waypoints.slice(0, -1);  // drop company (last) only
    // Adjust waypoint_index offset when garage is prepended (shifts all indices by 1)
    const offset = (hasGarage && direction === "ida") || (hasGarage && direction === "volta") ? 1 : 0;
    const order = waypointSlice
      .map(w => w.waypoint_index - offset); // original BP index

    const distanceKm = parseFloat((data.trips[0].distance / 1000).toFixed(2));
    return { order, distanceKm };
  } catch {
    return null;
  }
}

/** Haversine distance in km between two lat/lng points */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * MCLP — Maximum Coverage Location Problem (greedy approximation).
 *
 * Instead of seeding clusters from individual worker positions (which creates
 * sub-optimal splits when two workers are just outside each other's radius but
 * share a natural midpoint), this algorithm:
 *
 *  1. Generates CANDIDATE boarding-point locations:
 *     - Every worker's own position
 *     - Midpoints between every pair of workers within 2×radius of each other
 *  2. Picks the candidate that covers the MOST uncovered workers within `radiusKm`
 *  3. Assigns those workers to a boarding point at that optimal position
 *  4. Removes them from the unassigned pool and repeats
 *
 * This produces fewer, better-placed boarding points compared to the naive
 * first-worker-seeded approach.
 */
function clusterByRadius(
  workers: Array<{ id: number; lat: string | null; lng: string | null; address: string | null; name: string }>,
  radiusKm: number,
  fallbackLat: number,
  fallbackLng: number
): Array<{
  centroid: { lat: number; lng: number };
  workers: typeof workers;
}> {
  type Enriched = (typeof workers)[0] & { _lat: number; _lng: number };
  const geo: Enriched[] = workers.map(w => ({
    ...w,
    _lat: w.lat ? parseFloat(String(w.lat)) : fallbackLat,
    _lng: w.lng ? parseFloat(String(w.lng)) : fallbackLng,
  }));

  // Count workers covered by a candidate center position
  const coverageAt = (lat: number, lng: number, pool: Enriched[]) =>
    pool.filter(w => haversineKm(lat, lng, w._lat, w._lng) <= radiusKm);

  const unassigned = [...geo];
  const clusters: Array<{ center: { lat: number; lng: number }; members: Enriched[] }> = [];

  while (unassigned.length > 0) {
    // Build candidate centers:
    // a) every worker's own position
    const candidates: Array<{ lat: number; lng: number }> = unassigned.map(w => ({ lat: w._lat, lng: w._lng }));

    // b) midpoints between pairs within 2×radius (only when dataset is small enough)
    if (unassigned.length <= 150) {
      for (let i = 0; i < unassigned.length; i++) {
        for (let j = i + 1; j < unassigned.length; j++) {
          const dist = haversineKm(unassigned[i]!._lat, unassigned[i]!._lng, unassigned[j]!._lat, unassigned[j]!._lng);
          if (dist <= 2 * radiusKm) {
            candidates.push({
              lat: (unassigned[i]!._lat + unassigned[j]!._lat) / 2,
              lng: (unassigned[i]!._lng + unassigned[j]!._lng) / 2,
            });
          }
        }
      }
    }

    // Pick the candidate that covers the most workers
    let bestCenter = { lat: unassigned[0]!._lat, lng: unassigned[0]!._lng };
    let bestMembers = coverageAt(bestCenter.lat, bestCenter.lng, unassigned);

    for (const cand of candidates) {
      const members = coverageAt(cand.lat, cand.lng, unassigned);
      if (members.length > bestMembers.length) {
        bestCenter = cand;
        bestMembers = members;
      }
    }

    // Safety: always take at least the first unassigned worker
    if (bestMembers.length === 0) {
      bestMembers = [unassigned[0]!];
      bestCenter = { lat: bestMembers[0]!._lat, lng: bestMembers[0]!._lng };
    }

    const assignedIds = new Set(bestMembers.map(m => m.id));
    // Remove assigned workers from pool
    for (let i = unassigned.length - 1; i >= 0; i--) {
      if (assignedIds.has(unassigned[i]!.id)) unassigned.splice(i, 1);
    }

    clusters.push({ center: bestCenter, members: bestMembers });
  }

  // ── Post-processing: merge clusters whose centers are within 2×radius ────
  // If cluster A and cluster B are close enough that a single coverage point
  // can reach ALL members of both, merge them into one boarding point.
  let merged = true;
  while (merged) {
    merged = false;
    outer:
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const centerDist = haversineKm(
          clusters[i]!.center.lat, clusters[i]!.center.lng,
          clusters[j]!.center.lat, clusters[j]!.center.lng
        );
        if (centerDist > 2 * radiusKm) continue;

        const combined = [...clusters[i]!.members, ...clusters[j]!.members];
        // Try candidate centers: each member's position + midpoints between members
        const mergeCandidates: Array<{ lat: number; lng: number }> = combined.map(w => ({ lat: w._lat, lng: w._lng }));
        for (let a = 0; a < combined.length; a++) {
          for (let b = a + 1; b < combined.length; b++) {
            mergeCandidates.push({
              lat: (combined[a]!._lat + combined[b]!._lat) / 2,
              lng: (combined[a]!._lng + combined[b]!._lng) / 2,
            });
          }
        }

        for (const cand of mergeCandidates) {
          const allCovered = combined.every(w =>
            haversineKm(cand.lat, cand.lng, w._lat, w._lng) <= radiusKm
          );
          if (allCovered) {
            // Merge: replace cluster i with the merged cluster, remove j
            clusters[i] = { center: cand, members: combined };
            clusters.splice(j, 1);
            merged = true;
            break outer;
          }
        }
      }
    }
  }

  return clusters.map(c => ({
    centroid: {
      lat: parseFloat(c.center.lat.toFixed(7)),
      lng: parseFloat(c.center.lng.toFixed(7)),
    },
    workers: c.members,
  }));
}

function budgetToApi(row: {
  id: number; name: string; algorithm: string | null; companyId: number | null;
  partnerId?: number | null;
  status: string; destinationAddress: string | null; maxWalkingRadiusKm: string | null;
  maxTravelTimeMin: number | null; employeesCount: number; routesCount: number;
  createdAt: Date; updatedAt: Date;
}, companyName?: string | null) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    strategy: row.algorithm ?? "min_cost",
    companyId: row.companyId,
    partnerId: row.partnerId ?? null,
    companyName: companyName ?? null,
    companyAddress: row.destinationAddress ?? "",
    maxRadiusKm: parseFloat(row.maxWalkingRadiusKm ?? "2"),
    maxRouteMinutes: row.maxTravelTimeMin ?? 120,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ─── List budgets ───────────────────────────────────────────────────────── */
router.get("/admin/budgets", requireAdmin, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: budgetsTable.id, name: budgetsTable.name, algorithm: budgetsTable.algorithm,
        companyId: budgetsTable.companyId, companyName: companiesTable.name,
        status: budgetsTable.status, destinationAddress: budgetsTable.destinationAddress,
        maxWalkingRadiusKm: budgetsTable.maxWalkingRadiusKm, maxTravelTimeMin: budgetsTable.maxTravelTimeMin,
        employeesCount: budgetsTable.employeesCount, routesCount: budgetsTable.routesCount,
        createdAt: budgetsTable.createdAt, updatedAt: budgetsTable.updatedAt,
      })
      .from(budgetsTable)
      .leftJoin(companiesTable, eq(budgetsTable.companyId, companiesTable.id))
      .orderBy(desc(budgetsTable.createdAt));

    // Count from new tables
    const workerCounts = await db
      .select({ budgetId: budgetWorkersTable.budgetId })
      .from(budgetWorkersTable);
    const routeCounts = await db
      .select({ budgetId: budgetRoutesTable.budgetId })
      .from(budgetRoutesTable);

    const empMap = new Map<number, number>();
    for (const w of workerCounts) empMap.set(w.budgetId, (empMap.get(w.budgetId) ?? 0) + 1);
    const routeMap = new Map<number, number>();
    for (const r of routeCounts) routeMap.set(r.budgetId, (routeMap.get(r.budgetId) ?? 0) + 1);

    res.json(rows.map(r => ({
      ...budgetToApi(r, r.companyName),
      employeeCount: empMap.get(r.id) ?? r.employeesCount,
      routeCount: routeMap.get(r.id) ?? r.routesCount,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing budgets");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ─── Create budget ──────────────────────────────────────────────────────── */
router.post("/admin/budgets", requireAdmin, async (req, res) => {
  const { name, companyId, companyAddress, maxRadiusKm, maxRouteMinutes, strategy, partnerId, startDate } = req.body as {
    name: string; companyId: number; companyAddress: string;
    maxRadiusKm: number; maxRouteMinutes: number; strategy: string;
    partnerId?: number; startDate?: string;
  };
  if (!name || !companyId) { res.status(400).json({ error: "name e companyId obrigatórios" }); return; }
  try {
    const [row] = await db.insert(budgetsTable).values({
      name,
      companyId,
      partnerId: partnerId ?? null,
      startDate: startDate ?? null,
      destinationAddress: companyAddress,
      maxWalkingRadiusKm: String(maxRadiusKm ?? 2),
      maxTravelTimeMin: maxRouteMinutes ?? 120,
      algorithm: strategy ?? "min_cost",
      status: "draft",
    }).returning();
    const company = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
    res.status(201).json({ ...budgetToApi(row, company[0]?.name), employeeCount: 0, routeCount: 0 });
  } catch (err) {
    req.log.error({ err }, "Error creating budget");
    res.status(500).json({ error: "Erro ao criar orçamento" });
  }
});

/* ─── Vehicle types (for finalize form) ─────────────────────────────────── */
router.get("/admin/budgets/vehicle-types", requireAdmin, async (req, res) => {
  try {
    let types = await db.select().from(vehicleTypesTable).orderBy(desc(vehicleTypesTable.capacity));
    if (types.length === 0) {
      types = [
        { id: 1, type: "Ônibus", capacity: 44, costPerKm: "4.50", fixedCost: "150.00", createdAt: new Date() },
        { id: 2, type: "Micro-ônibus", capacity: 30, costPerKm: "3.20", fixedCost: "100.00", createdAt: new Date() },
        { id: 3, type: "Van", capacity: 15, costPerKm: "2.10", fixedCost: "60.00", createdAt: new Date() },
        { id: 4, type: "Mini-Van", capacity: 6, costPerKm: "1.50", fixedCost: "30.00", createdAt: new Date() },
      ];
    }
    res.json(types);
  } catch (err) {
    req.log.error({ err }, "Error fetching vehicle types");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ─── Get budget detail ───────────────────────────────────────────────────── */
router.get("/admin/budgets/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const [row] = await db
      .select({
        id: budgetsTable.id, name: budgetsTable.name, algorithm: budgetsTable.algorithm,
        companyId: budgetsTable.companyId, companyName: companiesTable.name,
        status: budgetsTable.status, destinationAddress: budgetsTable.destinationAddress,
        maxWalkingRadiusKm: budgetsTable.maxWalkingRadiusKm, maxTravelTimeMin: budgetsTable.maxTravelTimeMin,
        employeesCount: budgetsTable.employeesCount, routesCount: budgetsTable.routesCount,
        createdAt: budgetsTable.createdAt, updatedAt: budgetsTable.updatedAt,
      })
      .from(budgetsTable)
      .leftJoin(companiesTable, eq(budgetsTable.companyId, companiesTable.id))
      .where(eq(budgetsTable.id, id))
      .limit(1);

    if (!row) { res.status(404).json({ error: "Não encontrado" }); return; }

    // partnerId via raw SQL (column exists in DB but not in Drizzle schema)
    const partnerRaw = await db.execute(sql`SELECT partner_id FROM budgets WHERE id = ${id}`);
    const partnerId = (partnerRaw.rows[0] as { partner_id?: number } | undefined)?.partner_id ?? null;

    const workers = await db.select().from(budgetWorkersTable).where(eq(budgetWorkersTable.budgetId, id));
    const routes = await db.select().from(budgetRoutesTable).where(eq(budgetRoutesTable.budgetId, id));
    const bps = await db.select().from(budgetBoardingPointsTable).where(eq(budgetBoardingPointsTable.budgetId, id));

    const bpsByRoute = new Map<number, typeof bps>();
    for (const bp of bps) {
      if (bp.routeId == null) continue;
      if (!bpsByRoute.has(bp.routeId)) bpsByRoute.set(bp.routeId, []);
      bpsByRoute.get(bp.routeId)!.push(bp);
    }

    const companyGeoReal = row.destinationAddress
      ? await geocodeNominatim(row.destinationAddress)
      : null;
    const companyGeo = companyGeoReal ?? fakeGeocode(row.destinationAddress ?? "São Paulo");

    res.json({
      budget: {
        ...budgetToApi(row, row.companyName),
        companyLat: companyGeo.lat,
        companyLng: companyGeo.lng,
        partnerId,
      },
      employees: workers.map(w => ({
        id: w.id,
        budgetId: w.budgetId,
        name: w.name,
        address: w.address,
        shift: w.shift,
        lat: w.lat ? parseFloat(String(w.lat)) : null,
        lng: w.lng ? parseFloat(String(w.lng)) : null,
        geocoded: w.geocoded,
        boardingPointId: w.boardingPointId,
      })),
      routes: routes.map(r => ({
        id: r.id,
        name: r.name,
        shiftTime: r.shiftTime,
        vehicleBlockId: r.vehicleBlockId,
        totalPassengers: r.totalPassengers,
        totalDistanceKm: parseFloat(String(r.totalDistanceKm)),
        estimatedMinutes: r.estimatedMinutes,
        occupancyPct: parseFloat(String(r.occupancyPct)),
        totalCost: r.totalCost ? parseFloat(String(r.totalCost)) : null,
        vehicleAssignments: r.vehicleAssignments as Array<{ vehicleType: string; count: number; capacity: number }>,
        boardingPoints: (bpsByRoute.get(r.id) ?? []).map(bp => ({
          id: bp.id,
          name: bp.name,
          lat: parseFloat(String(bp.lat)),
          lng: parseFloat(String(bp.lng)),
          passengerCount: bp.passengerCount,
          sequenceOrder: bp.sequenceOrder,
        })),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching budget detail");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ─── Update budget ──────────────────────────────────────────────────────── */
router.patch("/admin/budgets/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { name, companyAddress, maxRadiusKm, maxRouteMinutes, strategy, status } = req.body as Record<string, string | number>;
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (companyAddress) updates.destinationAddress = companyAddress;
    if (maxRadiusKm != null) updates.maxWalkingRadiusKm = String(maxRadiusKm);
    if (maxRouteMinutes != null) updates.maxTravelTimeMin = maxRouteMinutes;
    if (strategy) updates.algorithm = strategy;
    if (status) updates.status = status;
    await db.update(budgetsTable).set(updates).where(eq(budgetsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error updating budget");
    res.status(500).json({ error: "Erro ao atualizar" });
  }
});

/* ─── Delete budget ──────────────────────────────────────────────────────── */
router.delete("/admin/budgets/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    await db.delete(budgetBoardingPointsTable).where(eq(budgetBoardingPointsTable.budgetId, id));
    await db.delete(budgetRoutesTable).where(eq(budgetRoutesTable.budgetId, id));
    await db.delete(budgetWorkersTable).where(eq(budgetWorkersTable.budgetId, id));
    await db.delete(budgetsTable).where(eq(budgetsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting budget");
    res.status(500).json({ error: "Erro ao deletar" });
  }
});

/* ─── Budget summary ─────────────────────────────────────────────────────── */
router.get("/admin/budgets/:id/summary", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const workers = await db.select({ id: budgetWorkersTable.id })
      .from(budgetWorkersTable).where(eq(budgetWorkersTable.budgetId, id));
    const routes = await db.select({ totalCost: budgetRoutesTable.totalCost })
      .from(budgetRoutesTable).where(eq(budgetRoutesTable.budgetId, id));

    const totalCost = routes.reduce((s, r) => s + (r.totalCost ? parseFloat(String(r.totalCost)) : 0), 0);
    res.json({ totalEmployees: workers.length, totalCost: totalCost > 0 ? totalCost : null });
  } catch (err) {
    req.log.error({ err }, "Error fetching summary");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ─── Upload employees ───────────────────────────────────────────────────── */
router.post("/admin/budgets/:id/employees", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { employees, replace = false } = req.body as {
    employees: Array<{ name: string; address?: string; shift?: string | null; lat?: number; lng?: number }>;
    replace?: boolean;
  };
  if (!Array.isArray(employees) || employees.length === 0) {
    res.status(400).json({ error: "employees[] obrigatório" }); return;
  }

  try {
    if (replace) {
      await db.delete(budgetWorkersTable).where(eq(budgetWorkersTable.budgetId, id));
    }

    const [budget] = await db.select({ destinationAddress: budgetsTable.destinationAddress })
      .from(budgetsTable).where(eq(budgetsTable.id, id)).limit(1);
    const companyGeoReal = budget?.destinationAddress
      ? await geocodeNominatim(budget.destinationAddress)
      : null;
    const companyGeo = companyGeoReal ?? fakeGeocode(budget?.destinationAddress ?? "São Paulo");

    const rows = employees
      .filter(e => e.name?.trim())
      .map(e => {
        const addr = (e.address ?? "").trim();
        const hasRealGeo = e.lat != null && e.lng != null && !isNaN(Number(e.lat)) && !isNaN(Number(e.lng));
        const geo = hasRealGeo
          ? { lat: Number(e.lat), lng: Number(e.lng) }
          : (addr ? fakeGeocode(addr, companyGeo.lat, companyGeo.lng) : { lat: companyGeo.lat, lng: companyGeo.lng });
        return {
          budgetId: id,
          name: e.name.trim(),
          address: addr,
          shift: e.shift?.trim() || null,
          lat: String(geo.lat),
          lng: String(geo.lng),
          geocoded: hasRealGeo || !!addr,
        };
      });

    if (rows.length > 0) {
      await db.insert(budgetWorkersTable).values(rows);
    }

    const total = await db.select({ id: budgetWorkersTable.id })
      .from(budgetWorkersTable).where(eq(budgetWorkersTable.budgetId, id));

    await db.update(budgetsTable)
      .set({ employeesCount: total.length, status: "draft", updatedAt: new Date() })
      .where(eq(budgetsTable.id, id));

    res.json({ geocoded: rows.filter(r => r.geocoded).length, failed: 0, total: total.length });
  } catch (err) {
    req.log.error({ err }, "Error uploading employees");
    res.status(500).json({ error: "Erro ao importar funcionários" });
  }
});

/* ─── Delete employees ───────────────────────────────────────────────────── */
router.delete("/admin/budgets/:id/employees", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    await db.delete(budgetWorkersTable).where(eq(budgetWorkersTable.budgetId, id));
    await db.update(budgetsTable).set({ employeesCount: 0, status: "draft", updatedAt: new Date() }).where(eq(budgetsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting employees");
    res.status(500).json({ error: "Erro ao deletar funcionários" });
  }
});

/* ─── Process routes ─────────────────────────────────────────────────────── */
router.post("/admin/budgets/:id/process", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id)).limit(1);
    if (!budget) { res.status(404).json({ error: "Orçamento não encontrado" }); return; }

    const strategy = budget.algorithm ?? "min_cost";
    const workers = await db.select().from(budgetWorkersTable).where(eq(budgetWorkersTable.budgetId, id));
    if (workers.length === 0) { res.status(400).json({ error: "Nenhum funcionário importado" }); return; }

    let vehicleTypes = await db.select().from(vehicleTypesTable).orderBy(desc(vehicleTypesTable.capacity));
    if (vehicleTypes.length === 0) {
      vehicleTypes = [
        { id: 1, type: "Ônibus", capacity: 44, costPerKm: "4.50", fixedCost: "150.00", createdAt: new Date() },
        { id: 2, type: "Micro-ônibus", capacity: 30, costPerKm: "3.20", fixedCost: "100.00", createdAt: new Date() },
        { id: 3, type: "Van", capacity: 15, costPerKm: "2.10", fixedCost: "60.00", createdAt: new Date() },
        { id: 4, type: "Mini-Van", capacity: 6, costPerKm: "1.50", fixedCost: "30.00", createdAt: new Date() },
      ];
    }

    // Always sort descending by capacity (largest first) — algorithm fills largest possible
    // maintaining ≥90% occupancy, downsizing only when needed for the remainder
    vehicleTypes.sort((a, b) => b.capacity - a.capacity);

    // Clear existing routes/bps
    await db.delete(budgetBoardingPointsTable).where(eq(budgetBoardingPointsTable.budgetId, id));
    await db.delete(budgetRoutesTable).where(eq(budgetRoutesTable.budgetId, id));
    await db.update(budgetWorkersTable)
      .set({ boardingPointId: null })
      .where(eq(budgetWorkersTable.budgetId, id));

    // Group workers by shift start time
    const shiftGroups = new Map<string, typeof workers>();
    for (const w of workers) {
      const key = parseShiftStart(w.shift) ?? "06:00";
      if (!shiftGroups.has(key)) shiftGroups.set(key, []);
      shiftGroups.get(key)!.push(w);
    }

    const sortedShifts = [...shiftGroups.keys()].sort();
    const companyGeoReal = budget.destinationAddress
      ? await geocodeNominatim(budget.destinationAddress)
      : null;
    const companyGeo = companyGeoReal ?? fakeGeocode(budget.destinationAddress ?? "São Paulo");

    // Load partner garage coordinates for KM calculation
    // IDA:   garagem → passageiros → empresa
    // VOLTA: empresa → passageiros → garagem
    let garageLat: number | null = null;
    let garageLng: number | null = null;
    if (budget.partnerId) {
      const [partner] = await db
        .select({ garageLat: partnersTable.garageLat, garageLng: partnersTable.garageLng })
        .from(partnersTable)
        .where(eq(partnersTable.id, budget.partnerId))
        .limit(1);
      garageLat = partner?.garageLat ?? null;
      garageLng = partner?.garageLng ?? null;
    }

    // Assign coordinates: use existing fakeGeocode coords set at import time.
    // Workers without coordinates yet get a fresh fakeGeocode scatter near the company.
    for (const w of workers) {
      if (!w.lat || !w.lng) {
        const geo = fakeGeocode(w.address ?? "", companyGeo.lat, companyGeo.lng);
        w.lat = String(geo.lat);
        w.lng = String(geo.lng);
        await db.update(budgetWorkersTable)
          .set({ lat: w.lat, lng: w.lng, geocoded: true })
          .where(eq(budgetWorkersTable.id, w.id));
      }
    }

    // Assign blockIds: vehicles can be reused across compatible shifts
    // Compatible = shift B start ≈ shift A end
    const shiftEndMap = new Map<string, string>(); // start → end
    for (const w of workers) {
      const start = parseShiftStart(w.shift);
      const end = parseShiftEnd(w.shift);
      if (start && end && !shiftEndMap.has(start)) shiftEndMap.set(start, end);
    }
    // Default shift ends if not parsed
    if (!shiftEndMap.has("06:00")) shiftEndMap.set("06:00", "14:20");
    if (!shiftEndMap.has("14:20")) shiftEndMap.set("14:20", "22:30");
    if (!shiftEndMap.has("22:30")) shiftEndMap.set("22:30", "06:00");

    const timeToMins = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    };

    // Block assignment: track which blocks are "free" at each shift
    // freeBlocks: blockId → earliest time it becomes free
    const freeBlockAt = new Map<number, number>(); // blockId → minutes when free
    let nextBlockId = 1;

    type RouteInsert = {
      budgetId: number; name: string; shiftTime: string; vehicleBlockId: number;
      totalPassengers: number; totalDistanceKm: string; estimatedMinutes: number;
      occupancyPct: string; totalCost: string | null;
      vehicleAssignments: Array<{ vehicleType: string; count: number; capacity: number }>;
    };

    const routesToInsert: RouteInsert[] = [];
    type BPInsert = { budgetId: number; routeId: number; name: string; lat: string; lng: string; passengerCount: number; sequenceOrder: number };
    const bpsToInsert: BPInsert[] = [];

    // Structured tracking: for each route, the worker IDs per cluster (by bp insert index)
    // routeCluster[i] = { bpInsertIdx, workerIds[] } for route i
    const routeClusters: Array<Array<{ bpInsertIdx: number; workerIds: number[] }>> = [];

    const radiusKm = parseFloat(String(budget.maxWalkingRadiusKm ?? "1.0"));

    for (const shiftTime of sortedShifts) {
      const group = shiftGroups.get(shiftTime)!;
      const shiftMins = timeToMins(shiftTime);
      const endTime = shiftEndMap.get(shiftTime);
      const shiftEndMins = endTime ? timeToMins(endTime) : shiftMins + 480;

      // Bin-pack workers into vehicles: largest-first, minimum 90% occupancy
      //
      // Rules (applied in order):
      // 1. Find the LARGEST vehicle where remaining >= ceil(capacity × 0.90)
      //    → this vehicle will be filled to ≥90% occupancy
      // 2. If using that vehicle would need multiple trips BUT a single consolidation
      //    vehicle exists that fits all remaining in ONE trip, prefer consolidation
      //    (fewer routes = better logistics, even if occupancy dips below 90%)
      // 3. If no vehicle can achieve 90%, fall back to the smallest vehicle that
      //    fits all remaining passengers (last-resort single trip)
      const MIN_OCCUPANCY = 0.90;
      let remaining = [...group];
      while (remaining.length > 0) {
        const n = remaining.length;

        // Step 1: largest vehicle achieving ≥90% occupancy
        const ideal = vehicleTypes.find(v => n >= Math.ceil(v.capacity * MIN_OCCUPANCY));
        // Step 2/3: smallest vehicle that physically fits ALL remaining (may be < 90%)
        const consolidation = [...vehicleTypes].reverse().find(v => v.capacity >= n);

        let chosen: typeof vehicleTypes[0];
        if (!ideal) {
          chosen = consolidation ?? vehicleTypes[vehicleTypes.length - 1]!;
        } else if (n > ideal.capacity && consolidation && n <= consolidation.capacity) {
          chosen = consolidation;
        } else {
          chosen = ideal;
        }

        const batchSize = Math.min(chosen.capacity, remaining.length);
        const batch = remaining.splice(0, batchSize);

        // Find a reusable block: a block "wakes up" exactly when the shift it served ends
        // (shiftEndMins of the previous shift), so we match any block whose stored free-time
        // equals the current shiftMins within ±30 min (clock-wrap aware).
        // We intentionally store shiftEndMins — not shiftEndMins + durationMins — so that
        // long routes (many stops, large distKm) don't push the free-time past the tolerance
        // window and accidentally allocate an extra physical vehicle.
        let assignedBlock = -1;
        for (const [bid, freeMins] of freeBlockAt.entries()) {
          const diff = Math.abs(freeMins - shiftMins);
          const diffWrapped = Math.min(diff, 1440 - diff);
          if (diffWrapped <= 30) { assignedBlock = bid; break; }
        }
        if (assignedBlock === -1) assignedBlock = nextBlockId++;

        // ── Cluster workers into boarding points by walking radius ──────────
        // Workers within `radiusKm` of each other share a boarding point
        // (centroid of the cluster). Vehicles stop at the boarding point —
        // passengers walk to it instead of being picked up at home.
        const boardingClusters = clusterByRadius(batch, radiusKm, companyGeo.lat, companyGeo.lng);

        // ── TSP optimisation via OSRM Trip API ───────────────────────────────
        // Asks the OSRM public routing engine to find the shortest road-network
        // path that visits all boarding-point centroids and ends at the company.
        // Returns both the optimal visit ORDER and the real road distance in km.
        // Falls back to Haversine estimate if the API call fails.
        const bpCentroids = boardingClusters.map(c => c.centroid);
        const garageOpts = garageLat != null && garageLng != null
          ? { garageLat, garageLng, direction: "ida" as "ida" | "volta" }
          : undefined;
        const tspResult = await optimizeTSP(bpCentroids, companyGeo.lat, companyGeo.lng, garageOpts);

        // Reorder clusters according to TSP-optimal sequence
        const orderedClusters = tspResult
          ? tspResult.order.map(i => boardingClusters[i]!).filter(Boolean)
          : boardingClusters;

        // Use OSRM real road distance; fall back to Haversine if TSP failed
        let distKm: number;
        if (tspResult) {
          distKm = Math.max(1.0, tspResult.distanceKm);
        } else {
          const pts = [...bpCentroids, companyGeo];
          let hav = 0;
          for (let i = 0; i < pts.length - 1; i++) {
            hav += haversineKm(pts[i]!.lat, pts[i]!.lng, pts[i + 1]!.lat, pts[i + 1]!.lng);
          }
          distKm = Math.max(1.0, hav * 1.4);
        }
        distKm = parseFloat(distKm.toFixed(2));

        const numStops = orderedClusters.length;
        const durationMins = Math.round(10 + numStops * 5 + distKm * 2.0);
        const costPerKm = parseFloat(String(chosen.costPerKm ?? "3.50"));
        const fixedCost = parseFloat(String(chosen.fixedCost ?? "80.00"));
        // Cost covers BOTH Ida (going to company) and Volta (returning home) since the
        // same vehicle makes both trips: variable part is 2× distKm; fixed cost is once
        // per shift-period (daily driver/fuel base fee applied once per service block).
        const totalCost = (distKm * 2 * costPerKm + fixedCost).toFixed(2);
        const occupancy = ((batch.length / chosen.capacity) * 100).toFixed(2);

        // Store shift END time (not shift-end + durationMins) as the "available at" marker.
        // A vehicle that finished serving shift X (Ida + Volta) is ready for shift Y exactly
        // when shift X ends — regardless of how long the route is.  Using
        // shiftEndMins + durationMins caused long routes to push the marker past the ±30 min
        // tolerance window and incorrectly allocate a brand-new physical vehicle.
        freeBlockAt.set(assignedBlock, shiftEndMins);

        // Record route index before pushing (used for cluster→route mapping)
        const routeInsertIdx = routesToInsert.length;
        routesToInsert.push({
          budgetId: id,
          name: `Rota ${shiftTime} - Veículo ${assignedBlock}`,
          shiftTime, vehicleBlockId: assignedBlock,
          totalPassengers: batch.length, totalDistanceKm: String(distKm),
          estimatedMinutes: durationMins, occupancyPct: occupancy, totalCost,
          vehicleAssignments: [{ vehicleType: chosen.type, count: 1, capacity: chosen.capacity }],
        });

        // One boarding point per cluster; track exact worker IDs per cluster
        const thisRouteClusters: Array<{ bpInsertIdx: number; workerIds: number[] }> = [];
        let seq = 1;
        for (const cluster of orderedClusters) {
          const label = cluster.workers[0]?.address?.split(",").slice(0, 2).join(",").trim()
            ?? `Ponto de Embarque ${seq}`;
          const bpInsertIdx = bpsToInsert.length;
          bpsToInsert.push({
            budgetId: id,
            routeId: -1,          // filled after route DB insert
            name: label.substring(0, 80),
            lat: String(cluster.centroid.lat),
            lng: String(cluster.centroid.lng),
            passengerCount: cluster.workers.length,
            sequenceOrder: seq++,
          });
          thisRouteClusters.push({
            bpInsertIdx,
            workerIds: cluster.workers.map(w => w.id),
          });
        }
        routeClusters[routeInsertIdx] = thisRouteClusters;
      }
    }

    // ── Insert routes ───────────────────────────────────────────────────────
    if (routesToInsert.length === 0) { res.status(400).json({ error: "Nenhuma rota gerada" }); return; }
    const insertedRoutes = await db.insert(budgetRoutesTable).values(routesToInsert).returning();

    // Fill in real routeId for each BP using the cluster index map
    for (let rIdx = 0; rIdx < insertedRoutes.length; rIdx++) {
      const route = insertedRoutes[rIdx]!;
      const clusters = routeClusters[rIdx] ?? [];
      for (const cluster of clusters) {
        bpsToInsert[cluster.bpInsertIdx]!.routeId = route.id;
      }
    }

    // ── Insert boarding points ──────────────────────────────────────────────
    const validBps = bpsToInsert.filter(bp => bp.routeId > 0);
    let insertedBPs: Array<typeof validBps[0] & { id: number }> = [];
    if (validBps.length > 0) {
      insertedBPs = await db.insert(budgetBoardingPointsTable).values(validBps).returning() as typeof insertedBPs;
    }

    // Build a map from bpInsertIdx → inserted BP id
    // We need to reconcile validBps (filtered) indices back to bpsToInsert indices
    const bpInsertIdxToId = new Map<number, number>();
    {
      let vIdx = 0;
      for (let i = 0; i < bpsToInsert.length; i++) {
        if ((bpsToInsert[i]?.routeId ?? -1) > 0) {
          const inserted = insertedBPs[vIdx++];
          if (inserted) bpInsertIdxToId.set(i, inserted.id);
        }
      }
    }

    // ── Assign boardingPointId to each worker using exact cluster membership ─
    for (let rIdx = 0; rIdx < insertedRoutes.length; rIdx++) {
      const clusters = routeClusters[rIdx] ?? [];
      for (const cluster of clusters) {
        const bpId = bpInsertIdxToId.get(cluster.bpInsertIdx);
        if (!bpId) continue;
        for (const wid of cluster.workerIds) {
          await db.update(budgetWorkersTable)
            .set({ boardingPointId: bpId })
            .where(eq(budgetWorkersTable.id, wid));
        }
      }
    }

    // Update budget
    const totalCostSum = insertedRoutes.reduce((s, r) => s + parseFloat(String(r.totalCost ?? "0")), 0);
    await db.update(budgetsTable).set({
      status: "ready",
      routesCount: insertedRoutes.length,
      employeesCount: workers.length,
      updatedAt: new Date(),
    }).where(eq(budgetsTable.id, id));

    res.json({ routes: insertedRoutes.length, totalCost: totalCostSum.toFixed(2) });
  } catch (err) {
    req.log.error({ err }, "Error processing budget routes");
    res.status(500).json({ error: "Erro ao processar rotas" });
  }
});

/* ─── Delete single worker ───────────────────────────────────────────────── */
router.delete("/admin/budgets/:id/employees/:wid", requireAdmin, async (req, res) => {
  const budgetId = parseInt(String(req.params.id), 10);
  const wid = parseInt(String(req.params.wid), 10);
  if (isNaN(budgetId) || isNaN(wid)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    await db.delete(budgetWorkersTable).where(eq(budgetWorkersTable.id, wid));
    const remaining = await db.select({ id: budgetWorkersTable.id }).from(budgetWorkersTable).where(eq(budgetWorkersTable.budgetId, budgetId));
    await db.update(budgetsTable).set({ employeesCount: remaining.length, updatedAt: new Date() }).where(eq(budgetsTable.id, budgetId));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting worker");
    res.status(500).json({ error: "Erro ao deletar" });
  }
});

/* ─── Boarding points — list (manual) ───────────────────────────────────── */
router.get("/admin/budgets/:id/boarding-points", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const bps = await db.select().from(budgetBoardingPointsTable)
      .where(eq(budgetBoardingPointsTable.budgetId, id))
      .orderBy(budgetBoardingPointsTable.sequenceOrder);

    const allWorkers = await db.select({ id: budgetWorkersTable.id, boardingPointId: budgetWorkersTable.boardingPointId })
      .from(budgetWorkersTable).where(eq(budgetWorkersTable.budgetId, id));

    const workersByBP = new Map<number, number[]>();
    for (const w of allWorkers) {
      if (!w.boardingPointId) continue;
      if (!workersByBP.has(w.boardingPointId)) workersByBP.set(w.boardingPointId, []);
      workersByBP.get(w.boardingPointId)!.push(w.id);
    }

    res.json(bps.map(bp => ({
      id: bp.id,
      name: bp.name,
      lat: parseFloat(String(bp.lat)),
      lng: parseFloat(String(bp.lng)),
      radiusKm: bp.radiusKm ? parseFloat(String(bp.radiusKm)) : 1.0,
      shiftTime: bp.shiftTime,
      direction: bp.direction ?? "ida",
      passengerCount: bp.passengerCount,
      sequenceOrder: bp.sequenceOrder,
      workerIds: workersByBP.get(bp.id) ?? [],
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing boarding points");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ─── Boarding points — create ───────────────────────────────────────────── */
router.post("/admin/budgets/:id/boarding-points", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { lat, lng, radiusKm, shiftTime, direction, workerIds, name } = req.body as {
    lat: number; lng: number; radiusKm?: number; shiftTime?: string;
    direction?: string; workerIds?: number[]; name?: string;
  };
  try {
    const existing = await db.select({ id: budgetBoardingPointsTable.id })
      .from(budgetBoardingPointsTable).where(eq(budgetBoardingPointsTable.budgetId, id));
    const seqNum = existing.length + 1;

    const [bp] = await db.insert(budgetBoardingPointsTable).values({
      budgetId: id,
      name: name ?? `Ponto ${seqNum}`,
      lat: String(lat),
      lng: String(lng),
      radiusKm: radiusKm ? String(radiusKm) : "1.000",
      shiftTime: shiftTime ?? null,
      direction: direction ?? "ida",
      passengerCount: workerIds?.length ?? 0,
      sequenceOrder: seqNum,
    }).returning();

    if (bp && workerIds?.length) {
      await db.update(budgetWorkersTable)
        .set({ boardingPointId: bp.id })
        .where(inArray(budgetWorkersTable.id, workerIds));
    }

    res.status(201).json({ ...bp, workerIds: workerIds ?? [] });
  } catch (err) {
    req.log.error({ err }, "Error creating boarding point");
    res.status(500).json({ error: "Erro ao criar ponto de embarque" });
  }
});

/* ─── Boarding points — update (move) ───────────────────────────────────── */
router.put("/admin/budgets/:id/boarding-points/:bpId", requireAdmin, async (req, res) => {
  const bpId = parseInt(String(req.params.bpId), 10);
  if (isNaN(bpId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { lat, lng, radiusKm, workerIds, name } = req.body as {
    lat: number; lng: number; radiusKm?: number; workerIds?: number[]; name?: string;
  };
  try {
    await db.update(budgetWorkersTable).set({ boardingPointId: null }).where(eq(budgetWorkersTable.boardingPointId, bpId));
    if (workerIds?.length) {
      await db.update(budgetWorkersTable).set({ boardingPointId: bpId }).where(inArray(budgetWorkersTable.id, workerIds));
    }
    await db.update(budgetBoardingPointsTable).set({
      lat: String(lat), lng: String(lng),
      ...(radiusKm != null ? { radiusKm: String(radiusKm) } : {}),
      ...(name ? { name } : {}),
      passengerCount: workerIds?.length ?? 0,
    }).where(eq(budgetBoardingPointsTable.id, bpId));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error updating boarding point");
    res.status(500).json({ error: "Erro ao atualizar ponto" });
  }
});

/* ─── Boarding points — delete ───────────────────────────────────────────── */
router.delete("/admin/budgets/:id/boarding-points/:bpId", requireAdmin, async (req, res) => {
  const bpId = parseInt(String(req.params.bpId), 10);
  if (isNaN(bpId)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    await db.update(budgetWorkersTable).set({ boardingPointId: null }).where(eq(budgetWorkersTable.boardingPointId, bpId));
    await db.delete(budgetBoardingPointsTable).where(eq(budgetBoardingPointsTable.id, bpId));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting boarding point");
    res.status(500).json({ error: "Erro ao deletar ponto" });
  }
});

/* ─── Finalize manual routes ─────────────────────────────────────────────── */
router.post("/admin/budgets/:id/finalize-manual", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { shiftRoutes } = req.body as {
    shiftRoutes: Array<{ shiftTime: string; direction?: string; vehicleTypeId: number }>;
  };
  if (!Array.isArray(shiftRoutes) || shiftRoutes.length === 0) {
    res.status(400).json({ error: "shiftRoutes[] obrigatório" }); return;
  }

  try {
    // Load vehicle types
    let vehicleTypes = await db.select().from(vehicleTypesTable).orderBy(desc(vehicleTypesTable.capacity));
    if (vehicleTypes.length === 0) {
      vehicleTypes = [
        { id: 1, type: "Ônibus", capacity: 44, costPerKm: "4.50", fixedCost: "150.00", createdAt: new Date() },
        { id: 2, type: "Micro-ônibus", capacity: 30, costPerKm: "3.20", fixedCost: "100.00", createdAt: new Date() },
        { id: 3, type: "Van", capacity: 15, costPerKm: "2.10", fixedCost: "60.00", createdAt: new Date() },
        { id: 4, type: "Mini-Van", capacity: 6, costPerKm: "1.50", fixedCost: "30.00", createdAt: new Date() },
      ];
    }

    // Load budget
    const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id)).limit(1);
    if (!budget) { res.status(404).json({ error: "Orçamento não encontrado" }); return; }

    // Load boarding points
    const allBPs = await db.select().from(budgetBoardingPointsTable).where(eq(budgetBoardingPointsTable.budgetId, id));
    if (allBPs.length === 0) { res.status(400).json({ error: "Nenhum ponto de embarque criado" }); return; }

    const companyGeoReal = budget.destinationAddress ? await geocodeNominatim(budget.destinationAddress) : null;
    const companyGeo = companyGeoReal ?? fakeGeocode(budget.destinationAddress ?? "São Paulo");

    // Load partner garage coordinates (if a partner is linked to this budget)
    let garageLat: number | null = null;
    let garageLng: number | null = null;
    if (budget.partnerId) {
      const [partner] = await db.select({ garageLat: partnersTable.garageLat, garageLng: partnersTable.garageLng })
        .from(partnersTable).where(eq(partnersTable.id, budget.partnerId)).limit(1);
      garageLat = partner?.garageLat ?? null;
      garageLng = partner?.garageLng ?? null;
    }

    // Clear existing routes (keep BPs)
    await db.delete(budgetRoutesTable).where(eq(budgetRoutesTable.budgetId, id));
    await db.update(budgetBoardingPointsTable).set({ routeId: null }).where(eq(budgetBoardingPointsTable.budgetId, id));

    const createdRoutes: Array<typeof budgetRoutesTable.$inferSelect> = [];

    for (const sr of shiftRoutes) {
      const srDir = sr.direction ?? "ida";
      const shiftBPs = allBPs.filter(bp =>
        (bp.shiftTime ?? "06:00") === sr.shiftTime &&
        (bp.direction ?? "ida") === srDir
      );
      if (shiftBPs.length === 0) continue;

      const vt = vehicleTypes.find(v => v.id === sr.vehicleTypeId) ?? vehicleTypes[vehicleTypes.length - 1]!;
      const totalPassengers = shiftBPs.reduce((s, bp) => s + bp.passengerCount, 0);

      // Optimize route with TSP
      const bpCentroids = shiftBPs.map(bp => ({ lat: parseFloat(String(bp.lat)), lng: parseFloat(String(bp.lng)) }));
      const manualGarageOpts = garageLat != null && garageLng != null
        ? { garageLat, garageLng, direction: (srDir ?? "ida") as "ida" | "volta" }
        : undefined;
      const tspResult = await optimizeTSP(bpCentroids, companyGeo.lat, companyGeo.lng, manualGarageOpts);

      let distKm: number;
      const orderedBPs: typeof shiftBPs = tspResult
        ? tspResult.order.map(i => shiftBPs[i]!).filter(Boolean)
        : shiftBPs;

      if (tspResult) {
        distKm = Math.max(1.0, tspResult.distanceKm);
      } else {
        const pts = [...bpCentroids, companyGeo];
        let hav = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          hav += haversineKm(pts[i]!.lat, pts[i]!.lng, pts[i + 1]!.lat, pts[i + 1]!.lng);
        }
        distKm = Math.max(1.0, hav * 1.4);
      }
      distKm = parseFloat(distKm.toFixed(2));

      const estimatedMinutes = Math.round(10 + shiftBPs.length * 4 + distKm * 2);
      const costPerKm = parseFloat(String(vt.costPerKm ?? "3.50"));
      const fixedCost = parseFloat(String(vt.fixedCost ?? "80.00"));
      const totalCost = (distKm * 2 * costPerKm + fixedCost).toFixed(2);
      const occupancy = ((totalPassengers / vt.capacity) * 100).toFixed(2);

      const dir = sr.direction ?? "ida";
      const [route] = await db.insert(budgetRoutesTable).values({
        budgetId: id,
        name: `Rota ${sr.shiftTime} - ${dir === "volta" ? "Volta" : "Ida"}`,
        shiftTime: sr.shiftTime,
        direction: dir,
        vehicleBlockId: 1,
        totalPassengers,
        totalDistanceKm: String(distKm),
        estimatedMinutes,
        occupancyPct: occupancy,
        totalCost,
        vehicleAssignments: [{ vehicleType: vt.type, count: 1, capacity: vt.capacity }],
      }).returning();

      if (route) {
        for (let i = 0; i < orderedBPs.length; i++) {
          await db.update(budgetBoardingPointsTable)
            .set({ routeId: route.id, sequenceOrder: i + 1 })
            .where(eq(budgetBoardingPointsTable.id, orderedBPs[i]!.id));
        }
        createdRoutes.push(route);
      }
    }

    await db.update(budgetsTable).set({
      status: "ready",
      routesCount: createdRoutes.length,
      updatedAt: new Date(),
    }).where(eq(budgetsTable.id, id));

    res.json({ routes: createdRoutes.length });
  } catch (err) {
    req.log.error({ err }, "Error finalizing manual routes");
    res.status(500).json({ error: "Erro ao criar rotas" });
  }
});

/* ─── Publish budget → sends routes to company dashboard ────────────────── */
router.post("/admin/budgets/:id/publish", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  try {
    const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id)).limit(1);
    if (!budget) { res.status(404).json({ error: "Orçamento não encontrado" }); return; }

    const routes = await db.select().from(budgetRoutesTable).where(eq(budgetRoutesTable.budgetId, id));
    if (routes.length === 0) { res.status(400).json({ error: "Nenhuma rota criada neste orçamento" }); return; }

    await db.update(budgetsTable)
      .set({ status: "publicado", updatedAt: new Date() })
      .where(eq(budgetsTable.id, id));

    res.json({ published: true, routes: routes.length });
  } catch (err) {
    req.log.error({ err }, "Error publishing budget");
    res.status(500).json({ error: "Erro ao publicar orçamento" });
  }
});

/* ─── List published scheduled routes for a company ─────────────────────── */
router.get("/companies/:companyId/scheduled-routes", async (req, res) => {
  const companyId = parseInt(String(req.params.companyId), 10);
  if (isNaN(companyId)) { res.status(400).json({ error: "ID inválido" }); return; }

  try {
    // Use raw SQL to avoid referencing columns not in Drizzle schema (startDate)
    const budgetsRaw = await db.execute(
      sql`SELECT id, name, status,
          start_date AS "startDate",
          destination_address AS "destinationAddress",
          employees_count AS "employeesCount",
          routes_count AS "routesCount",
          updated_at AS "publishedAt"
          FROM budgets WHERE company_id = ${companyId} ORDER BY updated_at DESC`
    );
    const budgets = budgetsRaw.rows as {
      id: number; name: string; status: string; startDate: string | null;
      destinationAddress: string | null; employeesCount: number;
      routesCount: number; publishedAt: string;
    }[];

    const published = budgets.filter(b => b.status === "publicado");
    const budgetIds = published.map(b => b.id);

    let routes: (typeof budgetRoutesTable.$inferSelect)[] = [];
    let workers: (typeof budgetWorkersTable.$inferSelect)[] = [];
    if (budgetIds.length > 0) {
      routes = await db.select().from(budgetRoutesTable)
        .where(inArray(budgetRoutesTable.budgetId, budgetIds))
        .orderBy(budgetRoutesTable.budgetId, budgetRoutesTable.shiftTime);
      workers = await db.select().from(budgetWorkersTable)
        .where(inArray(budgetWorkersTable.budgetId, budgetIds))
        .orderBy(budgetWorkersTable.name);
    }

    // Fetch ALL boarding points for these budgets (routeId may be null in some flows)
    const allBps = budgetIds.length > 0
      ? await db.select().from(budgetBoardingPointsTable)
          .where(inArray(budgetBoardingPointsTable.budgetId, budgetIds))
          .orderBy(budgetBoardingPointsTable.budgetId, budgetBoardingPointsTable.sequenceOrder)
      : [];

    // Index BPs by routeId (when set) and also by budgetId+shift+direction for fallback
    const bpsByRoute = new Map<number, (typeof budgetBoardingPointsTable.$inferSelect)[]>();
    const bpsByBudget = new Map<number, (typeof budgetBoardingPointsTable.$inferSelect)[]>();
    for (const bp of allBps) {
      if (bp.routeId) {
        if (!bpsByRoute.has(bp.routeId)) bpsByRoute.set(bp.routeId, []);
        bpsByRoute.get(bp.routeId)!.push(bp);
      }
      if (!bpsByBudget.has(bp.budgetId)) bpsByBudget.set(bp.budgetId, []);
      bpsByBudget.get(bp.budgetId)!.push(bp);
    }

    // Index BP ids for fast worker lookup
    const bpIdSet = new Set(allBps.map(bp => bp.id));

    const routesByBudget = new Map<number, typeof routes>();
    for (const r of routes) {
      if (!routesByBudget.has(r.budgetId)) routesByBudget.set(r.budgetId, []);
      routesByBudget.get(r.budgetId)!.push(r);
    }

    // Index workers: first by boardingPointId, then by budgetId as fallback
    const workersByBP = new Map<number, { name: string; shift: string | null; address: string }[]>();
    const workersByBudget = new Map<number, { name: string; shift: string | null; address: string; boardingPointId: number | null }[]>();
    for (const w of workers) {
      if (w.boardingPointId) {
        if (!workersByBP.has(w.boardingPointId)) workersByBP.set(w.boardingPointId, []);
        workersByBP.get(w.boardingPointId)!.push({ name: w.name, shift: w.shift, address: w.address });
      }
      if (!workersByBudget.has(w.budgetId)) workersByBudget.set(w.budgetId, []);
      workersByBudget.get(w.budgetId)!.push({ name: w.name, shift: w.shift, address: w.address, boardingPointId: w.boardingPointId ?? null });
    }

    const result = published.map(b => ({
      budgetId: b.id,
      name: b.name,
      startDate: b.startDate ?? null,
      destinationAddress: b.destinationAddress,
      employeesCount: b.employeesCount,
      publishedAt: b.publishedAt,
      routes: (routesByBudget.get(b.id) ?? []).map(r => {
        const bps = bpsByRoute.get(r.id) ?? [];
        const colaboradores: { name: string; shift: string | null; boardingPoint: string; address: string }[] = [];

        // Step 1: get BPs for this route — prefer routeId match, fallback to budget+shift+direction
        let routeBps = bpsByRoute.get(r.id) ?? [];
        if (routeBps.length === 0) {
          const budgetBps = bpsByBudget.get(b.id) ?? [];
          routeBps = budgetBps.filter(bp =>
            (!bp.shiftTime || bp.shiftTime === r.shiftTime) &&
            (!bp.direction || bp.direction === r.direction)
          );
        }

        // Step 2: workers linked to those BPs via boardingPointId
        const routeBpIds = new Set(routeBps.map(bp => bp.id));
        const bpById = new Map(routeBps.map(bp => [bp.id, bp]));

        const allW = workersByBudget.get(b.id) ?? [];
        for (const w of allW) {
          if (w.boardingPointId && routeBpIds.has(w.boardingPointId)) {
            const bp = bpById.get(w.boardingPointId);
            colaboradores.push({ name: w.name, shift: w.shift, boardingPoint: bp?.name ?? "", address: w.address });
          }
        }

        // Step 3: if still empty and workers have no boardingPointId, show workers with no BP assigned
        if (colaboradores.length === 0) {
          for (const w of allW) {
            if (!w.boardingPointId || !bpIdSet.has(w.boardingPointId)) {
              colaboradores.push({ name: w.name, shift: w.shift, boardingPoint: "", address: w.address });
            }
          }
        }

        return {
          id: r.id,
          name: r.name,
          shiftTime: r.shiftTime,
          direction: r.direction,
          totalPassengers: r.totalPassengers,
          totalDistanceKm: r.totalDistanceKm,
          estimatedMinutes: r.estimatedMinutes,
          occupancyPct: r.occupancyPct,
          vehicleAssignments: r.vehicleAssignments,
          createdAt: r.createdAt,
          colaboradores,
        };
      }),
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing scheduled routes");
    res.status(500).json({ error: "Erro ao buscar rotas agendadas" });
  }
});

export default router;