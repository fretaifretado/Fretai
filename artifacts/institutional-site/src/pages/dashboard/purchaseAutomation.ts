import { useEffect, useMemo, useRef } from "react";
import type { Colaborador, Empresa, Filial, Turno } from "./context";

export type StatusPedido = "Processando" | "Aprovado" | "Cancelado";

export interface PedidoCompra {
  id: number;
  colaboradorId: number;
  nome: string;
  turno: string;
  periodo: string;
  dataInicio: string;
  dataFim: string;
  dias: number;
  vales: number;
  valorUnit: number;
  total: number;
  status: StatusPedido;
  proRata: boolean;
}

export interface PreviewItem {
  colaborador: Colaborador;
  turnoNome: string;
  dias: number;
  vales: number;
  valorUnit: number;
  total: number;
  dataInicio: string;
  dataFim: string;
  periodo: string;
  proRata: boolean;
}

interface ApiPurchaseOrder {
  id: number;
  employeeId: number | null;
  nome: string;
  turno: string;
  periodo: string;
  dataInicio: string;
  dataFim: string;
  dias: number;
  vales: number;
  valorUnit: string;
  total: string;
  status: StatusPedido;
  proRata: boolean;
}

const API_URL = import.meta.env.VITE_API_URL ?? "";
const PURCHASE_REQUEST_TIMEOUT_MS = 15000;

export const MESES_CURTO = [
  "Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez",
];

export function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("jwt_token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), PURCHASE_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Tempo esgotado ao comunicar com a API de compras");
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function normalizeTurnoKey(name: string): string {
  return (name || "").toLowerCase().replace(/\s+/g, "");
}

export function inferTipoEscala(turnoNome: string, turno?: Pick<Turno, "tipoEscala" | "escala" | "entrada" | "saida">): string {
  const explicit = turno?.tipoEscala?.trim();
  if (explicit) return explicit;

  const escala = turno?.escala?.trim().toUpperCase() ?? "";
  if (escala === "SEG/SEX") return "5x2";
  if (escala === "SEG/SAB" || escala === "DOM/SEX") return "6x1";
  if (escala === "12X36") return "12x36";
  if (escala === "24X48") return "24x48";

  const key = normalizeTurnoKey(`${turnoNome} ${turno?.entrada ?? ""} ${turno?.saida ?? ""}`);
  if (key.includes("adm") || key.includes("administrativo") || key.includes("08:00") || key.includes("17:30")) return "5x2";
  if (key.includes("primeiro") || key.includes("segundo") || key.includes("terceiro")) return "6x1";
  return "6x1";
}

export function parseInicioOp(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const serial = Number(s);
  if (!isNaN(serial) && serial > 1000 && serial < 100000) {
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d;
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!isNaN(d.getTime())) return d;
  }

  const slashDate = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const n1 = Number(slashDate[1]), n2 = Number(slashDate[2]), y = Number(slashDate[3]);
    if (n1 > 12 && n2 <= 12) {
      const d = new Date(y, n2 - 1, n1);
      if (!isNaN(d.getTime())) return d;
    } else if (n2 > 12 && n1 <= 12) {
      const d = new Date(y, n1 - 1, n2);
      if (!isNaN(d.getTime())) return d;
    } else {
      const d = new Date(y, n2 - 1, n1);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const dmYDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmYDash && Number(dmYDash[2]) <= 12) {
    const d = new Date(Number(dmYDash[3]), Number(dmYDash[2]) - 1, Number(dmYDash[1]));
    if (!isNaN(d.getTime())) return d;
  }

  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback;

  return null;
}

export function isFutureDate(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const s = raw.trim();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dmY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmY) {
    const d = new Date(Number(dmY[3]), Number(dmY[2]) - 1, Number(dmY[1]));
    return !isNaN(d.getTime()) && d > hoje;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return !isNaN(d.getTime()) && d > hoje;
  }
  return false;
}

export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

export function formatDate(ano: number, mes: number, dia: number): string {
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
}

function diasCiclicosNoMes(
  tipoEscala: "12x36" | "24x48",
  inicioOp: string,
  ano: number,
  mes: number,
  fromDay = 1,
): number {
  const start = parseInicioOp(inicioOp);
  if (!start) return tipoEscala === "12x36" ? 15 : 10;

  const cyclePeriod = tipoEscala === "12x36" ? 2 : 3;
  const startTime = start.getTime();
  const ms = 1000 * 60 * 60 * 24;

  let count = 0;
  const daysInMonth = ultimoDiaDoMes(ano, mes);
  for (let day = fromDay; day <= daysInMonth; day++) {
    const current = new Date(ano, mes - 1, day).getTime();
    const diffDays = Math.round((current - startTime) / ms);
    if (diffDays >= 0 && diffDays % cyclePeriod === 0) count++;
  }
  return count || (tipoEscala === "12x36" ? 15 : 10);
}

