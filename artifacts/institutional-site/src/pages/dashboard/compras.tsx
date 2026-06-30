import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import DashboardLayout from "./layout";
import { CreditCard, CalendarClock, AlertTriangle } from "lucide-react";
import { useDashboard, type Colaborador } from "./context";
import { inferTipoEscala, processCompanyPurchaseOrders } from "./purchaseAutomation";

type StatusPedido = "Processando" | "Aprovado" | "Cancelado";

interface PedidoCompra {
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

interface PreviewItem {
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

const STATUS_STYLE: Record<StatusPedido, string> = {
  "Processando": "bg-blue-100 text-blue-700 border-blue-200",
  "Aprovado":    "bg-green-100 text-green-700 border-green-200",
  "Cancelado":   "bg-red-100 text-red-700 border-red-200",
};

const MESES_CURTO = [
  "Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez",
];

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
  const normalized = normalizeEscala(escala);
  const parts = normalized.split("/");
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

function isWorkingDay(wd: number, tipoEscala: string, escala?: string | null): boolean {
  const explicitWeekdays = weekdaysFromEscala(escala);
  if (explicitWeekdays) return explicitWeekdays.has(wd);
  if (tipoEscala === "5x2") return wd >= 1 && wd <= 5;
  if (tipoEscala === "6x1") return wd >= 1 && wd <= 6;
  return true;
}

function parseInicioOp(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Número serial do Excel (ex: 45678)
  const serial = Number(s);
  if (!isNaN(serial) && serial > 1000 && serial < 100000) {
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d;
  }

  // yyyy-mm-dd (ISO)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!isNaN(d.getTime())) return d;
  }

  // dd/mm/yyyy ou mm/dd/yyyy — sempre interpreta como BRASILEIRO (dd/mm/yyyy)
  // Só usa mm/dd/yyyy americano se o primeiro número for > 12 (impossível como dia)
  const slashDate = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const n1 = Number(slashDate[1]), n2 = Number(slashDate[2]), y = Number(slashDate[3]);
    if (n1 > 12 && n2 <= 12) {
      // Primeiro número > 12 → só pode ser dd/mm/yyyy
      const d = new Date(y, n2 - 1, n1);
      if (!isNaN(d.getTime())) return d;
    } else if (n2 > 12 && n1 <= 12) {
      // Segundo número > 12 → primeiro é mês → mm/dd/yyyy americano
      const d = new Date(y, n1 - 1, n2);
      if (!isNaN(d.getTime())) return d;
    } else {
      // Ambos <= 12: SEMPRE interpreta como dd/mm/yyyy (padrão brasileiro)
      const d = new Date(y, n2 - 1, n1);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // dd-mm-yyyy
  const dmYDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmYDash && Number(dmYDash[2]) <= 12) {
    const d = new Date(Number(dmYDash[3]), Number(dmYDash[2]) - 1, Number(dmYDash[1]));
    if (!isNaN(d.getTime())) return d;
  }

  // Texto livre — tenta Date.parse como último recurso
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback;

