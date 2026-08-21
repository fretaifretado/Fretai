import { Router, type Response } from "express";
import { db } from "@workspace/db";
import {
  scheduledMovementsTable,
  scheduledMovementTargetsTable,
  purchaseOrdersTable,
  employeesTable,
  companyShiftsTable,
  companyHolidaysTable,
  companiesTable,
} from "@workspace/db/schema";
import { and, eq, lt, lte, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { requireAuth, getAuth } from "../middlewares/auth";
import { logAudit } from "../services/audit";
import { periodLabelFromDate } from "../services/financial-summary";
import { buildHolidaySet } from "../services/holiday-calendar";
 
const router = Router();
 
type Tipo = "turno" | "status" | "filial";
type Estado = "pendente" | "ativo" | "concluido";
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
 
interface AlvoBody {
  colaboradorId: number;
  valorAnterior?: string;
  filialIdAnterior?: number | null;
}

class ScheduleRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly conflictingCollaboratorIds: number[] = [],
  ) {
    super(message);
  }
}

const SCHEDULE_LOCK_NAMESPACE = 7124;

async function lockCompanySchedules(tx: DbTransaction, companyId: number): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${SCHEDULE_LOCK_NAMESPACE}, ${companyId})`);
}

async function assertValidTargets(
  tx: DbTransaction,
  companyId: number,
  tipo: Tipo,
  alvos: AlvoBody[],
): Promise<AlvoBody[]> {
  const ids = alvos.map(alvo => alvo.colaboradorId);
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new ScheduleRequestError(400, "INVALID_TARGETS", "Há colaboradores inválidos na seleção.");
  }
  if (new Set(ids).size !== ids.length) {
    throw new ScheduleRequestError(400, "DUPLICATE_TARGETS", "A seleção contém o mesmo colaborador mais de uma vez.");
  }

  const branches = await tx.select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.parentCompanyId, companyId));
  const allowedCompanyIds = [companyId, ...branches.map(branch => branch.id)];
  const employees = await tx
    .select({
      id: employeesTable.id,
      companyId: employeesTable.companyId,
      route: employeesTable.route,
      status: employeesTable.status,
    })
    .from(employeesTable)
    .where(and(
      inArray(employeesTable.companyId, allowedCompanyIds),
      inArray(employeesTable.id, ids),
    ));
  if (employees.length !== ids.length) {
    throw new ScheduleRequestError(400, "INVALID_TARGETS", "Um ou mais colaboradores não pertencem à empresa.");
  }
  const byId = new Map(employees.map(employee => [employee.id, employee]));
  return alvos.map(alvo => {
    const employee = byId.get(alvo.colaboradorId)!;
    return {
      colaboradorId: employee.id,
      valorAnterior: tipo === "turno" ? employee.route ?? "" : tipo === "status" ? employee.status ?? "" : "",
      filialIdAnterior: employee.companyId,
    };
  });
}

async function assertNoScheduleConflicts(
  tx: DbTransaction,
  params: {
    companyId: number;
    tipo: Tipo;
    valorNovo: string;
    filialIdNovo: number | null;
    inicio: string;
    fim: string;
    colaboradorIds: number[];
    excludeMovementId?: number;
  },
): Promise<void> {
  const conditions = [
    eq(scheduledMovementsTable.companyId, params.companyId),
    eq(scheduledMovementsTable.tipo, params.tipo),
    inArray(scheduledMovementTargetsTable.colaboradorId, params.colaboradorIds),
    lte(scheduledMovementsTable.inicio, params.fim),
    gte(scheduledMovementsTable.fim, params.inicio),
  ];
  if (params.excludeMovementId !== undefined) {
    conditions.push(ne(scheduledMovementsTable.id, params.excludeMovementId));
  }

  const conflicts = await tx
    .select({
      movementId: scheduledMovementsTable.id,
      estado: scheduledMovementsTable.estado,
      valorNovo: scheduledMovementsTable.valorNovo,
      filialIdNovo: scheduledMovementsTable.filialIdNovo,
      inicio: scheduledMovementsTable.inicio,
      fim: scheduledMovementsTable.fim,
      colaboradorId: scheduledMovementTargetsTable.colaboradorId,
    })
    .from(scheduledMovementsTable)
    .innerJoin(
      scheduledMovementTargetsTable,
      eq(scheduledMovementTargetsTable.scheduledMovementId, scheduledMovementsTable.id),
    )
    .where(and(...conditions));

  if (conflicts.length === 0) return;

  const exactIds = [...new Set(conflicts
    .filter(conflict =>
      conflict.valorNovo === params.valorNovo &&
      (conflict.filialIdNovo ?? null) === params.filialIdNovo &&
      conflict.inicio === params.inicio &&
      conflict.fim === params.fim,
    )
    .map(conflict => conflict.colaboradorId))];
  const overlappingIds = [...new Set(conflicts
    .filter(conflict => conflict.estado === "pendente" || conflict.estado === "ativo")
    .map(conflict => conflict.colaboradorId))];

  if (exactIds.length > 0) {
    throw new ScheduleRequestError(
      409,
      "DUPLICATE_SCHEDULE",
      `Já existe um agendamento idêntico para ${exactIds.length} colaborador${exactIds.length === 1 ? "" : "es"}.`,
      exactIds,
    );
  }

  if (overlappingIds.length === 0) return;

  throw new ScheduleRequestError(
    409,
    "OVERLAPPING_SCHEDULE",
    `${overlappingIds.length} colaborador${overlappingIds.length === 1 ? " possui" : "es possuem"} outro agendamento de ${params.tipo} no período selecionado.`,
    overlappingIds,
  );
}

function normalizeComparableValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function assertTargetsChangeValue(
  tipo: Tipo,
  valorNovo: string,
  filialIdNovo: number | null,
  alvos: AlvoBody[],
): void {
  const normalizedNewValue = normalizeComparableValue(valorNovo);
  const unchangedIds = alvos
    .filter(alvo => tipo === "filial"
      ? alvo.filialIdAnterior === filialIdNovo
      : normalizeComparableValue(alvo.valorAnterior) === normalizedNewValue)
    .map(alvo => alvo.colaboradorId);

  if (unchangedIds.length === 0) return;

  const destinationLabel = tipo === "status"
    ? `o status ${valorNovo}`
    : tipo === "turno"
      ? `o turno ${valorNovo}`
      : "a filial selecionada";
  throw new ScheduleRequestError(
    409,
    "NO_CHANGE",
    unchangedIds.length === 1
      ? `O colaborador selecionado já possui ${destinationLabel}.`
      : `${unchangedIds.length} colaboradores selecionados já possuem ${destinationLabel}.`,
    unchangedIds,
  );
}

async function assertValidDestinationCompany(
  tx: DbTransaction,
  rootCompanyId: number,
  destinationCompanyId: number | null,
): Promise<void> {
  if (destinationCompanyId === null) return;
  const [destination] = await tx.select({ id: companiesTable.id, parentCompanyId: companiesTable.parentCompanyId })
    .from(companiesTable)
    .where(eq(companiesTable.id, destinationCompanyId))
    .limit(1);
  if (!destination || (destination.id !== rootCompanyId && destination.parentCompanyId !== rootCompanyId)) {
    throw new ScheduleRequestError(400, "INVALID_DESTINATION", "A filial de destino não pertence à empresa.");
  }
}

function sendScheduleError(res: Response, err: unknown): boolean {
  if (!(err instanceof ScheduleRequestError)) return false;
  res.status(err.status).json({
    error: err.message,
    code: err.code,
    conflictingCollaboratorIds: err.conflictingCollaboratorIds,
  });
  return true;
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

function countWorkDays(from: Date, to: Date, tipoEscala: string, anchor?: Date | null, escala?: string | null, holidays = new Set<string>()): number {
  if (from > to) return 0;
  let count = 0;
  const cur = startOfDay(from);
  const end = startOfDay(to);
  if ((tipoEscala === "12x36" || tipoEscala === "24x48") && anchor) {
    const period = tipoEscala === "12x36" ? 2 : 3;
    const anchorTime = startOfDay(anchor).getTime();
    while (cur <= end) {
      const dateIso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      const diff = Math.round((cur.getTime() - anchorTime) / 86400000);
      if (!holidays.has(dateIso) && diff >= 0 && diff % period === 0) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }
  while (cur <= end) {
    const dateIso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    const wd = cur.getDay();
    if (!holidays.has(dateIso) && isWorkingDay(wd, tipoEscala, escala)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

async function insertUnusedValeDiscount(
  tx: DbTransaction,
  params: {
    companyId: number;
    employeeId: number;
    effectiveDateIso: string;
    fallbackName: string;
    discountTurno: string;
    fimPeriodoIso?: string; // Optional end date for temporary absences
    sourceKey: string;
  },
): Promise<{ vales: number; total: number }> {
  const effectiveDate = parseDate(params.effectiveDateIso);
  if (!effectiveDate) return { vales: 0, total: 0 };
  const fimPeriodo = params.fimPeriodoIso ? parseDate(params.fimPeriodoIso) : null;

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

  const [company] = await tx.select({ parentCompanyId: companiesTable.parentCompanyId })
    .from(companiesTable).where(eq(companiesTable.id, params.companyId)).limit(1);
  const calendarCompanyId = company?.parentCompanyId ?? params.companyId;
  const [employeeRow, activeOrders, shifts, customHolidays] = await Promise.all([
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
    tx.select().from(companyShiftsTable).where(eq(companyShiftsTable.companyId, calendarCompanyId)),
    tx.select({ date: companyHolidaysTable.date }).from(companyHolidaysTable).where(eq(companyHolidaysTable.companyId, calendarCompanyId)),
  ]);

  let discountVales = 0;
  let discountTotal = 0;
  const anchor = parseDate(employeeRow[0]?.operationStart ?? employeeRow[0]?.admissionDate);
  const holidays = buildHolidaySet(
    [effectiveDate.getFullYear() - 1, effectiveDate.getFullYear(), effectiveDate.getFullYear() + 1],
    customHolidays.map(holiday => holiday.date),
  );

  for (const order of activeOrders.filter(o => o.vales > 0)) {
    const inicio = parseDate(order.dataInicio);
    const fim = parseDate(order.dataFim);
    // Skip if order already ended before effective date
    if (fim && effectiveDate > fim) continue;

    const from = inicio && effectiveDate < inicio ? inicio : effectiveDate;
    const turno = shifts.find(s => normalizeTurnoKey(s.nome) === normalizeTurnoKey(order.turno));
    const tipoEscala = inferTipoEscala(order.turno, turno);
    
    // If fimPeriodo is provided (temporary absence), only discount days within that period
    // Otherwise (permanent separation), discount all remaining days
    const orderEnd = fimPeriodo ? (fim ? (fimPeriodo < fim ? fimPeriodo : fim) : fimPeriodo) : (fim || effectiveDate);
    const remainingDays = inicio ? countWorkDays(from, orderEnd, tipoEscala, anchor, turno?.escala, holidays) : 0;
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
    sourceKey: params.sourceKey,
  }).onConflictDoNothing();

  return { vales: discountVales, total };
}
 
const INACTIVE_STATUSES = new Set(["desligado", "demitido", "desligamento", "férias", "ferias", "licença", "licenca", "afastado", "home office"]);
const TEMPORARY_STATUSES = new Set(["férias", "ferias", "licença", "licenca", "afastado", "home office"]);
const TERMINAL_STATUSES = new Set(["desligado", "demitido", "desligamento"]);
const PERMANENT_END = "9999-12-31";

function isTerminalStatusMovement(movement: { tipo: string; valorNovo: string }): boolean {
  return movement.tipo === "status" && TERMINAL_STATUSES.has(movement.valorNovo.trim().toLowerCase());
}

async function applyMovement(tx: DbTransaction, movementId: number): Promise<void> {
  const [movement] = await tx.select().from(scheduledMovementsTable)
    .where(eq(scheduledMovementsTable.id, movementId)).limit(1);
  if (!movement) return;

  const targets = await tx.select().from(scheduledMovementTargetsTable)
    .where(eq(scheduledMovementTargetsTable.scheduledMovementId, movementId));

  for (const target of targets) {
    if (movement.tipo === "turno") {
      await tx.update(employeesTable)
        .set({ route: movement.valorNovo, updatedAt: new Date() })
        .where(eq(employeesTable.id, target.colaboradorId));
    } else if (movement.tipo === "status") {
      const statusKey = movement.valorNovo.trim().toLowerCase();
      if (INACTIVE_STATUSES.has(statusKey)) {
        const [employee] = await tx.select({ companyId: employeesTable.companyId })
          .from(employeesTable).where(eq(employeesTable.id, target.colaboradorId)).limit(1);
        if (employee) {
          await insertUnusedValeDiscount(tx, {
            companyId: employee.companyId,
            employeeId: target.colaboradorId,
            effectiveDateIso: movement.inicio,
            fimPeriodoIso: TEMPORARY_STATUSES.has(statusKey) ? movement.fim : undefined,
            fallbackName: "Colaborador com status alterado",
            discountTurno: "Desconto por status",
            sourceKey: `schedule:${movement.id}:employee:${target.colaboradorId}:discount`,
          });
        }
      }
      await tx.update(employeesTable)
        .set({ status: movement.valorNovo, updatedAt: new Date() })
        .where(eq(employeesTable.id, target.colaboradorId));
    } else if (movement.tipo === "filial" && movement.filialIdNovo) {
      const [employee] = await tx.select({ companyId: employeesTable.companyId })
        .from(employeesTable).where(eq(employeesTable.id, target.colaboradorId)).limit(1);
      if (employee) {
        await insertUnusedValeDiscount(tx, {
          companyId: target.filialIdAnterior ?? employee.companyId,
          employeeId: target.colaboradorId,
          effectiveDateIso: movement.inicio,
          fallbackName: "Colaborador transferido",
          discountTurno: "Desconto por transferência",
          sourceKey: `schedule:${movement.id}:employee:${target.colaboradorId}:discount`,
        });
      }
      await tx.update(employeesTable)
        .set({ companyId: movement.filialIdNovo, updatedAt: new Date() })
        .where(eq(employeesTable.id, target.colaboradorId));
    }
  }

  await tx.update(scheduledMovementTargetsTable)
    .set({ appliedAt: sql`COALESCE(applied_at, NOW())` })
    .where(eq(scheduledMovementTargetsTable.scheduledMovementId, movementId));
}

async function revertMovement(tx: DbTransaction, movementId: number): Promise<void> {
  const [movement] = await tx.select().from(scheduledMovementsTable)
    .where(eq(scheduledMovementsTable.id, movementId)).limit(1);
  if (!movement) return;
  const targets = await tx.select().from(scheduledMovementTargetsTable)
    .where(and(
      eq(scheduledMovementTargetsTable.scheduledMovementId, movementId),
      isNull(scheduledMovementTargetsTable.revertedAt),
    ));

  for (const target of targets) {
    if (movement.tipo === "turno") {
      await tx.update(employeesTable)
        .set({ route: target.valorAnterior || null, updatedAt: new Date() })
        .where(eq(employeesTable.id, target.colaboradorId));
    } else if (movement.tipo === "status") {
      await tx.update(employeesTable)
        .set({ status: target.valorAnterior || "Ativo", updatedAt: new Date() })
        .where(eq(employeesTable.id, target.colaboradorId));
    } else if (movement.tipo === "filial" && target.filialIdAnterior) {
      await tx.update(employeesTable)
        .set({ companyId: target.filialIdAnterior, updatedAt: new Date() })
        .where(eq(employeesTable.id, target.colaboradorId));
    }
  }

  await tx.update(scheduledMovementTargetsTable)
    .set({ revertedAt: sql`COALESCE(reverted_at, NOW())` })
    .where(eq(scheduledMovementTargetsTable.scheduledMovementId, movementId));
}

export async function advanceStatesForCompany(companyId: number): Promise<void> {
  const today = todayIso();
  await db.transaction(async tx => {
    await lockCompanySchedules(tx, companyId);
    const due = await tx.select({
      id: scheduledMovementsTable.id,
      tipo: scheduledMovementsTable.tipo,
      valorNovo: scheduledMovementsTable.valorNovo,
    })
      .from(scheduledMovementsTable)
      .where(and(
        eq(scheduledMovementsTable.companyId, companyId),
        eq(scheduledMovementsTable.estado, "pendente"),
        lte(scheduledMovementsTable.inicio, today),
      ));

    for (const movement of due) {
      await applyMovement(tx, movement.id);
      await tx.update(scheduledMovementsTable)
        .set({
          estado: isTerminalStatusMovement(movement) ? "concluido" : "ativo",
          updatedAt: new Date(),
        })
        .where(and(eq(scheduledMovementsTable.id, movement.id), eq(scheduledMovementsTable.estado, "pendente")));
    }

    // Reaplica movimentos ativos para reparar dados antigos cujo estado mudou apenas no frontend.
    // Desligamentos antigos são finalizados sem reversão após a reaplicação idempotente.
    const active = await tx.select({
      id: scheduledMovementsTable.id,
      tipo: scheduledMovementsTable.tipo,
      valorNovo: scheduledMovementsTable.valorNovo,
    })
      .from(scheduledMovementsTable)
      .where(and(
        eq(scheduledMovementsTable.companyId, companyId),
        eq(scheduledMovementsTable.estado, "ativo"),
      ));
    for (const movement of active) {
      await applyMovement(tx, movement.id);
      if (isTerminalStatusMovement(movement)) {
        await tx.update(scheduledMovementsTable)
          .set({ estado: "concluido", updatedAt: new Date() })
          .where(and(
            eq(scheduledMovementsTable.id, movement.id),
            eq(scheduledMovementsTable.estado, "ativo"),
          ));
      }
    }

    const completed = await tx.select({ id: scheduledMovementsTable.id })
      .from(scheduledMovementsTable)
      .where(and(
        eq(scheduledMovementsTable.companyId, companyId),
        eq(scheduledMovementsTable.estado, "ativo"),
        ne(scheduledMovementsTable.fim, PERMANENT_END),
        lt(scheduledMovementsTable.fim, today),
      ));
    for (const movement of completed) {
      await revertMovement(tx, movement.id);
      await tx.update(scheduledMovementsTable)
        .set({ estado: "concluido", updatedAt: new Date() })
        .where(and(eq(scheduledMovementsTable.id, movement.id), eq(scheduledMovementsTable.estado, "ativo")));
    }
  });
}

export async function advanceAllScheduledMovements(): Promise<void> {
  const companies = await db.selectDistinct({ companyId: scheduledMovementsTable.companyId })
    .from(scheduledMovementsTable)
    .where(ne(scheduledMovementsTable.estado, "concluido"));
  for (const company of companies) await advanceStatesForCompany(company.companyId);
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
    if (typeof body.valorNovo !== "string" || !body.valorNovo.trim()) {
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
 
    const valorNovo = body.valorNovo.trim();
    const filialIdNovo = body.tipo === "filial" ? body.filialIdNovo! : null;

    try {
      await advanceStatesForCompany(companyId);
      const created = await db.transaction(async tx => {
        await lockCompanySchedules(tx, companyId);
        const alvos = await assertValidTargets(tx, companyId, body.tipo as Tipo, body.alvos!);
        await assertValidDestinationCompany(tx, companyId, filialIdNovo);
        await assertNoScheduleConflicts(tx, {
          companyId,
          tipo: body.tipo as Tipo,
          valorNovo,
          filialIdNovo,
          inicio: body.inicio!,
          fim: body.fim!,
          colaboradorIds: alvos.map(alvo => alvo.colaboradorId),
        });
        assertTargetsChangeValue(body.tipo as Tipo, valorNovo, filialIdNovo, alvos);

        const [row] = await tx.insert(scheduledMovementsTable).values({
          companyId,
          tipo: body.tipo as Tipo,
          valorNovo,
          filialIdNovo,
          inicio: body.inicio!,
          fim: body.fim!,
          estado: "pendente",
          createdByUserId: typeof auth.sub === "number" ? auth.sub : null,
        }).returning();
        if (!row) throw new Error("insert failed");
        const targetRows = alvos.map(a => ({
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
      if (sendScheduleError(res, err)) return;
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
      await db.transaction(async tx => {
        await lockCompanySchedules(tx, companyId);
        const [row] = await tx.select().from(scheduledMovementsTable)
          .where(and(
            eq(scheduledMovementsTable.id, id),
            eq(scheduledMovementsTable.companyId, companyId),
          ));
        if (!row) {
          throw new ScheduleRequestError(404, "SCHEDULE_NOT_FOUND", "Agendamento não encontrado.");
        }
        if (row.estado !== "pendente") {
          throw new ScheduleRequestError(409, "SCHEDULE_ALREADY_STARTED", "Só é possível editar agendamentos pendentes.");
        }

        const alvos = await assertValidTargets(tx, companyId, row.tipo as Tipo, body.alvos!);
        await assertNoScheduleConflicts(tx, {
          companyId,
          tipo: row.tipo as Tipo,
          valorNovo: row.valorNovo,
          filialIdNovo: row.filialIdNovo,
          inicio: body.inicio!,
          fim: body.fim!,
          colaboradorIds: alvos.map(alvo => alvo.colaboradorId),
          excludeMovementId: id,
        });
        assertTargetsChangeValue(row.tipo as Tipo, row.valorNovo, row.filialIdNovo, alvos);

        await tx.update(scheduledMovementsTable).set({
          inicio: body.inicio!,
          fim: body.fim!,
          updatedAt: new Date(),
        }).where(eq(scheduledMovementsTable.id, id));
        await tx.delete(scheduledMovementTargetsTable)
          .where(eq(scheduledMovementTargetsTable.scheduledMovementId, id));
        await tx.insert(scheduledMovementTargetsTable).values(
          alvos.map(a => ({
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
      if (sendScheduleError(res, err)) return;
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
          await lockCompanySchedules(tx, companyId);
          await revertMovement(tx, id);
          await tx.update(scheduledMovementsTable)
            .set({ estado: "concluido", updatedAt: new Date() })
            .where(and(eq(scheduledMovementsTable.id, id), eq(scheduledMovementsTable.companyId, companyId)));
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