export function calcularDiasNoMes(
  tipoEscala: string,
  inicioOp: string,
  ano: number,
  mes: number,
  feriados: Set<string> = new Set(),
): { dias: number; proRata: boolean; fromDay: number } {
  const start = parseInicioOp(inicioOp);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const anoHoje = hoje.getFullYear();
  const mesHoje = hoje.getMonth() + 1;
  const diaHoje = hoje.getDate();
  const ehMesAtual = ano === anoHoje && mes === mesHoje;
  const ehMesFuturo = ano > anoHoje || (ano === anoHoje && mes > mesHoje);

  if (start && start > hoje) {
    const sy = start.getFullYear();
    const sm = start.getMonth() + 1;
    const sd = start.getDate();
    if (sy > ano || (sy === ano && sm > mes)) {
      return { dias: 0, proRata: false, fromDay: 1 };
    }
    if (sy === ano && sm === mes) {
      const fromDay = sd;
      const daysInMonth = ultimoDiaDoMes(ano, mes);
      let dias = 0;
      if (tipoEscala === "12x36" || tipoEscala === "24x48") {
        dias = diasCiclicosNoMes(tipoEscala, inicioOp, ano, mes, fromDay);
      } else {
        for (let day = fromDay; day <= daysInMonth; day++) {
          const dateStr = `${ano}-${String(mes).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          if (feriados.has(dateStr)) continue;
          const wd = new Date(ano, mes - 1, day).getDay();
          if (tipoEscala === "5x2" && wd >= 1 && wd <= 5) dias++;
          else if (tipoEscala === "6x1" && wd >= 1 && wd <= 6) dias++;
          else if (tipoEscala !== "5x2" && tipoEscala !== "6x1") dias++;
        }
      }
      return { dias, proRata: true, fromDay };
    }
  }

  if (start) {
    const sy = start.getFullYear();
    const sm = start.getMonth() + 1;
    if (sy > ano || (sy === ano && sm > mes)) {
      return { dias: 0, proRata: false, fromDay: 1 };
    }
  }

  const isFirstMonth = !!start && start.getFullYear() === ano && start.getMonth() + 1 === mes;

  let fromDay: number;
  if (ehMesAtual) {
    const diaInicio = isFirstMonth ? start!.getDate() : 1;
    const diaAmanha = diaHoje + 1;
    fromDay = Math.max(diaAmanha, diaInicio);
  } else if (isFirstMonth) {
    fromDay = start!.getDate();
  } else {
    fromDay = 1;
  }

  const proRata = fromDay > 1;
  const daysInMonth = ultimoDiaDoMes(ano, mes);
  let dias: number;

  if (tipoEscala === "12x36" || tipoEscala === "24x48") {
    dias = diasCiclicosNoMes(tipoEscala, inicioOp, ano, mes, fromDay);
  } else if (proRata || ehMesFuturo === false) {
    dias = 0;
    for (let day = fromDay; day <= daysInMonth; day++) {
      const dateStr = `${ano}-${String(mes).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (feriados.has(dateStr)) continue;
      const wd = new Date(ano, mes - 1, day).getDay();
      if (tipoEscala === "5x2" && wd >= 1 && wd <= 5) dias++;
      else if (tipoEscala === "6x1" && wd >= 1 && wd <= 6) dias++;
      else if (tipoEscala !== "5x2" && tipoEscala !== "6x1") dias++;
    }
  } else if (!start) {
    dias = 0;
  } else {
    switch (tipoEscala) {
      case "5x2":   dias = 22; break;
      case "6x1":   dias = 26; break;
      case "12x36": dias = 15; break;
      case "24x48": dias = 10; break;
      default:      dias = 22;
    }
  }

  return { dias, proRata, fromDay };
}

export function getDefaultPurchasePeriod(today = new Date()): { ano: number; mes: number } {
  const ano = today.getDate() >= 28
    ? (today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear())
    : today.getFullYear();
  const mes = today.getDate() >= 28
    ? (today.getMonth() === 11 ? 1 : today.getMonth() + 2)
    : today.getMonth() + 1;
  return { ano, mes };
}

export function getFeriadosNacionais(ano: number): string[] {
  const fixos = [
    `${ano}-01-01`, `${ano}-04-21`, `${ano}-05-01`,
    `${ano}-09-07`, `${ano}-10-12`, `${ano}-11-02`,
    `${ano}-11-15`, `${ano}-11-20`, `${ano}-12-25`,
  ];
  const a = ano % 19, b = Math.floor(ano/100), cc = ano % 100;
  const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
  const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
  const i = Math.floor(cc/4), k = cc % 4, l = (32+2*e+2*i-h-k) % 7;
  const m = Math.floor((a+11*h+22*l)/451);
  const pMonth = Math.floor((h+l-7*m+114)/31);
  const pDay = ((h+l-7*m+114) % 31)+1;
  const pascoa = new Date(ano, pMonth-1, pDay);
  const addD = (date: Date, n: number) => { const x = new Date(date); x.setDate(x.getDate()+n); return x; };
  const fmt = (date: Date) => date.toISOString().split("T")[0]!;
  return [
    ...fixos,
    fmt(addD(pascoa, -48)), fmt(addD(pascoa, -47)),
    fmt(addD(pascoa, -2)),
    fmt(pascoa),
    fmt(addD(pascoa, 60)),
  ];
}

export function mapPurchaseOrder(order: ApiPurchaseOrder): PedidoCompra {
  return {
    id: order.id,
    colaboradorId: order.employeeId ?? 0,
    nome: order.nome,
    turno: order.turno,
    periodo: order.periodo,
    dataInicio: order.dataInicio,
    dataFim: order.dataFim,
    dias: order.dias,
    vales: order.vales,
    valorUnit: parseFloat(order.valorUnit),
    total: parseFloat(order.total),
    status: order.status,
    proRata: order.proRata,
  };
}

export async function fetchPurchaseOrders(companyId: number): Promise<PedidoCompra[]> {
  const res = await fetchWithTimeout(`${API_URL}/api/me/purchase-orders?companyId=${companyId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Erro ao carregar pedidos de compra: HTTP ${res.status}`);
  }
  const data = await res.json() as ApiPurchaseOrder[];
  return data.map(mapPurchaseOrder);
}

export async function loadCompanyHolidays(): Promise<string[]> {
  const res = await fetchWithTimeout(`${API_URL}/api/me/holidays`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return [];
  const data = await res.json() as { date: string }[];
  return data.map(h => h.date);
}

export function buildHolidaySet(periodoAno: number, feriadosCustom: string[]): Set<string> {
  const anos = [periodoAno - 1, periodoAno, periodoAno + 1];
  const nacionais = anos.flatMap(getFeriadosNacionais);
  return new Set([...nacionais, ...feriadosCustom]);
}

export function getEligibleEmployees(colaboradores: Colaborador[]): Colaborador[] {
  return colaboradores.filter(c =>
    (c.status === "Ativo" || isFutureDate(c.inicioOperacao)) &&
    !!c.cpf?.trim() &&
    !!c.telefone?.trim() &&
    !!c.endereco?.trim() &&
    !!c.turno && c.turno !== "—" &&
    !!c.inicioOperacao?.trim()
  );
}

export function buildPurchasePreview(params: {
  colaboradores: Colaborador[];
  turnos: Turno[];
  periodoAno: number;
  periodoMes: number;
  valeDiario: number;
  feriados: Set<string>;
}): PreviewItem[] {
  const { colaboradores, turnos, periodoAno, periodoMes, valeDiario, feriados } = params;
  return getEligibleEmployees(colaboradores)
    .map(c => {
      const t = turnos.find(x => normalizeTurnoKey(x.nome) === normalizeTurnoKey(c.turno));
      const escala = inferTipoEscala(c.turno, t);
      const { dias, proRata, fromDay } = calcularDiasNoMes(escala, c.inicioOperacao, periodoAno, periodoMes, feriados);
      const vales = dias * 2;
      const total = vales * valeDiario;
      const dataInicio = formatDate(periodoAno, periodoMes, fromDay);
      const dataFim = formatDate(periodoAno, periodoMes, ultimoDiaDoMes(periodoAno, periodoMes));
      const periodo = `${MESES_CURTO[periodoMes - 1]}/${periodoAno}`;
      return { colaborador: c, turnoNome: c.turno, dias, vales, valorUnit: valeDiario, total, dataInicio, dataFim, periodo, proRata };
    })
    .filter(item => item.dias > 0);
}

async function savePurchaseItems(items: PreviewItem[], companyId: number): Promise<PedidoCompra[]> {
  const res = await fetchWithTimeout(`${API_URL}/api/me/purchase-orders`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      companyId,
      items: items.map(item => ({
        employeeId: item.colaborador.id,
        nome: item.colaborador.nome,
        turno: item.turnoNome,
        periodo: item.periodo,
        dataInicio: item.dataInicio,
        dataFim: item.dataFim,
        dias: item.dias,
        vales: item.vales,
        valorUnit: item.valorUnit,
        total: item.total,
        proRata: item.proRata,
      })),
    }),
  });

  if (!res.ok) {
    throw new Error(`Erro ao salvar pedidos de compra: ${await res.text()}`);
  }

  const saved = await res.json() as ApiPurchaseOrder[];
  return saved.map(mapPurchaseOrder);
}

