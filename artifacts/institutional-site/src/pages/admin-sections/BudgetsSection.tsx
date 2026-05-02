import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText, Plus, Trash2, AlertCircle, Building2, ArrowLeft,
  MapPin, Users, Navigation, Bus, DollarSign, Play, Upload,
  ArrowRight, ArrowLeft as ArrowLeftIcon, RotateCcw, UserPlus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ─── Types ─── */
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

interface Company { id: number; name: string }

interface Employee {
  id: number;
  budgetId: number;
  name: string;
  address: string | null;
  shift: string;
  createdAt: string;
}

interface RouteVehicle {
  id: number;
  budgetId: number;
  vehicleLabel: string;
  vehicleColor: string;
  vehicleType: string;
  capacity: number;
  passengersCount: number;
  durationMin: number;
}

interface Props { token: string }

/* ─── Constants ─── */
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

const SHIFT_LABELS: Record<string, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };
const SHIFT_OPTIONS = [
  { value: "manha", label: "Manhã (06:00)" },
  { value: "tarde", label: "Tarde (14:20)" },
  { value: "noite", label: "Noite (22:30)" },
];

const SCHEDULE_SHIFTS = [
  { time: "06:00", exitTime: "22:30", label: "06:00", sublabel: "sai turno 22:30" },
  { time: "14:20", exitTime: "06:00", label: "14:20", sublabel: "sai turno 06:00" },
  { time: "22:30", exitTime: "14:20", label: "22:30", sublabel: "sai turno 14:20" },
];

const VEHICLE_COLORS: Record<string, { bg: string; text: string; dot: string; cell: string; border: string }> = {
  blue:   { bg: "bg-blue-50",   text: "text-blue-700",   dot: "bg-blue-500",   cell: "bg-blue-50 border-blue-200",   border: "border-blue-200" },
  green:  { bg: "bg-emerald-50",text: "text-emerald-700",dot: "bg-emerald-500",cell: "bg-emerald-50 border-emerald-200",border: "border-emerald-200" },
  amber:  { bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-400",  cell: "bg-amber-50 border-amber-200",  border: "border-amber-200" },
  purple: { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500", cell: "bg-violet-50 border-violet-200",border: "border-violet-200" },
  orange: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500", cell: "bg-orange-50 border-orange-200",border: "border-orange-200" },
  rose:   { bg: "bg-rose-50",   text: "text-rose-700",   dot: "bg-rose-500",   cell: "bg-rose-50 border-rose-200",   border: "border-rose-200" },
  teal:   { bg: "bg-teal-50",   text: "text-teal-700",   dot: "bg-teal-500",   cell: "bg-teal-50 border-teal-200",   border: "border-teal-200" },
  cyan:   { bg: "bg-cyan-50",   text: "text-cyan-700",   dot: "bg-cyan-500",   cell: "bg-cyan-50 border-cyan-200",   border: "border-cyan-200" },
};

const EMPTY_FORM = {
  name: "", companyId: "none", destinationAddress: "",
  maxWalkingRadiusKm: "2", maxTravelTimeMin: "120", algorithm: "menor_custo",
};

type View = "list" | "new" | "detail";
type DetailTab = "overview" | "employees" | "routes" | "map";

/* ─── Helper: parse CSV text ─── */
function parseCSV(text: string): Array<{ name: string; address: string; shift: string }> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase()
    .replace("nome", "name").replace("endereço", "address").replace("endereco", "address")
    .replace("turno", "shift"));
  return lines.slice(1).map(line => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
    return {
      name: obj.name ?? obj["nome"] ?? "",
      address: obj.address ?? obj["endereço"] ?? obj["endereco"] ?? "",
      shift: obj.shift ?? obj["turno"] ?? "manha",
    };
  }).filter(r => r.name);
}

