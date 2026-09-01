import { Router } from "express";
import { and, count, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { driversTable, partnersTable, usersTable, vehiclesTable } from "@workspace/db/schema";
import { getAuth, requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/mobile/me", requireAuth("parceiro_master", "motorista"), async (req, res) => {
  const auth = getAuth(req);
  const userId = typeof auth.sub === "number" ? auth.sub : Number(auth.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "Usuário inválido" });
    return;
  }

  try {
    const [user] = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    const [driver] = auth.role === "motorista"
      ? await db.select().from(driversTable).where(eq(driversTable.userId, userId)).limit(1)
      : [];
    const partnerId = driver?.partnerId ?? auth.entityId;
    const [partner] = Number.isInteger(partnerId)
      ? await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId as number)).limit(1)
      : [];

    let summary: { activeVehicles: number; activeDrivers: number } | null = null;
    if (auth.role === "parceiro_master" && partner) {
      const [[vehicleCount], [driverCount]] = await Promise.all([
        db.select({ value: count() }).from(vehiclesTable).where(and(eq(vehiclesTable.partnerId, partner.id), eq(vehiclesTable.status, "ativo"))),
        db.select({ value: count() }).from(driversTable).where(and(eq(driversTable.partnerId, partner.id), eq(driversTable.isActive, true))),
      ]);
      summary = {
        activeVehicles: Number(vehicleCount?.value ?? 0),
        activeDrivers: Number(driverCount?.value ?? 0),
      };
    }

    res.json({
      user: {
        id: user.id,
        name: user.name ?? driver?.name ?? user.email.split("@")[0],
        email: user.email,
        role: user.role,
      },
      partner: partner ? {
        id: partner.id,
        name: partner.name,
        phone: partner.phone,
        email: partner.email,
      } : null,
      driver: driver ? {
        id: driver.id,
        name: driver.name,
        cnh: driver.cnh,
        cnhCategory: driver.cnhCategory,
        isActive: driver.isActive,
      } : null,
      summary,
    });
  } catch (err) {
    req.log.error({ err }, "Error loading mobile identity");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

export default router;