export async function processCompanyPurchaseOrders(params: {
  companyId: number;
  colaboradores: Colaborador[];
  turnos: Turno[];
  periodoAno: number;
  periodoMes: number;
  valeDiario: number;
  feriados: Set<string>;
}): Promise<PedidoCompra[]> {
  const previewItems = buildPurchasePreview(params);
  if (previewItems.length === 0) return [];

  const pedidos = await fetchPurchaseOrders(params.companyId);
  const periodoLabel = `${MESES_CURTO[params.periodoMes - 1]}/${params.periodoAno}`;
  const jaGeradosIds = new Set(
    pedidos
      .filter(p => p.periodo === periodoLabel && p.colaboradorId > 0)
      .map(p => p.colaboradorId),
  );
  const faltando = previewItems.filter(item => !jaGeradosIds.has(item.colaborador.id));
  if (faltando.length === 0) return [];

  return savePurchaseItems(faltando, params.companyId);
}

export function usePurchaseOrderAutomation(params: {
  colaboradores: Colaborador[];
  empresas: Empresa[];
  empresaAtiva: Empresa;
  filiais: Filial[];
  turnos: Turno[];
  enabled: boolean;
}) {
  const { colaboradores, empresas, empresaAtiva, filiais, turnos, enabled } = params;
  const { ano: periodoAno, mes: periodoMes } = useMemo(() => getDefaultPurchasePeriod(), []);
  const processedRef = useRef<Set<string>>(new Set());
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled || runningRef.current) return;
    if (turnos.length === 0 || colaboradores.length === 0) return;

    const companies = filiais.length > 0
      ? filiais
      : empresas.length > 0
        ? empresas.map(e => ({ id: e.id, nome: e.nome }))
        : empresaAtiva.id
          ? [{ id: empresaAtiva.id, nome: empresaAtiva.nome }]
          : [];

    const companyIds = companies.map(c => c.id).filter(id => id > 0);
    if (companyIds.length === 0) return;

    const employeeKey = colaboradores.map(c => `${c.id}:${c.status}:${c.turno}:${c.inicioOperacao}:${c.filialId}`).sort().join("|");
    const shiftKey = turnos.map(t => `${t.nome}:${t.tipoEscala}`).sort().join("|");
    const runKey = `${periodoAno}-${periodoMes}:${companyIds.join(",")}:${employeeKey}:${shiftKey}:${empresaAtiva.valeValue}`;
    if (processedRef.current.has(runKey)) return;

    runningRef.current = true;
    processedRef.current.add(runKey);

    void (async () => {
      try {
        const holidays = await loadCompanyHolidays();
        const feriados = buildHolidaySet(periodoAno, holidays);
        let totalSaved = 0;

        for (const company of companies) {
          const cid = company.id;
          const colabsDaEmpresa = colaboradores.filter(c => c.filialId === cid);
          if (colabsDaEmpresa.length === 0) continue;

          const saved = await processCompanyPurchaseOrders({
            companyId: cid,
            colaboradores: colabsDaEmpresa,
            turnos,
            periodoAno,
            periodoMes,
            valeDiario: parseFloat(empresaAtiva.valeValue ?? "8.50"),
            feriados,
          });
          totalSaved += saved.length;
        }

        if (totalSaved > 0) {
          window.dispatchEvent(new CustomEvent("purchase-orders:updated"));
        }
      } catch (err) {
        console.error("[compras] processamento em background falhou:", err);
        processedRef.current.delete(runKey);
      } finally {
        runningRef.current = false;
      }
    })();
  }, [colaboradores, empresaAtiva, empresas, enabled, filiais, periodoAno, periodoMes, turnos]);
}
