import { Router } from "express";
import { db } from "@workspace/db";
import { orcVehiclesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateVehicleBody,
  GetVehicleParams,
  UpdateVehicleParams,
  UpdateVehicleBody,
  DeleteVehicleParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const vehicles = await db.select().from(orcVehiclesTable).orderBy(orcVehiclesTable.capacity);
    res.json(
      vehicles.map((v) => ({
        ...v,
        costPerKm: v.costPerKm ? Number(v.costPerKm) : null,
        costPerRoute: v.costPerRoute ? Number(v.costPerRoute) : null,
        createdAt: v.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  const parsed = CreateVehicleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { type, capacity, costPerKm, costPerRoute, availableCount } = parsed.data;
  try {
    const [vehicle] = await db
      .insert(orcVehiclesTable)
      .values({
        type,
        capacity,
        costPerKm: costPerKm !== undefined && costPerKm !== null ? String(costPerKm) : null,
        costPerRoute: costPerRoute !== undefined && costPerRoute !== null ? String(costPerRoute) : null,
        availableCount: availableCount ?? null,
      })
      .returning();
    res.status(201).json({
      ...vehicle,
      costPerKm: vehicle.costPerKm ? Number(vehicle.costPerKm) : null,
      costPerRoute: vehicle.costPerRoute ? Number(vehicle.costPerRoute) : null,
      createdAt: vehicle.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  const parsed = GetVehicleParams.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "Invalid ID" });
  try {
    const [vehicle] = await db.select().from(orcVehiclesTable).where(eq(orcVehiclesTable.id, parsed.data.id));
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    res.json({
      ...vehicle,
      costPerKm: vehicle.costPerKm ? Number(vehicle.costPerKm) : null,
      costPerRoute: vehicle.costPerRoute ? Number(vehicle.costPerRoute) : null,
      createdAt: vehicle.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  const paramsParsed = UpdateVehicleParams.safeParse(req.params);
  const bodyParsed = UpdateVehicleBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success)
    return res.status(400).json({ error: "Invalid data" });
  const { type, capacity, costPerKm, costPerRoute, availableCount } = bodyParsed.data;
  try {
    const [vehicle] = await db
      .update(orcVehiclesTable)
      .set({
        type,
        capacity,
        costPerKm: costPerKm !== undefined && costPerKm !== null ? String(costPerKm) : null,
        costPerRoute: costPerRoute !== undefined && costPerRoute !== null ? String(costPerRoute) : null,
        availableCount: availableCount ?? null,
      })
      .where(eq(orcVehiclesTable.id, paramsParsed.data.id))
      .returning();
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    res.json({
      ...vehicle,
      costPerKm: vehicle.costPerKm ? Number(vehicle.costPerKm) : null,
      costPerRoute: vehicle.costPerRoute ? Number(vehicle.costPerRoute) : null,
      createdAt: vehicle.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  const parsed = DeleteVehicleParams.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "Invalid ID" });
  try {
    await db.delete(orcVehiclesTable).where(eq(orcVehiclesTable.id, parsed.data.id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
