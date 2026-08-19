import { db } from "@workspace/db";
import {
  companiesTable,
  companyHolidaysTable,
  companyShiftsTable,
  employeesTable,
  purchaseOrdersTable,
  scheduledMovementsTable,
  scheduledMovementTargetsTable,
} from "@workspace/db/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { buildHolidaySet } from "./holiday-calendar";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const INACTIVE_STATUSES = new Set(["home office", "férias", "ferias", "licença", "licenca", "afastado", "desligado", "demitido", "desligamento"]);
const DAYS = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"] as const;
const PURCHASE_LOCK_NAMESPACE = 7125;

function localDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  return null;
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function brDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

function weekdaysFromScale(scale: string | null | undefined): Set<number> | null {
  const parts = normalize(scale).split("/");
  if (parts.length !== 2) return null;
  const from = DAYS.indexOf(parts[0] as typeof DAYS[number]);
  const to = DAYS.indexOf(parts[1] as typeof DAYS[number]);
  if (from < 0 || to < 0) return null;
  const result = new Set<number>();
  for (let index = 0; index < DAYS.length; index++) {
    const included = to >= from ? index >= from && index <= to : index >= from || index <= to;
    if (included) result.add(index === 6 ? 0 : index + 1);
  }
  return result;
}

function inferScale(shiftName: string, shift?: { tipoEscala: string; escala: string; entrada: string; saida: string }): string {
  if (shift?.tipoEscala.trim()) return shift.tipoEscala.trim().toLowerCase();
  const normalizedScale = normalize(shift?.escala);
  if (normalizedScale === "12X36") return "12x36";
  if (normalizedScale === "24X48") return "24x48";
  const weekdays = weekdaysFromScale(shift?.escala);
  if (weekdays?.size === 5) return "5x2";
  if (weekdays?.size === 6) return "6x1";
  const key = normalize(`${shiftName} ${shift?.entrada ?? ""} ${shift?.saida ?? ""}`);
  return key.includes("ADM") || key.includes("ADMINISTRATIVO") || key.includes("17:30") ? "5x2" : "6x1";
}

export function getAutomaticPurchasePeriod(today = new Date()): { year: number; month: number } {
  if (today.getDate() < 28) return { year: today.getFullYear(), month: today.getMonth() + 1 };
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return { year: next.getFullYear(), month: next.getMonth() + 1 };
}

function scheduleBlocksDate(
  schedules: { tipo: string; valorNovo: string; inicio: string; fim: string; colaboradorId: number }[],
  employeeId: number,
  date: string,
): boolean {
  return schedules.some(schedule => schedule.colaboradorId === employeeId
    && schedule.inicio <= date
    && schedule.fim >= date
    && (schedule.tipo === "filial" || (schedule.tipo === "status" && INACTIVE_STATUSES.has(schedule.valorNovo.trim().toLowerCase()))));
}

function countEmployeeDays(params: {
  year: number;
  month: number;
  fromDay: number;
  employeeId: number;
  anchor: Date;
  scale: string;
  explicitWeekdays: Set<number> | null;
  holidays: Set<string>;
  schedules: { tipo: string; valorNovo: string; inicio: string; fim: string; colaboradorId: number }[];
}): number {
  const lastDay = new Date(params.year, params.month, 0).getDate();
  let count = 0;
  for (let day = params.fromDay; day <= lastDay; day++) {
    const date = new Date(params.year, params.month - 1, day);
    const iso = isoDate(date);
    if (params.holidays.has(iso) || scheduleBlocksDate(params.schedules, params.employeeId, iso)) continue;
    if (params.scale === "12x36" || params.scale === "24x48") {
      const cycle = params.scale === "12x36" ? 2 : 3;
      const diff = Math.round((date.getTime() - params.anchor.getTime()) / 86400000);
      if (diff >= 0 && diff % cycle === 0) count++;
      continue;
    }
    const works = params.explicitWeekdays
      ? params.explicitWeekdays.has(date.getDay())
      : params.scale === "5x2" ? date.getDay() >= 1 && date.getDay() <= 5 : date.getDay() >= 1 && date.getDay() <= 6;
    if (works) count++;
  }
  return count;
}

