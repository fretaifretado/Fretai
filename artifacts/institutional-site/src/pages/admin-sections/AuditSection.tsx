import { useState, useEffect, useCallback, useMemo } from "react";
import { ScrollText, RefreshCw, LogIn, Activity, Filter, Search, Building2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AuditLog {
  id: number;
  userId: number | null;
  userEmail: string | null;
  companyId: number | null;
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

interface Company {
  id: number;
  name: string;
}

interface Props { token: string }

const ACTION_META: Record<string, { label: string; color: string }> = {
  create_company:             { label: "Empresa criada",           color: "bg-blue-100 text-blue-700" },
  create_branch:              { label: "Filial criada",            color: "bg-blue-100 text-blue-700" },
  create_partner:             { label: "Parceiro criado",          color: "bg-violet-100 text-violet-700" },
  create_employee:            { label: "Colaborador adicionado",   color: "bg-green-100 text-green-700" },
  update_employee:            { label: "Colaborador editado",      color: "bg-amber-100 text-amber-700" },
  update_employee_status:     { label: "Status alterado",          color: "bg-orange-100 text-orange-700" },
  fix_employee_pending:       { label: "Pendência corrigida",      color: "bg-teal-100 text-teal-700" },
  delete_employee:            { label: "Colaborador removido",     color: "bg-red-100 text-red-700" },
  create_movement:            { label: "Movimentação registrada",  color: "bg-indigo-100 text-indigo-700" },
  create_shift:               { label: "Turno adicionado",         color: "bg-cyan-100 text-cyan-700" },
  update_shift:               { label: "Turno editado",            color: "bg-cyan-100 text-cyan-700" },
  delete_shift:               { label: "Turno removido",           color: "bg-red-100 text-red-700" },
  create_scheduled_movement:  { label: "Agendamento criado",       color: "bg-purple-100 text-purple-700" },
  cancel_scheduled_movement:  { label: "Agendamento cancelado",    color: "bg-red-100 text-red-700" },
  create_driver:              { label: "Motorista cadastrado",     color: "bg-slate-100 text-slate-700" },
  change_password:            { label: "Senha alterada",           color: "bg-yellow-100 text-yellow-700" },
};

function actionMeta(action: string) {
  return ACTION_META[action] ?? { label: action, color: "bg-muted text-muted-foreground" };
}

function entityLabel(type: string) {
  const map: Record<string, string> = {
    company: "empresa", company_branch: "filial", employee: "colaborador",
    employee_movement: "movimentação", scheduled_movement: "agendamento",
    shift: "turno", user: "usuário", partner: "parceiro", driver: "motorista",
  };
  return map[type] ?? type;
}

export default function AuditSection({ token }: Props) {
  const [tab, setTab] = useState<"audit" | "login">("audit");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<number | "all">("all");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/companies", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setCompanies(await res.json() as Company[]);
    } catch { /* silent */ }
  }, [token]);

  const fetchLogs = useCallback(async (companyId?: number) => {
    setLoading(true);
    try {
      const companyParam = companyId ? `&companyId=${companyId}` : "";
      const [auditRes, loginRes] = await Promise.all([
        fetch(`/api/admin/audit-logs?limit=200${companyParam}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/login-logs?limit=100", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (auditRes.ok) setAuditLogs(await auditRes.json() as AuditLog[]);
      if (loginRes.ok) setLoginLogs(await loginRes.json() as LoginLog[]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void fetchCompanies(); }, [fetchCompanies]);

  useEffect(() => {
    void fetchLogs(selectedCompany === "all" ? undefined : selectedCompany);
    setActionFilter("all");
    setAuditSearch("");
  }, [selectedCompany, fetchLogs]);

  function handleRefresh() {
    void fetchLogs(selectedCompany === "all" ? undefined : selectedCompany);
  }

  const companyName = (id: number | null) => {
    if (!id) return null;
    return companies.find(c => c.id === id)?.name ?? `Empresa #${id}`;
  };

  const availableActions = useMemo(() => {
    const set = new Set<string>();
    auditLogs.forEach(l => set.add(l.action));
    return Array.from(set).sort((a, b) => (ACTION_META[a]?.label ?? a).localeCompare(ACTION_META[b]?.label ?? b));
  }, [auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter(l => {
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (!q) return true;
      return (
        (l.userEmail ?? "").toLowerCase().includes(q) ||
        actionMeta(l.action).label.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.entityType ?? "").toLowerCase().includes(q) ||
        String(l.entityId ?? "").includes(q) ||
        (l.ip ?? "").includes(q) ||
        (companyName(l.companyId) ?? "").toLowerCase().includes(q)
      );
    });
  }, [auditLogs, actionFilter, auditSearch, companies]);

  /* Group logs by company */
  const groupedLogs = useMemo(() => {
    if (selectedCompany !== "all") return null;
    const groups: Record<string, AuditLog[]> = {};
    filteredAuditLogs.forEach(l => {
      const key = l.companyId ? String(l.companyId) : "__platform";
      groups[key] = groups[key] ?? [];
      groups[key].push(l);
    });
    return groups;
  }, [filteredAuditLogs, selectedCompany]);

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function renderLogTable(logs: AuditLog[]) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              {["Data/Hora", "Usuário", "Ação", "Entidade", "ID", "Detalhes"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.map(log => {
              const meta = actionMeta(log.action);
              const isExpanded = expandedLog === log.id;
              const hasDetails = log.newValue || log.oldValue;
              return (
                <>
                  <tr
                    key={log.id}
                    className={`hover:bg-muted/20 transition-colors ${hasDetails ? "cursor-pointer" : ""}`}
                    onClick={() => hasDetails ? setExpandedLog(isExpanded ? null : log.id) : undefined}
                  >
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(log.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-foreground max-w-[160px] truncate">{log.userEmail ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{entityLabel(log.entityType)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{log.entityId ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {hasDetails ? (
                        <button className="flex items-center gap-1 text-accent hover:underline text-xs">
                          ver <ChevronDown size={12} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                      ) : "—"}
                    </td>
                  </tr>
                  {isExpanded && hasDetails && (
                    <tr key={`${log.id}-detail`} className="bg-muted/10">
                      <td colSpan={6} className="px-6 py-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          {log.newValue && (
                            <div>
                              <p className="font-semibold text-foreground mb-1">Novos valores</p>
                              <pre className="bg-muted/40 rounded p-2 text-muted-foreground overflow-auto max-h-32 text-[11px]">
                                {JSON.stringify(log.newValue, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.oldValue && (
                            <div>
                              <p className="font-semibold text-foreground mb-1">Valores anteriores</p>
                              <pre className="bg-muted/40 rounded p-2 text-muted-foreground overflow-auto max-h-32 text-[11px]">
                                {JSON.stringify(log.oldValue, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    );
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
        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
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

      {tab === "audit" && (
        <div className="bg-card border rounded-xl shadow-sm p-3 mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground pr-1">
            <Filter size={13} />Filtros:
          </div>

          {/* Company filter */}
          <div className="relative">
            <Building2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select
              value={selectedCompany}
              onChange={e => setSelectedCompany(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="h-9 pl-7 pr-8 rounded-md border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="all">Todas as empresas</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Action filter */}
          <div className="relative">
            <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className="h-9 pl-7 pr-8 rounded-md border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="all">Todas as ações</option>
              {availableActions.map(a => (
                <option key={a} value={a}>{actionMeta(a).label}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={auditSearch}
              onChange={e => setAuditSearch(e.target.value)}
              placeholder="Buscar por usuário, entidade, IP..."
              className="h-9 pl-8 text-sm"
            />
          </div>

          {(selectedCompany !== "all" || actionFilter !== "all" || auditSearch) && (
            <Button
              variant="ghost" size="sm"
              onClick={() => { setSelectedCompany("all"); setActionFilter("all"); setAuditSearch(""); }}
              className="h-9 text-xs text-muted-foreground"
            >
              Limpar
            </Button>
          )}

          <div className="ml-auto text-xs text-muted-foreground">
            {filteredAuditLogs.length} de {auditLogs.length}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="bg-card border rounded-xl shadow-sm py-16 text-center text-muted-foreground text-sm">Carregando logs...</div>
        ) : tab === "audit" ? (
          auditLogs.length === 0 ? (
            <div className="bg-card border rounded-xl shadow-sm py-16 text-center">
              <ScrollText size={32} className="text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Nenhuma ação registrada.</p>
            </div>
          ) : filteredAuditLogs.length === 0 ? (
            <div className="bg-card border rounded-xl shadow-sm py-16 text-center text-muted-foreground text-sm">
              Nenhuma ação corresponde aos filtros selecionados.
            </div>
          ) : selectedCompany !== "all" ? (
            /* ── Visão de empresa única ── */
            <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b bg-muted/20">
                <Building2 size={15} className="text-accent" />
                <span className="font-semibold text-sm text-foreground">
                  {companyName(selectedCompany as number)}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{filteredAuditLogs.length} registro(s)</span>
              </div>
              {renderLogTable(filteredAuditLogs)}
            </div>
          ) : (
            /* ── Visão agrupada por empresa ── */
            groupedLogs && Object.entries(groupedLogs).map(([key, logs]) => {
              const cid = key === "__platform" ? null : Number(key);
              const name = cid ? (companyName(cid) ?? `Empresa #${cid}`) : "Plataforma (sem empresa)";
              return (
                <div key={key} className="bg-card border rounded-xl shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-3.5 border-b bg-muted/20">
                    <Building2 size={15} className={cid ? "text-accent" : "text-muted-foreground"} />
                    <span className="font-semibold text-sm text-foreground">{name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{logs.length} registro(s)</span>
                  </div>
                  {renderLogTable(logs)}
                </div>
              );
            })
          )
        ) : (
          /* ── Login logs ── */
          loginLogs.length === 0 ? (
            <div className="bg-card border rounded-xl shadow-sm py-16 text-center text-muted-foreground text-sm">Nenhum acesso registrado.</div>
          ) : (
            <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
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
            </div>
          )
        )}
      </div>
    </div>
  );
}
