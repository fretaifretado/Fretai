import { Router } from "express";
import { db } from "@workspace/db";
import {
  orcBudgetsTable,
  orcEmployeesTable,
  orcBoardingPointsTable,
  orcRoutesTable,
  orcVehiclesTable,
  companiesTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  CreateBudgetBody,
  GetBudgetParams,
  UpdateBudgetParams,
  UpdateBudgetBody,
  DeleteBudgetParams,
  UploadEmployeesParams,
  UploadEmployeesBody,
  ProcessBudgetParams,
  GetBudgetSummaryParams,
} from "@workspace/api-zod";
import { runRoutingEngine, geocodeAddress } from "../lib/routingEngine.js";

const router = Router();

function formatBudget(budget: any, company?: any) {
  return {
    id: budget.id,
    name: budget.name,
    companyId: budget.companyId,
    companyName: company?.name ?? null,
    status: budget.status,
    companyAddress: budget.companyAddress,
    maxRadiusKm: Number(budget.maxRadiusKm),
    maxRouteMinutes: budget.maxRouteMinutes,
    strategy: budget.strategy,
    employeeCount: budget.employeeCount ?? 0,
    routeCount: budget.routeCount ?? 0,
    totalCost: budget.totalCost ?? null,
    createdAt:
      budget.createdAt instanceof Date
        ? budget.createdAt.toISOString()
        : budget.createdAt,
  };
}

