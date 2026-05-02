import { useState, useEffect, useCallback } from "react";
import {
  X, Users, AlertTriangle, CalendarClock, Radio, Calendar,
  CreditCard, FileText, Clock, LayoutDashboard, CheckCircle,
  XCircle, Building2, GitBranch, TrendingUp, DollarSign,
  ArrowUpRight, Search, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ─── Types ─────────────────────────────────────────────── */

interface Company {
  id: number;
  name: string;
  cnpj: string;
  address: string;
  phone: string;
  email: string;
  valeValue: string;
  createdAt: string;
}

interface Branch {
  id: number;
  name: string;
  cnpj: string;
  city: string | null;
  state: string | null;
  parentCompanyId: number | null;
}

interface Employee {
  id: number;
  companyId: number;
  name: string;
  cpf: string;
  matricula: string;
  admissionDate: string | null;
  route: string | null;
  turno?: string | null;
  status?: string | null;
  phone?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  email?: string | null;
  birthDate?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  valeValue?: string | null;
  codigo?: string | null;
}

interface PurchaseOrder {
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
  valorUnit: string;
  total: string;
  status: string;
  proRata: boolean;
  createdAt: string;
}

interface ScheduledMovement {
  id: number;
  tipo: string;
  valorNovo: string;
  inicio: string;
  fim: string;
  estado: string;
  criadoEm: string;
  alvos: { colaboradorId: number; valorAnterior: string }[];
}

/* ─── Helpers ────────────────────────────────────────────── */

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  if (!iso || iso === "9999-12-31") return "—";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

function formatCNPJ(v: string) {
  const d = (v || "").replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

const STATUS_STYLE: Record<string, string> = {
  Ativo:     "bg-green-100 text-green-700 border-green-200",
  Inativo:   "bg-gray-100 text-gray-700 border-gray-200",
  Férias:    "bg-blue-100 text-blue-700 border-blue-200",
  Licença:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  Afastado:  "bg-orange-100 text-orange-700 border-orange-200",
  Desligado: "bg-red-100 text-red-700 border-red-200",
};

const ORDER_STATUS_STYLE: Record<string, string> = {
  Processando: "bg-blue-100 text-blue-700 border-blue-200",
  Aprovado:    "bg-green-100 text-green-700 border-green-200",
  Cancelado:   "bg-red-100 text-red-700 border-red-200",
};

const ESTADO_STYLE: Record<string, string> = {
  pendente:  "bg-blue-50 text-blue-700 border-blue-200",
  ativo:     "bg-green-50 text-green-700 border-green-200",
  concluido: "bg-gray-100 text-gray-600 border-gray-200",
};

const TABS = [
  { id: "dashboard",         label: "Dashboard",        icon: LayoutDashboard },
  { id: "colaboradores",     label: "Colaboradores",    icon: Users },
  { id: "pendencias",        label: "Pendências",       icon: AlertTriangle },
  { id: "status-agendados",  label: "Status Agendados", icon: CalendarClock },
  { id: "rota-ao-vivo",      label: "Rota ao vivo",     icon: Radio },
  { id: "rotas-agendadas",   label: "Rotas Agendadas",  icon: Calendar },
  { id: "compras",           label: "Compras",          icon: CreditCard },
  { id: "notas-fiscais",     label: "Notas Fiscais",    icon: FileText },
  { id: "turnos",            label: "Turnos",           icon: Clock },
];

interface Props {
  company: Company;
  token: string;
  onClose: () => void;
}

/* ─── Main Component ────────────────────────────────────── */

export default function CompanyDetailPanel({ company, token, onClose }: Props) {
  const [activeTab, setActiveTab] = useState("dashboard");

  const [branches,  setBranches]  = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [orders,    setOrders]    = useState<PurchaseOrder[]>([]);
  const [movements, setMovements] = useState<ScheduledMovement[]>([]);

  const [loadingBranches,  setLoadingBranches]  = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingOrders,    setLoadingOrders]    = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);

  const [searchColabs, setSearchColabs] = useState("");

  const headers = { Authorization: `Bearer ${token}` };

  const fetchAll = useCallback(async () => {
    setLoadingBranches(true);
    setLoadingEmployees(true);
    setLoadingOrders(true);
    setLoadingMovements(true);

    const [brRes, empRes, ordRes, movRes] = await Promise.allSettled([
      fetch(`/api/admin/companies/${company.id}/branches`,             { headers }).then(r => r.ok ? r.json() as Promise<Branch[]> : []),
      fetch(`/api/companies/${company.id}/employees`,                  { headers }).then(r => r.ok ? r.json() as Promise<Employee[]> : []),
      fetch(`/api/admin/companies/${company.id}/purchase-orders`,      { headers }).then(r => r.ok ? r.json() as Promise<PurchaseOrder[]> : []).catch(() => [] as PurchaseOrder[]),
      fetch(`/api/admin/companies/${company.id}/scheduled-movements`,  { headers }).then(r => r.ok ? r.json() as Promise<ScheduledMovement[]> : []).catch(() => [] as ScheduledMovement[]),
    ]);

    setBranches(brRes.status === "fulfilled" ? brRes.value : []);
    setEmployees(empRes.status === "fulfilled" ? empRes.value : []);
    setOrders(ordRes.status === "fulfilled" ? ordRes.value : []);
    setMovements(movRes.status === "fulfilled" ? movRes.value : []);

    setLoadingBranches(false);
    setLoadingEmployees(false);
    setLoadingOrders(false);
    setLoadingMovements(false);
  }, [company.id, token]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const valeDiario = parseFloat(company.valeValue ?? "8.50");

  const ativos   = employees.filter(e => !e.status || e.status === "Ativo").length;
  const inativos = employees.filter(e => e.status && e.status !== "Ativo" && e.status !== "Desligado").length;
  const pendencias = employees.filter(e => !e.phone?.trim() || !e.address?.trim() || !e.turno || e.turno === "—").length;

  const totalOrders = orders.reduce((s, o) => s + parseFloat(o.total), 0);
  const totalVales  = orders.reduce((s, o) => s + o.vales, 0);

  const filteredEmployees = employees.filter(e => {
    const q = searchColabs.toLowerCase();
    return !q || e.name.toLowerCase().includes(q) || e.cpf.includes(q) || (e.matricula || "").toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-5xl h-full bg-background flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b bg-primary text-primary-foreground shrink-0">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Building2 size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg text-white leading-tight truncate">{company.name}</h2>
            <p className="text-xs text-white/60 font-mono">{formatCNPJ(company.cnpj)}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors">
            <X size={18} className="text-white" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b bg-card shrink-0 scrollbar-none">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                activeTab === tab.id
                  ? "border-accent text-accent bg-accent/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.id === "pendencias" && pendencias > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{pendencias}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-6 max-w-4xl">

            {/* ── DASHBOARD ── */}
            {activeTab === "dashboard" && (
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">Visão geral</h3>
                <p className="text-muted-foreground text-sm mb-6">{company.name} — dados consolidados</p>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: "Colaboradores",   value: employees.length,    icon: Users,       color: "text-accent" },
                    { label: "Ativos",           value: ativos,              icon: TrendingUp,  color: "text-green-600" },
                    { label: "Em afastamento",   value: inativos,            icon: Calendar,    color: "text-amber-600" },
                    { label: "Pendências",       value: pendencias,          icon: AlertTriangle, color: "text-red-500" },
                  ].map(k => (
                    <div key={k.label} className="bg-card border rounded-xl p-4 shadow-sm">
                      <div className={`flex items-center gap-1.5 mb-2 ${k.color}`}>
                        <k.icon size={14} />
                        <p className="text-xs font-semibold uppercase tracking-wide">{k.label}</p>
                      </div>
                      <p className="text-3xl font-bold text-foreground">{k.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                  <div className="bg-card border rounded-xl p-5 shadow-sm">
                    <h4 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-1.5">
                      <CreditCard size={14} className="text-accent" />Compras
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Total vales</p>
                        <p className="text-2xl font-bold text-foreground">{loadingOrders ? "…" : totalVales.toLocaleString("pt-BR")}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Valor total</p>
                        <p className="text-2xl font-bold text-accent">{loadingOrders ? "…" : fmt(totalOrders)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">{orders.length} pedido(s) registrado(s)</p>
                  </div>

                  <div className="bg-card border rounded-xl p-5 shadow-sm">
                    <h4 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-1.5">
                      <GitBranch size={14} className="text-accent" />Filiais
                    </h4>
                    {loadingBranches ? (
                      <p className="text-xs text-muted-foreground">Carregando...</p>
                    ) : branches.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma filial cadastrada.</p>
                    ) : (
                      <div className="space-y-2">
                        {branches.slice(0, 4).map(b => (
                          <div key={b.id} className="flex items-center justify-between text-sm">
                            <span className="text-foreground font-medium truncate">{b.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0 ml-2">{b.city ?? "—"}/{b.state ?? "—"}</span>
                          </div>
                        ))}
                        {branches.length > 4 && <p className="text-xs text-muted-foreground">+{branches.length - 4} mais</p>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-card border rounded-xl p-5 shadow-sm">
                  <h4 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-1.5">
                    <DollarSign size={14} className="text-green-600" />Dados financeiros
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Vale diário</p>
                      <p className="text-xl font-bold text-foreground">{fmt(valeDiario)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Custo mensal estimado</p>
                      <p className="text-xl font-bold text-foreground">{fmt(ativos * valeDiario * 22)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Pedidos aprovados</p>
                      <p className="text-xl font-bold text-green-600">
                        {orders.filter(o => o.status === "Aprovado").length}
                        <span className="text-sm font-normal text-muted-foreground ml-1">/ {orders.length}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── COLABORADORES ── */}
            {activeTab === "colaboradores" && (
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">Colaboradores</h3>
                <p className="text-muted-foreground text-sm mb-5">{employees.length} colaboradores cadastrados</p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: "Total",       value: employees.length },
                    { label: "Ativos",      value: ativos },
                    { label: "Afastados",   value: inativos },
                    { label: "Desligados",  value: employees.filter(e => e.status === "Desligado").length },
                  ].map(k => (
                    <div key={k.label} className="bg-card border rounded-xl p-4 shadow-sm">
                      <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
                      <p className="text-2xl font-bold text-foreground">{k.value}</p>
                    </div>
                  ))}
                </div>

                <div className="relative mb-4">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9 bg-card" placeholder="Buscar por nome, CPF ou matrícula..." value={searchColabs} onChange={e => setSearchColabs(e.target.value)} />
                </div>

                <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                  {loadingEmployees ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">Carregando colaboradores...</div>
                  ) : filteredEmployees.length === 0 ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">
                      {searchColabs ? "Nenhum colaborador encontrado." : "Nenhum colaborador cadastrado."}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/30 border-b">
                            {["Nome / CPF", "Matrícula", "Status", "Turno", "Admissão"].map(h => (
                              <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredEmployees.map(e => (
                            <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                              <td className="px-5 py-3.5">
                                <p className="font-medium text-foreground">{e.name}</p>
                                <p className="text-xs text-muted-foreground font-mono">{e.cpf}</p>
                              </td>
                              <td className="px-5 py-3.5 text-xs text-muted-foreground font-mono">{e.matricula || "—"}</td>
                              <td className="px-5 py-3.5">
                                {e.status ? (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${STATUS_STYLE[e.status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                                    {e.status}
                                  </span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-5 py-3.5 text-muted-foreground text-xs">{e.turno || "—"}</td>
                              <td className="px-5 py-3.5 text-muted-foreground text-xs">
                                {e.admissionDate ? new Date(e.admissionDate + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Exibindo <strong>{filteredEmployees.length}</strong> de <strong>{employees.length}</strong> colaboradores.
                </p>
              </div>
            )}

            {/* ── PENDÊNCIAS ── */}
            {activeTab === "pendencias" && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={18} className="text-amber-500" />
                  <h3 className="text-lg font-bold text-foreground">Pendências Cadastrais</h3>
                </div>
                <p className="text-muted-foreground text-sm mb-6">
                  Colaboradores com informações incompletas.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                  {[
                    { label: "Sem telefone",       count: employees.filter(e => !e.phone?.trim()).length },
                    { label: "Endereço incompleto", count: employees.filter(e => !e.address?.trim()).length },
                    { label: "Turno não definido",  count: employees.filter(e => !e.turno || e.turno === "—").length },
                  ].map(k => (
                    <div key={k.label} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-2xl font-bold text-amber-700">{k.count}</p>
                      <p className="text-xs text-amber-600 font-medium mt-1">{k.label}</p>
                    </div>
                  ))}
                </div>

                {loadingEmployees ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">Carregando...</div>
                ) : (() => {
                  const lista = employees.filter(e =>
                    e.status !== "Desligado" && (
                      !e.phone?.trim() || !e.address?.trim() || !e.turno || e.turno === "—"
                    )
                  );
                  return lista.length === 0 ? (
                    <div className="bg-card border rounded-xl p-12 text-center shadow-sm">
                      <CheckCircle size={32} className="text-green-500 mx-auto mb-3" />
                      <p className="font-semibold text-foreground">Nenhuma pendência cadastral!</p>
                    </div>
                  ) : (
                    <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/30 border-b">
                              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Colaborador</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Telefone</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endereço</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Turno</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {lista.map(e => (
                              <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                                <td className="px-5 py-3.5 font-medium text-foreground">
                                  {e.name}
                                  <span className="ml-2 text-xs text-muted-foreground font-mono">{e.cpf}</span>
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  {e.phone?.trim()
                                    ? <CheckCircle size={16} className="text-green-600 mx-auto" />
                                    : <XCircle size={16} className="text-red-500 mx-auto" />}
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  {e.address?.trim()
                                    ? <CheckCircle size={16} className="text-green-600 mx-auto" />
                                    : <XCircle size={16} className="text-red-500 mx-auto" />}
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  {e.turno && e.turno !== "—"
                                    ? <CheckCircle size={16} className="text-green-600 mx-auto" />
                                    : <XCircle size={16} className="text-red-500 mx-auto" />}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── STATUS AGENDADOS ── */}
            {activeTab === "status-agendados" && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CalendarClock size={18} className="text-accent" />
                  <h3 className="text-lg font-bold text-foreground">Status Agendados</h3>
                </div>
                <p className="text-muted-foreground text-sm mb-6">
                  Alterações de turno, status ou filial agendadas em massa.
                </p>
                <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                  {loadingMovements ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">Carregando...</div>
                  ) : movements.length === 0 ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">Nenhum agendamento criado ainda.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/30 border-b">
                            {["Tipo", "Para", "Início", "Fim", "Colaboradores", "Estado"].map(h => (
                              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {movements.map(m => (
                            <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{m.tipo}</td>
                              <td className="px-4 py-3 font-medium text-foreground text-xs">{m.valorNovo}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{fmtDate(m.inicio)}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{fmtDate(m.fim)}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{m.alvos?.length ?? 0}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${ESTADO_STYLE[m.estado] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                                  {m.estado === "pendente" ? "Pendente" : m.estado === "ativo" ? "Ativo" : "Concluído"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── ROTA AO VIVO ── */}
            {activeTab === "rota-ao-vivo" && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="p-4 rounded-2xl bg-muted mb-4">
                  <Radio size={32} className="text-muted-foreground/50" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Rota ao Vivo</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  O acompanhamento GPS em tempo real será exibido aqui quando os veículos estiverem em operação.
                </p>
              </div>
            )}

            {/* ── ROTAS AGENDADAS ── */}
            {activeTab === "rotas-agendadas" && (
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <Calendar size={18} className="text-accent" />
                  <h3 className="text-lg font-bold text-foreground">Rotas Agendadas</h3>
                </div>
                <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                  <div className="py-16 text-center">
                    <Calendar size={32} className="text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Nenhuma rota agendada.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── COMPRAS ── */}
            {activeTab === "compras" && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard size={18} className="text-accent" />
                  <h3 className="text-lg font-bold text-foreground">Compras</h3>
                </div>
                <p className="text-muted-foreground text-sm mb-6">Pedidos de compra de vale-transporte.</p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                  <div className="bg-card border rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1">Total vales</p>
                    <p className="text-2xl font-bold text-foreground">{loadingOrders ? "…" : totalVales.toLocaleString("pt-BR")}</p>
                  </div>
                  <div className="bg-card border rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1">Valor total</p>
                    <p className="text-2xl font-bold text-accent">{loadingOrders ? "…" : fmt(totalOrders)}</p>
                  </div>
                  <div className="bg-card border rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1">Pedidos aprovados</p>
                    <p className="text-2xl font-bold text-green-600">
                      {orders.filter(o => o.status === "Aprovado").length}
                      <span className="text-sm font-normal text-muted-foreground"> / {orders.length}</span>
                    </p>
                  </div>
                </div>

                <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                  {loadingOrders ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">Carregando...</div>
                  ) : orders.length === 0 ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">Nenhuma compra registrada.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/30 border-b">
                            {["Colaborador", "Período", "Dias", "Vales", "Valor Unit.", "Total", "Status"].map(h => (
                              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {orders.map(o => (
                            <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 font-medium text-foreground">
                                {o.nome}
                                {o.turno && <p className="text-xs text-muted-foreground">{o.turno}</p>}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{o.periodo}</td>
                              <td className="px-4 py-3 text-foreground">{o.dias}</td>
                              <td className="px-4 py-3 font-medium text-foreground">{o.vales}</td>
                              <td className="px-4 py-3 text-muted-foreground">{fmt(parseFloat(o.valorUnit))}</td>
                              <td className="px-4 py-3 font-bold text-foreground">{fmt(parseFloat(o.total))}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${ORDER_STATUS_STYLE[o.status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                                  {o.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                {!loadingOrders && orders.length > 0 && (
                  <div className="flex justify-between items-center mt-3 px-1">
                    <p className="text-xs text-muted-foreground">{orders.length} pedido(s)</p>
                    <p className="text-sm font-bold text-accent">Total: {fmt(totalOrders)}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── NOTAS FISCAIS ── */}
            {activeTab === "notas-fiscais" && (() => {
              const hoje = new Date();
              const mes = hoje.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
              const mesCapitalizado = mes.charAt(0).toUpperCase() + mes.slice(1);
              return (
                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <FileText size={18} className="text-accent" />
                    <h3 className="text-lg font-bold text-foreground">Notas Fiscais</h3>
                  </div>

                  <div className="bg-card border rounded-xl p-6 shadow-sm mb-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-accent/5 rounded-full -translate-y-12 translate-x-12" />
                    <div className="relative">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
                        <div>
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Nota fiscal vigente</p>
                          <h4 className="text-xl font-bold text-foreground">{mesCapitalizado}</h4>
                        </div>
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold border bg-amber-100 text-amber-700 border-amber-200">Aberta</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Total de vales</p>
                          <p className="text-2xl font-bold text-foreground">{totalVales}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Compras vinculadas</p>
                          <p className="text-2xl font-bold text-foreground">{orders.length}</p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-xs text-muted-foreground mb-1">Total a ser pago</p>
                          <p className="text-3xl font-bold text-accent">{fmt(totalOrders)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b">
                      <h4 className="font-semibold text-foreground text-sm">Compras vinculadas</h4>
                    </div>
                    {orders.length === 0 ? (
                      <div className="py-16 text-center text-sm text-muted-foreground">Nenhuma compra vinculada.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/30 border-b">
                              {["Colaborador", "Período", "Vales", "Total", "Status"].map(h => (
                                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {orders.map(o => (
                              <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                                <td className="px-5 py-3.5 font-medium text-foreground">{o.nome}</td>
                                <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{o.periodo}</td>
                                <td className="px-5 py-3.5 font-medium text-foreground">{o.vales.toLocaleString("pt-BR")}</td>
                                <td className="px-5 py-3.5 font-bold text-foreground">{fmt(parseFloat(o.total))}</td>
                                <td className="px-5 py-3.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${ORDER_STATUS_STYLE[o.status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                                    {o.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── TURNOS ── */}
            {activeTab === "turnos" && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={18} className="text-accent" />
                  <h3 className="text-lg font-bold text-foreground">Turnos</h3>
                </div>
                <p className="text-muted-foreground text-sm mb-6">
                  Turnos de trabalho cadastrados pela empresa.
                </p>

                {loadingEmployees ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">Carregando...</div>
                ) : (() => {
                  const turnoCounts = employees.reduce<Record<string, number>>((acc, e) => {
                    if (e.turno && e.turno !== "—") {
                      acc[e.turno] = (acc[e.turno] ?? 0) + 1;
                    }
                    return acc;
                  }, {});
                  const turnos = Object.entries(turnoCounts);
                  return turnos.length === 0 ? (
                    <div className="bg-card border rounded-xl p-12 text-center shadow-sm">
                      <Clock size={32} className="text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">Nenhum turno identificado nos colaboradores.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {turnos.map(([nome, count]) => (
                        <div key={nome} className="bg-card border rounded-xl p-5 shadow-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-accent" />
                            <h4 className="font-semibold text-foreground">{nome}</h4>
                          </div>
                          <div className="pt-3 border-t border-border flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">{count} colaborador{count !== 1 ? "es" : ""}</p>
                            <ArrowUpRight size={14} className="text-muted-foreground/40" />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
