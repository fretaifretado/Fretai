import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard, Users, Shuffle, AlertTriangle,
  CalendarClock, Radio, Calendar, CreditCard, FileText, CalendarDays,
  Clock, ChevronDown, LogOut, Settings, Bell, Menu, X, Building2,
  Pencil, Check, BarChart2,
} from "lucide-react";
import { useDashboard } from "./context";

interface NavItem { icon: React.ElementType; label: string; path: string }
interface NavSection { title?: string; items: NavItem[] }

const NAV: NavSection[] = [
  { items: [
    { icon: LayoutDashboard, label: "Dashboard",  path: "/painel" },
    { icon: BarChart2,       label: "Relatórios", path: "/painel/relatorios" },
  ]},
  {
    title: "COLABORADORES",
    items: [
      { icon: Users,         label: "Meus colaboradores",    path: "/painel/colaboradores" },
      { icon: Shuffle,       label: "Movimentação em bloco", path: "/painel/movimentacao" },
      { icon: AlertTriangle, label: "Pendências",            path: "/painel/pendencias" },
      { icon: CalendarClock, label: "Status agendados",      path: "/painel/status-agendados" },
    ],
  },
  {
    title: "ROTA",
    items: [
      { icon: Radio,    label: "Ao vivo",   path: "/painel/rota-ao-vivo" },
      { icon: Calendar, label: "Agendadas", path: "/painel/rotas-agendadas" },
    ],
  },
  {
    title: "FINANCEIRO",
    items: [
      { icon: CreditCard, label: "Compras",        path: "/painel/compras" },
      { icon: FileText,   label: "Notas fiscais", path: "/painel/notas-fiscais" },
    ],
  },
  {
    title: "ADMINISTRATIVO",
    items: [
      { icon: CalendarDays, label: "Feriados",  path: "/painel/feriados" },
      { icon: Clock,        label: "Turnos",    path: "/painel/turnos" },
    ],
  },
];

interface LayoutProps { children: React.ReactNode; alertMessage?: string }

