import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { companiesTable, usersTable, employeesTable, employeeMovementsTable } from "@workspace/db/schema";
import { eq, desc, or, inArray } from "drizzle-orm";
import { requireAdmin, requireAuth, getAuth } from "../middlewares/auth";
import { logAudit } from "../services/audit";

const router = Router();

function cleanCnpj(v: string) { return v.replace(/\D/g, ""); }
function cleanCpf(v: string) { return v.replace(/\D/g, ""); }

/* ── Administrador: listar empresas ── */
router.get("/admin/companies", requireAdmin, async (req, res) => {
  try {
    const companies = await db.select().from(companiesTable).orderBy(desc(companiesTable.createdAt));
    res.json(companies.map(c => ({
      ...c,
      createdAt: c.createdAt?.toISOString?.() ?? c.createdAt,
      updatedAt: c.updatedAt?.toISOString?.() ?? c.updatedAt,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing companies");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Administrador: criar empresa + usuário master ── */
router.post("/admin/companies", requireAdmin, async (req, res) => {
  const {
    name, cnpj, address, phone, email,
    masterName, masterCpf, masterEmail, valeValue,
  } = req.body as Record<string, string | undefined>;

  if (!name || !cnpj || !address || !phone || !email || !masterName || !masterCpf || !masterEmail) {
    res.status(400).json({ error: "Todos os campos são obrigatórios" }); return;
  }

  const cleanedCnpj = cleanCnpj(cnpj);
  const cleanedCpf = cleanCpf(masterCpf);
  if (cleanedCnpj.length !== 14) { res.status(400).json({ error: "CNPJ inválido" }); return; }
  if (cleanedCpf.length !== 11) { res.status(400).json({ error: "CPF do administrador inválido" }); return; }

  const initialPassword = cleanedCpf.slice(0, 6);
  const passwordHash = await bcrypt.hash(initialPassword, 12);

  try {
    const [masterUser] = await db.insert(usersTable).values({
      name: masterName.trim(),
      email: masterEmail.trim().toLowerCase(),
      passwordHash,
      role: "cliente_master",
      entityType: "company",
      forcePasswordChange: true,
      isActive: true,
    }).returning();

    if (!masterUser) throw new Error("Erro ao criar usuário master");

    const [company] = await db.insert(companiesTable).values({
      name: name.trim(),
      cnpj: cleanedCnpj,
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      masterUserId: masterUser.id,
      valeValue: valeValue ?? "8.50",
    }).returning();

    if (!company) throw new Error("Erro ao criar empresa");

    await db.update(usersTable).set({ entityId: company.id }).where(eq(usersTable.id, masterUser.id));

    const auth = getAuth(req);
    await logAudit({ userId: 0, userEmail: auth.email, action: "create_company", entityType: "company", entityId: company.id, newValue: { name, cnpj: cleanedCnpj } });

    res.status(201).json({
      ...company,
      createdAt: company.createdAt?.toISOString?.() ?? company.createdAt,
      updatedAt: company.updatedAt?.toISOString?.() ?? company.updatedAt,
      masterUser: { id: masterUser.id, email: masterUser.email, initialPassword },
    });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") { res.status(400).json({ error: "CNPJ ou e-mail já cadastrado" }); return; }
    req.log.error({ err }, "Error creating company");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Administrador: buscar empresa ── */
router.get("/admin/companies/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, id));
    if (!company) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
    res.json({ ...company, createdAt: company.createdAt?.toISOString?.() ?? company.createdAt, updatedAt: company.updatedAt?.toISOString?.() ?? company.updatedAt });
  } catch (err) {
    req.log.error({ err }, "Error fetching company");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Administrador: editar empresa ── */
router.put("/admin/companies/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { name, cnpj, address, phone, email } = req.body as Record<string, string | undefined>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name) updates.name = name.trim();
  if (cnpj) updates.cnpj = cleanCnpj(cnpj);
  if (address) updates.address = address.trim();
  if (phone) updates.phone = phone.trim();
  if (email) updates.email = email.trim().toLowerCase();
  try {
    const [company] = await db.update(companiesTable).set(updates).where(eq(companiesTable.id, id)).returning();
    if (!company) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
    res.json({ ...company, createdAt: company.createdAt?.toISOString?.() ?? company.createdAt, updatedAt: company.updatedAt?.toISOString?.() ?? company.updatedAt });
  } catch (err) {
    req.log.error({ err }, "Error updating company");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Administrador: criar filial de uma empresa ── */
router.post("/admin/companies/:id/branches", requireAdmin, async (req, res) => {
  const parentId = parseInt(req.params.id as string, 10);
  if (isNaN(parentId)) { res.status(400).json({ error: "ID da empresa inválido" }); return; }

  const { name, city, state, cnpj } = req.body as Record<string, string | undefined>;
  if (!name || !city || !state || !cnpj) {
    res.status(400).json({ error: "Nome, cidade, estado e CNPJ são obrigatórios" }); return;
  }

  const cleanedCnpj = cleanCnpj(cnpj);
  if (cleanedCnpj.length !== 14) { res.status(400).json({ error: "CNPJ inválido" }); return; }

  try {
    const [parent] = await db.select().from(companiesTable).where(eq(companiesTable.id, parentId));
    if (!parent) { res.status(404).json({ error: "Empresa pai não encontrada" }); return; }

    const [branch] = await db.insert(companiesTable).values({
      name: name.trim(),
      cnpj: cleanedCnpj,
      address: `${city.trim()} - ${state.trim()}`,
      phone: parent.phone,
      email: `filial-${cleanedCnpj}@${parent.email.split("@")[1] ?? "empresa.com"}`,
      masterUserId: parent.masterUserId,
      valeValue: parent.valeValue,
      parentCompanyId: parentId,
      city: city.trim(),
      state: state.trim(),
    }).returning();

    if (!branch) throw new Error("Erro ao criar filial");

    const auth = getAuth(req);
    await logAudit({
      userId: (auth.sub as number) ?? 0,
      userEmail: auth.email,
      action: "create_branch",
      entityType: "company_branch",
      entityId: branch.id,
      newValue: { name, cnpj: cleanedCnpj, parentCompanyId: parentId, city, state },
    });

    res.status(201).json({
      ...branch,
      createdAt: branch.createdAt?.toISOString?.() ?? branch.createdAt,
      updatedAt: branch.updatedAt?.toISOString?.() ?? branch.updatedAt,
    });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") { res.status(400).json({ error: "CNPJ ou e-mail já cadastrado" }); return; }
    req.log.error({ err }, "Error creating branch");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Administrador: listar filiais de uma empresa ── */
router.get("/admin/companies/:id/branches", requireAdmin, async (req, res) => {
  const parentId = parseInt(req.params.id as string, 10);
  if (isNaN(parentId)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const branches = await db.select().from(companiesTable)
      .where(eq(companiesTable.parentCompanyId, parentId))
      .orderBy(desc(companiesTable.createdAt));
    res.json(branches.map(b => ({
      ...b,
      createdAt: b.createdAt?.toISOString?.() ?? b.createdAt,
      updatedAt: b.updatedAt?.toISOString?.() ?? b.updatedAt,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing branches");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Administrador: excluir empresa ── */
router.delete("/admin/companies/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const [company] = await db.delete(companiesTable).where(eq(companiesTable.id, id)).returning();
    if (!company) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting company");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Funcionários: listar ── */
router.get("/companies/:id/employees", requireAuth("platform_admin", "cliente_master", "cliente_subadmin"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const filiais = await db.select({ id: companiesTable.id }).from(companiesTable).where(eq(companiesTable.parentCompanyId, id));
    const filialIds = filiais.map(f => f.id);
    const allIds = [id, ...filialIds];
    const employees = await db.select().from(employeesTable)
      .where(allIds.length === 1 ? eq(employeesTable.companyId, id) : inArray(employeesTable.companyId, allIds))
      .orderBy(employeesTable.name);
    res.json(employees.map(e => ({
      ...e,
      turno: e.route ?? null,
      admissionDate: e.admissionDate,
      createdAt: e.createdAt?.toISOString?.() ?? e.createdAt,
      updatedAt: e.updatedAt?.toISOString?.() ?? e.updatedAt,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing employees");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Funcionários: criar ── */
router.post("/companies/:id/employees", requireAuth("platform_admin", "cliente_master", "cliente_subadmin"), async (req, res) => {
  const companyId = parseInt(req.params.id as string, 10);
  if (isNaN(companyId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { name, cpf, matricula, admissionDate, route, routeStartDate } = req.body as Record<string, string | undefined>;
  if (!name || !cpf || !matricula || !admissionDate) {
    res.status(400).json({ error: "Nome, CPF, matrícula e data de admissão são obrigatórios" }); return;
  }
  const cleanedCpf = cleanCpf(cpf);
  if (cleanedCpf.length !== 11) { res.status(400).json({ error: "CPF inválido" }); return; }
  try {
    const [employee] = await db.insert(employeesTable).values({
      companyId,
      name: name.trim(),
      cpf: cleanedCpf,
      matricula: matricula.trim(),
      admissionDate,
      route: route?.trim() ?? null,
      routeStartDate: routeStartDate ?? null,
    }).returning();
    if (!employee) throw new Error("Erro ao criar funcionário");
    const auth = getAuth(req);
    await logAudit({ userId: auth.sub as number, userEmail: auth.email, action: "create_employee", entityType: "employee", entityId: employee.id, newValue: { name, cpf: cleanedCpf } });
    res.status(201).json({ ...employee, createdAt: employee.createdAt?.toISOString?.() ?? employee.createdAt, updatedAt: employee.updatedAt?.toISOString?.() ?? employee.updatedAt });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") { res.status(400).json({ error: "CPF já cadastrado" }); return; }
    req.log.error({ err }, "Error creating employee");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Funcionários: editar ── */
router.put("/companies/:companyId/employees/:id", requireAuth("platform_admin", "cliente_master", "cliente_subadmin"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { name, matricula, admissionDate, route, routeStartDate } = req.body as Record<string, string | undefined>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name) updates.name = name.trim();
  if (matricula) updates.matricula = matricula.trim();
  if (admissionDate) updates.admissionDate = admissionDate;
  if (route !== undefined) updates.route = route?.trim() ?? null;
  if (routeStartDate !== undefined) updates.routeStartDate = routeStartDate ?? null;
  try {
    const [employee] = await db.update(employeesTable).set(updates).where(eq(employeesTable.id, id)).returning();
    if (!employee) { res.status(404).json({ error: "Funcionário não encontrado" }); return; }
    res.json({ ...employee, createdAt: employee.createdAt?.toISOString?.() ?? employee.createdAt, updatedAt: employee.updatedAt?.toISOString?.() ?? employee.updatedAt });
  } catch (err) {
    req.log.error({ err }, "Error updating employee");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Master: buscar própria empresa ── */
router.get("/me/company", requireAuth("cliente_master", "cliente_subadmin"), async (req, res) => {
  const auth = getAuth(req);
  const entityId = auth.entityId as number | undefined;
  if (!entityId) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
  try {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, entityId));
    if (!company) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
    res.json({ ...company, createdAt: company.createdAt.toISOString(), updatedAt: company.updatedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Error fetching company");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Master: listar filiais da própria empresa (matriz + filiais) ── */
router.get("/me/branches", requireAuth("cliente_master", "cliente_subadmin"), async (req, res) => {
  const auth = getAuth(req);
  const entityId = auth.entityId as number | undefined;
  if (!entityId) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
  try {
    const [matriz] = await db.select().from(companiesTable).where(eq(companiesTable.id, entityId));
    if (!matriz) { res.status(404).json({ error: "Empresa não encontrada" }); return; }

    const branches = await db.select().from(companiesTable)
      .where(eq(companiesTable.parentCompanyId, entityId))
      .orderBy(companiesTable.name);

    const all = [matriz, ...branches].map(b => ({
      ...b,
      tipo: b.parentCompanyId ? "filial" as const : "matriz" as const,
      createdAt: b.createdAt?.toISOString?.() ?? b.createdAt,
      updatedAt: b.updatedAt?.toISOString?.() ?? b.updatedAt,
    }));
    res.json(all);
  } catch (err) {
    req.log.error({ err }, "Error listing user branches");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Movimentações: listar ── */
router.get("/employees/:id/movements", requireAuth("platform_admin", "cliente_master", "cliente_subadmin"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const movements = await db.select().from(employeeMovementsTable)
      .where(eq(employeeMovementsTable.employeeId, id))
      .orderBy(desc(employeeMovementsTable.createdAt));
    res.json(movements.map(m => ({ ...m, createdAt: m.createdAt?.toISOString?.() ?? m.createdAt })));
  } catch (err) {
    req.log.error({ err }, "Error listing movements");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Movimentações: criar ── */
router.post("/employees/:id/movements", requireAuth("platform_admin", "cliente_master", "cliente_subadmin"), async (req, res) => {
  const employeeId = parseInt(req.params.id as string, 10);
  if (isNaN(employeeId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { type, startDate, endDate, reason } = req.body as Record<string, string | undefined>;
  if (!type || !startDate) { res.status(400).json({ error: "Tipo e data de início são obrigatórios" }); return; }
  const auth = getAuth(req);
  try {
    const [movement] = await db.insert(employeeMovementsTable).values({
      employeeId,
      type: type as "ferias" | "afastamento" | "licenca" | "demissao" | "troca_rota",
      startDate,
      endDate: endDate ?? null,
      reason: reason?.trim() ?? null,
      createdByUserId: auth.sub as number,
    }).returning();
    if (!movement) throw new Error("Erro ao criar movimentação");
    await logAudit({ userId: auth.sub as number, userEmail: auth.email, action: "create_movement", entityType: "employee_movement", entityId: movement.id, newValue: { type, startDate } });
    res.status(201).json({ ...movement, createdAt: movement.createdAt?.toISOString?.() ?? movement.createdAt });
  } catch (err) {
    req.log.error({ err }, "Error creating movement");
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;