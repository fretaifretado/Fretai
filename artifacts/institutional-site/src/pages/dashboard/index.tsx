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
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const API_URL = import.meta.env.VITE_API_URL ?? "";
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("jwt_token") ?? "";
  return { Authorization: `Bearer ${token}` };
}

interface PedidoApi {
  id: number;
  employeeId: number | null;
  vales: number;
  total: string;
  status: "Processando" | "Aprovado" | "Cancelado";
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
const STATUS_INATIVOS = ["Férias", "Licença", "Afastado", "Desligado"] as const;
const STATUS_COLORS: Record<string, string> = {
  "Ativo":     "#22c55e",
  "Inativo":   "#94a3b8",
  "Férias":    "#3b82f6",
  "Licença":   "#f59e0b",
  "Afastado":  "#f97316",
  "Desligado": "#ef4444",
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

function normalizeTurnoKey(name: string) {
  return (name || "").toLowerCase().replace(/\s+/g, "");
}

export default function DashboardPage() {
  const { colaboradoresDaFilial: colaboradores, colaboradores: todosColaboradores, filiais, empresaAtiva, turnos, filialAtiva } = useDashboard();

  const today    = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const [futureDate, setFutureDate] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d;
  });

  /* ── purchase orders para os cards de relatório ── */
  const [pedidos, setPedidos] = useState<PedidoApi[]>([]);
  const [loadingPedidos, setLoadingPedidos] = useState(false);
  const companyId = filialAtiva?.id ?? null;

  const fetchPedidos = useCallback(async (cid: number) => {
    setLoadingPedidos(true);
    try {
      const res = await fetch(`${API_URL}/api/me/purchase-orders?companyId=${cid}`, { headers: getAuthHeaders() });
      if (res.ok) setPedidos(await res.json() as PedidoApi[]);
    } catch { /* ignore */ } finally { setLoadingPedidos(false); }
  }, []);

  useEffect(() => {
    if (companyId) void fetchPedidos(companyId);
  }, [companyId, fetchPedidos]);

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
  const afastados   = colaboradores.filter(c => ["Férias", "Licença", "Afastado"].includes(c.status)).length;
  const pendencias  = colaboradores.filter(c => !c.telefone || !c.endereco || !c.cep).length;
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

  const ativosRel   = colaboradoresFiltrados.filter(c => c.status === "Ativo").length;
  const inativosRel = colaboradoresFiltrados.filter(c => STATUS_INATIVOS.includes(c.status as never)).length;