router.get("/stats", async (req, res) => {
  try {
    const [totalBudgets] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orcBudgetsTable);
    const [totalCompanies] = await db
      .select({ count: sql<number>`count(*)` })
      .from(companiesTable);
    const [totalVehicleTypes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orcVehiclesTable);
    const [readyBudgets] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orcBudgetsTable)
      .where(eq(orcBudgetsTable.status, "ready"));
    const [draftBudgets] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orcBudgetsTable)
      .where(eq(orcBudgetsTable.status, "draft"));

    const recentRaw = await db
      .select()
      .from(orcBudgetsTable)
      .orderBy(sql`${orcBudgetsTable.createdAt} DESC`)
      .limit(5);

    const companies = await db.select().from(companiesTable);
    const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]));

    const recentWithCounts = await Promise.all(
      recentRaw.map(async (b) => {
        const [{ empCount }] = await db
          .select({ empCount: sql<number>`count(*)` })
          .from(orcEmployeesTable)
          .where(eq(orcEmployeesTable.budgetId, b.id));
        const [{ routeCount }] = await db
          .select({ routeCount: sql<number>`count(*)` })
          .from(orcRoutesTable)
          .where(eq(orcRoutesTable.budgetId, b.id));
        return formatBudget(
          {
            ...b,
            employeeCount: Number(empCount),
            routeCount: Number(routeCount),
          },
          companyMap[b.companyId]
        );
      })
    );

    res.json({
      totalBudgets: Number(totalBudgets.count),
      totalCompanies: Number(totalCompanies.count),
      totalVehicleTypes: Number(totalVehicleTypes.count),
      readyBudgets: Number(readyBudgets.count),
      draftBudgets: Number(draftBudgets.count),
      recentBudgets: recentWithCounts,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const budgets = await db
      .select()
      .from(orcBudgetsTable)
      .orderBy(sql`${orcBudgetsTable.createdAt} DESC`);
    const companies = await db.select().from(companiesTable);
    const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]));

    const result = await Promise.all(
      budgets.map(async (b) => {
        const [{ empCount }] = await db
          .select({ empCount: sql<number>`count(*)` })
          .from(orcEmployeesTable)
          .where(eq(orcEmployeesTable.budgetId, b.id));
        const [{ routeCount }] = await db
          .select({ routeCount: sql<number>`count(*)` })
          .from(orcRoutesTable)
          .where(eq(orcRoutesTable.budgetId, b.id));
        return formatBudget(
          {
            ...b,
            employeeCount: Number(empCount),
            routeCount: Number(routeCount),
          },
          companyMap[b.companyId]
        );
      })
    );

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  const parsed = CreateBudgetBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, companyId, companyAddress, maxRadiusKm, maxRouteMinutes, strategy } =
    parsed.data;
  try {
    const [budget] = await db
      .insert(orcBudgetsTable)
      .values({
        name,
        companyId,
        companyAddress,
        maxRadiusKm: String(maxRadiusKm),
        maxRouteMinutes,
        strategy,
        status: "draft",
      })
      .returning();
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, companyId));
    res.status(201).json(
      formatBudget({ ...budget, employeeCount: 0, routeCount: 0 }, company)
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  const parsed = GetBudgetParams.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "Invalid ID" });
  try {
    const [budget] = await db
      .select()
      .from(orcBudgetsTable)
      .where(eq(orcBudgetsTable.id, parsed.data.id));
    if (!budget) return res.status(404).json({ error: "Budget not found" });

    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, budget.companyId));
    const employees = await db
      .select()
      .from(orcEmployeesTable)
      .where(eq(orcEmployeesTable.budgetId, budget.id));
    const routes = await db
      .select()
      .from(orcRoutesTable)
      .where(eq(orcRoutesTable.budgetId, budget.id));
    const boardingPoints = await db
      .select()
      .from(orcBoardingPointsTable)
      .where(eq(orcBoardingPointsTable.budgetId, budget.id));

    const companyGeo = geocodeAddress(budget.companyAddress, -1);

    res.json({
      budget: {
        ...formatBudget(
          {
            ...budget,
            employeeCount: employees.length,
            routeCount: routes.length,
          },
          company
        ),
        companyLat: companyGeo.lat,
        companyLng: companyGeo.lng,
      },
      employees: employees.map((e) => ({
        ...e,
        lat: e.lat ? Number(e.lat) : null,
        lng: e.lng ? Number(e.lng) : null,
      })),
      routes: routes.map((r) => ({
        ...r,
        totalDistanceKm: Number(r.totalDistanceKm),
        occupancyPct: Number(r.occupancyPct),
        totalCost: r.totalCost ? Number(r.totalCost) : null,
        vehicleAssignments: Array.isArray(r.vehicleAssignments)
          ? r.vehicleAssignments
          : [],
        boardingPoints: boardingPoints
          .filter((bp) => bp.routeId === r.id)
          .map((bp) => ({
            ...bp,
            lat: Number(bp.lat),
            lng: Number(bp.lng),
          })),
      })),
      boardingPoints: boardingPoints.map((bp) => ({
        ...bp,
        lat: Number(bp.lat),
        lng: Number(bp.lng),
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  const paramsParsed = UpdateBudgetParams.safeParse(req.params);
  const bodyParsed = UpdateBudgetBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success)
    return res.status(400).json({ error: "Invalid data" });
  try {
    const updateData: any = { ...bodyParsed.data };
    if (updateData.maxRadiusKm !== undefined)
      updateData.maxRadiusKm = String(updateData.maxRadiusKm);
    const [budget] = await db
      .update(orcBudgetsTable)
      .set(updateData)
      .where(eq(orcBudgetsTable.id, paramsParsed.data.id))
      .returning();
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, budget.companyId));
    const [{ empCount }] = await db
      .select({ empCount: sql<number>`count(*)` })
      .from(orcEmployeesTable)
      .where(eq(orcEmployeesTable.budgetId, budget.id));
    const [{ routeCount }] = await db
      .select({ routeCount: sql<number>`count(*)` })
      .from(orcRoutesTable)
      .where(eq(orcRoutesTable.budgetId, budget.id));
    res.json(
      formatBudget(
        {
          ...budget,
          employeeCount: Number(empCount),
          routeCount: Number(routeCount),
        },
        company
      )
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  const parsed = DeleteBudgetParams.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "Invalid ID" });
  try {
    await db
      .delete(orcEmployeesTable)
      .where(eq(orcEmployeesTable.budgetId, parsed.data.id));
    await db
      .delete(orcBoardingPointsTable)
      .where(eq(orcBoardingPointsTable.budgetId, parsed.data.id));
    await db
      .delete(orcRoutesTable)
      .where(eq(orcRoutesTable.budgetId, parsed.data.id));
    await db
      .delete(orcBudgetsTable)
      .where(eq(orcBudgetsTable.id, parsed.data.id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/employees", async (req, res) => {
  const paramsParsed = UploadEmployeesParams.safeParse(req.params);
  const bodyParsed = UploadEmployeesBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success)
    return res.status(400).json({ error: "Invalid data" });

  const budgetId = paramsParsed.data.id;

  try {
    await db
      .delete(orcEmployeesTable)
      .where(eq(orcEmployeesTable.budgetId, budgetId));
    await db
      .delete(orcBoardingPointsTable)
      .where(eq(orcBoardingPointsTable.budgetId, budgetId));
    await db
      .delete(orcRoutesTable)
      .where(eq(orcRoutesTable.budgetId, budgetId));
    await db
      .update(orcBudgetsTable)
      .set({ status: "draft" })
      .where(eq(orcBudgetsTable.id, budgetId));

    const { employees: inputEmployees } = bodyParsed.data;
    let geocoded = 0;
    let failed = 0;

    const insertedEmployees = await Promise.all(
      inputEmployees.map(async (emp, i) => {
        try {
          const { lat, lng } = geocodeAddress(emp.address, i);
          const [inserted] = await db
            .insert(orcEmployeesTable)
            .values({
              budgetId,
              name: emp.name,
              address: emp.address,
              shift: emp.shift ?? null,
              lat: String(lat),
              lng: String(lng),
              geocoded: true,
            })
            .returning();
          geocoded++;
          return inserted;
        } catch {
          const [inserted] = await db
            .insert(orcEmployeesTable)
            .values({
              budgetId,
              name: emp.name,
              address: emp.address,
              shift: emp.shift ?? null,
              geocoded: false,
            })
            .returning();
          failed++;
          return inserted;
        }
      })
    );

    res.json({
      total: inputEmployees.length,
      geocoded,
      failed,
      employees: insertedEmployees.map((e) => ({
        ...e,
        lat: e.lat ? Number(e.lat) : null,
        lng: e.lng ? Number(e.lng) : null,
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/regeocode", async (req, res) => {
  const parsed = GetBudgetParams.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "Invalid ID" });
  const budgetId = parsed.data.id;
  try {
    const employees = await db
      .select()
      .from(orcEmployeesTable)
      .where(eq(orcEmployeesTable.budgetId, budgetId));
    let updated = 0;
    await Promise.all(
      employees.map(async (emp, i) => {
        try {
          const { lat, lng } = geocodeAddress(emp.address, i);
          await db
            .update(orcEmployeesTable)
            .set({ lat: String(lat), lng: String(lng), geocoded: true })
            .where(eq(orcEmployeesTable.id, emp.id));
          updated++;
        } catch {
          /* skip */
        }
      })
    );
    await db
      .delete(orcBoardingPointsTable)
      .where(eq(orcBoardingPointsTable.budgetId, budgetId));
    await db
      .delete(orcRoutesTable)
      .where(eq(orcRoutesTable.budgetId, budgetId));
    await db
      .update(orcBudgetsTable)
      .set({ status: "draft" })
      .where(eq(orcBudgetsTable.id, budgetId));
    res.json({ updated });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/process", async (req, res) => {
  const parsed = ProcessBudgetParams.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "Invalid ID" });
  const budgetId = parsed.data.id;

  try {
    const [budget] = await db
      .select()
      .from(orcBudgetsTable)
      .where(eq(orcBudgetsTable.id, budgetId));
    if (!budget) return res.status(404).json({ error: "Budget not found" });

    await db
      .update(orcBudgetsTable)
      .set({ status: "processing" })
      .where(eq(orcBudgetsTable.id, budgetId));

    const employees = await db
      .select()
      .from(orcEmployeesTable)
      .where(eq(orcEmployeesTable.budgetId, budgetId));
    const vehicles = await db
      .select()
      .from(orcVehiclesTable)
      .orderBy(orcVehiclesTable.capacity);

    const geocodedEmployees = employees
      .filter((e) => e.geocoded && e.lat !== null && e.lng !== null)
      .map((e) => ({
        id: e.id,
        lat: Number(e.lat!),
        lng: Number(e.lng!),
        name: e.name,
        address: e.address,
        shift: e.shift ?? null,
      }));

    if (geocodedEmployees.length === 0) {
      await db
        .update(orcBudgetsTable)
        .set({ status: "draft" })
        .where(eq(orcBudgetsTable.id, budgetId));
      return res.status(400).json({ error: "No geocoded employees found" });
    }

    const companyGeo = geocodeAddress(budget.companyAddress, -1);

    const routeResults = runRoutingEngine(geocodedEmployees, {
      maxRadiusKm: Number(budget.maxRadiusKm),
      maxRouteMinutes: budget.maxRouteMinutes,
      companyLat: companyGeo.lat,
      companyLng: companyGeo.lng,
      strategy: budget.strategy,
      vehicles: vehicles.map((v) => ({
        id: v.id,
        type: v.type,
        capacity: v.capacity,
        costPerKm: v.costPerKm ? Number(v.costPerKm) : null,
        costPerRoute: v.costPerRoute ? Number(v.costPerRoute) : null,
      })),
    });

    await db
      .delete(orcBoardingPointsTable)
      .where(eq(orcBoardingPointsTable.budgetId, budgetId));
    await db
      .delete(orcRoutesTable)
      .where(eq(orcRoutesTable.budgetId, budgetId));

    const savedRoutes: any[] = [];
    for (const routeResult of routeResults) {
      const [savedRoute] = await db
        .insert(orcRoutesTable)
        .values({
          budgetId,
          name: routeResult.name,
          shiftTime: routeResult.shiftTime ?? null,
          direction: routeResult.direction ?? "ida",
          vehicleBlockId: routeResult.vehicleBlockId ?? null,
          totalPassengers: routeResult.totalPassengers,
          totalDistanceKm: String(routeResult.totalDistanceKm),
          estimatedMinutes: routeResult.estimatedMinutes,
          occupancyPct: String(routeResult.occupancyPct),
          totalCost:
            routeResult.totalCost !== null
              ? String(routeResult.totalCost)
              : null,
          vehicleAssignments: routeResult.vehicleAssignments as any,
        })
        .returning();

      const savedBoardingPoints: any[] = [];
      for (let seq = 0; seq < routeResult.boardingPoints.length; seq++) {
        const bp = routeResult.boardingPoints[seq];
        const [savedBp] = await db
          .insert(orcBoardingPointsTable)
          .values({
            budgetId,
            routeId: savedRoute.id,
            name: bp.name,
            lat: String(bp.lat),
            lng: String(bp.lng),
            passengerCount: bp.passengerCount,
            sequenceOrder: seq + 1,
          })
          .returning();

        for (const empId of bp.employeeIds) {
          await db
            .update(orcEmployeesTable)
            .set({ boardingPointId: savedBp.id })
            .where(eq(orcEmployeesTable.id, empId));
        }

        savedBoardingPoints.push({
          ...savedBp,
          lat: Number(savedBp.lat),
          lng: Number(savedBp.lng),
        });
      }

      savedRoutes.push({
        ...savedRoute,
        totalDistanceKm: Number(savedRoute.totalDistanceKm),
        occupancyPct: Number(savedRoute.occupancyPct),
        totalCost: savedRoute.totalCost ? Number(savedRoute.totalCost) : null,
        vehicleAssignments: Array.isArray(savedRoute.vehicleAssignments)
          ? savedRoute.vehicleAssignments
          : [],
        boardingPoints: savedBoardingPoints,
      });
    }

    await db
      .update(orcBudgetsTable)
      .set({ status: "ready" })
      .where(eq(orcBudgetsTable.id, budgetId));

    const [updatedBudget] = await db
      .select()
      .from(orcBudgetsTable)
      .where(eq(orcBudgetsTable.id, budgetId));
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, budget.companyId));
    const allBoardingPoints = await db
      .select()
      .from(orcBoardingPointsTable)
      .where(eq(orcBoardingPointsTable.budgetId, budgetId));
    const updatedEmployees = await db
      .select()
      .from(orcEmployeesTable)
      .where(eq(orcEmployeesTable.budgetId, budgetId));

    res.json({
      budget: formatBudget(
        {
          ...updatedBudget,
          employeeCount: employees.length,
          routeCount: savedRoutes.length,
        },
        company
      ),
      employees: updatedEmployees.map((e) => ({
        ...e,
        lat: e.lat ? Number(e.lat) : null,
        lng: e.lng ? Number(e.lng) : null,
      })),
      routes: savedRoutes,
      boardingPoints: allBoardingPoints.map((bp) => ({
        ...bp,
        lat: Number(bp.lat),
        lng: Number(bp.lng),
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/summary", async (req, res) => {
  const parsed = GetBudgetSummaryParams.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "Invalid ID" });

  try {
    const [budget] = await db
      .select()
      .from(orcBudgetsTable)
      .where(eq(orcBudgetsTable.id, parsed.data.id));
    if (!budget) return res.status(404).json({ error: "Budget not found" });

    const employees = await db
      .select()
      .from(orcEmployeesTable)
      .where(eq(orcEmployeesTable.budgetId, budget.id));
    const routes = await db
      .select()
      .from(orcRoutesTable)
      .where(eq(orcRoutesTable.budgetId, budget.id));
    const boardingPoints = await db
      .select()
      .from(orcBoardingPointsTable)
      .where(eq(orcBoardingPointsTable.budgetId, budget.id));

    const blockTypeMap: Record<number, string> = {};
    const typeCapacity: Record<string, number> = {};
    let hasCostData = false;
    let totalCost = 0;

    for (const route of routes) {
      const assignments = Array.isArray(route.vehicleAssignments)
        ? route.vehicleAssignments
        : [];
      const blockId = route.vehicleBlockId;
      for (const a of assignments as any[]) {
        if (blockId && !blockTypeMap[blockId]) {
          blockTypeMap[blockId] = a.vehicleType;
        }
        if (!typeCapacity[a.vehicleType]) {
          typeCapacity[a.vehicleType] = a.capacity;
        }
      }
      if (route.totalCost !== null) {
        hasCostData = true;
        totalCost += Number(route.totalCost);
      }
    }

    const physicalCount: Record<string, number> = {};
    for (const type of Object.values(blockTypeMap)) {
      physicalCount[type] = (physicalCount[type] ?? 0) + 1;
    }

    const TIER_ORDER = ["Ônibus", "Micro-ônibus", "Van", "Mini-Van"];
    const vehicleBreakdown = Object.entries(physicalCount)
      .sort(([a], [b]) => {
        const ia = TIER_ORDER.indexOf(a),
          ib = TIER_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([type, count]) => ({
        type,
        count,
        totalCapacity: count * (typeCapacity[type] ?? 0),
      }));

    res.json({
      budgetId: budget.id,
      budgetName: budget.name,
      status: budget.status,
      totalEmployees: employees.length,
      totalRoutes: routes.length,
      totalBoardingPoints: boardingPoints.length,
      vehicleBreakdown,
      totalCost: hasCostData ? totalCost : null,
      hasCostData,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
