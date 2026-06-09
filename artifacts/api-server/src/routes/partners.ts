import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { partnersTable, vehiclesTable, driversTable, usersTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin, requireAuth, getAuth } from "../middlewares/auth";
import { logAudit } from "../services/audit";

const router = Router();

function cleanCnpj(v: string) { return v.replace(/\D/g, ""); }
function cleanCpf(v: string) { return v.replace(/\D/g, ""); }

/* ── Parceiros: listar ── */
router.get("/admin/partners", requireAdmin, async (req, res) => {
  try {
    const partners = await db.select().from(partnersTable).orderBy(desc(partnersTable.createdAt));
    res.json(partners.map(p => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Error listing partners");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Parceiros: criar ── */
router.post("/admin/partners", requireAdmin, async (req, res) => {
  const { name, cnpj, address, phone, email, masterName, masterCpf, masterEmail, garageAddress, garageLat, garageLng } = req.body as Record<string, string | undefined>;
  if (!name || !cnpj || !address || !phone || !email || !masterName || !masterCpf || !masterEmail) {
    res.status(400).json({ error: "Todos os campos são obrigatórios" }); return;
  }
  const cleanedCnpj = cleanCnpj(cnpj);
  const cleanedCpf = cleanCpf(masterCpf);
  if (cleanedCnpj.length !== 14) { res.status(400).json({ error: "CNPJ inválido" }); return; }
  if (cleanedCpf.length !== 11) { res.status(400).json({ error: "CPF inválido" }); return; }

  const initialPassword = cleanedCpf.slice(0, 6);
  const passwordHash = await bcrypt.hash(initialPassword, 12);

  try {
    const [masterUser] = await db.insert(usersTable).values({
      email: masterEmail.trim().toLowerCase(),
      passwordHash,
      role: "parceiro_master",
      entityType: "partner",
      forcePasswordChange: true,
      isActive: true,
    }).returning();

    const [partner] = await db.insert(partnersTable).values({
      name: name.trim(),
      cnpj: cleanedCnpj,
      address: address.trim(),
      garageAddress: garageAddress?.trim() ?? null,
      garageLat: garageLat ? parseFloat(garageLat) : null,
      garageLng: garageLng ? parseFloat(garageLng) : null,
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      masterUserId: masterUser.id,
    }).returning();

    await db.update(usersTable).set({ entityId: partner.id }).where(eq(usersTable.id, masterUser.id));

    const auth = getAuth(req);
    await logAudit({ userId: 0, userEmail: auth.email, action: "create_partner", entityType: "partner", entityId: partner.id });

    res.status(201).json({
      ...partner,
      createdAt: partner.createdAt.toISOString(),
      updatedAt: partner.updatedAt.toISOString(),
      masterUser: { id: masterUser.id, email: masterUser.email, initialPassword },
    });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") { res.status(400).json({ error: "CNPJ ou e-mail já cadastrado" }); return; }
    req.log.error({ err }, "Error creating partner");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Parceiros: buscar por ID ── */
router.get("/admin/partners/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, id)).limit(1);
    if (!partner) { res.status(404).json({ error: "Parceiro não encontrado" }); return; }
    res.json({
      ...partner,
      garageLat: partner.garageLat ?? null,
      garageLng: partner.garageLng ?? null,
      garageAddress: partner.garageAddress ?? null,
      createdAt: partner.createdAt.toISOString(),
      updatedAt: partner.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching partner by id");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Parceiros: editar ── */
router.put("/admin/partners/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { name, cnpj, address, phone, email, garageAddress, garageLat, garageLng } = req.body as Record<string, string | undefined>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name) updates.name = name.trim();
  if (cnpj) updates.cnpj = cleanCnpj(cnpj);
  if (address) updates.address = address.trim();
  if (garageAddress !== undefined) updates.garageAddress = garageAddress?.trim() ?? null;
  if (garageLat !== undefined) updates.garageLat = garageLat ? parseFloat(garageLat) : null;
  if (garageLng !== undefined) updates.garageLng = garageLng ? parseFloat(garageLng) : null;
  if (phone) updates.phone = phone.trim();
  if (email) updates.email = email.trim().toLowerCase();
  try {
    const [partner] = await db.update(partnersTable).set(updates as Record<string, unknown>).where(eq(partnersTable.id, id)).returning();
    if (!partner) { res.status(404).json({ error: "Parceiro não encontrado" }); return; }
    res.json({ ...partner, createdAt: partner.createdAt.toISOString(), updatedAt: partner.updatedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Error updating partner");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Parceiros: excluir ── */
router.delete("/admin/partners/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const [partner] = await db.delete(partnersTable).where(eq(partnersTable.id, id)).returning();
    if (!partner) { res.status(404).json({ error: "Parceiro não encontrado" }); return; }
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting partner");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Veículos: listar ── */
router.get("/admin/partners/:id/vehicles", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const vehicles = await db.select().from(vehiclesTable).where(eq(vehiclesTable.partnerId, id)).orderBy(vehiclesTable.plate);
    res.json(vehicles);
  } catch (err) { req.log.error({ err }, "Error listing partner vehicles (admin)"); res.status(500).json({ error: "Erro interno" }); }
});

router.get("/partners/:id/vehicles", requireAuth("platform_admin", "parceiro_master"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const vehicles = await db.select().from(vehiclesTable).where(eq(vehiclesTable.partnerId, id)).orderBy(vehiclesTable.plate);
    res.json(vehicles.map(v => ({ ...v, createdAt: v.createdAt.toISOString(), updatedAt: v.updatedAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Error listing vehicles");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Veículos: criar ── */
router.post("/partners/:id/vehicles", requireAuth("platform_admin", "parceiro_master"), async (req, res) => {
  const partnerId = parseInt(req.params.id as string, 10);
  if (isNaN(partnerId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { type, capacity, plate, internalId, status } = req.body as Record<string, string | undefined>;
  if (!type || !capacity || !plate) {
    res.status(400).json({ error: "Tipo, capacidade e placa são obrigatórios" }); return;
  }
  try {
    const [vehicle] = await db.insert(vehiclesTable).values({
      partnerId,
      type: type as "van" | "micro_onibus" | "onibus",
      capacity: parseInt(capacity, 10),
      plate: plate.trim().toUpperCase(),
      internalId: internalId?.trim() ?? null,
      status: (status ?? "ativo") as "ativo" | "inativo",
    }).returning();
    res.status(201).json({ ...vehicle, createdAt: vehicle.createdAt.toISOString(), updatedAt: vehicle.updatedAt.toISOString() });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") { res.status(400).json({ error: "Placa já cadastrada" }); return; }
    req.log.error({ err }, "Error creating vehicle");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Motoristas: listar ── */
router.get("/partners/:id/drivers", requireAuth("platform_admin", "parceiro_master"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const drivers = await db.select().from(driversTable).where(eq(driversTable.partnerId, id)).orderBy(driversTable.name);
    res.json(drivers.map(d => ({ ...d, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Error listing drivers");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Motoristas: criar ── */
router.post("/partners/:id/drivers", requireAuth("platform_admin", "parceiro_master"), async (req, res) => {
  const partnerId = parseInt(req.params.id as string, 10);
  if (isNaN(partnerId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { name, cpf, cnh, cnhCategory, email } = req.body as Record<string, string | undefined>;
  if (!name || !cpf || !cnh || !cnhCategory || !email) {
    res.status(400).json({ error: "Todos os campos são obrigatórios" }); return;
  }
  const cleanedCpf = cleanCpf(cpf);
  if (cleanedCpf.length !== 11) { res.status(400).json({ error: "CPF inválido" }); return; }

  const initialPassword = cleanedCpf.slice(0, 6);
  const passwordHash = await bcrypt.hash(initialPassword, 12);

  try {
    const [userRow] = await db.insert(usersTable).values({
      email: email.trim().toLowerCase(),
      passwordHash,
      role: "motorista",
      entityType: "partner",
      entityId: partnerId,
      forcePasswordChange: true,
      isActive: true,
    }).returning();

    const [driver] = await db.insert(driversTable).values({
      partnerId,
      name: name.trim(),
      cpf: cleanedCpf,
      cnh: cnh.trim(),
      cnhCategory: cnhCategory.trim(),
      email: email.trim().toLowerCase(),
      isActive: true,
      userId: userRow.id,
    }).returning();

    const auth = getAuth(req);
    await logAudit({ userId: auth.sub as number, userEmail: auth.email, action: "create_driver", entityType: "driver", entityId: driver.id });

    res.status(201).json({
      ...driver,
      createdAt: driver.createdAt.toISOString(),
      updatedAt: driver.updatedAt.toISOString(),
      initialPassword,
    });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") { res.status(400).json({ error: "CPF ou e-mail já cadastrado" }); return; }
    req.log.error({ err }, "Error creating driver");
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;