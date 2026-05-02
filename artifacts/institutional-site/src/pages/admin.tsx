import { useState, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Users, Plus, LogOut, Pencil, Trash2, X, Check, AlertCircle, Hexagon, Search,
  LayoutDashboard, FileBarChart2, Settings, ChevronRight, Menu as MenuIcon,
  Activity, Building2, Truck, ScrollText, TrendingUp, UserCheck, RefreshCw,
  CalendarDays, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CompaniesSection from "./admin-sections/CompaniesSection";
import PartnersSection from "./admin-sections/PartnersSection";
import AuditSection from "./admin-sections/AuditSection";

interface Client {
  id: number;
  name: string;
  cpf: string;
  email: string;
  accessLevel: string;
  createdAt: string;
  updatedAt: string;
}

interface DashCompany {
  id: number;
  name: string;
  createdAt: string;
}

interface DashPartner {
  id: number;
  name: string;
  createdAt: string;
}

interface DashAuditLog {
  id: number;
  userEmail: string | null;
  companyId: number | null;
  action: string;
  entityType: string;
  createdAt: string;
}

const AUDIT_LABELS: Record<string, string> = {
  create_company: "Empresa criada", create_branch: "Filial criada",
  create_partner: "Parceiro criado", create_employee: "Colaborador adicionado",
  update_employee: "Colaborador editado", update_employee_status: "Status alterado",
  fix_employee_pending: "Pendência corrigida", delete_employee: "Colaborador removido",
  create_movement: "Movimentação registrada", create_shift: "Turno adicionado",
  update_shift: "Turno editado", delete_shift: "Turno removido",
  create_scheduled_movement: "Agendamento criado", cancel_scheduled_movement: "Agendamento cancelado",
  create_driver: "Motorista cadastrado", change_password: "Senha alterada",
};

const ACCESS_LEVELS = [
  { value: "basico", label: "Básico" },
  { value: "intermediario", label: "Intermediário" },
  { value: "avancado", label: "Avançado" },
  { value: "admin", label: "Administrador" },
];

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard",    section: "dashboard" },
  { icon: Building2,       label: "Empresas",     section: "companies" },
  { icon: Truck,           label: "Parceiros",    section: "partners" },
  { icon: Users,           label: "Usuários",     section: "clients" },
  { icon: ScrollText,      label: "Auditoria",    section: "audit" },
  { icon: FileBarChart2,   label: "Relatórios",   section: "relatorios" },
  { icon: Settings,        label: "Configurações",section: "configuracoes" },
];

const clientSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório"),
  cpf: z.string().min(11, "CPF inválido").max(14, "CPF inválido"),
  email: z.string().email("E-mail inválido"),
  accessLevel: z.string().min(1, "Selecione um nível de acesso"),
});
type ClientForm = z.infer<typeof clientSchema>;

