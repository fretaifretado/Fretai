import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { companiesTable, usersTable, employeesTable, employeeMovementsTable, companyShiftsTable, companyHolidaysTable, passwordResetTokensTable } from "@workspace/db/schema";
import { eq, desc, or, inArray, isNull, and } from "drizzle-orm";
import { requireAdmin, requireAuth, getAuth } from "../middlewares/auth";
import { logAudit } from "../services/audit";
import { createUnusedValeDiscountForEmployee } from "../services/financial-summary";

const router = Router();

function cleanCnpj(v: string) { return v.replace(/\D/g, ""); }
function cleanCpf(v: string) { return v.replace(/\D/g, ""); }
function publicCompanyUser(user: { id: number; name: string | null; email: string; role: string; createdAt?: Date | string | null }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
  };
}

function generateInitialPassword(): string {
  return Math.random().toString(36).slice(2, 10);
}

/* ── Administrador: listar empresas (apenas raiz — sem parentCompanyId) ── */
router.get("/admin/companies", requireAdmin, async (req, res) => {
  try {
    const companies = await db.select().from(companiesTable)
      .where(isNull(companiesTable.parentCompanyId))
      .orderBy(desc(companiesTable.createdAt));
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
    // Drizzle wraps pg errors — check message string for unique violation
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    if (msg.includes("23505") || msg.includes("unique") || msg.includes("duplicate")) {
      res.status(400).json({ error: "CNPJ ou e-mail já cadastrado no sistema" }); return;
    }
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
      companyId: parentId,
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

function serializeEmployee(e: typeof employeesTable.$inferSelect) {
  return {
    ...e,
    turno: e.route ?? null,
    admissionDate: e.admissionDate,
    createdAt: e.createdAt?.toISOString?.() ?? e.createdAt,
    updatedAt: e.updatedAt?.toISOString?.() ?? e.updatedAt,
  };
}

/* ── Funcionários: importar em lote ── */
router.post("/companies/:id/employees/batch", requireAuth("platform_admin", "cliente_master", "cliente_subadmin"), async (req, res) => {
  const companyId = parseInt(req.params.id as string, 10);
  if (isNaN(companyId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const body = req.body as { employees: Record<string, string | undefined>[] };
  if (!Array.isArray(body.employees) || body.employees.length === 0) {
    res.status(400).json({ error: "Lista de funcionários obrigatória" }); return;
  }
  const auth = getAuth(req);
  const inserted: number[] = [];
  const skipped: string[] = [];

  try {
    // Processa em batches de 100 para não estourar a query
    const BATCH = 100;
    for (let i = 0; i < body.employees.length; i += BATCH) {
      const chunk = body.employees.slice(i, i + BATCH);
      const values = chunk
        .filter(e => e.name && e.cpf)
        .map(e => {
          const cleanedCpf = cleanCpf(e.cpf!);
          return {
            companyId,
            name: e.name!.trim(),
            cpf: cleanedCpf,
            matricula: (e.matricula ?? "000000").trim(),
            admissionDate: e.admissionDate || new Date().toISOString().slice(0, 10),
            route: e.route?.trim() ?? null,
            status: e.status?.trim() ?? "Ativo",
            email: e.email?.trim() ?? null,
            phone: e.phone?.trim() ?? null,
            birthDate: e.birthDate ?? null,
            address: e.address?.trim() ?? null,
            addressNumber: e.addressNumber?.trim() ?? null,
            addressComplement: e.addressComplement?.trim() ?? null,
            neighborhood: e.neighborhood?.trim() ?? null,
            city: e.city?.trim() ?? null,
            state: e.state?.trim() ?? null,
            zipCode: e.zipCode?.trim() ?? null,
            shiftStart: e.shiftStart?.trim() ?? null,
            shiftEnd: e.shiftEnd?.trim() ?? null,
            operationStart: e.operationStart ?? null,
            valeValue: e.valeValue?.trim() ?? null,
            codigo: e.codigo?.trim() ?? null,
            grupoId: e.grupoId ? parseInt(e.grupoId, 10) : null,
          };
        });

      if (values.length === 0) continue;

      try {
        const rows = await db.insert(employeesTable)
          .values(values)
          .onConflictDoNothing() // ignora CPF duplicado
          .returning({ id: employeesTable.id });
        inserted.push(...rows.map(r => r.id));
      } catch (chunkErr) {
        // Se o batch falhar, tenta um a um para salvar o máximo possível
        for (const v of values) {
          try {
            const [row] = await db.insert(employeesTable).values(v).returning({ id: employeesTable.id });
            if (row) inserted.push(row.id);
          } catch {
            skipped.push(v.name);
          }
        }
      }
    }

    await logAudit({
      userId: auth.sub as number, userEmail: auth.email, companyId,
      action: "batch_import_employees", entityType: "employee", entityId: companyId,
      newValue: { inserted: inserted.length, skipped: skipped.length },
    });

    res.status(201).json({ inserted: inserted.length, skipped, ids: inserted });
  } catch (err) {
    req.log.error({ err }, "Error batch importing employees");
    res.status(500).json({ error: "Erro interno ao importar funcionários" });
  }
});

/* ── Funcionários: criar ── */
router.post("/companies/:id/employees", requireAuth("platform_admin", "cliente_master", "cliente_subadmin"), async (req, res) => {
  const companyId = parseInt(req.params.id as string, 10);
  if (isNaN(companyId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const body = req.body as Record<string, string | undefined>;
  const { name, cpf, matricula, admissionDate } = body;
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
      route: body.route?.trim() ?? null,
      routeStartDate: body.routeStartDate ?? null,
      status: body.status?.trim() ?? "Ativo",
      email: body.email?.trim() ?? null,
      phone: body.phone?.trim() ?? null,
      birthDate: body.birthDate ?? null,
      address: body.address?.trim() ?? null,
      addressNumber: body.addressNumber?.trim() ?? null,
      addressComplement: body.addressComplement?.trim() ?? null,
      neighborhood: body.neighborhood?.trim() ?? null,
      city: body.city?.trim() ?? null,
      state: body.state?.trim() ?? null,
      zipCode: body.zipCode?.trim() ?? null,
      shiftStart: body.shiftStart?.trim() ?? null,
      shiftEnd: body.shiftEnd?.trim() ?? null,
      operationStart: body.operationStart ?? null,
      valeValue: body.valeValue?.trim() ?? null,
      codigo: body.codigo?.trim() ?? null,
      grupoId: body.grupoId ? parseInt(body.grupoId, 10) : null,
    }).returning();
    if (!employee) throw new Error("Erro ao criar funcionário");
    const auth = getAuth(req);
    await logAudit({ userId: auth.sub as number, userEmail: auth.email, companyId, action: "create_employee", entityType: "employee", entityId: employee.id, newValue: { name, cpf: cleanedCpf } });
    res.status(201).json(serializeEmployee(employee));
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
  const body = req.body as Record<string, string | undefined>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) updates.name = body.name.trim();
  if (body.matricula) updates.matricula = body.matricula.trim();
  if (body.admissionDate) updates.admissionDate = body.admissionDate;
  if (body.route !== undefined) updates.route = body.route?.trim() ?? null;
  if (body.routeStartDate !== undefined) updates.routeStartDate = body.routeStartDate ?? null;
  if (body.status !== undefined) updates.status = body.status?.trim() ?? null;
  if (body.email !== undefined) updates.email = body.email?.trim() ?? null;
  if (body.phone !== undefined) updates.phone = body.phone?.trim() ?? null;
  if (body.birthDate !== undefined) updates.birthDate = body.birthDate ?? null;
  if (body.address !== undefined) updates.address = body.address?.trim() ?? null;
  if (body.addressNumber !== undefined) updates.addressNumber = body.addressNumber?.trim() ?? null;
  if (body.addressComplement !== undefined) updates.addressComplement = body.addressComplement?.trim() ?? null;
  if (body.neighborhood !== undefined) updates.neighborhood = body.neighborhood?.trim() ?? null;
  if (body.city !== undefined) updates.city = body.city?.trim() ?? null;
  if (body.state !== undefined) updates.state = body.state?.trim() ?? null;
  if (body.zipCode !== undefined) updates.zipCode = body.zipCode?.trim() ?? null;
  if (body.shiftStart !== undefined) updates.shiftStart = body.shiftStart?.trim() ?? null;
  if (body.shiftEnd !== undefined) updates.shiftEnd = body.shiftEnd?.trim() ?? null;
  if (body.operationStart !== undefined) updates.operationStart = body.operationStart ?? null;
  if (body.valeValue !== undefined) updates.valeValue = body.valeValue?.trim() ?? null;
  if (body.codigo !== undefined) updates.codigo = body.codigo?.trim() ?? null;
  if (body.grupoId !== undefined) updates.grupoId = body.grupoId ? parseInt(body.grupoId, 10) : null;
  try {
    const [employee] = await db.update(employeesTable).set(updates).where(eq(employeesTable.id, id)).returning();
    if (!employee) { res.status(404).json({ error: "Funcionário não encontrado" }); return; }
    const authUpd = getAuth(req);
    const companyIdUpd = parseInt(req.params.companyId as string, 10);
    const action = body.status !== undefined && Object.keys(updates).filter(k => k !== "updatedAt").length === 1
      ? "update_employee_status"
      : body.address !== undefined || body.phone !== undefined || body.cep !== undefined
        ? "fix_employee_pending"
        : "update_employee";
    await logAudit({
      userId: authUpd.sub as number,
      userEmail: authUpd.email,
      companyId: isNaN(companyIdUpd) ? undefined : companyIdUpd,
      action,
      entityType: "employee",
      entityId: id,
      newValue: { name: employee.name, status: employee.status, ...Object.fromEntries(Object.entries(body).filter(([k]) => k !== "cpf")) },
    });
    if (body.status !== undefined && body.status.trim().toLowerCase() !== "ativo") {
      const discount = await createUnusedValeDiscountForEmployee({ companyId: employee.companyId, employeeId: employee.id });
      if (discount.created) {
        await logAudit({
          userId: authUpd.sub as number,
          userEmail: authUpd.email,
          companyId: employee.companyId,
          action: "create_unused_vale_credit",
          entityType: "purchase_order",
          entityId: employee.id,
          newValue: { employeeId: employee.id, vales: discount.vales, total: discount.total, status: employee.status },
        });
      }
    }
    res.json(serializeEmployee(employee));
  } catch (err) {
    req.log.error({ err }, "Error updating employee");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Funcionários: excluir ── */
router.delete("/companies/:companyId/employees/:id", requireAuth("platform_admin", "cliente_master", "cliente_subadmin"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const companyIdDel = parseInt(req.params.companyId as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    await db.delete(employeeMovementsTable).where(eq(employeeMovementsTable.employeeId, id));
    const [deleted] = await db.delete(employeesTable).where(eq(employeesTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Funcionário não encontrado" }); return; }
    const authDel = getAuth(req);
    await logAudit({
      userId: authDel.sub as number,
      userEmail: authDel.email,
      companyId: isNaN(companyIdDel) ? undefined : companyIdDel,
      action: "delete_employee",
      entityType: "employee",
      entityId: id,
      newValue: { name: deleted.name },
    });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting employee");
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

/* ── Master: listar próprios colaboradores (todas as filiais) ── */
router.get("/me/employees", requireAuth("cliente_master", "cliente_subadmin"), async (req, res) => {
  const auth = getAuth(req);
  const entityId = auth.entityId as number | undefined;
  if (!entityId) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
  try {
    const filiais = await db.select({ id: companiesTable.id }).from(companiesTable).where(eq(companiesTable.parentCompanyId, entityId));
    const filialIds = filiais.map(f => f.id);
    const allIds = [entityId, ...filialIds];
    const employees = await db.select().from(employeesTable)
      .where(allIds.length === 1 ? eq(employeesTable.companyId, entityId) : inArray(employeesTable.companyId, allIds))
      .orderBy(employeesTable.name);
    res.json(employees.map(serializeEmployee));
  } catch (err) {
    req.log.error({ err }, "Error listing own employees");
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

/* ── Turnos: listar por empresa (admin) ── */
router.get("/companies/:id/shifts", requireAuth("platform_admin", "cliente_master", "cliente_subadmin"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const shifts = await db.select().from(companyShiftsTable)
      .where(eq(companyShiftsTable.companyId, id))
      .orderBy(companyShiftsTable.createdAt);
    res.json(shifts.map(s => ({ ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Error listing shifts");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Turnos: listar os próprios turnos ── */
router.get("/me/shifts", requireAuth("cliente_master", "cliente_subadmin"), async (req, res) => {
  const auth = getAuth(req);
  const entityId = auth.entityId as number | undefined;
  if (!entityId) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
  try {
    const shifts = await db.select().from(companyShiftsTable)
      .where(eq(companyShiftsTable.companyId, entityId))
      .orderBy(companyShiftsTable.createdAt);
    res.json(shifts.map(s => ({ ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Error listing own shifts");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Turnos: criar ── */
router.post("/me/shifts", requireAuth("cliente_master", "cliente_subadmin"), async (req, res) => {
  const auth = getAuth(req);
  const entityId = auth.entityId as number | undefined;
  if (!entityId) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
  const { nome, entrada, saida, escala, tipoEscala } = req.body as Record<string, string | undefined>;
  if (!nome || !entrada || !saida) {
    res.status(400).json({ error: "Nome, entrada e saída são obrigatórios" }); return;
  }
  try {
    const [shift] = await db.insert(companyShiftsTable).values({
      companyId: entityId,
      nome: nome.trim(),
      entrada: entrada.trim(),
      saida: saida.trim(),
      escala: escala?.trim() ?? "",
      tipoEscala: tipoEscala?.trim() ?? "",
    }).returning();
    if (!shift) throw new Error("Erro ao criar turno");
    const authShift = getAuth(req);
    await logAudit({ userId: authShift.sub as number, userEmail: authShift.email, companyId: entityId, action: "create_shift", entityType: "shift", entityId: shift.id, newValue: { nome, entrada, saida, tipoEscala } });
    res.status(201).json({ ...shift, createdAt: shift.createdAt.toISOString(), updatedAt: shift.updatedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Error creating shift");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Turnos: editar ── */
router.put("/me/shifts/:id", requireAuth("cliente_master", "cliente_subadmin"), async (req, res) => {
  const auth = getAuth(req);
  const entityId = auth.entityId as number | undefined;
  if (!entityId) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { nome, entrada, saida, escala, tipoEscala } = req.body as Record<string, string | undefined>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (nome !== undefined) updates.nome = nome.trim();
  if (entrada !== undefined) updates.entrada = entrada.trim();
  if (saida !== undefined) updates.saida = saida.trim();
  if (escala !== undefined) updates.escala = escala.trim();
  if (tipoEscala !== undefined) updates.tipoEscala = tipoEscala.trim();
  try {
    const [shift] = await db.update(companyShiftsTable)
      .set(updates)
      .where(eq(companyShiftsTable.id, id))
      .returning();
    if (!shift) { res.status(404).json({ error: "Turno não encontrado" }); return; }
    await logAudit({ userId: auth.sub as number, userEmail: auth.email, companyId: entityId, action: "update_shift", entityType: "shift", entityId: id, newValue: { nome, entrada, saida, tipoEscala } });
    res.json({ ...shift, createdAt: shift.createdAt.toISOString(), updatedAt: shift.updatedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Error updating shift");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Turnos: excluir ── */
router.delete("/me/shifts/:id", requireAuth("cliente_master", "cliente_subadmin"), async (req, res) => {
  const auth = getAuth(req);
  const entityId = auth.entityId as number | undefined;
  if (!entityId) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const [deleted] = await db.delete(companyShiftsTable)
      .where(eq(companyShiftsTable.id, id))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Turno não encontrado" }); return; }
    await logAudit({ userId: auth.sub as number, userEmail: auth.email, companyId: entityId, action: "delete_shift", entityType: "shift", entityId: id, newValue: { nome: deleted.nome } });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting shift");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Usuários master: listar ── */
router.get("/companies/:id/users", requireAuth("platform_admin"), async (req, res) => {
  const companyId = parseInt(req.params.id as string, 10);
  if (isNaN(companyId)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, createdAt: usersTable.createdAt })
      .from(usersTable)
      .where(and(eq(usersTable.entityId, companyId), inArray(usersTable.role, ["cliente_master", "cliente_subadmin"])))
      .orderBy(usersTable.createdAt);
    res.json(users);
  } catch (err) {
    req.log.error({ err }, "Error listing company users");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Usuários master: criar ── */
router.post("/companies/:id/users", requireAuth("platform_admin"), async (req, res) => {
  const companyId = parseInt(req.params.id as string, 10);
  if (isNaN(companyId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { name, email, role = "cliente_master" } = req.body as { name: string; email: string; role?: string };
  if (!name || !email) { res.status(400).json({ error: "Nome e e-mail são obrigatórios" }); return; }
  if (!["cliente_master", "cliente_subadmin"].includes(role)) { res.status(400).json({ error: "Role inválido" }); return; }
  const auth = getAuth(req);
  try {
    const emailLower = email.trim().toLowerCase();
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, emailLower)).limit(1);
    if (existing.length > 0) { res.status(409).json({ error: "E-mail já cadastrado no sistema" }); return; }

    const initialPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(initialPassword, 10);

    const [user] = await db.insert(usersTable).values({
      name: name.trim(),
      email: emailLower,
      passwordHash,
      role: role as "cliente_master" | "cliente_subadmin",
      entityId: companyId,
      entityType: "company",
    }).returning();

    await logAudit({
      userId: auth.sub as number, userEmail: auth.email, companyId,
      action: "create_company_user", entityType: "user", entityId: user!.id,
      newValue: { name, email: emailLower, role },
    });

    res.status(201).json({ id: user!.id, name: user!.name, email: user!.email, role: user!.role, initialPassword });
  } catch (err) {
    req.log.error({ err }, "Error creating company user");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Usuários master: remover ── */
router.delete("/companies/:id/users/:userId", requireAuth("platform_admin"), async (req, res) => {
  const companyId = parseInt(req.params.id as string, 10);
  const userId    = parseInt(req.params.userId as string, 10);
  if (isNaN(companyId) || isNaN(userId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const auth = getAuth(req);
  try {
    const [user] = await db.select().from(usersTable).where(and(eq(usersTable.id, userId), eq(usersTable.entityId, companyId))).limit(1);
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    await db.delete(usersTable).where(eq(usersTable.id, userId));
    await logAudit({
      userId: auth.sub as number, userEmail: auth.email, companyId,
      action: "delete_company_user", entityType: "user", entityId: userId,
      newValue: { email: user.email },
    });
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting company user");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Minha conta: perfil ── */
router.get("/me/profile", requireAuth("cliente_master", "cliente_subadmin"), async (req, res) => {
  const auth = getAuth(req);
  if (typeof auth.sub !== "number") { res.status(400).json({ error: "Usuário inválido" }); return; }
  try {
    const [user] = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, entityId: usersTable.entityId, createdAt: usersTable.createdAt })
      .from(usersTable)
      .where(eq(usersTable.id, auth.sub))
      .limit(1);
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    res.json(publicCompanyUser(user));
  } catch (err) {
    req.log.error({ err }, "Error fetching my profile");
    res.status(500).json({ error: "Erro interno" });
  }
});

router.put("/me/profile", requireAuth("cliente_master", "cliente_subadmin"), async (req, res) => {
  const auth = getAuth(req);
  if (typeof auth.sub !== "number") { res.status(400).json({ error: "Usuário inválido" }); return; }
  const { name, currentPassword, newPassword } = req.body as { name?: string; currentPassword?: string; newPassword?: string };
  const trimmedName = name?.trim();
  const trimmedNewPassword = newPassword?.trim();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (trimmedName !== undefined) {
    if (trimmedName.length < 2) { res.status(400).json({ error: "Nome deve ter ao menos 2 caracteres" }); return; }
    updates.name = trimmedName;
  }
  if (trimmedNewPassword) {
    if (trimmedNewPassword.length < 6) { res.status(400).json({ error: "A nova senha deve ter ao menos 6 caracteres" }); return; }
    if (!currentPassword?.trim()) { res.status(400).json({ error: "Senha atual é obrigatória" }); return; }
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, auth.sub)).limit(1);
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    if (trimmedNewPassword) {
      const valid = await bcrypt.compare(currentPassword!.trim(), user.passwordHash);
      if (!valid) { res.status(401).json({ error: "Senha atual incorreta" }); return; }
      updates.passwordHash = await bcrypt.hash(trimmedNewPassword, 12);
      updates.forcePasswordChange = false;
    }

    const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, auth.sub)).returning();
    if (!updated) { res.status(404).json({ error: "Usuário não encontrado" }); return; }

    const action = trimmedNewPassword && trimmedName !== undefined ? "update_profile_and_password" : trimmedNewPassword ? "change_password" : "update_profile";
    await logAudit({
      userId: auth.sub,
      userEmail: auth.email,
      companyId: auth.entityId,
      action,
      entityType: "user",
      entityId: auth.sub,
      newValue: { name: updated.name, passwordChanged: Boolean(trimmedNewPassword) },
    });

    res.json(publicCompanyUser(updated));
  } catch (err) {
    req.log.error({ err }, "Error updating my profile");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Minha empresa: usuários de acesso ── */
router.get("/me/users", requireAuth("cliente_master"), async (req, res) => {
  const auth = getAuth(req);
  const companyId = auth.entityId;
  if (typeof companyId !== "number") { res.status(400).json({ error: "Empresa não identificada" }); return; }
  try {
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, createdAt: usersTable.createdAt })
      .from(usersTable)
      .where(and(eq(usersTable.entityId, companyId), inArray(usersTable.role, ["cliente_master", "cliente_subadmin"])))
      .orderBy(usersTable.createdAt);
    res.json(users.map(publicCompanyUser));
  } catch (err) {
    req.log.error({ err }, "Error listing my company users");
    res.status(500).json({ error: "Erro interno" });
  }
});

router.post("/me/users", requireAuth("cliente_master"), async (req, res) => {
  const auth = getAuth(req);
  const companyId = auth.entityId;
  if (typeof companyId !== "number") { res.status(400).json({ error: "Empresa não identificada" }); return; }
  const { name, email, role = "cliente_master" } = req.body as { name?: string; email?: string; role?: string };
  if (!name?.trim() || !email?.trim()) { res.status(400).json({ error: "Nome e e-mail são obrigatórios" }); return; }
  if (!["cliente_master", "cliente_subadmin"].includes(role)) { res.status(400).json({ error: "Perfil inválido" }); return; }

  try {
    const emailLower = email.trim().toLowerCase();
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, emailLower)).limit(1);
    if (existing.length > 0) { res.status(409).json({ error: "E-mail já cadastrado no sistema" }); return; }

    const initialPassword = generateInitialPassword();
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    const [user] = await db.insert(usersTable).values({
      name: name.trim(),
      email: emailLower,
      passwordHash,
      role: role as "cliente_master" | "cliente_subadmin",
      entityId: companyId,
      entityType: "company",
      forcePasswordChange: true,
      isActive: true,
    }).returning();

    if (!user) throw new Error("Erro ao criar usuário");
    await logAudit({
      userId: auth.sub as number,
      userEmail: auth.email,
      companyId,
      action: "create_company_user",
      entityType: "user",
      entityId: user.id,
      newValue: { name: user.name, email: user.email, role: user.role },
    });

    res.status(201).json({ ...publicCompanyUser(user), initialPassword });
  } catch (err) {
    req.log.error({ err }, "Error creating my company user");
    res.status(500).json({ error: "Erro interno" });
  }
});

router.delete("/me/users/:userId", requireAuth("cliente_master"), async (req, res) => {
  const auth = getAuth(req);
  const companyId = auth.entityId;
  const userId = parseInt(req.params.userId as string, 10);
  if (typeof companyId !== "number") { res.status(400).json({ error: "Empresa não identificada" }); return; }
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido" }); return; }
  if (typeof auth.sub === "number" && auth.sub === userId) { res.status(400).json({ error: "Você não pode excluir a própria conta" }); return; }

  try {
    const [user] = await db.select().from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.entityId, companyId), inArray(usersTable.role, ["cliente_master", "cliente_subadmin"])))
      .limit(1);
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }

    const masters = await db.select({ id: usersTable.id }).from(usersTable)
      .where(and(eq(usersTable.entityId, companyId), eq(usersTable.role, "cliente_master")));
    if (user.role === "cliente_master" && masters.length <= 1) {
      res.status(400).json({ error: "Não é possível excluir o último master da empresa" }); return;
    }

    const [company] = await db.select({ masterUserId: companiesTable.masterUserId }).from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
    if (company?.masterUserId === userId) {
      const replacement = masters.find(master => master.id !== userId);
      await db.update(companiesTable).set({ masterUserId: replacement?.id ?? null, updatedAt: new Date() }).where(eq(companiesTable.id, companyId));
    }

    await db.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.userId, userId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
    await logAudit({
      userId: auth.sub as number,
      userEmail: auth.email,
      companyId,
      action: "delete_company_user",
      entityType: "user",
      entityId: userId,
      newValue: { email: user.email, role: user.role },
    });
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting my company user");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Feriados personalizados: listar ── */
router.get("/me/holidays", requireAuth("cliente_master", "cliente_subadmin"), async (req, res) => {
  const auth = getAuth(req);
  const companyId = auth.entityId;
  if (!companyId) { res.status(400).json({ error: "Empresa não identificada" }); return; }
  try {
    const holidays = await db
      .select()
      .from(companyHolidaysTable)
      .where(eq(companyHolidaysTable.companyId, companyId))
      .orderBy(companyHolidaysTable.date);
    res.json(holidays.map(h => ({ id: h.id, date: h.date, label: h.label })));
  } catch (err) {
    req.log.error({ err }, "Error listing holidays");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Feriados personalizados: adicionar ── */
router.post("/me/holidays", requireAuth("cliente_master", "cliente_subadmin"), async (req, res) => {
  const auth = getAuth(req);
  const companyId = auth.entityId;
  if (!companyId) { res.status(400).json({ error: "Empresa não identificada" }); return; }
  const { date, label } = req.body as { date?: string; label?: string };
  if (!date || !label?.trim()) { res.status(400).json({ error: "Data e nome são obrigatórios" }); return; }
  try {
    const [holiday] = await db
      .insert(companyHolidaysTable)
      .values({ companyId, date, label: label.trim() })
      .onConflictDoUpdate({ target: [companyHolidaysTable.companyId, companyHolidaysTable.date], set: { label: label.trim() } })
      .returning();
    res.status(201).json({ id: holiday!.id, date: holiday!.date, label: holiday!.label });
  } catch (err) {
    req.log.error({ err }, "Error adding holiday");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ── Feriados personalizados: remover ── */
router.delete("/me/holidays/:id", requireAuth("cliente_master", "cliente_subadmin"), async (req, res) => {
  const auth = getAuth(req);
  const companyId = auth.entityId;
  if (!companyId) { res.status(400).json({ error: "Empresa não identificada" }); return; }
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    await db
      .delete(companyHolidaysTable)
      .where(eq(companyHolidaysTable.id, id));
    res.json({ deleted: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting holiday");
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
