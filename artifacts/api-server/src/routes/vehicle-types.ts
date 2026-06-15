import { Router } from "express";
import { db } from "@workspace/db";
import { vehicleTypesTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/admin/vehicle-types", requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(vehicleTypesTable).orderBy(asc(vehicleTypesTable.capacity));
    res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Error listing vehicle types");
    res.status(500).json({ error: "Erro interno" });
  }
});

router.post("/admin/vehicle-types", requireAdmin, async (req, res) => {
  const { type, capacity, costPerKm, fixedCost } = req.body as Record<string, string | undefined>;
  if (!type || !capacity || !costPerKm) {
    res.status(400).json({ error: "Tipo, capacidade e custo/km são obrigatórios" }); return;
  }
  try {
    const [row] = await db.insert(vehicleTypesTable).values({
      type: type.trim(),
      capacity: parseInt(capacity, 10),
      costPerKm,
      fixedCost: fixedCost && fixedCost.trim() !== "" ? fixedCost : null,
    }).returning();
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Error creating vehicle type");
    res.status(500).json({ error: "Erro interno" });
  }
});

router.delete("/admin/vehicle-types/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const [row] = await db.delete(vehicleTypesTable).where(eq(vehicleTypesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Veículo não encontrado" }); return; }
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting vehicle type");
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
