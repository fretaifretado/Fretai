import { useState, useMemo, useEffect, useCallback } from "react";
import DashboardLayout from "./layout";
import { useDashboard } from "./context";
import {
  Users, TrendingUp, CalendarDays, ChevronLeft, ChevronRight,
  ArrowUpRight, Info, BarChart2, TrendingDown, DollarSign, Calendar,
  Building2, Filter, CheckCircle2, XCircle, FileSpreadsheet,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

const API_URL = import.meta.env.VITE_API_URL ?? "";
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("jwt_token") ?? "";
  return { Authorization: `Bearer ${token}` };
}

interface ScheduledRoute {
  id: number;
  shiftTime: string | null;
  direction: string | null;
  totalPassengers: number;
  createdAt: string;
}
interface PublishedBudget {
  budgetId: number;
  name: string;
  publishedAt: string;
  routes: ScheduledRoute[];
}

interface FinancialSummary {
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

const EMPTY_FINANCIAL_SUMMARY: FinancialSummary = {
  companyId: 0,
  period: "",
  periodLabel: "",
  valesComprados: 0,
  compraDoMes: 0,
  valesNaoUtilizados: 0,
  creditoGerado: 0,
  creditoAplicado: 0,
  saldoCredito: 0,
  valorNotaFiscal: 0,
};

function passageirosNoDia(budgets: PublishedBudget[], date: Date): number {
  const dayOfWeek = date.getDay(); // 0=Dom, 1=Seg, ... 6=Sab
  // Dias da semana mapeados nos turnos (SEG=1..SEX=5, SAB=6)
  // Soma passageiros de todas as rotas de IDA (evita contar Volta em dobro)
  return budgets.flatMap(b => b.routes)
    .filter(r => r.direction !== "volta") // só IDA para não duplicar
    .reduce((sum, r) => sum + r.totalPassengers, 0);
}

function isFutureDate(raw: string | undefined | null): boolean {
  if (!raw || raw === "—") return false;
  try {
    const parts = raw.split("/");
    if (parts.length !== 3) return false;
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    const date = new Date(y, m, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date > today;
  } catch { return false; }
}

function StatCard({ label, value, sub, trend }: { label: string; value: number | string; sub?: string; trend?: "up" | "down" | "neutral" }) {
  return (
    <div className="bg-card border rounded-xl p-5 shadow-sm flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex items-end gap-2">
        <p className="text-3xl font-bold text-foreground">{value}</p>
        {trend === "up" && typeof value === "number" && value > 0 && (
          <span className="text-xs text-green-600 font-semibold flex items-center gap-0.5 mb-1"><ArrowUpRight size={12} />+8%</span>
        )}
      </div>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const VALE_DIARIO = 8.50;
const STATUS_INATIVOS = ["Férias", "Licença", "Afastado", "Desligado", "Home Office"] as const;
const STATUS_COLORS: Record<string, string> = {
  "Ativo":     "#22c55e",
  "Home Office": "#94a3b8",
  "Férias":    "#3b82f6",
  "Licença":   "#f59e0b",
  "Afastado":  "#f97316",
  "Desligado": "#ef4444",
  "Admissão":  "#a855f7",
};
const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type Periodo = "mensal" | "trimestral" | "semestral" | "anual";
const PERIODO_CONFIG: Record<Periodo, { meses: number; label: string }> = {
  mensal:     { meses: 1,  label: "Último mês" },
  trimestral: { meses: 3,  label: "Último trimestre" },
  semestral:  { meses: 6,  label: "Último semestre" },
  anual:      { meses: 12, label: "Último ano" },
};

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MESES_CURTO = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function monthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const { colaboradoresDaFilial: colaboradores, colaboradores: todosColaboradores, filiais, empresaAtiva, filialAtiva } = useDashboard();

  const today    = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const [futureDate, setFutureDate] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d;
  });

  /* ── Resumo financeiro real para os cards ── */
  const companyId = filialAtiva?.id ?? empresaAtiva.id ?? null;
  const financialPeriod = monthParam(today);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary>(EMPTY_FINANCIAL_SUMMARY);
  const [loadingFinancialSummary, setLoadingFinancialSummary] = useState(false);
  const [financialSummariesByBranch, setFinancialSummariesByBranch] = useState<Map<number, FinancialSummary>>(new Map());

  const fetchFinancialSummary = useCallback(async (cid: number, period: string) => {
    setLoadingFinancialSummary(true);
    try {
      const res = await fetch(`${API_URL}/api/me/financial-summary?companyId=${cid}&period=${period}`, { headers: getAuthHeaders() });
      if (res.ok) setFinancialSummary(await res.json() as FinancialSummary);
      else setFinancialSummary(EMPTY_FINANCIAL_SUMMARY);
    } catch {
      setFinancialSummary(EMPTY_FINANCIAL_SUMMARY);
    } finally {
      setLoadingFinancialSummary(false);
    }
  }, []);

  const fetchFinancialSummariesByBranches = useCallback(async (companyIds: number[], period: string) => {
    try {
      const res = await fetch(`${API_URL}/api/me/financial-summary-by-branches?companyIds=${companyIds.join(",")}&period=${period}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json() as Array<{ companyId: number } & FinancialSummary>;
        const summariesMap = new Map<number, FinancialSummary>();
        data.forEach(item => summariesMap.set(item.companyId, item));
        setFinancialSummariesByBranch(summariesMap);
      }
    } catch {
      setFinancialSummariesByBranch(new Map());
    }
  }, []);

  useEffect(() => {
    if (companyId) void fetchFinancialSummary(companyId, financialPeriod);
    else setFinancialSummary(EMPTY_FINANCIAL_SUMMARY);
  }, [companyId, fetchFinancialSummary, financialPeriod]);

  useEffect(() => {
    if (!companyId) return;
    const onUpdated = () => { void fetchFinancialSummary(companyId, financialPeriod); };
    window.addEventListener("purchase-orders:updated", onUpdated);
    return () => window.removeEventListener("purchase-orders:updated", onUpdated);
  }, [companyId, fetchFinancialSummary, financialPeriod]);

  /* ── rotas agendadas para cards de passageiros ── */
  const [scheduledBudgets, setScheduledBudgets] = useState<PublishedBudget[]>([]);

  const fetchScheduledRoutes = useCallback(async (cid: number) => {
    try {
      const token = localStorage.getItem("jwt_token") ?? "";
      const res = await fetch(`${API_URL}/api/companies/${cid}/scheduled-routes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setScheduledBudgets(await res.json() as PublishedBudget[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const cid = filialAtiva?.id ?? empresaAtiva?.id ?? null;
    if (cid) void fetchScheduledRoutes(cid);
  }, [filialAtiva?.id, empresaAtiva?.id, fetchScheduledRoutes]);

  /* ── relatórios state ── */
  const [periodo, setPeriodo] = useState<Periodo>("mensal");
  const [filtroUnidade, setFiltroUnidade] = useState<"global" | number>("global");

  const { meses } = PERIODO_CONFIG[periodo];
  const diasPeriodo = meses * 30;

  function fmtDate(d: Date) {
    return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  }
  function shiftDate(days: number) {
    setFutureDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + days); return d; });
  }

  const ativos      = colaboradores.filter(c => c.status === "Ativo").length;
  const passageirosHoje    = passageirosNoDia(scheduledBudgets, today);
  const passageirosAmanha  = passageirosNoDia(scheduledBudgets, tomorrow);
  const passageirosFutura  = passageirosNoDia(scheduledBudgets, futureDate);
  const temRotas = scheduledBudgets.length > 0 && scheduledBudgets.some(b => b.routes.length > 0);
  const afastados   = colaboradores.filter(c => ["Férias", "Licença", "Afastado"].includes(c.status)).length;
  const pendencias = colaboradores.filter(c =>
    c.status !== "Desligado" && (
      !c.cpf?.trim() ||
      !c.telefone?.trim() ||
      !c.endereco?.trim() ||
      !c.turno || c.turno === "—" ||
      !c.inicioOperacao?.trim()
    )
  ).length;
  const filiaisAtivas = filiais.filter(f => f.empresaId === empresaAtiva.id).length;

  const alertMessage = colaboradores.length > 0 && pendencias > 0
    ? `Atenção! Existem ${pendencias} colaborador(es) com pendências cadastrais.`
    : undefined;

  /* ── relatórios data ── */
  const filiaisEmpresa = useMemo(
    () => filiais.filter(f => f.empresaId === empresaAtiva.id),
    [filiais, empresaAtiva],
  );

  useEffect(() => { setFiltroUnidade("global"); }, [empresaAtiva.id]);

  const colaboradoresEmpresa = useMemo(() => {
    const filialIds = new Set(filiaisEmpresa.map(f => f.id));
    return todosColaboradores.filter(c => c.filialId !== null && filialIds.has(c.filialId));
  }, [todosColaboradores, filiaisEmpresa]);

  const colaboradoresFiltrados = useMemo(() => {
    if (filtroUnidade === "global") return colaboradoresEmpresa;
    return colaboradoresEmpresa.filter(c => c.filialId === filtroUnidade);
  }, [colaboradoresEmpresa, filtroUnidade]);

  const valeDiario = parseFloat(empresaAtiva.valeValue ?? "8.50");
  const ativosRel   = colaboradoresFiltrados.filter(c => c.status === "Ativo" && !isFutureDate(c.inicioOperacao)).length;
  const inativosRel = colaboradoresFiltrados.filter(c => STATUS_INATIVOS.includes(c.status as never)).length;

  // Usa o status efetivo: colaboradores com data de início futura aparecem como "Admissão"
  const statusDist = Object.entries(
    colaboradoresFiltrados.reduce<Record<string, number>>((acc, c) => {
      const efetivo = isFutureDate(c.inicioOperacao) ? "Admissão" : c.status;
      acc[efetivo] = (acc[efetivo] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }))
   .sort((a, b) => b.value - a.value);

  const economiaMotivos = [
    { motivo: "Férias",    count: colaboradoresFiltrados.filter(c => c.status === "Férias").length,    color: "#3b82f6" },
    { motivo: "Licença",   count: colaboradoresFiltrados.filter(c => c.status === "Licença").length,   color: "#f59e0b" },
    { motivo: "Afastado",  count: colaboradoresFiltrados.filter(c => c.status === "Afastado").length,  color: "#f97316" },
    { motivo: "Desligado", count: colaboradoresFiltrados.filter(c => c.status === "Desligado").length, color: "#ef4444" },
  ].filter(e => e.count > 0).map(e => ({
    ...e,
    economia: e.count * (valeDiario * 2) * diasPeriodo,
    label: fmt(e.count * (valeDiario * 2) * diasPeriodo),
  }));

  const totalEconomia = economiaMotivos.reduce((a, e) => a + e.economia, 0);

  const utilizacaoPorFilial = filiaisEmpresa.map(f => {
    const total  = colaboradoresEmpresa.filter(c => c.filialId === f.id).length;
    const usando = colaboradoresEmpresa.filter(c => c.filialId === f.id && c.status === "Ativo").length;
    // Use creditoAplicado from financialSummary for the active branch, otherwise use theoretical calculation
    const economia = (filialAtiva?.id === f.id) 
      ? financialSummary.creditoAplicado 
      : (total - usando) * (valeDiario * 2) * diasPeriodo;
    return {
      name: f.nome.replace("Filial ", "").replace("Matriz — ", ""),
      usando,
      naoUsa: total - usando,
      economia,
    };
  });

  const hoje = new Date();
  const dadosMensais = Array.from({ length: Math.min(meses, 12) }, (_, i) => {
    const d = new Date(hoje);
    d.setMonth(d.getMonth() - (Math.min(meses, 12) - 1 - i));
    const diasNoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const varAleatorio = 1 + (Math.sin(i * 1.3) * 0.05);
    const ativosN   = Math.round(ativosRel * varAleatorio);
    const inativosN = Math.round(inativosRel * (1 / varAleatorio));
    return {
      mes: MONTH_LABELS[d.getMonth()],
      utilizaram: ativosN,
      naoUtilizaram: inativosN,
      economia: inativosN * (valeDiario * 2) * diasNoMes,
    };
  });

  const nomeUnidade = filtroUnidade === "global"
    ? `${empresaAtiva.nome} — Visão Global`
    : filiaisEmpresa.find(f => f.id === filtroUnidade)?.nome ?? "";

  const descricaoValesNaoUtilizados = financialSummary.valesNaoUtilizados > 0
    ? `${financialSummary.valesNaoUtilizados.toLocaleString("pt-BR")} vale(s) não utilizado(s) no mês`
    : "Nenhum desconto registrado no período";

  return (
    <DashboardLayout alertMessage={alertMessage}>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-6xl">

        {/* ── Visão geral ── */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-foreground mb-0.5">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Visão geral dos colaboradores e rotas.</p>
        </div>

        {colaboradores.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Users size={28} className="text-muted-foreground/40" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">Painel vazio</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Comece cadastrando colaboradores, filiais e turnos para ver as estatísticas aqui.
            </p>
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <StatCard
                label={`Passageiros hoje · ${fmtDate(today)}`}
                value={temRotas ? passageirosHoje : "—"}
                sub={temRotas ? `${scheduledBudgets.flatMap(b => b.routes).filter(r => r.direction !== "volta").length} rota(s) ativa(s)` : "Nenhuma rota agendada para hoje"}
                trend="up"
              />
              <StatCard
                label={`Passageiros amanhã · ${fmtDate(tomorrow)}`}
                value={temRotas ? passageirosAmanha : "—"}
                sub={temRotas ? "Baseado nas rotas publicadas" : "Nenhuma rota agendada para amanhã"}
                trend="neutral"
              />
              <div className="bg-card border rounded-xl p-5 shadow-sm flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data futura</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => shiftDate(-1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted transition-colors">
                      <ChevronLeft size={14} />
                    </button>
                    <button onClick={() => shiftDate(1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted transition-colors">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-3xl font-bold text-foreground">{temRotas ? passageirosFutura : "—"}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(futureDate)}</p>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
              {[
                { label: "Colaboradores ativos",  value: ativos.toString(),        icon: Users },
                { label: "Em férias / licença",   value: afastados.toString(),     icon: CalendarDays },
                { label: "Unidades ativas",        value: filiaisAtivas.toString(), icon: TrendingUp },
                { label: "Pendências cadastrais",  value: pendencias.toString(),    icon: null },
              ].map(kpi => (
                <div key={kpi.label} className="bg-card border rounded-xl px-4 py-3.5 shadow-sm flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10">
                    {kpi.icon
                      ? <kpi.icon size={16} className="text-accent" />
                      : <span className="block w-4 h-4 rounded-full bg-amber-500/80" />
                    }
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground leading-none mb-0.5">{kpi.value}</p>
                    <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Relatórios ── */}
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 size={18} className="text-accent" />
              <h2 className="text-lg font-bold text-foreground">Relatórios</h2>
            </div>
            <p className="text-muted-foreground text-sm mb-6">
              Visão analítica de utilização e economia de vale-transporte — <strong>{nomeUnidade}</strong>
            </p>

            {/* Filtros */}
            <div className="flex flex-wrap gap-3 mb-8 p-4 bg-muted/30 rounded-xl border">
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Filtros:</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Building2 size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Unidade:</span>
                <select
                  value={filtroUnidade}
                  onChange={e => setFiltroUnidade(e.target.value === "global" ? "global" : Number(e.target.value))}
                  className="text-xs border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <option value="global">Global (todas as unidades)</option>
                  {filiaisEmpresa.map(f => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Período:</span>
                <div className="flex rounded-lg border overflow-hidden bg-background">
                  {(Object.keys(PERIODO_CONFIG) as Periodo[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setPeriodo(p)}
                      className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${periodo === p ? "bg-accent text-white" : "hover:bg-muted text-muted-foreground"}`}
                    >
                      {p === "mensal" ? "mês" : p === "trimestral" ? "trimestre" : p === "semestral" ? "semestre" : "ano"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Report Cards — 6 Cards conforme especificação */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {/* Card 1: Vales Comprados */}
              <div className="bg-green-50/50 border border-green-100 rounded-xl p-5 shadow-sm flex flex-col gap-1">
                <div className="flex items-center gap-2 text-green-600 mb-1">
                  <CheckCircle2 size={14} />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Vales Comprados</p>
                </div>
                <p className="text-3xl font-bold text-green-700">{financialSummary.valesComprados.toLocaleString("pt-BR")}</p>
                <p className="text-[10px] text-muted-foreground">{loadingFinancialSummary ? "Atualizando..." : `Competência ${financialSummary.periodLabel || financialPeriod}`}</p>
              </div>

              {/* Card 2: Vales Não Utilizados */}
              <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-5 shadow-sm flex flex-col gap-1">
                <div className="flex items-center gap-2 text-orange-600 mb-1">
                  <XCircle size={14} />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Vales Não Utilizados</p>
                </div>
                <p className="text-3xl font-bold text-orange-700">{financialSummary.valesNaoUtilizados.toLocaleString("pt-BR")}</p>
                <p className="text-[10px] text-muted-foreground">{descricaoValesNaoUtilizados}</p>
              </div>

              {/* Card 3: Crédito Gerado */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-5 shadow-sm flex flex-col gap-1">
                <div className="flex items-center gap-2 text-blue-600 mb-1">
                  <DollarSign size={14} />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Crédito Gerado</p>
                </div>
                <p className="text-3xl font-bold text-blue-700">{fmt(financialSummary.creditoGerado)}</p>
                <p className="text-[10px] text-muted-foreground">Descontos reais gerados neste mês</p>
              </div>

              {/* Card 4: Compra do Mês */}
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 shadow-sm flex flex-col gap-1">
                <div className="flex items-center gap-2 text-indigo-600 mb-1">
                  <TrendingUp size={14} />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Compra do Mês</p>
                </div>
                <p className="text-3xl font-bold text-indigo-700">{fmt(financialSummary.compraDoMes)}</p>
                <p className="text-[10px] text-muted-foreground">Valor real das compras da competência</p>
              </div>

              {/* Card 5: Crédito Aplicado */}
              <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-5 shadow-sm flex flex-col gap-1">
                <div className="flex items-center gap-2 text-purple-600 mb-1">
                  <FileSpreadsheet size={14} />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Crédito Aplicado</p>
                </div>
                <p className="text-3xl font-bold text-purple-700">{fmt(financialSummary.creditoAplicado)}</p>
                <p className="text-[10px] text-muted-foreground">Crédito de meses anteriores aplicado agora</p>
              </div>

              {/* Card 6: Valor da Nota Fiscal */}
              <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-5 shadow-sm flex flex-col gap-1">
                <div className="flex items-center gap-2 text-rose-600 mb-1">
                  <TrendingDown size={14} />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Valor da Nota Fiscal</p>
                </div>
                <p className="text-3xl font-bold text-rose-700">{fmt(financialSummary.valorNotaFiscal)}</p>
                <p className="text-[10px] text-muted-foreground">Compra do mês - Crédito aplicado</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Distribuição por unidade */}
              <div className="bg-card border rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-foreground mb-1">Economia por unidade</h3>
                <p className="text-xs text-muted-foreground mb-6">Vale-transporte economizado por filial no período</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={utilizacaoPorFilial} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Bar dataKey="economia" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Distribuição por status */}
              <div className="bg-card border rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-foreground mb-1">Distribuição por status</h3>
                <p className="text-xs text-muted-foreground mb-6">{colaboradoresFiltrados.length} colaboradores no grupo</p>
                <div className="flex items-center justify-center gap-8 h-64">
                  <ResponsiveContainer width="50%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusDist}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {statusDist.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] ?? "#94a3b8"} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2">
                    {statusDist.map(s => (
                      <div key={s.name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: STATUS_COLORS[s.name] ?? "#94a3b8" }} />
                        <span className="text-xs text-foreground font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto pl-2">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>


          </>
        )}
      </div>
    </DashboardLayout>
  );
}
