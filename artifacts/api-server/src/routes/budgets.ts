import { Router } from "express";
import { db } from "@workspace/db";
import { budgetsTable, companiesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

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

router.post("/admin/budgets", requireAdmin, async (req, res) => {
  const { name, algorithm, companyId, status } = req.body as Record<string, string | undefined>;
  if (!name) { res.status(400).json({ error: "Nome é obrigatório" }); return; }
  try {
    const [row] = await db.insert(budgetsTable).values({
      name: name.trim(),
      algorithm: algorithm ?? "maior_ocupacao",
      companyId: companyId ? parseInt(companyId, 10) : null,
      status: status ?? "rascunho",
    }).returning();
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Error creating budget");
    res.status(500).json({ error: "Erro interno" });
  }
});

router.put("/admin/budgets/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { name, algorithm, companyId, status, employeesCount, routesCount } = req.body as Record<string, string | undefined>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name) updates.name = name.trim();
  if (algorithm) updates.algorithm = algorithm;
  if (companyId !== undefined) updates.companyId = companyId ? parseInt(companyId, 10) : null;
  if (status) updates.status = status;
  if (employeesCount !== undefined) updates.employeesCount = parseInt(employeesCount, 10);
  if (routesCount !== undefined) updates.routesCount = parseInt(routesCount, 10);
  try {
    const [row] = await db.update(budgetsTable).set(updates as Parameters<typeof db.update>[0]).where(eq(budgetsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Orçamento não encontrado" }); return; }
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Error updating budget");
    res.status(500).json({ error: "Erro interno" });
  }
});

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

export default router;