/* ─── Component ─── */
export default function BudgetsSection({ token }: Props) {
  const [items, setItems] = useState<Budget[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<Budget | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [routeVehicles, setRouteVehicles] = useState<RouteVehicle[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState("");

  /* Add employee form */
  const [empForm, setEmpForm] = useState({ name: "", address: "", shift: "manha" });
  const [empFormOpen, setEmpFormOpen] = useState(false);
  const [empFormLoading, setEmpFormLoading] = useState(false);
  const [empFormError, setEmpFormError] = useState("");

  /* CSV import */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string>("");

  /* Delete confirm */
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteEmpId, setDeleteEmpId] = useState<number | null>(null);
  const [clearEmpsConfirm, setClearEmpsConfirm] = useState(false);

  /* New budget form */
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { ...headers, "Content-Type": "application/json" };

  /* ─── Fetch budgets + companies ─── */
  const fetchItems = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [bRes, cRes] = await Promise.all([
        fetch("/api/admin/budgets", { headers }),
        fetch("/api/admin/companies", { headers }),
      ]);
      if (!bRes.ok) throw new Error("Erro");
      const budgets = await bRes.json() as Budget[];
      setItems(budgets);
      if (cRes.ok) setCompanies(await cRes.json() as Company[]);
      if (selected) {
        const updated = budgets.find(b => b.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch { setError("Erro ao carregar orçamentos."); }
    finally { setLoading(false); }
  }, [token, selected?.id]);

  useEffect(() => { void fetchItems(); }, [fetchItems]);

  /* ─── Fetch employees for selected budget ─── */
  const fetchEmployees = useCallback(async (budgetId: number) => {
    setEmpLoading(true);
    try {
      const res = await fetch(`/api/admin/budgets/${budgetId}/employees`, { headers });
      if (res.ok) setEmployees(await res.json() as Employee[]);
    } catch { /* ignore */ }
    finally { setEmpLoading(false); }
  }, [token]);

  /* ─── Fetch route vehicles for selected budget ─── */
  const fetchRouteVehicles = useCallback(async (budgetId: number) => {
    setRouteLoading(true);
    try {
      const res = await fetch(`/api/admin/budgets/${budgetId}/route-vehicles`, { headers });
      if (res.ok) setRouteVehicles(await res.json() as RouteVehicle[]);
      else setRouteVehicles([]);
    } catch { setRouteVehicles([]); }
    finally { setRouteLoading(false); }
  }, [token]);

  /* ─── Open detail ─── */
  function openDetail(budget: Budget) {
    setSelected(budget);
    setDetailTab("overview");
    setView("detail");
    setEmployees([]);
    setRouteVehicles([]);
    setProcessError("");
    setImportResult("");
    void fetchEmployees(budget.id);
    void fetchRouteVehicles(budget.id);
  }

  /* ─── When tab changes, load data if needed ─── */
  function switchTab(tab: DetailTab) {
    setDetailTab(tab);
    if (!selected) return;
    if (tab === "employees") void fetchEmployees(selected.id);
    if (tab === "routes" || tab === "overview") void fetchRouteVehicles(selected.id);
  }

  /* ─── Create budget ─── */
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
      const res = await fetch("/api/admin/budgets", { method: "POST", headers: jsonHeaders, body: JSON.stringify(payload) });
      const data = await res.json() as Budget & { error?: string };
      if (!res.ok) { setFormError(data.error ?? "Erro ao salvar."); return; }
      setView("list"); setForm(EMPTY_FORM); await fetchItems();
    } catch { setFormError("Erro de conexão."); }
    finally { setFormLoading(false); }
  }

  /* ─── Delete budget ─── */
  async function handleDelete(id: number) {
    try {
      await fetch(`/api/admin/budgets/${id}`, { method: "DELETE", headers });
      setDeleteId(null);
      if (selected?.id === id) { setView("list"); setSelected(null); }
      await fetchItems();
    } catch { setError("Erro ao excluir."); }
  }

  /* ─── Change budget status ─── */
  async function handleStatusChange(budget: Budget, newStatus: string) {
    try {
      const res = await fetch(`/api/admin/budgets/${budget.id}`, {
        method: "PUT", headers: jsonHeaders, body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json() as Budget;
        setSelected(updated);
        await fetchItems();
      }
    } catch { setError("Erro ao atualizar status."); }
  }

  /* ─── Process routes ─── */
  async function handleProcess() {
    if (!selected) return;
    setProcessing(true); setProcessError("");
    try {
      const res = await fetch(`/api/admin/budgets/${selected.id}/process`, { method: "POST", headers });
      const data = await res.json() as { vehicles?: number; employees?: number; error?: string };
      if (!res.ok) { setProcessError(data.error ?? "Erro ao processar."); return; }
      await fetchItems();
      await fetchRouteVehicles(selected.id);
    } catch { setProcessError("Erro de conexão."); }
    finally { setProcessing(false); }
  }

  /* ─── Add single employee ─── */
  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !empForm.name.trim()) return;
    setEmpFormLoading(true); setEmpFormError("");
    try {
      const res = await fetch(`/api/admin/budgets/${selected.id}/employees`, {
        method: "POST", headers: jsonHeaders,
        body: JSON.stringify({ name: empForm.name, address: empForm.address, shift: empForm.shift }),
      });
      const data = await res.json() as Employee & { error?: string };
      if (!res.ok) { setEmpFormError(data.error ?? "Erro."); return; }
      setEmpForm({ name: "", address: "", shift: "manha" });
      setEmpFormOpen(false);
      await fetchEmployees(selected.id);
      await fetchItems();
    } catch { setEmpFormError("Erro de conexão."); }
    finally { setEmpFormLoading(false); }
  }

  /* ─── Delete single employee ─── */
  async function handleDeleteEmployee(empId: number) {
    if (!selected) return;
    try {
      await fetch(`/api/admin/budgets/${selected.id}/employees/${empId}`, { method: "DELETE", headers });
      setDeleteEmpId(null);
      await fetchEmployees(selected.id);
      await fetchItems();
    } catch { /* ignore */ }
  }

  /* ─── Clear all employees ─── */
  async function handleClearEmployees() {
    if (!selected) return;
    try {
      await fetch(`/api/admin/budgets/${selected.id}/employees`, { method: "DELETE", headers });
      setClearEmpsConfirm(false);
      setEmployees([]);
      await fetchItems();
    } catch { /* ignore */ }
  }

  /* ─── CSV file upload ─── */
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setImporting(true); setImportResult("");
    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      if (parsed.length === 0) { setImportResult("Nenhum registro válido encontrado no arquivo."); return; }
      const res = await fetch(`/api/admin/budgets/${selected.id}/employees/import`, {
        method: "POST", headers: jsonHeaders,
        body: JSON.stringify({ employees: parsed }),
      });
      const data = await res.json() as { imported?: number; total?: number; error?: string };
      if (!res.ok) { setImportResult(data.error ?? "Erro ao importar."); return; }
      setImportResult(`${data.imported ?? 0} funcionários importados com sucesso (total: ${data.total ?? 0}).`);
      await fetchEmployees(selected.id);
      await fetchItems();
    } catch { setImportResult("Erro ao ler o arquivo."); }
    finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /* ─── Aggregate frota ─── */
  function aggregateFleet(vehicles: RouteVehicle[]) {
    const map: Record<string, { count: number; pax: number }> = {};
    for (const v of vehicles) {
      if (!map[v.vehicleType]) map[v.vehicleType] = { count: 0, pax: 0 };
      map[v.vehicleType].count++;
      map[v.vehicleType].pax += v.passengersCount;
    }
    return Object.entries(map).map(([type, { count, pax }]) => ({ type, count, pax }));
  }

  /* ══════════════════════════════════════════
     DETAIL VIEW
  ══════════════════════════════════════════ */
  if (view === "detail" && selected) {
    const fleet = aggregateFleet(routeVehicles);
    const totalPassengers = routeVehicles.reduce((s, v) => s + v.passengersCount, 0);
    const isProcessed = routeVehicles.length > 0;

    const tabs: { key: DetailTab; label: string }[] = [
      { key: "overview", label: "Visão Geral" },
      { key: "employees", label: `Funcionários (${selected.employeesCount})` },
      { key: "routes", label: `Rotas (${selected.routesCount})` },
      { key: "map", label: "Mapa Visual" },
    ];

    return (
      <div>
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <button
              onClick={() => { setView("list"); setSelected(null); setEmployees([]); setRouteVehicles([]); }}
              className="mt-1 p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
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
            {processError && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle size={12} />{processError}
              </span>
            )}
            {selected.status === "rascunho" ? (
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => void handleProcess()} disabled={processing}>
                <Play size={13} /> {processing ? "Processando…" : "Processar Rotas"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void handleStatusChange(selected, "rascunho")}>
                <RotateCcw size={13} /> Reverter para Rascunho
              </Button>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b mb-6">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => switchTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                detailTab === tab.key ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >{tab.label}</button>
          ))}
        </div>

        {/* ══ TAB: Visão Geral ══ */}
        {detailTab === "overview" && (
          <div className="space-y-5">
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Custo Estimado", value: "—", icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
                { label: "Passageiros", value: String(isProcessed ? totalPassengers : selected.employeesCount), icon: Users, color: "text-violet-600", bg: "bg-violet-50" },
                { label: "Rotas / Turnos", value: String(selected.routesCount), icon: Navigation, color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "Veículos Físicos", value: isProcessed ? String(routeVehicles.length) : "—", icon: Bus, color: "text-orange-600", bg: "bg-orange-50" },
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

            {/* Parâmetros + Frota */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-card border rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-foreground mb-4 text-sm">Parâmetros do Orçamento</h3>
                <div className="space-y-0">
                  {[
                    { label: "Raio de Caminhada Máximo", value: selected.maxWalkingRadiusKm ? `${selected.maxWalkingRadiusKm} km` : "—" },
                    { label: "Tempo de Viagem Máximo", value: selected.maxTravelTimeMin ? `${selected.maxTravelTimeMin} minutos` : "—" },
                    { label: "Estratégia", value: ALGORITHM_LABELS[selected.algorithm] ?? selected.algorithm },
                    ...(selected.companyName ? [{ label: "Empresa", value: selected.companyName }] : []),
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                      <p className="text-sm text-muted-foreground">{row.label}</p>
                      <p className="text-sm font-semibold text-foreground">{row.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-card border rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-foreground mb-1 text-sm">Frota Utilizada</h3>
                <p className="text-xs text-muted-foreground mb-4">Composição dos veículos nas rotas</p>
                {routeLoading ? (
                  <div className="py-6 text-sm text-muted-foreground text-center">Carregando…</div>
                ) : !isProcessed ? (
                  <div className="py-6 text-sm text-muted-foreground text-center">As rotas ainda não foram processadas.</div>
                ) : (
                  <div className="space-y-3">
                    {fleet.map(({ type, count, pax }) => (
                      <div key={type} className="flex items-center gap-3">
                        <Bus size={16} className="text-muted-foreground/60 shrink-0" />
                        <span className="text-sm text-foreground flex-1 font-medium">{type}</span>
                        <span className="text-sm font-bold text-foreground">{count}×</span>
                        <span className="text-xs text-muted-foreground">({pax} pax total)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Roteiro Diário por Veículo */}
            {isProcessed && (
              <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                <div className="p-5 pb-3">
                  <h3 className="font-semibold text-foreground text-sm">Roteiro Diário por Veículo</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ao chegar na empresa com um turno, o veículo imediatamente embarca os que estão saindo —
                    fazendo <strong>entrada + saída em cada horário</strong>.
                  </p>
                  <div className="flex items-center gap-5 mt-3 text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <ArrowRight size={12} className="text-blue-500" />
                      <strong>Entrada:</strong> leva funcionários <strong>para a empresa</strong>
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <ArrowLeftIcon size={12} className="text-muted-foreground/60" />
                      <strong>Saída:</strong> traz funcionários <strong>para casa</strong>
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t border-b bg-muted/20">
                        <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs min-w-[130px]">Veículo</th>
                        {SCHEDULE_SHIFTS.map(s => (
                          <th key={s.time} className="px-4 py-3 text-center min-w-[200px]">
                            <div className="font-bold text-accent text-base">{s.label}</div>
                            <div className="text-xs text-muted-foreground font-normal">{s.sublabel}</div>
                          </th>
                        ))}
                        <th className="px-5 py-3 text-right font-medium text-muted-foreground text-xs min-w-[90px]">Viagens/dia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {routeVehicles.map(v => {
                        const c = VEHICLE_COLORS[v.vehicleColor] ?? VEHICLE_COLORS.blue;
                        return (
                          <tr key={v.id} className="hover:bg-muted/10 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <span className={`w-3 h-3 rounded-full ${c.dot} shrink-0`} />
                                <span className="font-medium text-foreground">Veículo {v.vehicleLabel}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 ml-5">{v.vehicleType} · {v.passengersCount} pax</div>
                            </td>
                            {SCHEDULE_SHIFTS.map(s => (
                              <td key={s.time} className="px-4 py-3">
                                <div className={`rounded-lg border p-2.5 space-y-1.5 ${c.cell}`}>
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <ArrowRight size={11} className={c.text} />
                                    <span className={`font-medium ${c.text}`}>Entrada {s.time}</span>
                                    <span className="text-muted-foreground ml-auto">({v.durationMin}min)</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <ArrowLeftIcon size={11} />
                                    <span>Saída turno {s.exitTime}</span>
                                    <span className="ml-auto">({v.durationMin}min)</span>
                                  </div>
                                </div>
                              </td>
                            ))}
                            <td className="px-5 py-3 text-right">
                              <span className="text-lg font-bold text-foreground">6×</span>
                              <div className="text-xs text-muted-foreground">viagens</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!isProcessed && selected.status === "rascunho" && (
              <div className="bg-card border border-dashed rounded-xl p-8 text-center">
                <Navigation size={28} className="text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-3">
                  {selected.employeesCount === 0
                    ? "Adicione funcionários na aba Funcionários e depois clique em Processar Rotas."
                    : "Clique em Processar Rotas para gerar o roteiro de veículos."}
                </p>
                <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => void handleProcess()} disabled={processing || selected.employeesCount === 0}>
                  <Play size={13} /> {processing ? "Processando…" : "Processar Rotas"}
                </Button>
                {processError && <p className="text-xs text-destructive mt-2">{processError}</p>}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: Funcionários ══ */}
        {detailTab === "employees" && (
          <div className="space-y-4">
            {/* Actions bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {employees.length === 0 ? "Nenhum funcionário cadastrado." : `${employees.length} funcionário(s) cadastrado(s).`}
              </p>
              <div className="flex items-center gap-2">
                {employees.length > 0 && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive hover:border-destructive/50"
                    onClick={() => setClearEmpsConfirm(true)}>
                    <Trash2 size={13} /> Limpar tudo
                  </Button>
                )}
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEmpFormOpen(true); setEmpFormError(""); }}>
                  <UserPlus size={13} /> Adicionar
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                  <Upload size={13} /> {importing ? "Importando…" : "Importar CSV"}
                </Button>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => void handleFileChange(e)} />
              </div>
            </div>

            {/* Import result */}
            {importResult && (
              <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 border ${
                importResult.includes("sucesso") ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-destructive/10 text-destructive border-destructive/20"
              }`}>
                <AlertCircle size={13} />{importResult}
                <button onClick={() => setImportResult("")} className="ml-auto"><X size={13} /></button>
              </div>
            )}

            {/* CSV format hint */}
            <div className="bg-muted/40 rounded-xl px-4 py-3 text-xs text-muted-foreground">
              <strong>Formato CSV:</strong> nome, endereço, turno &nbsp;·&nbsp;
              Turno aceito: <code>manha</code>, <code>tarde</code>, <code>noite</code> &nbsp;·&nbsp;
              Primeira linha = cabeçalho
            </div>

            {/* Add employee form */}
            {empFormOpen && (
              <div className="bg-card border rounded-xl p-4 shadow-sm">
                <h4 className="font-semibold text-sm text-foreground mb-3">Novo Funcionário</h4>
                <form onSubmit={e => void handleAddEmployee(e)} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Nome *</label>
                      <Input value={empForm.name} onChange={e => setEmpForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome completo" required />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Endereço</label>
                      <Input value={empForm.address} onChange={e => setEmpForm(f => ({ ...f, address: e.target.value }))} placeholder="Rua, número..." />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Turno</label>
                      <Select value={empForm.shift} onValueChange={v => setEmpForm(f => ({ ...f, shift: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SHIFT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {empFormError && <p className="text-xs text-destructive">{empFormError}</p>}
                  <div className="flex justify-end gap-2">
                    <Button size="sm" type="button" variant="outline" onClick={() => { setEmpFormOpen(false); setEmpFormError(""); }}>Cancelar</Button>
                    <Button size="sm" type="submit" disabled={empFormLoading}>{empFormLoading ? "Salvando…" : "Adicionar"}</Button>
                  </div>
                </form>
              </div>
            )}

            {/* Employee table */}
            {empLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
            ) : employees.length === 0 ? (
              <div className="bg-card border rounded-xl p-10 text-center">
                <Users size={28} className="text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum funcionário cadastrado ainda.</p>
                <p className="text-xs text-muted-foreground mt-1">Importe via CSV ou adicione manualmente.</p>
              </div>
            ) : (
              <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Nome</th>
                      <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Turno</th>
                      <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Endereço</th>
                      <th className="text-right px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {employees.map(emp => (
                      <tr key={emp.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-5 py-3 font-medium text-foreground">{emp.name}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent">
                            {SHIFT_LABELS[emp.shift] ?? emp.shift}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">{emp.address ?? "—"}</td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => setDeleteEmpId(emp.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: Rotas ══ */}
        {detailTab === "routes" && (
          <div className="space-y-4">
            {routeLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
            ) : !isProcessed ? (
              <div className="bg-card border rounded-xl p-10 text-center">
                <Navigation size={32} className="text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-4">
                  {selected.employeesCount === 0
                    ? "Adicione funcionários e processe as rotas para visualizar o roteiro."
                    : "Clique em Processar Rotas para gerar o roteiro de veículos."}
                </p>
                <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => void handleProcess()} disabled={processing || selected.employeesCount === 0}>
                  <Play size={13} /> {processing ? "Processando…" : "Processar Rotas"}
                </Button>
                {processError && <p className="text-xs text-destructive mt-2">{processError}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground text-sm">{routeVehicles.length} veículo(s) alocado(s)</h3>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void handleProcess()} disabled={processing}>
                    <RotateCcw size={13} /> {processing ? "Reprocessando…" : "Reprocessar"}
                  </Button>
                </div>
                <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Veículo</th>
                        <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Tipo</th>
                        <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Capacidade</th>
                        <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Passageiros</th>
                        <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Duração Est.</th>
                        <th className="text-right px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Viagens/dia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {routeVehicles.map(v => {
                        const c = VEHICLE_COLORS[v.vehicleColor] ?? VEHICLE_COLORS.blue;
                        const occupancy = Math.round((v.passengersCount / (v.capacity || 1)) * 100);
                        return (
                          <tr key={v.id} className="hover:bg-muted/10 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`w-3 h-3 rounded-full ${c.dot}`} />
                                <span className="font-medium text-foreground">Veículo {v.vehicleLabel}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-muted-foreground">{v.vehicleType}</td>
                            <td className="px-5 py-3 text-muted-foreground">{v.capacity} pax</td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-foreground font-medium">{v.passengersCount}</span>
                                <div className="flex-1 max-w-20 bg-muted rounded-full h-1.5">
                                  <div className={`h-1.5 rounded-full ${c.dot}`} style={{ width: `${occupancy}%` }} />
                                </div>
                                <span className="text-xs text-muted-foreground">{occupancy}%</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-muted-foreground">{v.durationMin} min</td>
                            <td className="px-5 py-3 text-right font-bold text-foreground">6×</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: Mapa Visual ══ */}
        {detailTab === "map" && (
          <div className="bg-card border rounded-xl p-10 text-center shadow-sm">
            <MapPin size={32} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">O mapa visual estará disponível em breve.</p>
            <p className="text-muted-foreground text-xs mt-1">Após o processamento, será possível visualizar as rotas no mapa.</p>
          </div>
        )}

        {/* ── Delete employee confirm ── */}
        {deleteEmpId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 border text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={22} className="text-destructive" />
              </div>
              <h2 className="font-bold text-foreground mb-2">Remover funcionário?</h2>
              <p className="text-sm text-muted-foreground mb-6">Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteEmpId(null)}>Cancelar</Button>
                <Button variant="destructive" className="flex-1" onClick={() => void handleDeleteEmployee(deleteEmpId)}>Remover</Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Clear all employees confirm ── */}
        {clearEmpsConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 border text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={22} className="text-destructive" />
              </div>
              <h2 className="font-bold text-foreground mb-2">Limpar todos os funcionários?</h2>
              <p className="text-sm text-muted-foreground mb-6">Todos os {employees.length} funcionários serão removidos.</p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setClearEmpsConfirm(false)}>Cancelar</Button>
                <Button variant="destructive" className="flex-1" onClick={() => void handleClearEmployees()}>Limpar</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ══════════════════════════════════════════
     NEW BUDGET FORM
  ══════════════════════════════════════════ */
  if (view === "new") {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { setView("list"); setForm(EMPTY_FORM); setFormError(""); }}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Novo Orçamento</h1>
            <p className="text-muted-foreground text-sm">Configure os parâmetros da rota.</p>
          </div>
        </div>

        <form onSubmit={e => void handleSubmit(e)}>
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

  /* ══════════════════════════════════════════
     LIST VIEW
  ══════════════════════════════════════════ */
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

      {/* Confirm delete budget */}
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
        <div className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} />{error}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-card border rounded-xl p-10 text-center">
          <FileText size={32} className="text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum orçamento cadastrado ainda.</p>
          <Button size="sm" variant="outline" className="mt-4 gap-2" onClick={() => setView("new")}>
            <Plus size={14} />Criar primeiro orçamento
          </Button>
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
                    <button onClick={() => openDetail(item)} className="text-left group">
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
                        <Building2 size={13} className="text-muted-foreground/60" />{item.companyName}
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
                    <button onClick={() => setDeleteId(item.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Excluir">
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
