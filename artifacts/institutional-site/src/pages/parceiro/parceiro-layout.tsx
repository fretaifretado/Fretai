import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Truck, Users, Menu, X, LogOut, ChevronRight } from "lucide-react";

interface NavItem { icon: React.ElementType; label: string; path: string }

const NAV: NavItem[] = [
  { icon: Users, label: "Motoristas", path: "/parceiro/motoristas" },
];

interface LayoutProps { children: React.ReactNode }

export default function ParceiroLayout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const displayName =
    localStorage.getItem("jwt_displayname") ??
    localStorage.getItem("jwt_username") ??
    "Parceiro";

  const initial = displayName.charAt(0).toUpperCase();

  function logout() {
    localStorage.removeItem("jwt_token");
    localStorage.removeItem("jwt_username");
    localStorage.removeItem("jwt_displayname");
    localStorage.removeItem("jwt_role");
    localStorage.removeItem("jwt_user_id");
    window.location.href = "/login";
  }

  function isActive(path: string) {
    return location === path || location.startsWith(path + "/");
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Top bar */}
      <header className="bg-primary text-primary-foreground border-b border-white/10 sticky top-0 z-40 h-14 flex items-center shrink-0">
        <div className="hidden lg:flex items-center gap-2.5 px-5 w-64 shrink-0 border-r border-white/10 h-full">
          <Truck size={18} className="text-accent" />
          <span className="font-bold text-base tracking-tight">Fretai</span>
          <span className="text-xs text-primary-foreground/40 ml-1">Parceiro</span>
        </div>

        <button
          className="lg:hidden flex items-center justify-center h-14 w-14 hover:bg-white/10 transition-colors"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <div className="flex items-center gap-2 px-4 ml-auto">
          <div className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg">
            <div className="w-7 h-7 rounded-full bg-accent/30 text-accent text-xs font-bold flex items-center justify-center">
              {initial}
            </div>
            <span className="text-sm text-primary-foreground/80 hidden sm:block max-w-[140px] truncate">
              {displayName}
            </span>
          </div>
          <button
            onClick={logout}
            className="flex items-center justify-center h-9 w-9 rounded-lg hover:bg-white/10 transition-colors text-primary-foreground/60 hover:text-red-400"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed lg:static inset-y-0 left-0 z-40 w-64 bg-primary text-primary-foreground
            flex flex-col shrink-0 transition-transform duration-200 lg:translate-x-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          `}
        >
          {/* Partner identity */}
          <div className="px-4 pt-5 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/20 text-accent text-base font-bold flex items-center justify-center shrink-0">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                <p className="text-xs text-primary-foreground/40">Parceiro transportador</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground/30 px-4 py-2 mt-2">
              Menu
            </p>
            {NAV.map(item => (
              <Link key={item.path} href={item.path}>
                <a
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left
                    ${isActive(item.path)
                      ? "bg-white/10 text-white border-r-2 border-accent font-medium"
                      : "text-primary-foreground/55 hover:bg-white/5 hover:text-white"
                    }
                  `}
                >
                  <item.icon size={15} className={isActive(item.path) ? "text-accent" : ""} />
                  <span className="flex-1">{item.label}</span>
                  {isActive(item.path) && <ChevronRight size={12} className="text-accent" />}
                </a>
              </Link>
            ))}
          </nav>

          {/* Footer */}
          <div className="px-4 pb-5 pt-3 border-t border-white/10">
            <button
              onClick={logout}
              className="w-full flex items-center gap-2 text-xs text-primary-foreground/40 hover:text-red-400 transition-colors"
            >
              <LogOut size={12} />
              Sair
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
