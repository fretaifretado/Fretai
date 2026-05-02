import { Router } from "express";
import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.use("/admin", requireAdmin);

router.get("/admin/clients", async (req, res) => {
  try {
    const clients = await db.select().from(clientsTable).orderBy(clientsTable.createdAt);
    const mapped = clients.map((c) => ({
      id: c.id,
      name: c.name,
      cpf: c.cpf,
      email: c.email,
      accessLevel: c.accessLevel,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
    res.json(mapped);
  } catch (err) {
    req.log.error({ err }, "Error listing clients");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.post("/admin/clients", async (req, res) => {
  const { name, cpf, email, accessLevel } = req.body as {
    name?: string;
    cpf?: string;
    email?: string;
    accessLevel?: string;
  };

  if (!name || !cpf || !email || !accessLevel) {
    res.status(400).json({ error: "Todos os campos são obrigatórios" });
    return;
  }

  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length !== 11) {
    res.status(400).json({ error: "CPF inválido" });
    return;
  }

  try {
    const [client] = await db
      .insert(clientsTable)
      .values({ name, cpf: cleanCpf, email, accessLevel })
      .returning();
    res.status(201).json({
      id: client.id,
      name: client.name,
      cpf: client.cpf,
      email: client.email,
      accessLevel: client.accessLevel,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
    });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      res.status(400).json({ error: "CPF ou e-mail já cadastrado" });
      return;
    }
    req.log.error({ err }, "Error creating client");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.get("/admin/clients/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  try {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!client) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }
    res.json({
      id: client.id,
      name: client.name,
      cpf: client.cpf,
      email: client.email,
      accessLevel: client.accessLevel,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error getting client");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.put("/admin/clients/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const { name, cpf, email, accessLevel } = req.body as {
    name?: string;
    cpf?: string;
    email?: string;
    accessLevel?: string;
  };

  const updates: Partial<{ name: string; cpf: string; email: string; accessLevel: string; updatedAt: Date }> = {};
  if (name) updates.name = name;
  if (cpf) updates.cpf = cpf.replace(/\D/g, "");
  if (email) updates.email = email;
  if (accessLevel) updates.accessLevel = accessLevel;
  updates.updatedAt = new Date();

  try {
    const [client] = await db.update(clientsTable).set(updates).where(eq(clientsTable.id, id)).returning();
    if (!client) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }
    res.json({
      id: client.id,
      name: client.name,
      cpf: client.cpf,
      email: client.email,
      accessLevel: client.accessLevel,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error updating client");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.delete("/admin/clients/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  try {
    const [client] = await db.delete(clientsTable).where(eq(clientsTable.id, id)).returning();
    if (!client) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting client");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

export default router;
