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

    const companyGeo = fakeGeocode(row.destinationAddress ?? "São Paulo");

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
    const companyGeo = fakeGeocode(budget?.destinationAddress ?? "São Paulo");

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

    // Sort by strategy
    if (strategy === "min_cost") {
      vehicleTypes.sort((a, b) => parseFloat(String(a.costPerKm ?? "999")) - parseFloat(String(b.costPerKm ?? "999")));
    } else if (strategy === "min_vehicles" || strategy === "maior_ocupacao") {
      vehicleTypes.sort((a, b) => b.capacity - a.capacity);
    } else {
      // max_occupancy: prefer smaller vehicles that fit best
      vehicleTypes.sort((a, b) => a.capacity - b.capacity);
    }

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
    const companyGeo = fakeGeocode(budget.destinationAddress ?? "São Paulo");

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
    const workerBPUpdates: { workerId: number; bpId?: number }[] = [];

    for (const shiftTime of sortedShifts) {
      const group = shiftGroups.get(shiftTime)!;
      const shiftMins = timeToMins(shiftTime);
      const endTime = shiftEndMap.get(shiftTime);
      const shiftEndMins = endTime ? timeToMins(endTime) : shiftMins + 480;

      // Bin-pack workers into vehicles
      let remaining = [...group];
      while (remaining.length > 0) {
        // Pick vehicle type based on strategy
        let chosen = vehicleTypes[0];
        if (strategy === "max_occupancy") {
          // Find smallest vehicle that fits
          const fit = vehicleTypes.filter(v => v.capacity >= remaining.length);
          chosen = fit.length > 0 ? fit[fit.length - 1] : vehicleTypes[vehicleTypes.length - 1];
        } else {
          chosen = vehicleTypes[0];
        }
        const batchSize = Math.min(chosen.capacity, remaining.length);
        const batch = remaining.splice(0, batchSize);

        // Find a reusable block (block that becomes free at this shiftMins ±30min)
        let assignedBlock = -1;
        for (const [bid, freeMins] of freeBlockAt.entries()) {
          const diff = Math.abs(freeMins - shiftMins);
          const diffWrapped = Math.min(diff, 1440 - diff);
          if (diffWrapped <= 30) {
            assignedBlock = bid;
            break;
          }
        }
        if (assignedBlock === -1) {
          assignedBlock = nextBlockId++;
        }

        // Estimate route
        const addrGroups = new Map<string, typeof batch>();
        for (const w of batch) {
          const key = addressKey(w.address);
          if (!addrGroups.has(key)) addrGroups.set(key, []);
          addrGroups.get(key)!.push(w);
        }

        const numStops = Math.max(1, addrGroups.size);
        const distKm = parseFloat((0.8 + numStops * 1.2).toFixed(2));
        const durationMins = Math.round(10 + numStops * 8 + distKm * 2.5);
        const costPerKm = parseFloat(String(chosen.costPerKm ?? "3.50"));
        const fixedCost = parseFloat(String(chosen.fixedCost ?? "80.00"));
        const totalCost = (distKm * costPerKm + fixedCost).toFixed(2);
        const occupancy = ((batch.length / chosen.capacity) * 100).toFixed(2);

        // Mark block free at shift end + duration
        freeBlockAt.set(assignedBlock, shiftEndMins + durationMins);

        routesToInsert.push({
          budgetId: id,
          name: `Rota ${shiftTime} - Veículo ${assignedBlock}`,
          shiftTime,
          vehicleBlockId: assignedBlock,
          totalPassengers: batch.length,
          totalDistanceKm: String(distKm),
          estimatedMinutes: durationMins,
          occupancyPct: occupancy,
          totalCost,
          vehicleAssignments: [{ vehicleType: chosen.type, count: 1, capacity: chosen.capacity }],
        });

        // Create boarding points
        let seq = 1;
        for (const [, clusterWorkers] of addrGroups.entries()) {
          const sampleAddr = clusterWorkers[0]?.address ?? "";
          const geo = sampleAddr
            ? fakeGeocode(sampleAddr, companyGeo.lat, companyGeo.lng)
            : { lat: companyGeo.lat + 0.01 * seq, lng: companyGeo.lng };
          bpsToInsert.push({
            budgetId: id,
            routeId: -1, // will fill after insert
            name: sampleAddr ? sampleAddr.substring(0, 50) : `Ponto ${seq}`,
            lat: String(geo.lat),
            lng: String(geo.lng),
            passengerCount: clusterWorkers.length,
            sequenceOrder: seq++,
          });
          for (const w of clusterWorkers) {
            workerBPUpdates.push({ workerId: w.id, bpId: undefined });
          }
        }
      }
    }

    // Insert routes
    if (routesToInsert.length === 0) { res.status(400).json({ error: "Nenhuma rota gerada" }); return; }
    const insertedRoutes = await db.insert(budgetRoutesTable).values(routesToInsert).returning();

    // Map routeId by position
    let routeIdx = 0;
    let bpOffset = 0;
    for (const _ of routesToInsert) {
      const route = insertedRoutes[routeIdx++]!;
      const addrKey = addressKey(routesToInsert[routeIdx - 1]?.name ?? "");
      const numBps = [...new Set(
        (shiftGroups.get(routesToInsert[routeIdx - 1]?.shiftTime ?? "") ?? [])
          .slice(0, routesToInsert[routeIdx - 1]?.totalPassengers ?? 0)
          .map(w => addressKey(w.address))
      )].length || 1;

      for (let i = bpOffset; i < bpOffset + numBps && i < bpsToInsert.length; i++) {
        bpsToInsert[i]!.routeId = route.id;
      }
      bpOffset += numBps;
      void addrKey;
    }

    // Re-assign routeId properly — rebuild mapping
    {
      let rIdx = 0;
      let bpIdx = 0;
      for (const route of routesToInsert) {
        const insertedRoute = insertedRoutes[rIdx++]!;
        const addrSet = new Set<string>();
        const shiftWorkers = shiftGroups.get(route.shiftTime ?? "") ?? [];
        for (const w of shiftWorkers.slice(0, route.totalPassengers)) addrSet.add(addressKey(w.address));
        const cnt = Math.max(1, addrSet.size);
        for (let k = 0; k < cnt && bpIdx < bpsToInsert.length; k++, bpIdx++) {
          bpsToInsert[bpIdx]!.routeId = insertedRoute.id;
        }
      }
    }

    // Insert boarding points
    const validBps = bpsToInsert.filter(bp => bp.routeId > 0);
    let insertedBPs: typeof validBps & { id: number }[] = [];
    if (validBps.length > 0) {
      insertedBPs = await db.insert(budgetBoardingPointsTable).values(validBps).returning() as typeof insertedBPs;
    }

    // Update worker boardingPointIds: assign each worker to a BP in their route
    const bpsByRoute2 = new Map<number, (typeof insertedBPs[0])[]>();
    for (const bp of insertedBPs) {
      if (!bpsByRoute2.has(bp.routeId)) bpsByRoute2.set(bp.routeId, []);
      bpsByRoute2.get(bp.routeId)!.push(bp);
    }

    for (const route of insertedRoutes) {
      const bpsForRoute = bpsByRoute2.get(route.id) ?? [];
      if (bpsForRoute.length === 0) continue;
      const shiftWorkers = (shiftGroups.get(route.shiftTime ?? "") ?? []).slice(0, route.totalPassengers);
      const addrToBP = new Map<string, number>();
      for (const bp of bpsForRoute) addrToBP.set(bp.name.substring(0, 50), bp.id);

      let bpIter = 0;
      for (const w of shiftWorkers) {
        const addrMatch = w.address.substring(0, 50);
        let bpId = addrToBP.get(addrMatch) ?? bpsForRoute[bpIter % bpsForRoute.length]?.id;
        bpIter++;
        if (bpId) {
          await db.update(budgetWorkersTable).set({ boardingPointId: bpId }).where(eq(budgetWorkersTable.id, w.id));
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
