import { Router } from "express";
import { db } from "@workspace/db";
import {
  scheduledMovementsTable,
  scheduledMovementTargetsTable,
  purchaseOrdersTable,
  employeesTable,
} from "@workspace/db/schema";
import { and, eq, lt, lte, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { requireAuth, getAuth } from "../middlewares/auth";
import { logAudit } from "../services/audit";
 
const router = Router();
 
type Tipo = "turno" | "status" | "filial";
type Estado = "pendente" | "ativo" | "concluido";
 
interface AlvoBody {
  colaboradorId: number;
  valorAnterior?: string;
  filialIdAnterior?: number | null;
}
 
function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
 
const VALID_TIPOS: ReadonlyArray<Tipo> = ["turno", "status", "filial"];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
 
function isValidIsoDate(v: unknown): v is string {
  return typeof v === "string" && ISO_DATE_RE.test(v);
}
 
/**
 * Idempotently advances scheduled-movement states for a company AND records
 * the apply/revert effect on each target inside the same transaction.
 *
 *  - pendente whose window has fully passed (today > fim) → concluido directly,
 *    and targets get both applied_at and reverted_at set (skipped window:
 *    no net change should be visible to clients).
 *  - pendente whose start has arrived (inicio <= today <= fim) → ativo,
 *    and targets get applied_at set.
 *  - ativo whose end has passed (today > fim) → concluido, and targets
 *    get reverted_at set.
 *
 * Idempotent: reapplying never overwrites an existing applied_at/reverted_at
 * (we use COALESCE / "where applied_at IS NULL" guards), and the state
 * transitions are gated on the prior state.
 */
async function advanceStatesForCompany(companyId: number): Promise<void> {
  const today = todayIso();
  await db.transaction(async tx => {
    // 1) pendente that already passed → concluido (skipped window).
    //    Capture the affected ids so we can also stamp their targets.
    const skippedRows = await tx.update(scheduledMovementsTable)
      .set({ estado: "concluido", updatedAt: new Date() })
      .where(and(
        eq(scheduledMovementsTable.companyId, companyId),
        eq(scheduledMovementsTable.estado, "pendente"),
        lt(scheduledMovementsTable.fim, today),
      ))
      .returning({ id: scheduledMovementsTable.id });
    if (skippedRows.length > 0) {
      const ids = skippedRows.map(r => r.id);
      await tx.update(scheduledMovementTargetsTable)
        .set({ appliedAt: sql`COALESCE(applied_at, NOW())`, revertedAt: sql`COALESCE(reverted_at, NOW())` })
        .where(inArray(scheduledMovementTargetsTable.scheduledMovementId, ids));
    }
 
    // 2) pendente whose start has arrived → ativo (apply effect on targets).
    const activatedRows = await tx.update(scheduledMovementsTable)
      .set({ estado: "ativo", updatedAt: new Date() })
      .where(and(
        eq(scheduledMovementsTable.companyId, companyId),
        eq(scheduledMovementsTable.estado, "pendente"),
        lte(scheduledMovementsTable.inicio, today),
        gte(scheduledMovementsTable.fim, today),
      ))
      .returning({ id: scheduledMovementsTable.id });
    if (activatedRows.length > 0) {
      const ids = activatedRows.map(r => r.id);
      await tx.update(scheduledMovementTargetsTable)
        .set({ appliedAt: sql`NOW()` })
        .where(and(
          inArray(scheduledMovementTargetsTable.scheduledMovementId, ids),
          isNull(scheduledMovementTargetsTable.appliedAt),
        ));
 
      // ── Transferência de filial: cancelar vales e zerar créditos ──────────
      // Quando um agendamento de tipo "filial" é ativado, o colaborador
      // muda de empresa. Precisamos:
      // 1) Cancelar todos os pedidos de compra ativos/aprovados dele na empresa antiga
      // 2) Registrar um pedido de desconto (vales não utilizados)
      // 3) Atualizar o companyId do colaborador na tabela employees
      const filialMovements = await tx
        .select({
          id: scheduledMovementsTable.id,
          tipo: scheduledMovementsTable.tipo,
          filialIdNovo: scheduledMovementsTable.filialIdNovo,
        })
        .from(scheduledMovementsTable)
        .where(and(
          inArray(scheduledMovementsTable.id, ids),
          eq(scheduledMovementsTable.tipo, "filial"),
        ));
 
      for (const mv of filialMovements) {
        if (!mv.filialIdNovo) continue;
 
        // Get all targets (colaboradores) of this movement
        const targets = await tx
          .select({
            colaboradorId: scheduledMovementTargetsTable.colaboradorId,
            filialIdAnterior: scheduledMovementTargetsTable.filialIdAnterior,
          })
          .from(scheduledMovementTargetsTable)
          .where(eq(scheduledMovementTargetsTable.scheduledMovementId, mv.id));
 
        for (const t of targets) {
          const oldCompanyId = t.filialIdAnterior ?? companyId;
 
          // 1) Get approved/pending purchase orders for this employee in old company
          const activeOrders = await tx
            .select()
            .from(purchaseOrdersTable)
            .where(and(
              eq(purchaseOrdersTable.companyId, oldCompanyId),
              eq(purchaseOrdersTable.employeeId, t.colaboradorId),
              ne(purchaseOrdersTable.status, "Cancelado"),
            ));
 
          if (activeOrders.length > 0) {
            // 2) Cancel all active orders
            await tx.update(purchaseOrdersTable)
              .set({ status: "Cancelado", updatedAt: new Date() })
              .where(and(
                eq(purchaseOrdersTable.companyId, oldCompanyId),
                eq(purchaseOrdersTable.employeeId, t.colaboradorId),
                ne(purchaseOrdersTable.status, "Cancelado"),
              ));
 
            // 3) Create a "desconto" entry representing unused vales
            const totalValesNaoUsados = activeOrders.reduce((s, o) => s + o.vales, 0);
            const totalValor = activeOrders.reduce((s, o) => s + parseFloat(String(o.total)), 0);
 
            if (totalValesNaoUsados > 0) {
              const employeeRow = await tx
                .select({ name: employeesTable.name })
                .from(employeesTable)
                .where(eq(employeesTable.id, t.colaboradorId))
                .limit(1);
 
              await tx.insert(purchaseOrdersTable).values({
                companyId: oldCompanyId,
                employeeId: t.colaboradorId,
                nome: employeeRow[0]?.name ?? "Colaborador transferido",
                turno: "—",
                periodo: "Transferência de filial",
                dataInicio: today,
                dataFim: today,
                dias: 0,
                vales: -totalValesNaoUsados,       // negativo = desconto
                valorUnit: "0",
                total: String(-totalValor.toFixed(2)), // negativo = estorno
                status: "Aprovado",
                proRata: false,
              });
            }
          }
 
          // 4) Update employee's companyId to the new filial
          await tx.update(employeesTable)
            .set({ companyId: mv.filialIdNovo, updatedAt: new Date() })
            .where(eq(employeesTable.id, t.colaboradorId));
        }
      }
    }
 
    // 3) ativo whose end has passed → concluido (revert effect on targets).
    const completedRows = await tx.update(scheduledMovementsTable)
      .set({ estado: "concluido", updatedAt: new Date() })
      .where(and(
        eq(scheduledMovementsTable.companyId, companyId),
        eq(scheduledMovementsTable.estado, "ativo"),
        lt(scheduledMovementsTable.fim, today),
      ))
      .returning({ id: scheduledMovementsTable.id });
    if (completedRows.length > 0) {
      const ids = completedRows.map(r => r.id);
      await tx.update(scheduledMovementTargetsTable)
        .set({ revertedAt: sql`NOW()` })
        .where(and(
          inArray(scheduledMovementTargetsTable.scheduledMovementId, ids),
          isNull(scheduledMovementTargetsTable.revertedAt),
        ));
    }
  });
}
 
interface AgendamentoApi {
  id: number;
  tipo: Tipo;
  valorNovo: string;
  filialIdNovo: number | null;
  inicio: string;
  fim: string;
  estado: Estado;
  criadoEm: string;
  alvos: {
    colaboradorId: number;
    valorAnterior: string;
    filialIdAnterior: number | null;
    appliedAt: string | null;
    revertedAt: string | null;
  }[];
}
 
async function listAgendamentos(companyId: number): Promise<AgendamentoApi[]> {
  const rows = await db.select().from(scheduledMovementsTable)
    .where(eq(scheduledMovementsTable.companyId, companyId));
  if (rows.length === 0) return [];
  const ids = rows.map(r => r.id);
  const targets = await db.select().from(scheduledMovementTargetsTable)
    .where(inArray(scheduledMovementTargetsTable.scheduledMovementId, ids));
  const byMov = new Map<number, typeof targets>();
  for (const t of targets) {
    const arr = byMov.get(t.scheduledMovementId) ?? [];
    arr.push(t);
    byMov.set(t.scheduledMovementId, arr);
  }
  return rows.map(r => ({
    id: r.id,
    tipo: r.tipo as Tipo,
    valorNovo: r.valorNovo,
    filialIdNovo: r.filialIdNovo,
    inicio: r.inicio,
    fim: r.fim,
    estado: r.estado as Estado,
    criadoEm: r.createdAt?.toISOString?.() ?? String(r.createdAt),
    alvos: (byMov.get(r.id) ?? []).map(t => ({
      colaboradorId: t.colaboradorId,
      valorAnterior: t.valorAnterior,
      filialIdAnterior: t.filialIdAnterior,
      appliedAt: t.appliedAt ? t.appliedAt.toISOString() : null,
      revertedAt: t.revertedAt ? t.revertedAt.toISOString() : null,
    })),
  }));
}
 
/* ── Admin: listar agendamentos de uma empresa ── */
router.get("/admin/companies/:id/scheduled-movements",
  requireAuth("platform_admin"),
  async (req, res) => {
    const companyId = parseInt(req.params.id as string, 10);
    if (isNaN(companyId)) {
      res.status(400).json({ error: "ID inválido" }); return;
    }
    try {
      await advanceStatesForCompany(companyId);
      const list = await listAgendamentos(companyId);
      res.json(list);
    } catch (err) {
      req.log.error({ err }, "Admin: error listing scheduled movements");
      res.status(500).json({ error: "Erro interno" });
    }
  });
 
/* ---------- Listar ---------- */
router.get("/me/scheduled-movements",
  requireAuth("cliente_master", "cliente_subadmin"),
  async (req, res) => {
    const auth = getAuth(req);
    const companyId = auth.entityId;
    if (typeof companyId !== "number") {
      res.status(403).json({ error: "Sem empresa associada" }); return;
    }
    try {
      await advanceStatesForCompany(companyId);
      const list = await listAgendamentos(companyId);
      res.json(list);
    } catch (err) {
      req.log.error({ err }, "Error listing scheduled movements");
      res.status(500).json({ error: "Erro interno" });
    }
  });
 
/* ---------- Criar ---------- */
router.post("/me/scheduled-movements",
  requireAuth("cliente_master", "cliente_subadmin"),
  async (req, res) => {
    const auth = getAuth(req);
    const companyId = auth.entityId;
    if (typeof companyId !== "number") {
      res.status(403).json({ error: "Sem empresa associada" }); return;
    }
    const body = req.body as {
      tipo?: string;
      valorNovo?: string;
      filialIdNovo?: number | null;
      inicio?: string;
      fim?: string;
      alvos?: AlvoBody[];
    };
 
    if (!body.tipo || !VALID_TIPOS.includes(body.tipo as Tipo)) {
      res.status(400).json({ error: "Tipo inválido" }); return;
    }
    if (!body.valorNovo || typeof body.valorNovo !== "string") {
      res.status(400).json({ error: "valorNovo é obrigatório" }); return;
    }
    if (!isValidIsoDate(body.inicio) || !isValidIsoDate(body.fim)) {
      res.status(400).json({ error: "Datas inválidas" }); return;
    }
    if (body.fim < body.inicio) {
      res.status(400).json({ error: "fim deve ser >= inicio" }); return;
    }
    if (!Array.isArray(body.alvos) || body.alvos.length === 0) {
      res.status(400).json({ error: "Lista de alvos não pode ser vazia" }); return;
    }
    if (body.tipo === "filial" && (typeof body.filialIdNovo !== "number")) {
      res.status(400).json({ error: "filialIdNovo é obrigatório para tipo=filial" }); return;
    }
 
    try {
      const created = await db.transaction(async tx => {
        const [row] = await tx.insert(scheduledMovementsTable).values({
          companyId,
          tipo: body.tipo as Tipo,
          valorNovo: body.valorNovo!,
          filialIdNovo: body.filialIdNovo ?? null,
          inicio: body.inicio!,
          fim: body.fim!,
          estado: "pendente",
          createdByUserId: typeof auth.sub === "number" ? auth.sub : null,
        }).returning();
        if (!row) throw new Error("insert failed");
        const targetRows = body.alvos!.map(a => ({
          scheduledMovementId: row.id,
          colaboradorId: a.colaboradorId,
          valorAnterior: a.valorAnterior ?? "",
          filialIdAnterior: a.filialIdAnterior ?? null,
        }));
        await tx.insert(scheduledMovementTargetsTable).values(targetRows);
        return row;
      });
 
      // advance immediately so the response reflects the correct state
      await advanceStatesForCompany(companyId);
      const list = await listAgendamentos(companyId);
      const fresh = list.find(a => a.id === created.id);
 
      await logAudit({
        userId: typeof auth.sub === "number" ? auth.sub : 0,
        userEmail: auth.email,
        companyId,
        action: "create_scheduled_movement",
        entityType: "scheduled_movement",
        entityId: created.id,
        newValue: { tipo: body.tipo, valorNovo: body.valorNovo, inicio: body.inicio, fim: body.fim, alvos: body.alvos!.length },
      });
 
      res.status(201).json(fresh ?? null);
    } catch (err) {
      req.log.error({ err }, "Error creating scheduled movement");
      res.status(500).json({ error: "Erro interno" });
    }
  });
 
/* ---------- Editar (apenas pendente) ---------- */
router.patch("/me/scheduled-movements/:id",
  requireAuth("cliente_master", "cliente_subadmin"),
  async (req, res) => {
    const auth = getAuth(req);
    const companyId = auth.entityId;
    if (typeof companyId !== "number") {
      res.status(403).json({ error: "Sem empresa associada" }); return;
    }
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
    const body = req.body as {
      inicio?: string;
      fim?: string;
      alvos?: AlvoBody[];
    };
    if (!isValidIsoDate(body.inicio) || !isValidIsoDate(body.fim)) {
      res.status(400).json({ error: "Datas inválidas" }); return;
    }
    if (body.fim < body.inicio) {
      res.status(400).json({ error: "fim deve ser >= inicio" }); return;
    }
    if (!Array.isArray(body.alvos) || body.alvos.length === 0) {
      res.status(400).json({ error: "Lista de alvos não pode ser vazia" }); return;
    }
 
    try {
      await advanceStatesForCompany(companyId);
      const [row] = await db.select().from(scheduledMovementsTable)
        .where(and(
          eq(scheduledMovementsTable.id, id),
          eq(scheduledMovementsTable.companyId, companyId),
        ));
      if (!row) { res.status(404).json({ error: "Agendamento não encontrado" }); return; }
      if (row.estado !== "pendente") {
        res.status(409).json({ error: "Só é possível editar agendamentos pendentes" }); return;
      }
 
      await db.transaction(async tx => {
        await tx.update(scheduledMovementsTable).set({
          inicio: body.inicio!,
          fim: body.fim!,
          updatedAt: new Date(),
        }).where(eq(scheduledMovementsTable.id, id));
        await tx.delete(scheduledMovementTargetsTable)
          .where(eq(scheduledMovementTargetsTable.scheduledMovementId, id));
        await tx.insert(scheduledMovementTargetsTable).values(
          body.alvos!.map(a => ({
            scheduledMovementId: id,
            colaboradorId: a.colaboradorId,
            valorAnterior: a.valorAnterior ?? "",
            filialIdAnterior: a.filialIdAnterior ?? null,
          })),
        );
      });
 
      await advanceStatesForCompany(companyId);
      const list = await listAgendamentos(companyId);
      const fresh = list.find(a => a.id === id);
      res.json(fresh ?? null);
    } catch (err) {
      req.log.error({ err }, "Error updating scheduled movement");
      res.status(500).json({ error: "Erro interno" });
    }
  });
 
/* ---------- Cancelar ----------
 * Pendente: deleta a linha (nunca esteve aplicado).
 * Ativo:    transaciona estado=concluido + reverted_at=NOW() em todos os
 *           targets cujo reverted_at ainda é NULL. Isso registra de forma
 *           autoritativa, no banco, que o efeito foi revertido — clientes
 *           apenas projetam (deterministicamente) esse estado para a tela.
 * Concluido: 409.
 */
router.delete("/me/scheduled-movements/:id",
  requireAuth("cliente_master", "cliente_subadmin"),
  async (req, res) => {
    const auth = getAuth(req);
    const companyId = auth.entityId;
    if (typeof companyId !== "number") {
      res.status(403).json({ error: "Sem empresa associada" }); return;
    }
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
    try {
      await advanceStatesForCompany(companyId);
      const [row] = await db.select().from(scheduledMovementsTable)
        .where(and(
          eq(scheduledMovementsTable.id, id),
          eq(scheduledMovementsTable.companyId, companyId),
        ));
      if (!row) { res.status(404).json({ error: "Agendamento não encontrado" }); return; }
 
      if (row.estado === "pendente") {
        await db.delete(scheduledMovementsTable).where(eq(scheduledMovementsTable.id, id));
        await logAudit({
          userId: typeof auth.sub === "number" ? auth.sub : 0,
          userEmail: auth.email,
          companyId,
          action: "cancel_scheduled_movement",
          entityType: "scheduled_movement",
          entityId: id,
          oldValue: { estado: "pendente" },
        });
        res.status(204).end();
        return;
      }
      if (row.estado === "ativo") {
        await db.transaction(async tx => {
          await tx.update(scheduledMovementsTable)
            .set({ estado: "concluido", updatedAt: new Date() })
            .where(eq(scheduledMovementsTable.id, id));
          await tx.update(scheduledMovementTargetsTable)
            .set({ revertedAt: sql`NOW()` })
            .where(and(
              eq(scheduledMovementTargetsTable.scheduledMovementId, id),
              isNull(scheduledMovementTargetsTable.revertedAt),
            ));
        });
        await logAudit({
          userId: typeof auth.sub === "number" ? auth.sub : 0,
          userEmail: auth.email,
          companyId,
          action: "cancel_scheduled_movement",
          entityType: "scheduled_movement",
          entityId: id,
          oldValue: { estado: "ativo" },
          newValue: { estado: "concluido" },
        });
        res.status(204).end();
        return;
      }
      res.status(409).json({ error: "Agendamento já concluído" });
    } catch (err) {
      req.log.error({ err }, "Error cancelling scheduled movement");
      res.status(500).json({ error: "Erro interno" });
    }
  });
 
export default router;