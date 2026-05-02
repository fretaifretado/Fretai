import { useState, useEffect, useCallback } from "react";
import { FileText, Plus, Trash2, Eye, X, AlertCircle, Building2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Budget {
  id: number;
  name: string;
  algorithm: string;
  companyId: number | null;
  companyName: string | null;
  status: string;
  destinationAddress: string | null;
  maxWalkingRadiusKm: string | null;
  maxTravelTimeMin: number | null;
  employeesCount: number;
  routesCount: number;
  createdAt: string;
}

interface Company {
  id: number;
  name: string;
}

interface Props { token: string }

const ALGORITHM_LABELS: Record<string, string> = {
  maior_ocupacao: "Maior Ocupação",
  menor_custo: "Menor Custo",
};

const ALGORITHM_OPTIONS = [
  { value: "menor_custo", label: "Menor Custo (Otimiza valor total em R$)" },
  { value: "maior_ocupacao", label: "Maior Ocupação (Maximiza uso dos veículos)" },
];

const STATUS_STYLES: Record<string, string> = {
  pronto: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rascunho: "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  pronto: "Pronto",
  rascunho: "Rascunho",
};

const EMPTY_FORM = {
  name: "",
  companyId: "none",
  destinationAddress: "",
  maxWalkingRadiusKm: "2",
  maxTravelTimeMin: "120",
  algorithm: "menor_custo",
};

export default function BudgetsSection({ token }: Props) {
  const [items, setItems] = useState<Budget[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"list" | "new">("list");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewBudget, setViewBudget] = useState<Budget | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [budgetsRes, companiesRes] = await Promise.all([
        fetch("/api/admin/budgets", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/companies", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!budgetsRes.ok) throw new Error("Erro");
      setItems(await budgetsRes.json() as Budget[]);
      if (companiesRes.ok) setCompanies(await companiesRes.json() as Company[]);
    } catch { setError("Erro ao carregar orçamentos."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setFormError(""); setFormLoading(true);
    try {
      const payload = {
        name: form.name,
        algorithm: form.algorithm,
        companyId: form.companyId !== "none" ? form.companyId : undefined,
        destinationAddress: form.destinationAddress || undefined,
        maxWalkingRadiusKm: form.maxWalkingRadiusKm,
        maxTravelTimeMin: form.maxTravelTimeMin,
        status: "rascunho",
      };
      const res = await fetch("/api/admin/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as Budget & { error?: string };
      if (!res.ok) { setFormError(data.error ?? "Erro ao salvar."); return; }
      setView("list"); setForm(EMPTY_FORM); await fetchItems();
    } catch { setFormError("Erro de conexão."); }
    finally { setFormLoading(false); }
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`/api/admin/budgets/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setDeleteId(null); await fetchItems();
    } catch { setError("Erro ao excluir."); }
  }

  async function handleStatusChange(budget: Budget, newStatus: string) {
    try {
      await fetch(`/api/admin/budgets/${budget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchItems();
      if (viewBudget?.id === budget.id) setViewBudget(b => b ? { ...b, status: newStatus } : null);
    } catch { setError("Erro ao atualizar status."); }
  }

  /* ── New Budget Form (full-page) ── */
  if (view === "new") {
    return (
      <div>
        {/* Back + title */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => { setView("list"); setForm(EMPTY_FORM); setFormError(""); }}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Novo Orçamento</h1>
            <p className="text-muted-foreground text-sm">Configure os parâmetros da rota.</p>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-6">

            {/* Row 1: Nome + Empresa */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Nome do Orçamento</label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Roteirização Q3"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Empresa Cliente</label>
                <Select value={form.companyId} onValueChange={v => setForm(f => ({ ...f, companyId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {companies.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Endereço */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                Endereço de Destino (Fábrica/Escritório)
              </label>
              <Input
                value={form.destinationAddress}
                onChange={e => setForm(f => ({ ...f, destinationAddress: e.target.value }))}
                placeholder="Ex: Av. Paulista, 1000 - São Paulo, SP"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Todos os funcionários serão transportados para este local.</p>
            </div>

            {/* Row 3: Raio + Tempo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Raio Máximo a pé (KM)</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.maxWalkingRadiusKm}
                  onChange={e => setForm(f => ({ ...f, maxWalkingRadiusKm: e.target.value }))}
                  placeholder="2"
                />
                <p className="text-xs text-muted-foreground mt-1.5">Distância máxima que o funcionário pode caminhar até o ponto de embarque.</p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Tempo Máximo de Viagem (Minutos)</label>
                <Input
                  type="number"
                  min="1"
                  value={form.maxTravelTimeMin}
                  onChange={e => setForm(f => ({ ...f, maxTravelTimeMin: e.target.value }))}
                  placeholder="120"
                />
                <p className="text-xs text-muted-foreground mt-1.5">Tempo máximo que um funcionário pode passar dentro do veículo.</p>
              </div>
            </div>

            {/* Row 4: Estratégia */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Estratégia de Otimização</label>
              <Select value={form.algorithm} onValueChange={v => setForm(f => ({ ...f, algorithm: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALGORITHM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {formError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle size={14} />{formError}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={formLoading} className="min-w-36">
                {formLoading ? "Salvando…" : "Criar Orçamento"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  /* ── List view ── */
  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText size={18} className="text-accent" />
            <h1 className="text-xl font-bold text-foreground">Orçamentos</h1>
          </div>
          <p className="text-muted-foreground text-sm">Planeje e processe rotas de transporte.</p>
        </div>
        <Button onClick={() => { setView("new"); setForm(EMPTY_FORM); setFormError(""); }} className="gap-2 shrink-0">
          <Plus size={16} /> Novo Orçamento
        </Button>
      </div>

      {/* Confirm delete */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 border text-center">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-destructive" />
            </div>
            <h2 className="font-bold text-foreground mb-2">Excluir orçamento?</h2>
            <p className="text-sm text-muted-foreground mb-6">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>Cancelar</Button>
              <Button variant="destructive" className="flex-1" onClick={() => void handleDelete(deleteId)}>Excluir</Button>
            </div>
          </div>
        </div>
      )}

      {/* View detail modal */}
      {viewBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg p-6 border">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-foreground text-lg">{viewBudget.name}</h2>
              <button onClick={() => setViewBudget(null)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Estratégia</p>
                  <p className="font-semibold text-foreground">{ALGORITHM_LABELS[viewBudget.algorithm] ?? viewBudget.algorithm}</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${STATUS_STYLES[viewBudget.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABELS[viewBudget.status] ?? viewBudget.status}
                  </span>
                </div>
                <div className="bg-muted/40 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Empresa</p>
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    {viewBudget.companyName ? <><Building2 size={13} />{viewBudget.companyName}</> : "—"}
                  </p>
                </div>
                <div className="bg-muted/40 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Raio Máximo a pé</p>
                  <p className="font-semibold text-foreground">{viewBudget.maxWalkingRadiusKm ? `${viewBudget.maxWalkingRadiusKm} km` : "—"}</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Tempo Máximo de Viagem</p>
                  <p className="font-semibold text-foreground">{viewBudget.maxTravelTimeMin ? `${viewBudget.maxTravelTimeMin} min` : "—"}</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Funcionários / Rotas</p>
                  <p className="font-semibold text-foreground">{viewBudget.employeesCount} / {viewBudget.routesCount}</p>
                </div>
              </div>
              {viewBudget.destinationAddress && (
                <div className="bg-muted/40 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Endereço de Destino</p>
                  <p className="font-semibold text-foreground">{viewBudget.destinationAddress}</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                {viewBudget.status === "rascunho" ? (
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => void handleStatusChange(viewBudget, "pronto")}>
                    Marcar como Pronto
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void handleStatusChange(viewBudget, "rascunho")}>
                    Reverter para Rascunho
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setViewBudget(null)}>Fechar</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Carregando…</div>
      ) : error ? (
        <div className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-sm"><AlertCircle size={16} />{error}</div>
      ) : items.length === 0 ? (
        <div className="bg-card border rounded-xl p-10 text-center">
          <FileText size={32} className="text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum orçamento cadastrado ainda.</p>
          <Button size="sm" variant="outline" className="mt-4 gap-2" onClick={() => setView("new")}><Plus size={14} />Criar primeiro orçamento</Button>
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Nome</th>
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Empresa</th>
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Funcionários</th>
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Rotas</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <span className="text-muted-foreground/60">↳</span>
                      {ALGORITHM_LABELS[item.algorithm] ?? item.algorithm}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {item.companyName ? (
                      <span className="flex items-center gap-1.5">
                        <Building2 size={13} className="text-muted-foreground/60" />
                        {item.companyName}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded border text-xs font-medium ${STATUS_STYLES[item.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{item.employeesCount}</td>
                  <td className="px-5 py-4 text-muted-foreground">{item.routesCount}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setViewBudget(item)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
                        title="Visualizar"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteId(item.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
