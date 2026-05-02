import { useState } from "react";
import DashboardLayout from "./layout";
import { useDashboard } from "./context";
import { Users, TrendingUp, CalendarDays, ChevronLeft, ChevronRight, ArrowUpRight, Info } from "lucide-react";

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

const TIPO_COLOR: Record<string, string> = {
  Turno:  "bg-blue-100 text-blue-700 border-blue-200",
  Status: "bg-purple-100 text-purple-700 border-purple-200",
  Local:  "bg-teal-100 text-teal-700 border-teal-200",
};

export default function DashboardPage() {
  const { colaboradoresDaFilial: colaboradores, filiais, empresaAtiva } = useDashboard();

  const today    = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const [futureDate, setFutureDate] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d;
  });

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

  return (
    <DashboardLayout alertMessage={alertMessage}>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">

        <div className="mb-8">
          <h1 className="text-xl font-bold text-foreground mb-0.5">Estatísticas</h1>
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              {[
                { label: "Colaboradores ativos",  value: ativos.toString(),     icon: Users },
                { label: "Em férias / licença",   value: afastados.toString(),  icon: CalendarDays },
                { label: "Unidades ativas",        value: filiaisAtivas.toString(), icon: TrendingUp },
                { label: "Pendências cadastrais",  value: pendencias.toString(), icon: null },
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

            {/* Tabela vazia por enquanto */}
            <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
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
          </>
        )}
      </div>
    </DashboardLayout>
  );
}