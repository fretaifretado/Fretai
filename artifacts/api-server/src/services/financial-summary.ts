import { db } from "@workspace/db";
import { companyShiftsTable, employeesTable, purchaseOrdersTable } from "@workspace/db/schema";
import { and, eq, ne } from "drizzle-orm";

const MESES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface Period {
  year: number;
  month: number;
}

interface PurchaseOrderRow {
  id: number;
  companyId: number;
  employeeId: number | null;
  nome: string;
  turno: string;
  periodo: string;
  dataInicio: string;
  dataFim: string;
  dias: number;
  vales: number;
  valorUnit: string | number;
  total: string | number;
  status: "Processando" | "Aprovado" | "Cancelado";
}

export interface FinancialSummary {
  companyId: number;
  period: string;
  periodLabel: string;
  valesComprados: number;
  compraDoMes: number;
  valesNaoUtilizados: number;
  creditoGerado: number;
  creditoAplicado: number;
  saldoCredito: number;
  valorNotaFiscal: number;
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

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

export function parsePeriodParam(value: string | undefined, fallback = new Date()): Period {
  if (!value) return { year: fallback.getFullYear(), month: fallback.getMonth() + 1 };
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error("period inválido");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("period inválido");
  }
  return { year, month };
}

export function periodLabel(period: Period): string {
  return `${MESES_CURTO[period.month - 1]}/${period.year}`;
}

export function periodLabelFromDate(date = new Date()): string {
  return periodLabel({ year: date.getFullYear(), month: date.getMonth() + 1 });
}

function periodParam(period: Period): string {
  return `${period.year}-${String(period.month).padStart(2, "0")}`;
}

function periodKey(period: Period): number {
  return period.year * 12 + period.month;
}

function periodFromLabel(label: string): Period | null {
  const match = label.match(/^([A-Za-zÀ-ÿ]{3})\/(\d{4})$/);
  if (!match) return null;
  const month = MESES_CURTO.findIndex(m => m.toLowerCase() === match[1]!.toLowerCase()) + 1;
  const year = Number(match[2]);
  if (!month || !Number.isInteger(year)) return null;
  return { year, month };
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

export async function getFinancialSummary(companyId: number, period: Period): Promise<FinancialSummary> {
  const targetKey = periodKey(period);
  const targetLabel = periodLabel(period);
  const orders = await db
    .select()
    .from(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.companyId, companyId), ne(purchaseOrdersTable.status, "Cancelado")));

  const totalsByKey = new Map<number, { purchases: number; discounts: number }>();
  let valesComprados = 0;
  let compraDoMes = 0;
  let valesNaoUtilizados = 0;
  let creditoGerado = 0;

  for (const order of orders) {
    const p = periodFromLabel(order.periodo);
    if (!p) continue;
    const key = periodKey(p);
    const totals = totalsByKey.get(key) ?? { purchases: 0, discounts: 0 };
    const total = money(order.total);
    if (order.vales > 0) totals.purchases += total;
    if (order.vales < 0) totals.discounts += Math.abs(total);
    totalsByKey.set(key, totals);

    if (key === targetKey) {
      if (order.vales > 0) {
        valesComprados += order.vales;
        compraDoMes += total;
      } else if (order.vales < 0) {
        valesNaoUtilizados += Math.abs(order.vales);
        creditoGerado += Math.abs(total);
      }
    }
  }

  let carry = 0;
  for (const key of Array.from(totalsByKey.keys()).filter(k => k < targetKey).sort((a, b) => a - b)) {
    const totals = totalsByKey.get(key)!;
    const applied = Math.min(carry, totals.purchases);
    carry = roundMoney(carry - applied + totals.discounts);
  }

  const creditoAplicado = roundMoney(Math.min(carry, compraDoMes));
  const saldoAnteriorRestante = roundMoney(carry - creditoAplicado);
  const saldoCredito = roundMoney(saldoAnteriorRestante + creditoGerado);
  const valorNotaFiscal = roundMoney(Math.max(0, compraDoMes - creditoAplicado));

  return {
    companyId,
    period: periodParam(period),
    periodLabel: targetLabel,
    valesComprados,
    compraDoMes: roundMoney(compraDoMes),
    valesNaoUtilizados,
    creditoGerado: roundMoney(creditoGerado),
    creditoAplicado,
    saldoCredito,
    valorNotaFiscal,
  };
}

