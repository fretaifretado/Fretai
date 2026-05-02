import { Router } from "express";
import { db } from "@workspace/db";
import {
  budgetsTable, companiesTable,
  budgetWorkersTable, budgetRoutesTable, budgetBoardingPointsTable,
  vehicleTypesTable,
} from "@workspace/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
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

/* ─── Nominatim real geocoding (OpenStreetMap) ── */
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

async function geocodeWithFallback(address: string, baseLat: number, baseLng: number): Promise<{ lat: number; lng: number }> {
  const real = await geocodeNominatim(address);
  if (real) return real;
  return fakeGeocode(address, baseLat, baseLng);
}

/** Rate-limited batch geocoding: 1 request per 1.1s, up to maxItems */
async function batchGeocode(
  items: Array<{ id: number; address: string }>,
  baseLat: number,
  baseLng: number,
  maxItems = 60
): Promise<Map<number, { lat: number; lng: number }>> {
  const result = new Map<number, { lat: number; lng: number }>();
  const uniqueAddrs = new Map<string, { lat: number; lng: number } | null>();

  for (const item of items.slice(0, maxItems)) {
    const key = item.address.trim().toLowerCase();
    if (!uniqueAddrs.has(key)) uniqueAddrs.set(key, null);
  }

  // Geocode unique addresses sequentially with rate limiting
  for (const addr of uniqueAddrs.keys()) {
    const r = await geocodeNominatim(addr);
    uniqueAddrs.set(addr, r ?? fakeGeocode(addr, baseLat, baseLng));
    await new Promise(resolve => setTimeout(resolve, 1100));
  }

  for (const item of items.slice(0, maxItems)) {
    const key = item.address.trim().toLowerCase();
    const geo = uniqueAddrs.get(key) ?? fakeGeocode(item.address, baseLat, baseLng);
    result.set(item.id, geo);
  }
  // For items beyond maxItems, use scatter
  for (const item of items.slice(maxItems)) {
    result.set(item.id, fakeGeocode(item.address, baseLat, baseLng));
  }
  return result;
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
 * Greedy radius clustering.
 * Each cluster = one boarding point. Workers within `radiusKm` of the first
 * unclustered worker are grouped together. The boarding point is the centroid
 * of the cluster (workers walk to the nearest boarding point).
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

  const assigned = new Set<number>();
  const clusters: Array<{ members: Enriched[] }> = [];

  for (const w of geo) {
    if (assigned.has(w.id)) continue;
    const members: Enriched[] = [w];
    assigned.add(w.id);

    for (const other of geo) {
      if (assigned.has(other.id)) continue;
      if (haversineKm(w._lat, w._lng, other._lat, other._lng) <= radiusKm) {
        members.push(other);
        assigned.add(other.id);
      }
    }
    clusters.push({ members });
  }

  return clusters.map(c => {
    const centLat = c.members.reduce((s, m) => s + m._lat, 0) / c.members.length;
    const centLng = c.members.reduce((s, m) => s + m._lng, 0) / c.members.length;
    return {
      centroid: { lat: parseFloat(centLat.toFixed(7)), lng: parseFloat(centLng.toFixed(7)) },
      workers: c.members,
    };
  });
}

function budgetToApi(row: {
  id: number; name: string; algorithm: string | null; companyId: number | null;
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
  const { name, companyId, companyAddress, maxRadiusKm, maxRouteMinutes, strategy } = req.body as {
    name: string; companyId: number; companyAddress: string;
    maxRadiusKm: number; maxRouteMinutes: number; strategy: string;
  };
  if (!name || !companyId) { res.status(400).json({ error: "name e companyId obrigatórios" }); return; }
  try {
    const [row] = await db.insert(budgetsTable).values({
      name,
      companyId,
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
    employees: Array<{ name: string; address: string; shift?: string | null }>;
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
        const geo = addr ? fakeGeocode(addr, companyGeo.lat, companyGeo.lng) : { lat: companyGeo.lat, lng: companyGeo.lng };
        return {
          budgetId: id,
          name: e.name.trim(),
          address: addr,
          shift: e.shift?.trim() || null,
          lat: String(geo.lat),
          lng: String(geo.lng),
          geocoded: !!addr,
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

    // Geocode individual employee addresses (rate-limited, up to 60 unique addresses)
    req.log.info({ budgetId: id }, "Geocodificando endereços dos funcionários via Nominatim...");
    const workerGeoMap = await batchGeocode(
      workers.map(w => ({ id: w.id, address: w.address ?? "" })),
      companyGeo.lat,
      companyGeo.lng,
      60
    );
    // Update workers with real coordinates in DB
    for (const [wid, geo] of workerGeoMap.entries()) {
      await db.update(budgetWorkersTable)
        .set({ lat: String(geo.lat), lng: String(geo.lng), geocoded: true })
        .where(eq(budgetWorkersTable.id, wid));
    }
    // Also update in-memory workers list with real coords
    for (const w of workers) {
      const geo = workerGeoMap.get(w.id);
      if (geo) { w.lat = String(geo.lat); w.lng = String(geo.lng); }
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

        // Find a reusable block (block that becomes free at this shiftMins ±30min)
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

        // Route distance: sum of haversine legs between consecutive boarding points
        // plus the final leg to the company destination
        let distKm = 0;
        const pts = [...boardingClusters.map(c => c.centroid), companyGeo];
        for (let i = 0; i < pts.length - 1; i++) {
          distKm += haversineKm(pts[i]!.lat, pts[i]!.lng, pts[i + 1]!.lat, pts[i + 1]!.lng);
        }
        distKm = parseFloat(Math.max(1.0, distKm * 1.4).toFixed(2));

        const numStops = boardingClusters.length;
        const durationMins = Math.round(10 + numStops * 5 + distKm * 2.0);
        const costPerKm = parseFloat(String(chosen.costPerKm ?? "3.50"));
        const fixedCost = parseFloat(String(chosen.fixedCost ?? "80.00"));
        const totalCost = (distKm * costPerKm + fixedCost).toFixed(2);
        const occupancy = ((batch.length / chosen.capacity) * 100).toFixed(2);

        freeBlockAt.set(assignedBlock, shiftEndMins + durationMins);

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
        for (const cluster of boardingClusters) {
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

/* ─── List companies (for budget form) ──────────────────────────────────── */
// Already handled by companies router, but keep alias if needed

export default router;
