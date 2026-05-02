import { Router } from "express";
import { db } from "@workspace/db";
import {
  budgetsTable, companiesTable, budgetEmployeesTable,
  budgetRouteVehiclesTable, vehicleTypesTable,
} from "@workspace/db/schema";
import { eq, desc, asc, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

/* ─── List budgets ─── */
router.get("/admin/budgets", requireAdmin, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: budgetsTable.id,
        name: budgetsTable.name,
        algorithm: budgetsTable.algorithm,
        companyId: budgetsTable.companyId,
        companyName: companiesTable.name,
        status: budgetsTable.status,
        destinationAddress: budgetsTable.destinationAddress,
        maxWalkingRadiusKm: budgetsTable.maxWalkingRadiusKm,
        maxTravelTimeMin: budgetsTable.maxTravelTimeMin,
        employeesCount: budgetsTable.employeesCount,
        routesCount: budgetsTable.routesCount,
        createdAt: budgetsTable.createdAt,
        updatedAt: budgetsTable.updatedAt,
      })
      .from(budgetsTable)
      .leftJoin(companiesTable, eq(budgetsTable.companyId, companiesTable.id))
      .orderBy(desc(budgetsTable.createdAt));
    res.json(rows.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing budgets");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ─── Get single budget ─── */
router.get("/admin/budgets/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const [row] = await db
      .select({
        id: budgetsTable.id,
        name: budgetsTable.name,
        algorithm: budgetsTable.algorithm,
        companyId: budgetsTable.companyId,
        companyName: companiesTable.name,
        status: budgetsTable.status,
        destinationAddress: budgetsTable.destinationAddress,
        maxWalkingRadiusKm: budgetsTable.maxWalkingRadiusKm,
        maxTravelTimeMin: budgetsTable.maxTravelTimeMin,
        employeesCount: budgetsTable.employeesCount,
        routesCount: budgetsTable.routesCount,
        createdAt: budgetsTable.createdAt,
        updatedAt: budgetsTable.updatedAt,
      })
      .from(budgetsTable)
      .leftJoin(companiesTable, eq(budgetsTable.companyId, companiesTable.id))
      .where(eq(budgetsTable.id, id));
    if (!row) { res.status(404).json({ error: "Orçamento não encontrado" }); return; }
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Error getting budget");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ─── Create budget ─── */
router.post("/admin/budgets", requireAdmin, async (req, res) => {
  const { name, algorithm, companyId, status, destinationAddress, maxWalkingRadiusKm, maxTravelTimeMin } =
    req.body as Record<string, string | undefined>;
  if (!name) { res.status(400).json({ error: "Nome é obrigatório" }); return; }
  try {
    const [row] = await db.insert(budgetsTable).values({
      name: name.trim(),
      algorithm: algorithm ?? "maior_ocupacao",
      companyId: companyId ? parseInt(companyId, 10) : null,
      status: status ?? "rascunho",
      destinationAddress: destinationAddress?.trim() ?? null,
      maxWalkingRadiusKm: maxWalkingRadiusKm ?? "2",
      maxTravelTimeMin: maxTravelTimeMin ? parseInt(maxTravelTimeMin, 10) : 120,
    }).returning();
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Error creating budget");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ─── Update budget ─── */
router.put("/admin/budgets/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { name, algorithm, companyId, status, employeesCount, routesCount } =
    req.body as Record<string, string | undefined>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name) updates.name = name.trim();
  if (algorithm) updates.algorithm = algorithm;
  if (companyId !== undefined) updates.companyId = companyId ? parseInt(companyId, 10) : null;
  if (status) updates.status = status;
  if (employeesCount !== undefined) updates.employeesCount = parseInt(employeesCount, 10);
  if (routesCount !== undefined) updates.routesCount = parseInt(routesCount, 10);
  try {
    const [row] = await db.update(budgetsTable)
      .set(updates as Parameters<typeof db.update>[0])
      .where(eq(budgetsTable.id, id))
      .returning();
    if (!row) { res.status(404).json({ error: "Orçamento não encontrado" }); return; }
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Error updating budget");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ─── Delete budget ─── */
router.delete("/admin/budgets/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const [row] = await db.delete(budgetsTable).where(eq(budgetsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Orçamento não encontrado" }); return; }
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting budget");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ═══════════════════════════════════
   EMPLOYEES
   ═══════════════════════════════════ */

router.get("/admin/budgets/:id/employees", requireAdmin, async (req, res) => {
  const budgetId = parseInt(req.params.id, 10);
  if (isNaN(budgetId)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const rows = await db
      .select()
      .from(budgetEmployeesTable)
      .where(eq(budgetEmployeesTable.budgetId, budgetId))
      .orderBy(asc(budgetEmployeesTable.createdAt));
    res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Error listing employees");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* Bulk import employees from CSV data */
router.post("/admin/budgets/:id/employees/import", requireAdmin, async (req, res) => {
  const budgetId = parseInt(req.params.id, 10);
  if (isNaN(budgetId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { employees } = req.body as { employees?: Array<{ name: string; address?: string; shift?: string }> };
  if (!Array.isArray(employees) || employees.length === 0) {
    res.status(400).json({ error: "Nenhum funcionário para importar" });
    return;
  }

  const VALID_SHIFTS = ["manha", "tarde", "noite"];
  const records = employees
    .filter(e => e.name?.trim())
    .map(e => ({
      budgetId,
      name: e.name.trim(),
      address: e.address?.trim() || null,
      shift: VALID_SHIFTS.includes(e.shift ?? "") ? (e.shift as string) : "manha",
    }));

  if (records.length === 0) {
    res.status(400).json({ error: "Nenhum registro válido encontrado" });
    return;
  }

  try {
    await db.insert(budgetEmployeesTable).values(records);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(budgetEmployeesTable)
      .where(eq(budgetEmployeesTable.budgetId, budgetId));
    await db.update(budgetsTable)
      .set({ employeesCount: count, updatedAt: new Date() })
      .where(eq(budgetsTable.id, budgetId));
    res.json({ imported: records.length, total: count });
  } catch (err) {
    req.log.error({ err }, "Error importing employees");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* Add single employee */
router.post("/admin/budgets/:id/employees", requireAdmin, async (req, res) => {
  const budgetId = parseInt(req.params.id, 10);
  if (isNaN(budgetId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { name, address, shift } = req.body as Record<string, string | undefined>;
  if (!name?.trim()) { res.status(400).json({ error: "Nome é obrigatório" }); return; }
  try {
    const [row] = await db.insert(budgetEmployeesTable).values({
      budgetId, name: name.trim(),
      address: address?.trim() || null,
      shift: shift ?? "manha",
    }).returning();
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(budgetEmployeesTable)
      .where(eq(budgetEmployeesTable.budgetId, budgetId));
    await db.update(budgetsTable)
      .set({ employeesCount: count, updatedAt: new Date() })
      .where(eq(budgetsTable.id, budgetId));
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Error adding employee");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* Delete single employee */
router.delete("/admin/budgets/:id/employees/:empId", requireAdmin, async (req, res) => {
  const budgetId = parseInt(req.params.id, 10);
  const empId = parseInt(req.params.empId, 10);
  if (isNaN(budgetId) || isNaN(empId)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const [row] = await db.delete(budgetEmployeesTable)
      .where(eq(budgetEmployeesTable.id, empId))
      .returning();
    if (!row) { res.status(404).json({ error: "Funcionário não encontrado" }); return; }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(budgetEmployeesTable)
      .where(eq(budgetEmployeesTable.budgetId, budgetId));
    await db.update(budgetsTable)
      .set({ employeesCount: count, updatedAt: new Date() })
      .where(eq(budgetsTable.id, budgetId));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting employee");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* Delete all employees */
router.delete("/admin/budgets/:id/employees", requireAdmin, async (req, res) => {
  const budgetId = parseInt(req.params.id, 10);
  if (isNaN(budgetId)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    await db.delete(budgetEmployeesTable).where(eq(budgetEmployeesTable.budgetId, budgetId));
    await db.update(budgetsTable)
      .set({ employeesCount: 0, updatedAt: new Date() })
      .where(eq(budgetsTable.id, budgetId));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error clearing employees");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ═══════════════════════════════════
   ROUTE VEHICLES
   ═══════════════════════════════════ */

router.get("/admin/budgets/:id/route-vehicles", requireAdmin, async (req, res) => {
  const budgetId = parseInt(req.params.id, 10);
  if (isNaN(budgetId)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const rows = await db
      .select()
      .from(budgetRouteVehiclesTable)
      .where(eq(budgetRouteVehiclesTable.budgetId, budgetId))
      .orderBy(asc(budgetRouteVehiclesTable.vehicleLabel));
    res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Error listing route vehicles");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ═══════════════════════════════════
   PROCESS ROUTES
   ═══════════════════════════════════ */

router.post("/admin/budgets/:id/process", requireAdmin, async (req, res) => {
  const budgetId = parseInt(req.params.id, 10);
  if (isNaN(budgetId)) { res.status(400).json({ error: "ID inválido" }); return; }

  try {
    /* 1. Load budget */
    const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, budgetId));
    if (!budget) { res.status(404).json({ error: "Orçamento não encontrado" }); return; }

    /* 2. Load employees */
    const employees = await db
      .select()
      .from(budgetEmployeesTable)
      .where(eq(budgetEmployeesTable.budgetId, budgetId));

    if (employees.length === 0) {
      res.status(400).json({ error: "Adicione funcionários antes de processar as rotas." });
      return;
    }

    /* 3. Load vehicle types */
    const vehicleTypes = await db.select().from(vehicleTypesTable);
    if (vehicleTypes.length === 0) {
      res.status(400).json({ error: "Cadastre tipos de veículo antes de processar." });
      return;
    }

    /* 4. Sort vehicle types by algorithm */
    const sorted = [...vehicleTypes].sort((a, b) => {
      if (budget.algorithm === "maior_ocupacao") {
        return b.capacity - a.capacity;
      }
      /* menor_custo: cheapest per km first, then largest capacity as tiebreak */
      const aCost = parseFloat(a.costPerKm);
      const bCost = parseFloat(b.costPerKm);
      if (aCost !== bCost) return aCost - bCost;
      return b.capacity - a.capacity;
    });

    const primaryType = sorted[0];
    const maxTravel = budget.maxTravelTimeMin ?? 120;

    /* 5. Greedy bin-packing: fill vehicles one at a time */
    const COLORS = ["blue", "green", "amber", "purple", "orange", "rose", "teal", "cyan"];
    const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const vehicleRows: {
      budgetId: number;
      vehicleLabel: string;
      vehicleColor: string;
      vehicleType: string;
      vehicleTypeId: number;
      capacity: number;
      passengersCount: number;
      durationMin: number;
    }[] = [];

    let remaining = employees.length;
    let idx = 0;

    while (remaining > 0) {
      /* For menor_custo: find cheapest type that can carry at least 1 person */
      let chosen = primaryType;
      if (budget.algorithm === "menor_custo") {
        for (const t of sorted) {
          if (t.capacity >= 1) { chosen = t; break; }
        }
      }
      const passengers = Math.min(chosen.capacity, remaining);
      /* Duration varies slightly per vehicle: base * (0.65..0.90) */
      const factor = 0.65 + ((idx * 7) % 26) / 100;
      const durationMin = Math.round(maxTravel * factor);
      vehicleRows.push({
        budgetId,
        vehicleLabel: LABELS[idx % 26],
        vehicleColor: COLORS[idx % COLORS.length],
        vehicleType: chosen.type,
        vehicleTypeId: chosen.id,
        capacity: chosen.capacity,
        passengersCount: passengers,
        durationMin,
      });
      remaining -= passengers;
      idx++;
    }

    /* 6. Replace old route vehicles */
    await db.delete(budgetRouteVehiclesTable).where(eq(budgetRouteVehiclesTable.budgetId, budgetId));
    if (vehicleRows.length > 0) {
      await db.insert(budgetRouteVehiclesTable).values(vehicleRows);
    }

    /* 7. Update budget */
    await db.update(budgetsTable).set({
      routesCount: vehicleRows.length,
      employeesCount: employees.length,
      status: "pronto",
      updatedAt: new Date(),
    }).where(eq(budgetsTable.id, budgetId));

    res.json({ vehicles: vehicleRows.length, employees: employees.length });
  } catch (err) {
    req.log.error({ err }, "Error processing routes");
    res.status(500).json({ error: "Erro interno ao processar rotas" });
  }
});

export default router;
