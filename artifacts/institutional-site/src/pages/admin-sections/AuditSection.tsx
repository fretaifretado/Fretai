import { useState, useEffect, useCallback, useMemo } from "react";
import { ScrollText, RefreshCw, LogIn, Activity, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AuditLog {
  id: number;
  userId: number | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  oldValue: unknown;
  newValue: unknown;
  ip: string | null;
  createdAt: string;
}

interface LoginLog {
  id: number;
  userId: number | null;
  email: string | null;
  success: boolean;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface Props { token: string }

const ACTION_LABELS: Record<string, string> = {
  create_company: "Empresa criada",
  create_branch: "Filial criada",
  create_partner: "Parceiro criado",
  create_employee: "Funcionário cadastrado",
  create_movement: "Movimentação registrada",
  create_driver: "Motorista cadastrado",
  change_password: "Senha alterada",
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

export default function AuditSection({ token }: Props) {
  const [tab, setTab] = useState<"audit" | "login">("audit");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [auditSearch, setAuditSearch] = useState("");

  const availableActions = useMemo(() => {
    const set = new Set<string>();
    auditLogs.forEach(l => set.add(l.action));
    return Array.from(set).sort();
  }, [auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter(l => {
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (!q) return true;
      return (
        (l.userEmail ?? "").toLowerCase().includes(q) ||
        actionLabel(l.action).toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.entityType ?? "").toLowerCase().includes(q) ||
        String(l.entityId ?? "").toLowerCase().includes(q) ||
        (l.ip ?? "").toLowerCase().includes(q)
      );
    });
  }, [auditLogs, actionFilter, auditSearch]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const [auditRes, loginRes] = await Promise.all([
        fetch("/api/admin/audit-logs?limit=100", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/login-logs?limit=100", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (auditRes.ok) setAuditLogs(await auditRes.json() as AuditLog[]);
      if (loginRes.ok) setLoginLogs(await loginRes.json() as LoginLog[]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ScrollText size={18} className="text-accent" />
            <h1 className="text-xl font-bold text-foreground">Auditoria e Rastreabilidade</h1>
          </div>
          <p className="text-muted-foreground text-sm">Histórico completo de ações e acessos ao sistema.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} className="gap-1.5">
          <RefreshCw size={14} />Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit mb-6">
        <button
          onClick={() => setTab("audit")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "audit" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Activity size={13} className="inline mr-1.5" />Ações do sistema
        </button>
        <button
          onClick={() => setTab("login")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "login" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <LogIn size={13} className="inline mr-1.5" />Histórico de login
        </button>
      </div>

      {tab === "audit" && !loading && auditLogs.length > 0 && (
        <div className="bg-card border rounded-xl shadow-sm p-3 mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground pr-1">
            <Filter size={13} />Filtros:
          </div>

          <div className="relative">
            <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className="h-9 pl-7 pr-8 rounded-md border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
              data-testid="select-audit-action-filter"
            >
              <option value="all">Todas as ações</option>
              {availableActions.map(a => (
                <option key={a} value={a}>{actionLabel(a)}</option>
              ))}
            </select>
          </div>

          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={auditSearch}
              onChange={e => setAuditSearch(e.target.value)}
              placeholder="Buscar por usuário, entidade, IP..."
              className="h-9 pl-8 text-sm"
              data-testid="input-audit-search"
            />
          </div>

          {(actionFilter !== "all" || auditSearch) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setActionFilter("all"); setAuditSearch(""); }}
              className="h-9 text-xs text-muted-foreground"
              data-testid="button-clear-audit-filters"
            >
              Limpar
            </Button>
          )}

          <div className="ml-auto text-xs text-muted-foreground">
            {filteredAuditLogs.length} de {auditLogs.length}
          </div>
        </div>
      )}

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Carregando logs...</div>
        ) : tab === "audit" ? (
          auditLogs.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">Nenhuma ação registrada.</div>
          ) : filteredAuditLogs.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              Nenhuma ação corresponde aos filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Data/Hora", "Usuário", "Ação", "Entidade", "ID", "IP"].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAuditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-muted/20">
                      <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(log.createdAt)}</td>
                      <td className="px-5 py-3 text-xs text-foreground">{log.userEmail ?? "—"}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-accent/10 text-accent text-xs font-medium">
                          {actionLabel(log.action)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{log.entityType}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{log.entityId ?? "—"}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground font-mono">{log.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          loginLogs.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">Nenhum acesso registrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Data/Hora", "E-mail", "Status", "IP", "Dispositivo"].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loginLogs.map(log => (
                    <tr key={log.id} className="hover:bg-muted/20">
                      <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(log.createdAt)}</td>
                      <td className="px-5 py-3 text-xs text-foreground">{log.email ?? "—"}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${log.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {log.success ? "Sucesso" : "Falhou"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground font-mono">{log.ip ?? "—"}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{log.userAgent ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