export default function DashboardLayout({ children, alertMessage }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const { empresaAtiva, nomeEmpresaAtiva, filiais, filialAtiva, setFilialAtiva, colaboradoresDaFilial: colaboradores } = useDashboard();

  // Nome do usuário vem do localStorage — agora salva o name real
  const userName = localStorage.getItem("jwt_displayname")
    ?? localStorage.getItem("jwt_username")
    ?? "Usuário";
  const displayName = userName.includes("@") ? userName.split("@")[0] : userName;
  const initial = displayName.charAt(0).toUpperCase();

  const pendencias = colaboradores.filter(c =>
    c.status !== "Desligado" && (
      !c.telefone?.trim() ||
      !c.endereco?.trim() ||
      (!c.turno || c.turno === "—")
    )
  ).length;

  useEffect(() => {
    const t = localStorage.getItem("jwt_token");
    if (!t) { sessionStorage.setItem("redirect_after_login", location); setLocation("/login"); }
    else setAuthed(true);
  }, [location, setLocation]);

  function logout() {
    localStorage.removeItem("jwt_token");
    localStorage.removeItem("jwt_username");
    localStorage.removeItem("jwt_displayname");
    localStorage.removeItem("jwt_role");
    setLocation("/login");
  }

  const isActive = (path: string) =>
    path === "/painel" ? location === "/painel" : location.startsWith(path);

  if (!authed) return null;

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Header */}
      <header className="bg-primary text-primary-foreground border-b border-white/10 sticky top-0 z-40 h-14 flex items-center shrink-0">
        <div className="hidden lg:flex items-center gap-2.5 px-5 w-64 shrink-0 border-r border-white/10 h-full">
          <div className="hidden lg:flex items-center gap-2.5 px-5 w-56 shrink-0 border-r border-white/10 h-full">
            <img src="/logo.png" alt="Fretai" className="h-8 w-auto mb-4 mt-4" />
          </div>
        </div>
        <button className="lg:hidden flex items-center justify-center h-14 w-14 hover:bg-white/10 transition-colors" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-1 px-4">
          {pendencias > 0 && (
            <button className="relative flex items-center justify-center h-9 w-9 rounded-lg hover:bg-white/10 transition-colors">
              <Bell size={17} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400" />
            </button>
          )}
          <button className="flex items-center justify-center h-9 w-9 rounded-lg hover:bg-white/10 transition-colors">
            <Settings size={17} />
          </button>
          <div className="relative ml-2">
            <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <div className="w-7 h-7 rounded-full bg-accent/30 text-accent text-xs font-bold flex items-center justify-center">{initial}</div>
              <span className="hidden sm:block text-sm text-white/80">Olá, <strong className="text-white capitalize">{displayName}</strong></span>
              <ChevronDown size={14} className={`text-white/50 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-52 bg-card border rounded-xl shadow-lg z-50 py-1.5 overflow-hidden">
                  <div className="px-4 py-3 border-b">
                    <p className="font-semibold text-sm text-foreground capitalize">{displayName}</p>
                    <p className="text-xs text-muted-foreground">{nomeEmpresaAtiva}</p>
                  </div>
                  <button className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted/60 transition-colors">
                    <Pencil size={14} className="text-muted-foreground" />Editar perfil
                  </button>
                  <button onClick={logout} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors">
                    <LogOut size={14} />Sair
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {alertMessage && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 lg:px-6 py-2 flex items-center gap-2 shrink-0">
          <AlertTriangle size={14} className="text-amber-500 shrink-0" />
          <p className="text-xs font-medium text-amber-700">{alertMessage}</p>
          <Link href="/painel/pendencias" className="ml-auto text-xs font-semibold text-amber-600 hover:text-amber-700 underline underline-offset-2 shrink-0">Ver pendências</Link>
        </div>
      )}

      <div className="flex flex-1 relative overflow-hidden">
        {sidebarOpen && <div className="lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}

        {/* Sidebar */}
        <aside className={`
          fixed lg:sticky top-14 left-0
          h-[calc(100vh-3.5rem)]
          z-30 w-64 shrink-0 bg-primary text-primary-foreground border-r border-white/10
          flex flex-col transition-transform duration-200 ease-in-out overflow-y-auto
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}>
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-accent/20 text-accent text-base font-bold flex items-center justify-center shrink-0">{initial}</div>
              <div className="min-w-0">
                <p className="font-semibold text-white text-sm truncate capitalize">{displayName}</p>
                <p className="text-xs text-primary-foreground/60 truncate font-medium" data-testid="text-empresa-nome">
                  {nomeEmpresaAtiva || "—"}
                </p>
              </div>
            </div>

            <button onClick={() => setCompanyMenuOpen(!companyMenuOpen)} className="w-full flex items-center gap-1.5 text-xs text-primary-foreground/50 hover:text-primary-foreground/80 transition-colors mb-1">
              <Building2 size={11} /><span>Trocar empresa</span>
              <ChevronDown size={11} className={`ml-auto transition-transform ${companyMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {companyMenuOpen && (
              <div className="bg-white/5 rounded-lg p-1.5 mb-2 space-y-0.5">
                {filiais.length === 0 ? (
                  <p className="text-xs text-primary-foreground/40 px-2 py-1">Nenhuma filial cadastrada</p>
                ) : (
                  filiais.map(f => {
                    const ativa = filialAtiva?.id === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => { setFilialAtiva(f); setCompanyMenuOpen(false); }}
                        className={`w-full text-left text-xs px-2.5 py-2 rounded flex items-center gap-2 transition-colors ${
                          ativa ? "bg-accent/20 text-accent font-semibold" : "text-primary-foreground/60 hover:bg-white/5 hover:text-white"
                        }`}
                        data-testid={`button-trocar-filial-${f.id}`}
                      >
                        {ativa ? <Check size={11} className="shrink-0" /> : <span className="w-[11px] shrink-0" />}
                        <span className="flex-1 truncate">{f.nome}</span>
                        {f.tipo === "matriz" && (
                          <span className="text-[9px] uppercase tracking-wide text-primary-foreground/40 shrink-0">matriz</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button className="flex-1 text-xs text-primary-foreground/50 hover:text-white transition-colors flex items-center gap-1"><Pencil size={10} />Editar perfil</button>
              <button onClick={logout} className="flex-1 text-xs text-primary-foreground/50 hover:text-red-400 transition-colors flex items-center gap-1 justify-end"><LogOut size={10} />Sair</button>
            </div>
          </div>

          <nav className="flex-1 py-3">
            {NAV.map((section, si) => (
              <div key={si} className="mb-1">
                {section.title && <p className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground/30 px-4 py-2 mt-2">{section.title}</p>}
                {section.items.map(item => (
                  <Link key={item.path} href={item.path}>
                    <button onClick={() => setSidebarOpen(false)} className={`
                      w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left
                      ${isActive(item.path) ? "bg-white/10 text-white border-r-2 border-accent font-medium" : "text-primary-foreground/55 hover:bg-white/5 hover:text-white"}
                    `}>
                      <item.icon size={15} className={isActive(item.path) ? "text-accent" : ""} />
                      <span className="flex-1">{item.label}</span>
                      {item.path === "/painel/pendencias" && pendencias > 0 && (
                        <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{pendencias}</span>
                      )}
                    </button>
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <div className="border-t border-white/10 p-4">
            <Link href="/" className="flex items-center gap-2 text-xs text-primary-foreground/40 hover:text-primary-foreground/70 transition-colors">← Ver site institucional</Link>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto h-[calc(100vh-3.5rem)]">{children}</main>
      </div>
    </div>
  );
}