import { useState, useEffect, useCallback } from "react";
import {
  FileText, Plus, Trash2, AlertCircle, Building2, ArrowLeft,
  MapPin, Users, Navigation, Bus, DollarSign, Play,
} from "lucide-react";
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

interface Company { id: number; name: string; }

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
const STATUS_LABELS: Record<string, string> = { pronto: "Pronto", rascunho: "Rascunho" };

const EMPTY_FORM = {
  name: "", companyId: "none", destinationAddress: "",
  maxWalkingRadiusKm: "2", maxTravelTimeMin: "120", algorithm: "menor_custo",
};

type View = "list" | "new" | "detail";
type DetailTab = "overview" | "employees" | "routes" | "map";

export default function BudgetsSection({ token }: Props) {
  const [items, setItems] = useState<Budget[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<Budget | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [budgetsRes, companiesRes] = await Promise.all([
        fetch("/api/admin/budgets", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/companies", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!budgetsRes.ok) throw new Error("Erro");
      const budgets = await budgetsRes.json() as Budget[];
      setItems(budgets);
      if (companiesRes.ok) setCompanies(await companiesRes.json() as Company[]);
      /* refresh selected if we're in detail view */
      if (selected) {
        const updated = budgets.find(b => b.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch { setError("Erro ao carregar orçamentos."); }
    finally { setLoading(false); }
  }, [token, selected]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setFormError(""); setFormLoading(true);
    try {
      const payload = {
        name: form.name, algorithm: form.algorithm,
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
      setDeleteId(null);
      if (selected?.id === id) { setView("list"); setSelected(null); }
      await fetchItems();
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
    } catch { setError("Erro ao atualizar status."); }
  }

  function openDetail(budget: Budget) {
    setSelected(budget);
    setDetailTab("overview");
    setView("detail");
  }

  /* ── Detail view ── */
  if (view === "detail" && selected) {
    const tabs: { key: DetailTab; label: string }[] = [
      { key: "overview", label: "Visão Geral" },
      { key: "employees", label: `Funcionários (${selected.employeesCount})` },
      { key: "routes", label: `Rotas (${selected.routesCount})` },
      { key: "map", label: "Mapa Visual" },
    ];

    return (
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <button
              onClick={() => { setView("list"); setSelected(null); }}
              className="mt-0.5 p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">{selected.name}</h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded border text-xs font-medium ${STATUS_STYLES[selected.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                  {STATUS_LABELS[selected.status] ?? selected.status}
                </span>
              </div>
              {selected.destinationAddress && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                  <MapPin size={13} className="shrink-0" />
                  {selected.destinationAddress}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {selected.status === "rascunho" ? (
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => void handleStatusChange(selected, "pronto")}>
                <Play size={13} /> Processar Rotas
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void handleStatusChange(selected, "rascunho")}>
                Reverter para Rascunho
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b mb-6 gap-0">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setDetailTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                detailTab === tab.key
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {detailTab === "overview" && (
          <div className="space-y-5">
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Custo Estimado", value: "—", icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
                { label: "Passageiros", value: String(selected.employeesCount), icon: Users, color: "text-violet-600", bg: "bg-violet-50" },
                { label: "Rotas / Turnos", value: String(selected.routesCount), icon: Navigation, color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "Veículos Físicos", value: "—", icon: Bus, color: "text-orange-600", bg: "bg-orange-50" },
              ].map(card => (
                <div key={card.label} className="bg-card border rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-muted-foreground font-medium">{card.label}</p>
                    <div className={`w-8 h-8 rounded-full ${card.bg} flex items-center justify-center`}>
                      <card.icon size={15} className={card.color} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{card.value}</p>
                </div>
              ))}
            </div>

            {/* Bottom row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Parâmetros */}
              <div className="bg-card border rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-foreground mb-4 text-sm">Parâmetros do Orçamento</h3>
                <div className="space-y-3">
                  {[
                    {
                      label: "Raio de Caminhada Máximo",
                      value: selected.maxWalkingRadiusKm ? `${selected.maxWalkingRadiusKm} km` : "—",
                    },
                    {
                      label: "Tempo de Viagem Máximo",
                      value: selected.maxTravelTimeMin ? `${selected.maxTravelTimeMin} minutos` : "—",
                    },
                    {
                      label: "Estratégia",
                      value: ALGORITHM_LABELS[selected.algorithm] ?? selected.algorithm,
                    },
                    ...(selected.companyName ? [{
                      label: "Empresa",
                      value: selected.companyName,
                    }] : []),
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <p className="text-sm text-muted-foreground">{row.label}</p>
                      <p className="text-sm font-medium text-foreground">{row.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Frota Utilizada */}
              <div className="bg-card border rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-foreground mb-1 text-sm">Frota Utilizada</h3>
                <p className="text-xs text-muted-foreground mb-4">Composição dos veículos nas rotas</p>
                {selected.routesCount === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    As rotas ainda não foram processadas.
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    {selected.routesCount} rota(s) processada(s).
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {detailTab === "employees" && (
          <div className="bg-card border rounded-xl p-10 text-center shadow-sm">
            <Users size={32} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {selected.employeesCount === 0
                ? "Nenhum funcionário associado a este orçamento."
                : `${selected.employeesCount} funcionário(s) associado(s).`}
            </p>
          </div>
        )}

        {detailTab === "routes" && (
          <div className="bg-card border rounded-xl p-10 text-center shadow-sm">
            <Navigation size={32} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {selected.routesCount === 0
                ? "Nenhuma rota gerada ainda. Processe as rotas para visualizá-las."
                : `${selected.routesCount} rota(s) gerada(s).`}
            </p>
          </div>
        )}

        {detailTab === "map" && (
          <div className="bg-card border rounded-xl p-10 text-center shadow-sm">
            <MapPin size={32} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">O mapa visual estará disponível após o processamento das rotas.</p>
          </div>
        )}
      </div>
    );
  }

  /* ── New Budget Form (full-page) ── */
  if (view === "new") {
    return (
      <div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Nome do Orçamento</label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Roteirização Q3" required />
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

            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Endereço de Destino (Fábrica/Escritório)</label>
              <Input value={form.destinationAddress} onChange={e => setForm(f => ({ ...f, destinationAddress: e.target.value }))} placeholder="Ex: Av. Paulista, 1000 - São Paulo, SP" />
              <p className="text-xs text-muted-foreground mt-1.5">Todos os funcionários serão transportados para este local.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Raio Máximo a pé (KM)</label>
                <Input type="number" step="0.1" min="0" value={form.maxWalkingRadiusKm} onChange={e => setForm(f => ({ ...f, maxWalkingRadiusKm: e.target.value }))} placeholder="2" />
                <p className="text-xs text-muted-foreground mt-1.5">Distância máxima que o funcionário pode caminhar até o ponto de embarque.</p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Tempo Máximo de Viagem (Minutos)</label>
                <Input type="number" min="1" value={form.maxTravelTimeMin} onChange={e => setForm(f => ({ ...f, maxTravelTimeMin: e.target.value }))} placeholder="120" />
                <p className="text-xs text-muted-foreground mt-1.5">Tempo máximo que um funcionário pode passar dentro do veículo.</p>
              </div>
            </div>

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
                    <button
                      onClick={() => openDetail(item)}
                      className="text-left group"
                    >
                      <p className="font-medium text-foreground group-hover:text-accent transition-colors">{item.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <span className="text-muted-foreground/60">↳</span>
                        {ALGORITHM_LABELS[item.algorithm] ?? item.algorithm}
                      </p>
                    </button>
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
                    <button
                      onClick={() => setDeleteId(item.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={15} />
                    </button>
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