export async function createUnusedValeDiscountForEmployee(params: {
  companyId: number;
  employeeId: number;
  effectiveDate?: Date;
}): Promise<{ created: boolean; vales: number; total: number }> {
  const effectiveDate = startOfDay(params.effectiveDate ?? new Date());
  const period = periodLabelFromDate(effectiveDate);
  const today = toIsoDate(effectiveDate);

  return db.transaction(async tx => {
    const [employee] = await tx
      .select()
      .from(employeesTable)
      .where(and(eq(employeesTable.id, params.employeeId), eq(employeesTable.companyId, params.companyId)))
      .limit(1);
    if (!employee) return { created: false, vales: 0, total: 0 };

    const existingDiscount = await tx
      .select({ id: purchaseOrdersTable.id })
      .from(purchaseOrdersTable)
      .where(and(
        eq(purchaseOrdersTable.companyId, params.companyId),
        eq(purchaseOrdersTable.employeeId, params.employeeId),
        eq(purchaseOrdersTable.periodo, period),
        ne(purchaseOrdersTable.status, "Cancelado"),
      ));
    const currentPeriodOrders = await tx.select({ vales: purchaseOrdersTable.vales }).from(purchaseOrdersTable).where(and(
      eq(purchaseOrdersTable.companyId, params.companyId),
      eq(purchaseOrdersTable.employeeId, params.employeeId),
      eq(purchaseOrdersTable.periodo, period),
      ne(purchaseOrdersTable.status, "Cancelado"),
    ));
    if (existingDiscount.length > 0 && currentPeriodOrders.some(o => o.vales < 0)) return { created: false, vales: 0, total: 0 };

    const [orders, shifts] = await Promise.all([
      tx.select().from(purchaseOrdersTable).where(and(
        eq(purchaseOrdersTable.companyId, params.companyId),
        eq(purchaseOrdersTable.employeeId, params.employeeId),
        ne(purchaseOrdersTable.status, "Cancelado"),
      )),
      tx.select().from(companyShiftsTable).where(eq(companyShiftsTable.companyId, params.companyId)),
    ]);

    let discountVales = 0;
    let discountTotal = 0;
    const anchor = parseDate(employee.operationStart ?? employee.admissionDate);

    for (const order of orders.filter(o => o.vales > 0)) {
      const inicio = parseDate(order.dataInicio);
      const fim = parseDate(order.dataFim);
      if (!fim || effectiveDate > fim) continue;

      const from = inicio && effectiveDate < inicio ? inicio : effectiveDate;
      const turno = shifts.find(s => normalizeTurnoKey(s.nome) === normalizeTurnoKey(order.turno));
      const tipoEscala = inferTipoEscala(order.turno, turno);
      let remainingDays = 0;
      if (fim && inicio) {
        remainingDays = countWorkDays(from, fim, tipoEscala, anchor, turno?.escala);
      }

      const unusedVales = Math.min(order.vales, Math.max(0, remainingDays * 2));
      if (unusedVales <= 0) continue;
      const valorUnit = money(order.valorUnit);
      discountVales += unusedVales;
      discountTotal += unusedVales * valorUnit;
    }

    if (discountVales <= 0 || discountTotal <= 0) return { created: false, vales: 0, total: 0 };

    const valorUnit = roundMoney(discountTotal / discountVales);
    const total = roundMoney(discountTotal);
    await tx.insert(purchaseOrdersTable).values({
      companyId: params.companyId,
      employeeId: params.employeeId,
      nome: employee.name,
      turno: "Desconto por status",
      periodo: period,
      dataInicio: today,
      dataFim: today,
      dias: 0,
      vales: -discountVales,
      valorUnit: String(valorUnit),
      total: String(-total),
      status: "Aprovado",
      proRata: false,
    });

    return { created: true, vales: discountVales, total };
  });
}