  return null;
}

function isFutureDate(raw: string | undefined | null): boolean {
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

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

function formatDate(ano: number, mes: number, dia: number): string {
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

function calcularDiasNoMes(
  tipoEscala: string,
  inicioOp: string,
  ano: number,
  mes: number,
  feriados: Set<string> = new Set(),
  escala?: string | null,
  deactivationDate?: string | null,
): { dias: number; proRata: boolean; fromDay: number } {
  const start = parseInicioOp(inicioOp);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const anoHoje = hoje.getFullYear();
  const mesHoje = hoje.getMonth() + 1;
  const diaHoje = hoje.getDate();
  const ehMesAtual = ano === anoHoje && mes === mesHoje;

  // ── Caso 1: colaborador em ADMISSÃO (data de início no futuro) ────────────
  // Se a data de início é futura, não comprar vales antes dela.
  if (start && start > hoje) {
    const sy = start.getFullYear();
    const sm = start.getMonth() + 1;
    const sd = start.getDate();
    // Data de início em mês posterior ao período → 0 vales
    if (sy > ano || (sy === ano && sm > mes)) {
      return { dias: 0, proRata: false, fromDay: 1 };
    }
    // Data de início no mesmo mês do período → pro-rata a partir do dia de admissão
    if (sy === ano && sm === mes) {
      const fromDay = sd;
      const daysInMonth = ultimoDiaDoMes(ano, mes);
      let dias = 0;
      if (tipoEscala === "12x36" || tipoEscala === "24x48") {
        dias = diasCiclicosNoMes(tipoEscala as "12x36" | "24x48", inicioOp, ano, mes, fromDay);
      } else {
        for (let day = fromDay; day <= daysInMonth; day++) {
          const dateStr = `${ano}-${String(mes).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          if (feriados.has(dateStr)) continue; // ignora feriados
          const wd = new Date(ano, mes - 1, day).getDay();
          if (isWorkingDay(wd, tipoEscala, escala)) dias++;
        }
      }
      return { dias, proRata: true, fromDay };
    }
  }

  // ── Caso 2: data de início no futuro mas mês posterior → 0 vales ─────────
  if (start) {
    const sy = start.getFullYear();
    const sm = start.getMonth() + 1;
    if (sy > ano || (sy === ano && sm > mes)) {
      return { dias: 0, proRata: false, fromDay: 1 };
    }
  }

  // ── Caso 3: mês atual — calcular a partir de HOJE (não do dia 1) ──────────
  // Para colaboradores já ativos: compra a partir de hoje até o fim do mês.
  // Para colaboradores que começam este mês mas já passaram: idem.
  const isFirstMonth = !!start && start.getFullYear() === ano && start.getMonth() + 1 === mes;

  let fromDay: number;
  if (ehMesAtual) {
    // Compra a partir de AMANHÃ (hoje já passou) ou do dia de início se for posterior
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
  let dias = 0;

  // Parse deactivation date if provided (YYYY-MM-DD format)
  let deactivationDay: number | null = null;
  if (deactivationDate) {
    const parts = deactivationDate.split('-');
    if (parts.length === 3) {
      const deactYear = parseInt(parts[0], 10);
      const deactMonth = parseInt(parts[1], 10);
      deactivationDay = parseInt(parts[2], 10);
      // Only apply if deactivation is in the current month/year
      if (deactYear !== ano || deactMonth !== mes) {
        deactivationDay = null;
      }
    }
  }

  if (tipoEscala === "12x36" || tipoEscala === "24x48") {
    dias = diasCiclicosNoMes(tipoEscala as "12x36" | "24x48", inicioOp, ano, mes, fromDay);
  } else if (start) {
    dias = 0;
    for (let day = fromDay; day <= daysInMonth; day++) {
      // Stop counting if we reach the deactivation date
      if (deactivationDay && day >= deactivationDay) break;
      
      const dateStr = `${ano}-${String(mes).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (feriados.has(dateStr)) continue; // ignora feriados
      const wd = new Date(ano, mes - 1, day).getDay();
      if (isWorkingDay(wd, tipoEscala, escala)) dias++;
    }
  } else if (!start) {
    // inicioOperacao não preenchido: não gerar compra
    dias = 0;
  }

  return { dias, proRata, fromDay };
}

const API_URL = import.meta.env.VITE_API_URL ?? "";
const REQUEST_TIMEOUT_MS = 15000;

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("jwt_token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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

export default function ComprasPage() {
  const { colaboradoresDaFilial: colaboradores, colaboradores: todosColaboradores, empresaAtiva, turnos, filialAtiva } = useDashboard();

  const hoje = new Date();

  const defaultAno = hoje.getDate() >= 28
    ? (hoje.getMonth() === 11 ? hoje.getFullYear() + 1 : hoje.getFullYear())
    : hoje.getFullYear();
  const defaultMes = hoje.getDate() >= 28
    ? (hoje.getMonth() === 11 ? 1 : hoje.getMonth() + 2)
    : hoje.getMonth() + 1;

  const [pedidos, setPedidos] = useState<PedidoCompra[]>([]);
  const [loadingPedidos, setLoadingPedidos] = useState(true);
  const [savingPedidos, setSavingPedidos] = useState(false);
  const [autoError, setAutoError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [periodoAno] = useState(defaultAno);
  const [periodoMes] = useState(defaultMes);

  const valeDiario = parseFloat(empresaAtiva.valeValue ?? "8.50");
  const companyId = filialAtiva?.id ?? empresaAtiva.id ?? null;

  // Feriados da empresa — datas a serem ignoradas no cálculo de vales
  const [feriadosCustom, setFeriadosCustom] = useState<string[]>([]);
  const [feriadosLoaded, setFeriadosLoaded] = useState(false);
  useEffect(() => {
    const token = localStorage.getItem("jwt_token") ?? "";
    const API_URL_LOCAL = import.meta.env.VITE_API_URL ?? "";
    fetch(`${API_URL_LOCAL}/api/me/holidays`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((data: { date: string }[]) => {
        setFeriadosCustom(data.map(h => h.date));
        setFeriadosLoaded(true);
      })
      .catch(() => setFeriadosLoaded(true)); // mesmo em erro, marca como carregado
  }, []);

  // Feriados nacionais fixos — sempre ignorados
  function getFeriadosNacionais(ano: number): string[] {
    const fixos = [
      `${ano}-01-01`, `${ano}-04-21`, `${ano}-05-01`,
      `${ano}-09-07`, `${ano}-10-12`, `${ano}-11-02`,
      `${ano}-11-15`, `${ano}-11-20`, `${ano}-12-25`,
    ];
    // Páscoa
    const a = ano % 19, b = Math.floor(ano/100), cc = ano % 100;
    const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
    const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
    const i = Math.floor(cc/4), k = cc % 4, l = (32+2*e+2*i-h-k) % 7;
    const m = Math.floor((a+11*h+22*l)/451);
    const pMonth = Math.floor((h+l-7*m+114)/31);
    const pDay   = ((h+l-7*m+114) % 31)+1;
    const pascoa = new Date(ano, pMonth-1, pDay);
    const addD = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
    const fmt  = (d: Date) => d.toISOString().split("T")[0]!;
    return [
      ...fixos,
      fmt(addD(pascoa, -48)), fmt(addD(pascoa, -47)), // carnaval
      fmt(addD(pascoa, -2)),  // sexta santa
      fmt(pascoa),            // páscoa
      fmt(addD(pascoa, 60)),  // corpus christi
    ];
  }

  // Conjunto completo de datas a ignorar (nacionais + customizados)
  const todosFeriados = useMemo(() => {
    const anos = [periodoAno - 1, periodoAno, periodoAno + 1];
    const nacionais = anos.flatMap(getFeriadosNacionais);
    return new Set([...nacionais, ...feriadosCustom]);
  }, [periodoAno, feriadosCustom]);

  const fetchPedidos = useCallback(async (cid: number) => {
    setLoadingPedidos(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/me/purchase-orders?companyId=${cid}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        setPedidos([]);
        return;
      }
      const data = await res.json() as {
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
      }[];
      setPedidos(
        data
          .filter(o => o.vales > 0) // Filter out discount entries (negative vales)
          .map(o => ({
            id: o.id,
            colaboradorId: o.employeeId ?? 0,
            nome: o.nome,
            turno: o.turno,
            periodo: o.periodo,
            dataInicio: o.dataInicio,
            dataFim: o.dataFim,
            dias: o.dias,
            vales: o.vales,
            valorUnit: parseFloat(o.valorUnit),
            total: parseFloat(o.total),
            status: o.status,
            proRata: o.proRata,
          })),
      );
    } catch (err) {
      console.error("[compras] erro ao carregar pedidos:", err);
    } finally {
      setLoadingPedidos(false);
    }
  }, []);

  useEffect(() => {
    if (companyId) {
      void fetchPedidos(companyId);
    } else {
      setLoadingPedidos(false);
    }
  }, [companyId, fetchPedidos]);

  useEffect(() => {
    if (!companyId) return;
    const onUpdated = () => void fetchPedidos(companyId);
    window.addEventListener("purchase-orders:updated", onUpdated);
    return () => window.removeEventListener("purchase-orders:updated", onUpdated);
  }, [companyId, fetchPedidos]);

  // Usa todosColaboradores para saber se o contexto já carregou
  // (colaboradoresDaFilial pode ser subset vazio se filial ainda não setou)
  const contextCarregado = todosColaboradores.length > 0 || !loadingPedidos;

  // Colaboradores com cadastro incompleto — bloqueados da compra de vales
  // até que todas as pendências sejam resolvidas (CPF, telefone, endereço, turno, data de início)
  const colaboradoresComPendencia = useMemo(() =>
    colaboradores.filter(c =>
      (c.status === "Ativo" || isFutureDate(c.inicioOperacao)) && (
        !c.cpf?.trim() ||
        !c.telefone?.trim() ||
        !c.endereco?.trim() ||
        !c.turno || c.turno === "—" ||
        !c.inicioOperacao?.trim()
      )
    ),
    [colaboradores]);

  // Colaboradores elegíveis: Ativos + Admissão (data futura)
  // Colaboradores em Admissão entram na compra mas com vales calculados
  // apenas a partir da data de início deles.
  const colaboradoresElegiveis = useMemo(() =>
    colaboradores.filter(c =>
      (c.status === "Ativo" || isFutureDate(c.inicioOperacao)) &&
      !!c.cpf?.trim() &&
      !!c.telefone?.trim() &&
      !!c.endereco?.trim() &&
      !!c.turno && c.turno !== "—" &&
      !!c.inicioOperacao?.trim()
    ),
    [colaboradores]);

  // Subconjunto dos elegíveis cuja data de início não foi parseada — aviso extra
  const semDataInicio = useMemo(() =>
    colaboradoresElegiveis.filter(c => !c.inicioOperacao || !parseInicioOp(c.inicioOperacao)),
    [colaboradoresElegiveis]);

  const previewItems = useMemo((): PreviewItem[] => {
    if (!feriadosLoaded) return []; // aguarda feriados carregarem
    return colaboradoresElegiveis
      .map(c => {
        const t = turnos.find(x => normalizeTurnoKey(x.nome) === normalizeTurnoKey(c.turno));
        const escala = inferTipoEscala(c.turno, t);
        const { dias, proRata, fromDay } = calcularDiasNoMes(escala, c.inicioOperacao, periodoAno, periodoMes, todosFeriados, t?.escala);
        const vales = dias * 2;
        const total = vales * valeDiario;
        const dataInicio = formatDate(periodoAno, periodoMes, fromDay);
        const dataFim    = formatDate(periodoAno, periodoMes, ultimoDiaDoMes(periodoAno, periodoMes));
        const periodo    = `${MESES_CURTO[periodoMes - 1]}/${periodoAno}`;
        return { colaborador: c, turnoNome: c.turno, dias, vales, valorUnit: valeDiario, total, dataInicio, dataFim, periodo, proRata };
      })
      .filter(item => item.dias > 0);
  }, [colaboradoresElegiveis, turnos, periodoAno, periodoMes, valeDiario, todosFeriados, feriadosLoaded]);

  /**
   * Current period label used to detect which orders already exist for this period.
   * e.g. "Mai/2026"
   */
  const periodoLabel = `${MESES_CURTO[periodoMes - 1]}/${periodoAno}`;
  const autoGeradoParaRef = useRef("");

  useEffect(() => {
    if (!companyId || loadingPedidos || savingPedidos) return;
    if (!contextCarregado || !feriadosLoaded || previewItems.length === 0) return;

    const colaboradoresKey = previewItems
      .map(item => `${item.colaborador.id}:${item.dias}:${item.vales}:${item.total}:${item.dataInicio}:${item.dataFim}`)
      .sort()
      .join(",");
    const runKey = `${companyId}:${periodoLabel}:${colaboradoresKey}`;
    if (autoGeradoParaRef.current === runKey) return;

    autoGeradoParaRef.current = runKey;
    setSavingPedidos(true);

    processCompanyPurchaseOrders({
      companyId,
      colaboradores,
      turnos,
      periodoAno,
      periodoMes,
      valeDiario,
      feriados: todosFeriados,
    })
      .then(saved => {
        setAutoError("");
        if (saved.length > 0) {
          setPedidos(prev => {
            const savedById = new Map(saved.map(p => [p.id, p]));
            const existingIds = new Set(prev.map(p => p.id));
            const atualizados = prev.map(p => savedById.get(p.id) ?? p);
            const novos = saved.filter(p => !existingIds.has(p.id));
            return novos.length > 0 || saved.some(p => existingIds.has(p.id)) ? [...novos, ...atualizados] : prev;
          });
        }
    })
      .catch(err => {
        console.error("[compras] geração ao abrir a aba falhou:", err);
        setAutoError(err instanceof Error ? err.message : "Erro ao gerar compras automaticamente.");
      })
      .finally(() => setSavingPedidos(false));
  }, [
    colaboradores,
    companyId,
    contextCarregado,
    feriadosLoaded,
    fetchPedidos,
    loadingPedidos,
    periodoAno,
    periodoLabel,
    periodoMes,
    previewItems,
    savingPedidos,
    todosFeriados,
    turnos,
    valeDiario,
  ]);

  // Extract unique months from orders, sorted by most recent first
  const availableMonths = useMemo(() => {
    const months = new Set(pedidos.map(p => p.periodo));
    return Array.from(months).sort((a, b) => {
      // Parse month labels (e.g., "Jun/2026") to sort chronologically
      const [ma, ya] = a.split('/');
      const [mb, yb] = b.split('/');
      const monthA = MESES_CURTO.indexOf(ma);
      const monthB = MESES_CURTO.indexOf(mb);
      const yearA = parseInt(ya, 10);
      const yearB = parseInt(yb, 10);
      // Sort by year descending, then month descending
      if (yearA !== yearB) return yearB - yearA;
      return monthB - monthA;
    });
  }, [pedidos]);

  // Set default selected month to the month of the last purchase order
  useEffect(() => {
    if (availableMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  // Filter orders by selected month
  const pedidosFiltrados = useMemo(() => {
    if (!selectedMonth) return pedidos;
    return pedidos.filter(p => p.periodo === selectedMonth);
  }, [pedidos, selectedMonth]);

  const totalGasto          = pedidosFiltrados.reduce((a, p) => a + p.total, 0);
  const totalValesHistorico = pedidosFiltrados.reduce((a, p) => a + p.vales, 0);
  const ultimoPedido        = pedidos.length > 0 ? pedidos[0].periodo : "—";

  const proxDia28 = (() => {
    const candidate = new Date(hoje.getFullYear(), hoje.getMonth(), 28);
    if (candidate > hoje) return candidate;
    return new Date(hoje.getFullYear(), hoje.getMonth() + 1, 28);
  })();
  const proxDia28Str = formatDate(proxDia28.getFullYear(), proxDia28.getMonth() + 1, 28);

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CreditCard size={18} className="text-accent" />
              <h1 className="text-xl font-bold text-foreground">Compras</h1>
            </div>
            <p className="text-muted-foreground text-sm">Histórico e gestão de compras de vale-transporte.</p>
          </div>
          {availableMonths.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="month-filter" className="text-sm text-muted-foreground">Filtrar por:</label>
              <select
                id="month-filter"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-background border border-input rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {availableMonths.map(month => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total em compras", value: fmt(totalGasto) },
            { label: "Total de vales",   value: totalValesHistorico.toLocaleString("pt-BR") },
            { label: "Último pedido",    value: ultimoPedido },
          ].map(item => (
            <div key={item.label} className="bg-card border rounded-xl p-5 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">{item.label}</p>
              <p className="text-2xl font-bold text-foreground">{item.value}</p>
            </div>
          ))}
        </div>

        {/* ── Aviso: colaboradores com pendências cadastrais ── */}
        {colaboradoresComPendencia.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {colaboradoresComPendencia.length} colaborador{colaboradoresComPendencia.length > 1 ? "es" : ""} aguardando correção de pendências — vales não serão gerados para eles
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Acesse <strong>Pendências Cadastrais</strong> e preencha todos os campos obrigatórios (CPF, Telefone, Endereço, Turno e Data de Início) para incluí-los na próxima compra.
              </p>
              <p className="text-xs text-amber-600 mt-1 font-medium">
                {colaboradoresComPendencia.map(c => c.nome).join(" · ")}
              </p>
            </div>
          </div>
        )}

        {/* ── Aviso: colaboradores sem data de início ── */}
        {semDataInicio.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {semDataInicio.length} colaborador{semDataInicio.length > 1 ? "es" : ""} sem data de início preenchida
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Eles não serão incluídos na compra automática. Preencha o campo <strong>Início de Operação</strong> no cadastro de cada um para que o sistema calcule o pro-rata corretamente.
              </p>
              <p className="text-xs text-amber-600 mt-1 font-medium">
                {semDataInicio.map(c => c.nome).join(" · ")}
              </p>
            </div>
          </div>
        )}

        {autoError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">Não foi possível gerar as compras automaticamente.</p>
              <p className="text-xs text-red-700 mt-0.5">{autoError}</p>
            </div>
          </div>
        )}

        <div className="bg-card border rounded-xl shadow-sm overflow-hidden mb-5">
          {loadingPedidos || (savingPedidos && pedidos.length === 0) ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {savingPedidos && pedidos.length === 0 ? "Gerando compras automaticamente..." : "Carregando histórico..."}
            </div>
          ) : pedidos.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Nenhuma compra realizada ainda.
            </div>
          ) : pedidosFiltrados.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Nenhuma compra no período selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    {["Colaborador", "Turno", "Período", "Vales", "Valor unit.", "Total", "Status"].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pedidosFiltrados.map(p => (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-foreground">{p.nome}</p>
                        <p className="text-xs text-muted-foreground font-mono">{p.dataInicio} – {p.dataFim}</p>
                        
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground text-xs">{p.turno}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{p.periodo}</td>
                      <td className="px-5 py-3.5 font-medium text-foreground">{p.vales.toLocaleString("pt-BR")}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{fmt(p.valorUnit)}</td>
                      <td className="px-5 py-3.5 font-semibold text-foreground">{fmt(p.total)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${STATUS_STYLE[p.status]}`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <CalendarClock size={15} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-700">
            Próxima compra programada: <strong>{proxDia28Str}</strong> —{" "}
            {colaboradoresElegiveis.length} colaborador{colaboradoresElegiveis.length !== 1 ? "es" : ""} elegível{colaboradoresElegiveis.length !== 1 ? "is" : ""}.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
