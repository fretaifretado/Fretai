import { Router } from "express";
import { db } from "@workspace/db";
import {
  scheduledMovementsTable,
  scheduledMovementTargetsTable,
  purchaseOrdersTable,
  employeesTable,
  companyShiftsTable,
} from "@workspace/db/schema";
import { and, eq, lt, lte, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { requireAuth, getAuth } from "../middlewares/auth";
import { logAudit } from "../services/audit";
import { periodLabelFromDate } from "../services/financial-summary";
 
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

function normalizeTurnoKey(name: string): string {
  return (name || "").toLowerCase().replace(/\s+/g, "");
}

const DIAS_ORDEM = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"] as const;

function normalizeEscala(escala: string | null | undefined): string {
  return (escala ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function weekdaysFromEscala(escala: string | null | undefined): Set<number> | null {
  const parts = normalizeEscala(escala).split("/");
  if (parts.length !== 2) return null;
  const fromIdx = DIAS_ORDEM.indexOf(parts[0] as typeof DIAS_ORDEM[number]);
  const toIdx = DIAS_ORDEM.indexOf(parts[1] as typeof DIAS_ORDEM[number]);
  if (fromIdx < 0 || toIdx < 0) return null;

  const weekdays = new Set<number>();
  for (let i = 0; i < DIAS_ORDEM.length; i++) {
    const inRange = toIdx >= fromIdx
      ? i >= fromIdx && i <= toIdx
      : i >= fromIdx || i <= toIdx;
    if (!inRange) continue;
    weekdays.add(i === 6 ? 0 : i + 1);
  }
  return weekdays;
}

function inferTipoEscala(turnoNome: string, turno?: { tipoEscala: string; escala: string; entrada: string; saida: string } | null): string {
  const explicit = turno?.tipoEscala?.trim();
  if (explicit) return explicit;

  const escala = normalizeEscala(turno?.escala);
  const explicitWeekdays = weekdaysFromEscala(escala);
  if (explicitWeekdays?.size === 5) return "5x2";
  if (explicitWeekdays?.size === 6) return "6x1";
  if (escala === "12X36") return "12x36";
  if (escala === "24X48") return "24x48";

  const key = normalizeTurnoKey(`${turnoNome} ${turno?.entrada ?? ""} ${turno?.saida ?? ""}`);
  if (key.includes("adm") || key.includes("administrativo") || key.includes("08:00") || key.includes("17:30")) return "5x2";
  if (key.includes("primeiro") || key.includes("segundo") || key.includes("terceiro")) return "6x1";
  return "6x1";
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return startOfDay(value);
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return startOfDay(new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return startOfDay(new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : startOfDay(fallback);
}

function money(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isWorkingDay(wd: number, tipoEscala: string, escala?: string | null): boolean {
  const explicitWeekdays = weekdaysFromEscala(escala);
  if (explicitWeekdays) return explicitWeekdays.has(wd);
  if (tipoEscala === "5x2") return wd >= 1 && wd <= 5;
  if (tipoEscala === "6x1") return wd >= 1 && wd <= 6;
  return true;
}

function countWorkDays(from: Date, to: Date, tipoEscala: string, anchor?: Date | null, escala?: string | null): number {
  if (from > to) return 0;
  let count = 0;
  const cur = startOfDay(from);
  const end = startOfDay(to);
  if ((tipoEscala === "12x36" || tipoEscala === "24x48") && anchor) {
    const period = tipoEscala === "12x36" ? 2 : 3;
    const anchorTime = startOfDay(anchor).getTime();
    while (cur <= end) {
      const diff = Math.round((cur.getTime() - anchorTime) / 86400000);
      if (diff >= 0 && diff % period === 0) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }
  while (cur <= end) {
    const wd = cur.getDay();
    if (isWorkingDay(wd, tipoEscala, escala)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

async function insertUnusedValeDiscount(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    companyId: number;
    employeeId: number;
    effectiveDateIso: string;
    fallbackName: string;
    discountTurno: string;
  },
): Promise<{ vales: number; total: number }> {
  const effectiveDate = parseDate(params.effectiveDateIso);
  if (!effectiveDate) return { vales: 0, total: 0 };

  const existingDiscount = await tx
    .select({ id: purchaseOrdersTable.id })
    .from(purchaseOrdersTable)
    .where(and(
      eq(purchaseOrdersTable.companyId, params.companyId),
      eq(purchaseOrdersTable.employeeId, params.employeeId),
      eq(purchaseOrdersTable.dataInicio, params.effectiveDateIso),
      eq(purchaseOrdersTable.dataFim, params.effectiveDateIso),
      lt(purchaseOrdersTable.vales, 0),
      ne(purchaseOrdersTable.status, "Cancelado"),
    ))
    .limit(1);
  if (existingDiscount.length > 0) return { vales: 0, total: 0 };

  const [employeeRow, activeOrders, shifts] = await Promise.all([
    tx
      .select({
        name: employeesTable.name,
        operationStart: employeesTable.operationStart,
        admissionDate: employeesTable.admissionDate,
      })
      .from(employeesTable)
      .where(eq(employeesTable.id, params.employeeId))
      .limit(1),
    tx
      .select()
      .from(purchaseOrdersTable)
      .where(and(
        eq(purchaseOrdersTable.companyId, params.companyId),
        eq(purchaseOrdersTable.employeeId, params.employeeId),
        ne(purchaseOrdersTable.status, "Cancelado"),
      )),
    tx.select().from(companyShiftsTable).where(eq(companyShiftsTable.companyId, params.companyId)),
  ]);

  let discountVales = 0;
  let discountTotal = 0;
  const anchor = parseDate(employeeRow[0]?.operationStart ?? employeeRow[0]?.admissionDate);

  for (const order of activeOrders.filter(o => o.vales > 0)) {
    const inicio = parseDate(order.dataInicio);
    const fim = parseDate(order.dataFim);
    if (!fim || effectiveDate > fim) continue;

    const from = inicio && effectiveDate < inicio ? inicio : effectiveDate;
    const turno = shifts.find(s => normalizeTurnoKey(s.nome) === normalizeTurnoKey(order.turno));
    const tipoEscala = inferTipoEscala(order.turno, turno);
    const remainingDays = inicio ? countWorkDays(from, fim, tipoEscala, anchor, turno?.escala) : 0;
    const unusedVales = Math.min(order.vales, Math.max(0, remainingDays * 2));
    if (unusedVales <= 0) continue;

    const valorUnit = money(order.valorUnit);
    discountVales += unusedVales;
    discountTotal += unusedVales * valorUnit;
  }

  if (discountVales <= 0 || discountTotal <= 0) return { vales: 0, total: 0 };

  const total = roundMoney(discountTotal);
  const valorUnit = roundMoney(total / discountVales);
  await tx.insert(purchaseOrdersTable).values({
    companyId: params.companyId,
    employeeId: params.employeeId,
    nome: employeeRow[0]?.name ?? params.fallbackName,
    turno: params.discountTurno,
    periodo: periodLabelFromDate(effectiveDate),
    dataInicio: params.effectiveDateIso,
    dataFim: params.effectiveDateIso,
    dias: 0,
    vales: -discountVales,
    valorUnit: String(valorUnit),
    total: String(-total),
    status: "Aprovado",
    proRata: false,
  });

  return { vales: discountVales, total };
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
          inicio: scheduledMovementsTable.inicio,
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
          await insertUnusedValeDiscount(tx, {
            companyId: oldCompanyId,
            employeeId: t.colaboradorId,
            effectiveDateIso: mv.inicio,
            fallbackName: "Colaborador transferido",
            discountTurno: "Desconto por transferência",
          });
 
          // 4) Update employee's companyId to the new filial
          await tx.update(employeesTable)
            .set({ companyId: mv.filialIdNovo, updatedAt: new Date() })
            .where(eq(employeesTable.id, t.colaboradorId));
        }
      }

      // ── Mudança de status inativo: cancelar vales e gerar crédito ──────────
      // Quando um agendamento de tipo "status" é ativado para um status inativo
      // (Desligado, Férias, Licença, Afastado), precisamos:
      // 1) Cancelar todos os pedidos de compra ativos/aprovados
      // 2) Registrar um pedido de desconto (vales não utilizados)
      // 3) Atualizar o status do colaborador na tabela employees
      const INACTIVE_STATUSES = ["Desligado", "Férias", "Licença", "Afastado"];
      const statusMovements = await tx
        .select({
          id: scheduledMovementsTable.id,
          tipo: scheduledMovementsTable.tipo,
          valorNovo: scheduledMovementsTable.valorNovo,
          inicio: scheduledMovementsTable.inicio,
        })
        .from(scheduledMovementsTable)
        .where(and(
          inArray(scheduledMovementsTable.id, ids),
          eq(scheduledMovementsTable.tipo, "status"),
        ));

      for (const mv of statusMovements) {
        if (!INACTIVE_STATUSES.includes(mv.valorNovo)) continue;

        // Get all targets (colaboradores) of this movement
        const targets = await tx
          .select({
            colaboradorId: scheduledMovementTargetsTable.colaboradorId,
            valorAnterior: scheduledMovementTargetsTable.valorAnterior,
          })
          .from(scheduledMovementTargetsTable)
          .where(eq(scheduledMovementTargetsTable.scheduledMovementId, mv.id));

        for (const t of targets) {
          await insertUnusedValeDiscount(tx, {
            companyId,
            employeeId: t.colaboradorId,
            effectiveDateIso: mv.inicio,
            fallbackName: "Colaborador desligado",
            discountTurno: "Desconto por status",
          });

          // Only update employee's status on the actual activation date
          if (mv.inicio === today) {
            await tx.update(employeesTable)
              .set({ status: mv.valorNovo, updatedAt: new Date() })
              .where(eq(employeesTable.id, t.colaboradorId));
          }
        }
      }
    }

    // ── Processar agendamentos ativos sem créditos gerados (retroativo) ──────────
    // Verifica agendamentos de status inativo que já estão ativos mas não tiveram
    // os créditos gerados, e gera os créditos retroativamente
    const INACTIVE_STATUSES = ["Desligado", "Férias", "Licença", "Afastado"];
    const activeStatusMovements = await tx
      .select({
        id: scheduledMovementsTable.id,
        tipo: scheduledMovementsTable.tipo,
        valorNovo: scheduledMovementsTable.valorNovo,
        inicio: scheduledMovementsTable.inicio,
      })
      .from(scheduledMovementsTable)
      .where(and(
        eq(scheduledMovementsTable.companyId, companyId),
        eq(scheduledMovementsTable.estado, "ativo"),
        eq(scheduledMovementsTable.tipo, "status"),
      ));

    for (const mv of activeStatusMovements) {
      if (!INACTIVE_STATUSES.includes(mv.valorNovo)) continue;

      // Get all targets (colaboradores) of this movement
      const targets = await tx
        .select({
          colaboradorId: scheduledMovementTargetsTable.colaboradorId,
          appliedAt: scheduledMovementTargetsTable.appliedAt,
        })
        .from(scheduledMovementTargetsTable)
        .where(eq(scheduledMovementTargetsTable.scheduledMovementId, mv.id));

      for (const t of targets) {
        // Check if a discount entry already exists for this employee on the movement start date
        const existingDiscount = await tx
          .select()
          .from(purchaseOrdersTable)
          .where(and(
            eq(purchaseOrdersTable.companyId, companyId),
            eq(purchaseOrdersTable.employeeId, t.colaboradorId),
            eq(purchaseOrdersTable.dataInicio, mv.inicio),
            eq(purchaseOrdersTable.dataFim, mv.inicio),
            lt(purchaseOrdersTable.vales, 0), // negative = discount
          ))
          .limit(1);

        if (existingDiscount.length > 0) {
          // Credit already generated, skip
          continue;
        }

        await insertUnusedValeDiscount(tx, {
          companyId,
          employeeId: t.colaboradorId,
          effectiveDateIso: mv.inicio,
          fallbackName: "Colaborador desligado",
          discountTurno: "Desconto por status",
        });

        // Only update employee's status on the actual activation date
        if (mv.inicio === today) {
          await tx.update(employeesTable)
            .set({ status: mv.valorNovo, updatedAt: new Date() })
            .where(eq(employeesTable.id, t.colaboradorId));
        }
      }
    }
 
    // 3) ativo whose end has passed → concluido (revert effect on targets).
    // For status movements without end date (e.g., desligado), transition to concluido the day after start date
    const completedRows = await tx.update(scheduledMovementsTable)
      .set({ estado: "concluido", updatedAt: new Date() })
      .where(and(
        eq(scheduledMovementsTable.companyId, companyId),
        eq(scheduledMovementsTable.estado, "ativo"),
        sql`(${scheduledMovementsTable.fim} < ${today} OR (${scheduledMovementsTable.fim} = '9999-12-31' AND ${scheduledMovementsTable.inicio} < ${today}))`,
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