function formatCPF(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function accessLevelBadge(level: string) {
  const colors: Record<string, string> = {
    basico: "bg-blue-100 text-blue-700 border-blue-200",
    intermediario: "bg-yellow-100 text-yellow-700 border-yellow-200",
    avancado: "bg-green-100 text-green-700 border-green-200",
    admin: "bg-purple-100 text-purple-700 border-purple-200",
  };
  const labels: Record<string, string> = {
    basico: "Básico", intermediario: "Intermediário", avancado: "Avançado", admin: "Administrador",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${colors[level] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
      {labels[level] ?? level}
    </span>
  );
}

function ComingSoon({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center h-72 text-center">
      <div className="p-4 rounded-2xl bg-muted mb-4"><Icon size={32} className="text-muted-foreground/50" /></div>
      <h3 className="font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">Esta seção será disponibilizada em breve.</p>
    </div>
  );
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [adminUsername, setAdminUsername] = useState("");

  /* ── dashboard state ── */
  const [dashCompanies, setDashCompanies] = useState<DashCompany[]>([]);
  const [dashPartners, setDashPartners] = useState<DashPartner[]>([]);
  const [dashAuditLogs, setDashAuditLogs] = useState<DashAuditLog[]>([]);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashLastRefresh, setDashLastRefresh] = useState<Date | null>(null);

  const token = localStorage.getItem("admin_token") ?? "";

  useEffect(() => {
    if (!token) { setLocation("/login"); return; }
    setAdminUsername(localStorage.getItem("admin_username") ?? "admin");
  }, [token, setLocation]);

  const fetchClients = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/clients", { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { localStorage.removeItem("admin_token"); setLocation("/login"); return; }
      if (!res.ok) { setError("Erro ao carregar usuários."); setClients([]); return; }
      const data = await res.json();
      setClients(Array.isArray(data) ? data as Client[] : []);
    } catch { setError("Erro ao carregar usuários."); setClients([]); }
    finally { setLoading(false); }
  }, [token, setLocation]);

  const fetchDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [companiesRes, partnersRes, auditRes] = await Promise.all([
        fetch("/api/admin/companies", { headers }),
        fetch("/api/admin/partners", { headers }),
        fetch("/api/admin/audit-logs?limit=8", { headers }),
      ]);
      if (companiesRes.ok) setDashCompanies(await companiesRes.json() as DashCompany[]);
      if (partnersRes.ok) setDashPartners(await partnersRes.json() as DashPartner[]);
      if (auditRes.ok) setDashAuditLogs(await auditRes.json() as DashAuditLog[]);
      setDashLastRefresh(new Date());
    } catch { /* silent */ }
    finally { setDashLoading(false); }
  }, [token]);

  useEffect(() => { if (token) fetchClients(); }, [token, fetchClients]);
  useEffect(() => { if (token && activeSection === "dashboard") fetchDashboard(); }, [token, activeSection, fetchDashboard]);

  const form = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: { name: "", cpf: "", email: "", accessLevel: "" },
  });

  function openCreate() {
    setEditingClient(null);
    form.reset({ name: "", cpf: "", email: "", accessLevel: "" });
    setFormError(""); setShowForm(true);
  }

  function openEdit(client: Client) {
    setEditingClient(client);
    form.reset({ name: client.name, cpf: formatCPF(client.cpf), email: client.email, accessLevel: client.accessLevel });
    setFormError(""); setShowForm(true);
  }

  async function onSubmit(values: ClientForm) {
    setFormLoading(true); setFormError("");
    try {
      const url = editingClient ? `/api/admin/clients/${editingClient.id}` : "/api/admin/clients";
      const res = await fetch(url, {
        method: editingClient ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(values),
      });
      const data = await res.json() as Client & { error?: string };
      if (!res.ok) { setFormError(data.error ?? "Erro ao salvar."); return; }
      setShowForm(false); await fetchClients();
    } catch { setFormError("Erro de conexão."); }
    finally { setFormLoading(false); }
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`/api/admin/clients/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setDeleteId(null); await fetchClients();
    } catch { setError("Erro ao excluir."); }
  }

  function logout() {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_username");
    setLocation("/login");
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.cpf.includes(search.replace(/\D/g, ""))
  );

  const currentLabel = NAV_ITEMS.find(n => n.section === activeSection)?.label ?? "";

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">

      {/* ── Top Bar ── */}
      <header className="bg-primary text-primary-foreground border-b border-white/10 sticky top-0 z-40 h-14 flex items-center">
        <div className="flex items-center h-full">
          <button className="lg:hidden flex items-center justify-center h-14 w-14 hover:bg-white/10 transition-colors" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <MenuIcon size={20} />
          </button>
          <div className="hidden lg:flex items-center gap-2.5 px-5 w-56 shrink-0 border-r border-white/10 h-full">
            <img src="/logo.png" alt="Fretai" className="h-8 w-auto mb-4 mt-4" />
          </div>
        </div>

        <div className="flex-1 flex items-center px-4 gap-2">
          <span className="text-primary-foreground/40 text-sm font-medium">Admin</span>
          <ChevronRight size={14} className="text-primary-foreground/30" />
          <span className="text-primary-foreground/80 text-sm font-medium">{currentLabel}</span>
        </div>

        <div className="flex items-center gap-3 px-4">
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold uppercase">
              {adminUsername.charAt(0)}
            </div>
            <span className="text-primary-foreground/70 text-sm hidden md:block">
              <strong className="text-white font-medium">{adminUsername}</strong>
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="text-primary-foreground/60 hover:text-white hover:bg-white/10 gap-1.5">
            <LogOut size={14} /><span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 relative">
        {/* Mobile overlay */}
        {sidebarOpen && <div className="lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}

        {/* ── Sidebar ── */}
        <aside className={`
          fixed lg:sticky top-14 left-0 h-[calc(100vh-3.5rem)] z-30 w-56 shrink-0
          bg-primary text-primary-foreground border-r border-white/10
          flex flex-col transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}>
          <nav className="flex-1 py-4 overflow-y-auto">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground/30 px-5 mb-2">Menu</p>
            {NAV_ITEMS.map(({ icon: Icon, label, section }) => (
              <button
                key={section}
                onClick={() => { setActiveSection(section); setSidebarOpen(false); }}
                className={`
                  w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors text-left
                  ${activeSection === section
                    ? "bg-white/10 text-white border-r-2 border-accent"
                    : "text-primary-foreground/60 hover:bg-white/5 hover:text-white"
                  }
                `}
              >
                <Icon size={17} className={activeSection === section ? "text-accent" : ""} />
                {label}
              </button>
            ))}
          </nav>
          <div className="border-t border-white/10 p-4">
            <Link href="/" className="flex items-center gap-2 text-xs text-primary-foreground/40 hover:text-primary-foreground/70 transition-colors">
              <Activity size={13} />Ver site institucional
            </Link>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-auto">
          <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">

            {/* DASHBOARD */}
            {activeSection === "dashboard" && (() => {
              const today = new Date();
              const todayStr = today.toISOString().slice(0, 10);
              const thisMonth = today.toISOString().slice(0, 7);

              const acoesHoje = dashAuditLogs.filter(l => l.createdAt.slice(0, 10) === todayStr).length;
              const empresasMes = dashCompanies.filter(c => c.createdAt.slice(0, 7) === thisMonth).length;
              const masterUsers = clients.filter(c => c.accessLevel === "admin" || c.accessLevel === "avancado").length;

              return (
                <div>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h1 className="text-xl font-bold text-foreground mb-0.5">Dashboard</h1>
                      <p className="text-muted-foreground text-sm">
                        Visão geral da plataforma Fretai
                        {dashLastRefresh && (
                          <span className="ml-2 text-xs text-muted-foreground/60">
                            · Atualizado às {dashLastRefresh.toLocaleTimeString("pt-BR", { timeStyle: "short" })}
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => void fetchDashboard()}
                      disabled={dashLoading}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border rounded-lg px-3 py-2 bg-card hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={dashLoading ? "animate-spin" : ""} />
                      Atualizar
                    </button>
                  </div>

                  {/* KPI cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {[
                      {
                        icon: Building2,
                        label: "Empresas clientes",
                        value: dashLoading ? "…" : dashCompanies.length,
                        sub: `${empresasMes} cadastrada(s) este mês`,
                        color: "text-blue-600", bg: "bg-blue-50 border-blue-100",
                        onClick: () => setActiveSection("companies"),
                      },
                      {
                        icon: Truck,
                        label: "Parceiros transportadores",
                        value: dashLoading ? "…" : dashPartners.length,
                        sub: "frotas ativas na plataforma",
                        color: "text-violet-600", bg: "bg-violet-50 border-violet-100",
                        onClick: () => setActiveSection("partners"),
                      },
                      {
                        icon: UserCheck,
                        label: "Usuários do sistema",
                        value: dashLoading ? "…" : clients.length,
                        sub: `${masterUsers} com nível avançado/admin`,
                        color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100",
                        onClick: () => setActiveSection("clients"),
                      },
                      {
                        icon: TrendingUp,
                        label: "Ações hoje",
                        value: dashLoading ? "…" : acoesHoje,
                        sub: `${dashAuditLogs.length} nas últimas ações registradas`,
                        color: "text-orange-600", bg: "bg-orange-50 border-orange-100",
                        onClick: () => setActiveSection("audit"),
                      },
                    ].map(card => (
                      <button
                        key={card.label}
                        onClick={card.onClick}
                        className={`border rounded-xl p-5 shadow-sm text-left hover:shadow-md transition-all ${card.bg}`}
                      >
                        <div className={`flex items-center gap-2 mb-3 ${card.color}`}>
                          <card.icon size={16} />
                          <p className="text-xs font-semibold uppercase tracking-wide">{card.label}</p>
                        </div>
                        <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
                        <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                      </button>
                    ))}
                  </div>

                  {/* Bottom grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                    {/* Últimas empresas cadastradas */}
                    <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-4 border-b">
                        <div className="flex items-center gap-2">
                          <Building2 size={15} className="text-accent" />
                          <h2 className="font-semibold text-foreground text-sm">Últimas empresas cadastradas</h2>
                        </div>
                        <button onClick={() => setActiveSection("companies")} className="text-xs text-accent hover:underline">Ver todas</button>
                      </div>
                      {dashLoading ? (
                        <div className="py-8 text-center text-muted-foreground text-sm">Carregando...</div>
                      ) : dashCompanies.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground text-sm">Nenhuma empresa cadastrada.</div>
                      ) : (
                        <div className="divide-y divide-border">
                          {dashCompanies.slice(0, 5).map(c => (
                            <div key={c.id} className="flex items-center justify-between px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent uppercase shrink-0">
                                  {c.name.charAt(0)}
                                </div>
                                <p className="text-sm font-medium text-foreground">{c.name}</p>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <CalendarDays size={11} />
                                {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Atividade recente */}
                    <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-4 border-b">
                        <div className="flex items-center gap-2">
                          <Activity size={15} className="text-accent" />
                          <h2 className="font-semibold text-foreground text-sm">Atividade recente</h2>
                        </div>
                        <button onClick={() => setActiveSection("audit")} className="text-xs text-accent hover:underline">Ver auditoria</button>
                      </div>
                      {dashLoading ? (
                        <div className="py-8 text-center text-muted-foreground text-sm">Carregando...</div>
                      ) : dashAuditLogs.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground text-sm">Nenhuma ação registrada.</div>
                      ) : (
                        <div className="divide-y divide-border">
                          {dashAuditLogs.slice(0, 6).map(log => (
                            <div key={log.id} className="flex items-start gap-3 px-5 py-3">
                              <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                                <ShieldCheck size={11} className="text-accent" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground truncate">
                                  <span className="font-medium">{AUDIT_LABELS[log.action] ?? log.action}</span>
                                </p>
                                <p className="text-xs text-muted-foreground truncate">{log.userEmail ?? "sistema"}</p>
                              </div>
                              <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                                {new Date(log.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })()}

            {/* EMPRESAS */}
            {activeSection === "companies" && <CompaniesSection token={token} />}

            {/* PARCEIROS */}
            {activeSection === "partners" && <PartnersSection token={token} />}

            {/* AUDITORIA */}
            {activeSection === "audit" && <AuditSection token={token} />}

            {/* USUÁRIOS (clientes legado) */}
            {activeSection === "clients" && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Users size={18} className="text-accent" />
                      <h1 className="text-xl font-bold text-foreground">Gestão de Usuários</h1>
                    </div>
                    <p className="text-muted-foreground text-sm">Usuários com acesso à plataforma.</p>
                  </div>
                  <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-white font-semibold shrink-0">
                    <Plus size={16} className="mr-2" />Novo Usuário
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  <div className="bg-card border rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1">Total</p>
                    <p className="text-2xl font-bold text-foreground">{clients.length}</p>
                  </div>
                  {ACCESS_LEVELS.slice(0, 3).map(level => (
                    <div key={level.value} className="bg-card border rounded-xl p-4 shadow-sm">
                      <p className="text-xs text-muted-foreground mb-1">{level.label}</p>
                      <p className="text-2xl font-bold text-foreground">{clients.filter(c => c.accessLevel === level.value).length}</p>
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 mb-4">
                    <AlertCircle size={15} /><span>{error}</span>
                  </div>
                )}

                <div className="relative mb-4">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9 bg-card" placeholder="Buscar por nome, e-mail ou CPF..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>

                <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                  {loading ? (
                    <div className="py-16 text-center text-muted-foreground text-sm">Carregando...</div>
                  ) : filtered.length === 0 ? (
                    <div className="py-16 text-center">
                      <Users size={36} className="text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground font-medium text-sm">{search ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}</p>
                      {!search && <Button onClick={openCreate} variant="outline" className="mt-4" size="sm"><Plus size={13} className="mr-1.5" />Cadastrar</Button>}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            {["Nome", "CPF", "E-mail", "Nível", "Cadastro", ""].map(h => (
                              <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filtered.map(client => (
                            <tr key={client.id} className="hover:bg-muted/20 transition-colors">
                              <td className="px-5 py-3.5 font-medium text-foreground">{client.name}</td>
                              <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{formatCPF(client.cpf)}</td>
                              <td className="px-5 py-3.5 text-muted-foreground">{client.email}</td>
                              <td className="px-5 py-3.5">{accessLevelBadge(client.accessLevel)}</td>
                              <td className="px-5 py-3.5 text-muted-foreground text-xs">{new Date(client.createdAt).toLocaleDateString("pt-BR")}</td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-1 justify-end">
                                  {deleteId === client.id ? (
                                    <>
                                      <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => handleDelete(client.id)}>
                                        <Check size={12} className="mr-1" />Confirmar
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDeleteId(null)}><X size={12} /></Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openEdit(client)}><Pencil size={13} /></Button>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(client.id)}><Trash2 size={13} /></Button>
                                    </>
                                  )}
                                </div>
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

            {activeSection === "relatorios" && <ComingSoon title="Relatórios" icon={FileBarChart2} />}
            {activeSection === "configuracoes" && <ComingSoon title="Configurações" icon={Settings} />}
          </div>
        </main>
      </div>

      {/* Modal de usuário */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-lg text-foreground">{editingClient ? "Editar Usuário" : "Novo Usuário"}</h2>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowForm(false)}><X size={16} /></Button>
            </div>
            <div className="p-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Nome completo</FormLabel><FormControl><Input placeholder="João da Silva" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="cpf" render={({ field }) => (
                    <FormItem><FormLabel>CPF</FormLabel><FormControl>
                      <Input placeholder="000.000.000-00" {...field} onChange={e => field.onChange(formatCPF(e.target.value))} />
                    </FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>E-mail</FormLabel><FormControl><Input type="email" placeholder="joao@empresa.com" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="accessLevel" render={({ field }) => (
                    <FormItem><FormLabel>Nível de acesso</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione o nível" /></SelectTrigger></FormControl>
                        <SelectContent>{ACCESS_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                      </Select><FormMessage />
                    </FormItem>
                  )} />
                  {formError && (
                    <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                      <AlertCircle size={14} /><span>{formError}</span>
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
                    <Button type="submit" className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold" disabled={formLoading}>
                      {formLoading ? "Salvando..." : editingClient ? "Salvar alterações" : "Cadastrar"}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
