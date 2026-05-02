import DashboardLayout from "./layout";
import { useDashboard } from "./context";
import { BarChart2, TrendingDown, Users, DollarSign, Calendar, Building2, Filter } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { useState, useMemo, useEffect } from "react";

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
  mensal:      { meses: 1,  label: "Último mês" },
  trimestral:  { meses: 3,  label: "Último trimestre" },
  semestral:   { meses: 6,  label: "Último semestre" },
  anual:       { meses: 12, label: "Último ano" },
};

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function RelatoriosPage() {
  const { colaboradores, filiais, empresaAtiva } = useDashboard();

  const [periodo, setPeriodo] = useState<Periodo>("mensal");
  const [filtroUnidade, setFiltroUnidade] = useState<"global" | number>("global");

  const { meses } = PERIODO_CONFIG[periodo];
  const diasPeriodo = meses * 30;

  // Filiais da empresa ativa
  const filiaisEmpresa = useMemo(
    () => filiais.filter(f => f.empresaId === empresaAtiva.id),
    [filiais, empresaAtiva]
  );

  // Reseta o filtro local quando o usuário troca de empresa no cabeçalho
  // (evita IDs de filial obsoletos pertencentes à empresa anterior).
  useEffect(() => {
    setFiltroUnidade("global");
  }, [empresaAtiva.id]);

  // Colaboradores da empresa ativa (somando todas as filiais da empresa)
  const colaboradoresEmpresa = useMemo(() => {
    const filialIds = new Set(filiaisEmpresa.map(f => f.id));
    return colaboradores.filter(c => c.filialId !== null && filialIds.has(c.filialId));
  }, [colaboradores, filiaisEmpresa]);

  // Colaboradores filtrados por unidade (Global = empresa inteira; senão = filial específica)
  const colaboradoresFiltrados = useMemo(() => {
    if (filtroUnidade === "global") return colaboradoresEmpresa;
    return colaboradoresEmpresa.filter(c => c.filialId === filtroUnidade);
  }, [colaboradoresEmpresa, filtroUnidade]);

  const ativos   = colaboradoresFiltrados.filter(c => c.status === "Ativo").length;
  const inativos = colaboradoresFiltrados.filter(c => STATUS_INATIVOS.includes(c.status as never)).length;

  const statusDist = Object.entries(
    colaboradoresFiltrados.reduce<Record<string, number>>((acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1;
      return acc;
    }, {})
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

  // Utilização por filial (só no modo global)
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

  // Tendência mensal
  const hoje = new Date();
  const dadosMensais = Array.from({ length: Math.min(meses, 12) }, (_, i) => {
    const d = new Date(hoje);
    d.setMonth(d.getMonth() - (Math.min(meses, 12) - 1 - i));
    const diasNoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const varAleatorio = 1 + (Math.sin(i * 1.3) * 0.05);
    const ativosN   = Math.round(ativos * varAleatorio);
    const inativosN = Math.round(inativos * (1 / varAleatorio));
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

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-6xl">

        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <BarChart2 size={18} className="text-accent" />
          <h1 className="text-xl font-bold text-foreground">Relatórios</h1>
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

          {/* Filtro unidade */}
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

          {/* Filtro período */}
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Período:</span>
            <div className="flex rounded-lg border overflow-hidden bg-background">
              {(Object.keys(PERIODO_CONFIG) as Periodo[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    periodo === p
                      ? "bg-accent text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {PERIODO_CONFIG[p].label.replace("Último ", "").replace("Última ", "")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Users,      label: "Utilizaram VT",      value: ativos.toString(),   sub: "colaboradores ativos",           color: "text-green-600", bg: "bg-green-50  border-green-100" },
            { icon: Users,      label: "Não utilizaram",     value: inativos.toString(), sub: `fora do sistema (${diasPeriodo} dias)`, color: "text-amber-600", bg: "bg-amber-50  border-amber-100" },
            { icon: Calendar,   label: "Dias contabilizados",value: diasPeriodo.toString(), sub: PERIODO_CONFIG[periodo].label, color: "text-blue-600",  bg: "bg-blue-50   border-blue-100"  },
            { icon: DollarSign, label: "Economia estimada",  value: fmt(totalEconomia),  sub: "vales não utilizados no período", color: "text-accent",    bg: "bg-accent/5  border-accent/20" },
          ].map(item => (
            <div key={item.label} className={`border rounded-xl p-4 shadow-sm ${item.bg}`}>
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
          {/* Utilização por filial (global) ou status distribuição (unidade) */}
          <div className="bg-card border rounded-xl p-5 shadow-sm">
            {filtroUnidade === "global" ? (
              <>
                <h2 className="font-semibold text-foreground mb-1">Economia por unidade</h2>
                <p className="text-xs text-muted-foreground mb-4">Vale-transporte economizado por filial no período</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={utilizacaoPorFilial} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number, n: string) => [n === "usando" ? v : fmt(v as number), n === "usando" ? "Utilizaram" : n === "naoUsa" ? "Não utilizaram" : "Economia"]} />
                    <Legend formatter={(v) => v === "usando" ? "Utilizaram" : v === "naoUsa" ? "Não utilizaram" : "Economia (R$)"} />
                    <Bar dataKey="usando"   fill="#22c55e" radius={[4,4,0,0]} name="usando" />
                    <Bar dataKey="naoUsa"   fill="#f97316" radius={[4,4,0,0]} name="naoUsa" />
                  </BarChart>
                </ResponsiveContainer>
              </>
            ) : (
              <>
                <h2 className="font-semibold text-foreground mb-1">Utilização na unidade</h2>
                <p className="text-xs text-muted-foreground mb-4">{colaboradoresFiltrados.length} colaboradores nesta unidade</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={[{ name: "Utilização", usando: ativos, naoUsa: inativos }]}
                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number, n: string) => [v, n === "usando" ? "Utilizaram" : "Não utilizaram"]} />
                    <Legend formatter={(v) => v === "usando" ? "Utilizaram" : "Não utilizaram"} />
                    <Bar dataKey="usando"  fill="#22c55e" radius={[4,4,0,0]} name="usando" />
                    <Bar dataKey="naoUsa"  fill="#f97316" radius={[4,4,0,0]} name="naoUsa" />
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
          </div>

          {/* Status pie */}
          <div className="bg-card border rounded-xl p-5 shadow-sm">
            <h2 className="font-semibold text-foreground mb-1">Distribuição por status</h2>
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
            <h2 className="font-semibold text-foreground">Economia por motivo de inatividade</h2>
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
          <h2 className="font-semibold text-foreground mb-1">Tendência — {PERIODO_CONFIG[periodo].label}</h2>
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
                  n === "utilizaram" ? "Utilizaram" : n === "naoUtilizaram" ? "Não utilizaram" : "Economia"
                ]}
              />
              <Legend formatter={(v) => v === "utilizaram" ? "Utilizaram VT" : v === "naoUtilizaram" ? "Não utilizaram" : "Economia (R$)"} />
              <Line yAxisId="left"  type="monotone" dataKey="utilizaram"    stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} name="utilizaram" />
              <Line yAxisId="left"  type="monotone" dataKey="naoUtilizaram" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} name="naoUtilizaram" />
              <Line yAxisId="right" type="monotone" dataKey="economia"      stroke="#1E90FF" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} name="economia" />
            </LineChart>
          </ResponsiveContainer>
        </div>

      </div>
    </DashboardLayout>
  );
}