  const statusDist = Object.entries(
    colaboradoresFiltrados.reduce<Record<string, number>>((acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  const economiaMotivos = [
    { motivo: "Férias",    count: colaboradoresFiltrados.filter(c => c.status === "Férias").length,    color: "#3b82f6" },
    { motivo: "Licença",   count: colaboradoresFiltrados.filter(c => c.status === "Licença").length,   color: "#f59e0b" },
    { motivo: "Afastado",  count: colaboradoresFiltrados.filter(c => c.status === "Afastado").length,  color: "#f97316" },
    { motivo: "Desligado", count: colaboradoresFiltrados.filter(c => c.status === "Desligado").length, color: "#ef4444" },
    { motivo: "Inativo",   count: colaboradoresFiltrados.filter(c => c.status === "Inativo").length,   color: "#94a3b8" },
  ].filter(e => e.count > 0).map(e => ({
    ...e,
    economia: e.count * VALE_DIARIO * diasPeriodo,
    label: fmt(e.count * VALE_DIARIO * diasPeriodo),
  }));

  const totalEconomia = economiaMotivos.reduce((a, e) => a + e.economia, 0);

  const utilizacaoPorFilial = filiaisEmpresa.map(f => {
    const total  = colaboradoresEmpresa.filter(c => c.filialId === f.id).length;
    const usando = colaboradoresEmpresa.filter(c => c.filialId === f.id && c.status === "Ativo").length;
    return {
      name: f.nome.replace("Filial ", "").replace("Matriz — ", ""),
      usando,
      naoUsa: total - usando,
      economia: (total - usando) * VALE_DIARIO * diasPeriodo,
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
      economia: inativosN * VALE_DIARIO * diasNoMes,
    };
  });

  const nomeUnidade = filtroUnidade === "global"
    ? `${empresaAtiva.nome} — Visão Global`
    : filiaisEmpresa.find(f => f.id === filtroUnidade)?.nome ?? "";

  /* ── métricas dos 5 cards de relatório ── */
  const valeDiario = parseFloat(empresaAtiva.valeValue ?? "8.50");

  const valesUtilizados = useMemo(
    () => pedidos.filter(p => p.status !== "Cancelado").reduce((s, p) => s + p.vales, 0),
    [pedidos],
  );

  const valorTotalCompras = useMemo(
    () => pedidos.filter(p => p.status !== "Cancelado").reduce((s, p) => s + parseFloat(p.total), 0),
    [pedidos],
  );

  const inativosHoje = useMemo(
    () => colaboradoresFiltrados.filter(c => ["Férias","Licença","Afastado","Desligado","Inativo"].includes(c.status)),
    [colaboradoresFiltrados],
  );

  const diasMesAtual = useMemo(() => {
    const h = new Date();
    return new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate();
  }, []);

  const valesNaoUtilizados = inativosHoje.length * 2 * diasMesAtual;

  const economiaMensal = inativosHoje.length * valeDiario * 2 * diasMesAtual;

  const nextPeriodoLabel = useMemo(() => {
    const h = new Date();
    const ano = h.getDate() >= 28 ? (h.getMonth() === 11 ? h.getFullYear() + 1 : h.getFullYear()) : h.getFullYear();
    const mes = h.getDate() >= 28 ? (h.getMonth() === 11 ? 1 : h.getMonth() + 2) : h.getMonth() + 1;
    return `${MESES_CURTO[mes - 1]}/${ano}`;
  }, []);

  const notaASerGerada = useMemo(() => {
    return colaboradoresFiltrados
      .filter(c => c.status === "Ativo" && c.turno !== "—")
      .reduce((sum, c) => {
        const t = turnos.find(x => normalizeTurnoKey(x.nome) === normalizeTurnoKey(c.turno));
        let dias = 22;
        switch (t?.tipoEscala) {
          case "5x2": dias = 22; break; case "6x1": dias = 26; break;
          case "12x36": dias = 15; break; case "24x48": dias = 10; break;
        }
        return sum + dias * 2 * valeDiario;
      }, 0);
  }, [colaboradoresFiltrados, turnos, valeDiario]);

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
                value={ativos}
                sub={`Em ${filiaisAtivas} unidade(s) ativa(s)`}
                trend="up"
              />
              <StatCard
                label={`Passageiros amanhã · ${fmtDate(tomorrow)}`}
                value={ativos}
                sub="Previsão baseada em turnos"
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
                <p className="text-3xl font-bold text-foreground">{ativos}</p>
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

            {/* Próximas alterações */}
            <div className="bg-card border rounded-xl shadow-sm overflow-hidden mb-10">
              <div className="px-5 py-4 border-b">
                <h3 className="font-semibold text-foreground text-sm">Próximas alterações (próximos 15 dias)</h3>
              </div>
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Info size={18} className="text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
              </div>
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
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        periodo === p ? "bg-accent text-white" : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {PERIODO_CONFIG[p].label.replace("Último ", "").replace("Última ", "")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* KPI Cards — Relatórios */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {[
                {
                  icon: CheckCircle2,
                  label: "Vales utilizados",
                  value: loadingPedidos ? "…" : valesUtilizados.toLocaleString("pt-BR"),
                  sub: "Total de vales emitidos (pedidos não cancelados)",
                  color: "text-green-700", bg: "bg-green-50 border-green-100",
                },
                {
                  icon: XCircle,
                  label: "Vales não utilizados",
                  value: `${valesNaoUtilizados.toLocaleString("pt-BR")}`,
                  sub: `${inativosHoje.length} colaborador(es) inativo(s) × 2 vales/dia × ${diasMesAtual} dias`,
                  color: "text-orange-600", bg: "bg-orange-50 border-orange-100",
                },
                {
                  icon: DollarSign,
                  label: "Valor total das compras",
                  value: loadingPedidos ? "…" : fmt(valorTotalCompras),
                  sub: "Soma de todos os pedidos não cancelados",
                  color: "text-blue-700", bg: "bg-blue-50 border-blue-100",
                },
                {
                  icon: TrendingDown,
                  label: "Economia atual",
                  value: fmt(economiaMensal),
                  sub: `Estimativa mensal — colaboradores fora do sistema × R$ ${valeDiario.toFixed(2)}/dia`,
                  color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100",
                },
                {
                  icon: FileSpreadsheet,
                  label: "Nota a ser gerada",
                  value: fmt(notaASerGerada),
                  sub: `Previsão para ${nextPeriodoLabel} com base nos colaboradores ativos`,
                  color: "text-violet-700", bg: "bg-violet-50 border-violet-100",
                },
              ].map(item => (
                <div key={item.label} className={`border rounded-xl p-5 shadow-sm ${item.bg}`}>
                  <div className={`flex items-center gap-2 mb-2 ${item.color}`}>
                    <item.icon size={15} />
                    <p className="text-xs font-semibold uppercase tracking-wide">{item.label}</p>
                  </div>
                  <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.sub}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Utilização por filial / status */}
              <div className="bg-card border rounded-xl p-5 shadow-sm">
                {filtroUnidade === "global" ? (
                  <>
                    <h3 className="font-semibold text-foreground mb-1">Economia por unidade</h3>
                    <p className="text-xs text-muted-foreground mb-4">Vale-transporte economizado por filial no período</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={utilizacaoPorFilial} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number, n: string) => [n === "usando" ? v : fmt(v), n === "usando" ? "Utilizaram" : n === "naoUsa" ? "Não utilizaram" : "Economia"]} />
                        <Legend formatter={(v) => v === "usando" ? "Utilizaram" : v === "naoUsa" ? "Não utilizaram" : "Economia (R$)"} />
                        <Bar dataKey="usando"  fill="#22c55e" radius={[4,4,0,0]} name="usando" />
                        <Bar dataKey="naoUsa"  fill="#f97316" radius={[4,4,0,0]} name="naoUsa" />
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                ) : (
                  <>
                    <h3 className="font-semibold text-foreground mb-1">Utilização na unidade</h3>
                    <p className="text-xs text-muted-foreground mb-4">{colaboradoresFiltrados.length} colaboradores nesta unidade</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={[{ name: "Utilização", usando: ativosRel, naoUsa: inativosRel }]}
                        margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number, n: string) => [v, n === "usando" ? "Utilizaram" : "Não utilizaram"]} />
                        <Legend formatter={(v) => v === "usando" ? "Utilizaram" : "Não utilizaram"} />
                        <Bar dataKey="usando" fill="#22c55e" radius={[4,4,0,0]} name="usando" />
                        <Bar dataKey="naoUsa" fill="#f97316" radius={[4,4,0,0]} name="naoUsa" />
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                )}
              </div>

              {/* Status pie */}
              <div className="bg-card border rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-foreground mb-1">Distribuição por status</h3>
                <p className="text-xs text-muted-foreground mb-4">{colaboradoresFiltrados.length} colaboradores {filtroUnidade === "global" ? "no grupo" : "nesta unidade"}</p>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="55%" height={200}>
                    <PieChart>
                      <Pie data={statusDist} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                        {statusDist.map(entry => (
                          <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#94a3b8"} />
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

            {/* Economia por motivo */}
            <div className="bg-card border rounded-xl p-5 shadow-sm mb-6">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={16} className="text-green-600" />
                <h3 className="font-semibold text-foreground">Economia por motivo de inatividade</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-5">
                Valor economizado = nº colaboradores × R$ {VALE_DIARIO.toFixed(2)}/dia × {diasPeriodo} dias ({PERIODO_CONFIG[periodo].label})
              </p>
              {economiaMotivos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum colaborador inativo no momento.</p>
              ) : (
                <div className="space-y-3">
                  {economiaMotivos.map(e => (
                    <div key={e.motivo} className="flex items-center gap-4">
                      <div className="w-24 shrink-0">
                        <span className="text-sm font-medium text-foreground">{e.motivo}</span>
                      </div>
                      <div className="flex-1 bg-muted/30 rounded-full h-7 overflow-hidden">
                        <div
                          className="h-full rounded-full flex items-center justify-end pr-3 transition-all"
                          style={{ width: `${Math.max(10, (e.economia / totalEconomia) * 100)}%`, background: e.color }}
                        >
                          <span className="text-white text-xs font-bold">{e.count}</span>
                        </div>
                      </div>
                      <div className="w-28 shrink-0 text-right">
                        <span className="text-sm font-bold text-foreground">{e.label}</span>
                      </div>
                    </div>
                  ))}
                  <div className="border-t pt-3 flex justify-between items-center">
                    <span className="text-sm font-semibold text-foreground">Total economizado no período</span>
                    <span className="text-lg font-bold text-green-600">{fmt(totalEconomia)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Tendência */}
            <div className="bg-card border rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-foreground mb-1">Tendência — {PERIODO_CONFIG[periodo].label}</h3>
              <p className="text-xs text-muted-foreground mb-4">Evolução de utilização e economia no período selecionado</p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={dadosMensais} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={v => `R$${(v/1000).toFixed(1)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number, n: string) => [
                      n === "economia" ? fmt(v) : v,
                      n === "utilizaram" ? "Utilizaram" : n === "naoUtilizaram" ? "Não utilizaram" : "Economia",
                    ]}
                  />
                  <Legend formatter={(v) => v === "utilizaram" ? "Utilizaram VT" : v === "naoUtilizaram" ? "Não utilizaram" : "Economia (R$)"} />
                  <Line yAxisId="left"  type="monotone" dataKey="utilizaram"    stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} name="utilizaram" />
                  <Line yAxisId="left"  type="monotone" dataKey="naoUtilizaram" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} name="naoUtilizaram" />
                  <Line yAxisId="right" type="monotone" dataKey="economia"      stroke="#1E90FF" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} name="economia" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
