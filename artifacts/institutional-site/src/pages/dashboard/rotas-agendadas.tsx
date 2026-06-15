import { useEffect, useState } from "react";
import DashboardLayout from "./layout";
import { useDashboard } from "./context";
import { apiUrl } from "@/lib/api";
import {
  Calendar, MapPin, Bus, Users, Ruler, Clock,
  ChevronDown, ChevronUp, User, Truck, UserCheck,
} from "lucide-react";

interface Colaborador {
  name: string;
  shift: string | null;
  boardingPoint: string;
  address: string;
}

interface ScheduledRoute {
  id: number;
  name: string;
  shiftTime: string | null;
  direction: string | null;
  totalPassengers: number;
  totalDistanceKm: string | null;
  estimatedMinutes: number;
  occupancyPct: string | null;
  vehicleAssignments: Array<{ vehicleType?: string; capacity?: number }>;
  createdAt: string;
  colaboradores: Colaborador[];
}

interface PublishedBudget {
  budgetId: number;
  name: string;
  destinationAddress: string | null;
  employeesCount: number;
  publishedAt: string;
  routes: ScheduledRoute[];
}

function fmtDateTime(date: string) {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(date: string) {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function fmtTime(min: number) {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ""}` : `${m}min`;
}

function RouteCard({ route }: { route: ScheduledRoute }) {
  const [showWorkers, setShowWorkers] = useState(false);
  const isIda = route.direction !== "volta";
  const occ = route.occupancyPct ? parseFloat(route.occupancyPct) : null;
  const occColor = occ == null ? "text-muted-foreground" : occ >= 80 ? "text-emerald-600" : occ >= 60 ? "text-amber-600" : "text-red-500";
  const badgeCls = isIda ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700";
  const vehicleType = route.vehicleAssignments[0]?.vehicleType ?? null;

  return (
    <div className="border rounded-xl overflow-hidden mb-3 bg-card shadow-sm">
      {/* ── Header row ── */}
      <div className="flex items-stretch gap-0">
        {/* Turno + sentido */}
        <div className={`flex flex-col items-center justify-center px-5 py-4 border-r ${isIda ? "bg-blue-50" : "bg-violet-50"} min-w-[90px]`}>
          <span className="text-xl font-bold text-foreground">{route.shiftTime ?? "—"}</span>
          <span className={`mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeCls}`}>
            {isIda ? "→ Ida" : "← Volta"}
          </span>
        </div>

        {/* Info grid */}
        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-0 divide-x">
          {/* Veículo */}
          <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Truck size={10} /> Veículo
            </span>
            <span className="text-sm font-medium text-foreground">{vehicleType ?? "—"}</span>
            <span className="text-[11px] text-muted-foreground">Placa: <em>a definir</em></span>
          </div>

          {/* Motorista */}
          <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <UserCheck size={10} /> Motorista
            </span>
            <span className="text-sm text-muted-foreground italic">A definir</span>
          </div>

          {/* Data e horário */}
          <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Calendar size={10} /> Data e Horário
            </span>
            <span className="text-sm font-medium text-foreground">{fmtDateTime(route.createdAt)}</span>
          </div>

          {/* Stats */}
          <div className="flex flex-col justify-center px-4 py-3 gap-1.5">
            <div className="flex items-center gap-1.5 text-sm">
              <Users size={13} className="text-muted-foreground" />
              <span className="font-medium">{route.totalPassengers} passageiros</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Ruler size={11} />{route.totalDistanceKm ? `${parseFloat(route.totalDistanceKm).toFixed(1)} km` : "—"}</span>
              <span className="flex items-center gap-1"><Clock size={11} />{fmtTime(route.estimatedMinutes)}</span>
              {occ != null && <span className={`font-bold ${occColor}`}>{occ.toFixed(0)}%</span>}
            </div>
          </div>
        </div>

        {/* Toggle colaboradores */}
        <button
          onClick={() => setShowWorkers(o => !o)}
          className="flex flex-col items-center justify-center px-4 border-l hover:bg-muted/30 transition-colors gap-1 min-w-[80px]"
        >
          <Users size={15} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-medium">Colaboradores</span>
          {showWorkers ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </button>
      </div>

      {/* ── Colaboradores expandable ── */}
      {showWorkers && (
        <div className="border-t bg-muted/20">
          {route.colaboradores.length === 0 ? (
            <p className="text-sm text-muted-foreground px-5 py-4 italic">Nenhum colaborador associado a esta rota.</p>
          ) : (
            <div>
              {/* Column header */}
              <div className="grid grid-cols-3 px-5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
                <span className="flex items-center gap-1"><User size={10} /> Nome</span>
                <span>Ponto de Embarque</span>
                <span>Turno</span>
              </div>
              {route.colaboradores.map((c, i) => (
                <div key={i} className="grid grid-cols-3 px-5 py-2.5 text-sm border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                  <span className="font-medium text-foreground truncate pr-2">{c.name}</span>
                  <span className="text-muted-foreground truncate pr-2 flex items-center gap-1">
                    <MapPin size={11} className="shrink-0" />{c.boardingPoint || c.address || "—"}
                  </span>
                  <span className="text-muted-foreground">{c.shift ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BudgetBlock({ budget }: { budget: PublishedBudget }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-6">
      {/* Budget header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-card border shadow-sm hover:bg-muted/20 transition-colors text-left mb-3"
        onClick={() => setOpen(o => !o)}
      >
        <Bus size={16} className="text-accent flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">{budget.name}</p>
          {budget.destinationAddress && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin size={10} />{budget.destinationAddress}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
          <span className="font-medium">{budget.routes.length} rota{budget.routes.length !== 1 ? "s" : ""}</span>
          <span>{budget.employeesCount} func.</span>
          <span>Publicado em {fmtDate(budget.publishedAt)}</span>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>
      </button>

      {open && (
        <div className="pl-2">
          {budget.routes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma rota neste orçamento.</p>
          ) : (
            budget.routes.map(r => <RouteCard key={r.id} route={r} />)
          )}
        </div>
      )}
    </div>
  );
}

export default function RotasAgendadasPage() {
  const { empresaAtiva } = useDashboard();
  const [budgets, setBudgets] = useState<PublishedBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!empresaAtiva.id) return;
    const companyId = empresaAtiva.id;
    const token = localStorage.getItem("jwt_token");
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    setLoading(true);
    setError("");

    async function load() {
      try {
        const r = await fetch(apiUrl(`/api/companies/${companyId}/scheduled-routes`), { headers });
        if (!r.ok) throw new Error(r.statusText);
        const data = (await r.json()) as PublishedBudget[];
        setBudgets(data);
      } catch {
        setError("Erro ao carregar rotas agendadas.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [empresaAtiva.id]);

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">
        <div className="flex items-center gap-2 mb-8">
          <Calendar size={18} className="text-accent" />
          <h1 className="text-xl font-bold text-foreground">Rotas Agendadas</h1>
        </div>

        {loading && (
          <div className="bg-card border rounded-xl p-8 text-center text-sm text-muted-foreground animate-pulse">
            Carregando rotas…
          </div>
        )}

        {error && !loading && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && budgets.length === 0 && (
          <div className="bg-card border rounded-xl p-16 text-center">
            <MapPin size={32} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma rota agendada.</p>
            <p className="text-xs text-muted-foreground mt-1">As rotas aparecem aqui quando um orçamento é publicado pelo administrador.</p>
          </div>
        )}

        {!loading && budgets.map(b => <BudgetBlock key={b.budgetId} budget={b} />)}
      </div>
    </DashboardLayout>
  );
}