export async function processAutomaticPurchasesForCompany(companyId: number, today = new Date()) {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company) return [];
  const rootCompanyId = company.parentCompanyId ?? company.id;
  const { year, month } = getAutomaticPurchasePeriod(today);
  const period = `${MONTHS[month - 1]}/${year}`;
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const currentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  const [employees, shifts, customHolidays, scheduleRows] = await Promise.all([
    db.select().from(employeesTable).where(eq(employeesTable.companyId, companyId)),
    db.select().from(companyShiftsTable).where(eq(companyShiftsTable.companyId, rootCompanyId)),
    db.select({ date: companyHolidaysTable.date }).from(companyHolidaysTable).where(eq(companyHolidaysTable.companyId, rootCompanyId)),
    db.select({
      tipo: scheduledMovementsTable.tipo,
      valorNovo: scheduledMovementsTable.valorNovo,
      inicio: scheduledMovementsTable.inicio,
      fim: scheduledMovementsTable.fim,
      colaboradorId: scheduledMovementTargetsTable.colaboradorId,
    }).from(scheduledMovementsTable)
      .innerJoin(scheduledMovementTargetsTable, eq(scheduledMovementTargetsTable.scheduledMovementId, scheduledMovementsTable.id))
      .where(and(eq(scheduledMovementsTable.companyId, rootCompanyId), ne(scheduledMovementsTable.estado, "concluido"))),
  ]);

  const holidays = buildHolidaySet([year], customHolidays.map(holiday => holiday.date));
  const items: (typeof purchaseOrdersTable.$inferInsert)[] = [];

  for (const employee of employees) {
    const operationStart = localDate(employee.operationStart ?? employee.admissionDate);
    if (!operationStart || operationStart > monthEnd) continue;
    if ((employee.status ?? "").trim().toLowerCase() !== "ativo") continue;
    if (!employee.cpf.trim() || !employee.phone?.trim() || !employee.address?.trim() || !employee.route?.trim()) continue;

    const shift = shifts.find(item => normalize(item.nome) === normalize(employee.route));
    const scale = inferScale(employee.route, shift);
    const firstEligible = operationStart > monthStart ? operationStart : monthStart;
    const firstPurchaseDate = currentMonth
      ? new Date(year, month - 1, Math.max(today.getDate() + 1, firstEligible.getDate()))
      : firstEligible;
    if (firstPurchaseDate > monthEnd) continue;

    const days = countEmployeeDays({
      year,
      month,
      fromDay: firstPurchaseDate.getDate(),
      employeeId: employee.id,
      anchor: operationStart,
      scale,
      explicitWeekdays: weekdaysFromScale(shift?.escala),
      holidays,
      schedules: scheduleRows,
    });
    if (days <= 0) continue;
    const vales = days * 2;
    const unitValue = Number(employee.valeValue ?? company.valeValue);
    const total = Math.round(vales * unitValue * 100) / 100;
    items.push({
      companyId,
      employeeId: employee.id,
      nome: employee.name,
      turno: employee.route,
      periodo: period,
      dataInicio: brDate(firstPurchaseDate),
      dataFim: brDate(monthEnd),
      dias: days,
      vales,
      valorUnit: String(unitValue),
      total: String(total),
      status: "Aprovado",
      proRata: firstPurchaseDate.getDate() > 1,
      sourceKey: `auto:${companyId}:${employee.id}:${period}`,
    });
  }

  if (items.length === 0) return [];
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${PURCHASE_LOCK_NAMESPACE}, ${companyId})`);
    return tx.insert(purchaseOrdersTable).values(items).onConflictDoNothing().returning();
  });
}

export async function processAllAutomaticPurchases(today = new Date()): Promise<number> {
  const roots = await db.select({ id: companiesTable.id }).from(companiesTable)
    .where(sql`${companiesTable.parentCompanyId} IS NULL`);
  let inserted = 0;
  for (const root of roots) {
    const branches = await db.select({ id: companiesTable.id }).from(companiesTable)
      .where(eq(companiesTable.parentCompanyId, root.id));
    for (const companyId of [root.id, ...branches.map(branch => branch.id)]) {
      inserted += (await processAutomaticPurchasesForCompany(companyId, today)).length;
    }
  }
  return inserted;
}
