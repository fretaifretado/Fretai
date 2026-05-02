import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import * as XLSX from "xlsx";
import {
  ArrowLeft, Plus, Trash2, Eye, Play, Upload, Users, MapPin,
  Navigation, Bus, CheckCircle2, Clock, Truck, Download,
  ChevronDown, ChevronUp, FileText, Settings2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import type { MapEmployee, MapRoute } from "@/components/RouteMap";

const RouteMapLazy = lazy(() => import("@/components/RouteMap").then(m => ({ default: m.RouteMap })));

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Props { token: string | null }
type View = "list" | "new" | "detail";

interface BudgetListItem {
  id: number; name: string; status: string; strategy: string;
  companyName: string | null; companyAddress: string;
  employeeCount: number; routeCount: number;
}

interface BudgetWorker {
  id: number; name: string; address: string; shift: string | null;
  lat: number | null; lng: number | null; boardingPointId: number | null;
}

interface BoardingPoint {
  id: number; name: string; lat: number; lng: number;
  passengerCount: number; sequenceOrder: number | null;
}

interface ExtRoute {
  id: number; name: string; shiftTime: string | null; vehicleBlockId: number | null;
  totalPassengers: number; totalDistanceKm: number; estimatedMinutes: number;
  occupancyPct: number; totalCost: number | null;
  vehicleAssignments: Array<{ vehicleType: string; count: number; capacity: number }>;
  boardingPoints: BoardingPoint[];
}

interface BudgetDetailData {
  budget: {
    id: number; name: string; status: string; strategy: string;
    companyAddress: string; companyName: string | null;
    maxRadiusKm: number; maxRouteMinutes: number;
    companyLat: number; companyLng: number;
  };
  employees: BudgetWorker[];
  routes: ExtRoute[];
}

interface Company { id: number; name: string; address?: string | null }

/* ─── Constants ─────────────────────────────────────────────────────────── */
const BLOCK_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300", dot: "bg-blue-500" },
  { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300", dot: "bg-emerald-500" },
  { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300", dot: "bg-amber-500" },
  { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300", dot: "bg-purple-500" },
  { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-300", dot: "bg-rose-500" },
  { bg: "bg-cyan-100", text: "text-cyan-800", border: "border-cyan-300", dot: "bg-cyan-500" },
  { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300", dot: "bg-orange-500" },
  { bg: "bg-teal-100", text: "text-teal-800", border: "border-teal-300", dot: "bg-teal-500" },
];
function blockColor(id: number) { return BLOCK_COLORS[(id - 1) % BLOCK_COLORS.length]; }
const timeToMins = (t: string) => { const [h, m] = t.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };
const minsToTime = (m: number) => { const hh = Math.floor(m / 60) % 24; const mm = m % 60; return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; };

function getStatusBadge(status: string) {
  if (status === "ready") return <Badge className="bg-emerald-600 hover:bg-emerald-700">Pronto</Badge>;
  if (status === "processing") return <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">Processando</Badge>;
  return <Badge variant="secondary">Rascunho</Badge>;
}

/* ─── Main export ────────────────────────────────────────────────────────── */
export default function BudgetsSection({ token }: Props) {
  const [view, setView] = useState<View>("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (view === "new")
    return <BudgetNewView token={token} onBack={() => setView("list")} onCreated={id => { setSelectedId(id); setView("detail"); }} />;
  if (view === "detail" && selectedId)
    return <BudgetDetailView id={selectedId} token={token} onBack={() => setView("list")} />;
  return <BudgetListView token={token} onNew={() => setView("new")} onSelect={id => { setSelectedId(id); setView("detail"); }} />;
}

/* ─── List view ──────────────────────────────────────────────────────────── */
function BudgetListView({ token, onNew, onSelect }: { token: string | null; onNew: () => void; onSelect: (id: number) => void }) {
  const [items, setItems] = useState<BudgetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/budgets", { headers: hdrs });
      setItems(await r.json() as BudgetListItem[]);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir este orçamento e todos os dados relacionados?")) return;
    setDeleting(id);
    await fetch(`/api/admin/budgets/${id}`, { method: "DELETE", headers: hdrs });
    await load();
    setDeleting(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orçamentos</h1>
          <p className="text-muted-foreground">Planeje e processe rotas de transporte.</p>
        </div>
        <Button onClick={onNew}><Plus className="mr-2 h-4 w-4" />Novo Orçamento</Button>
      </div>

      <Card>
        {loading ? (
          <div className="p-8 space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : items.length === 0 ? (
          <div className="p-12 flex flex-col items-center text-center text-muted-foreground border border-dashed rounded-lg bg-muted/20">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhum orçamento</h3>
            <p className="max-w-sm mt-1">Crie um orçamento, importe funcionários e gere rotas otimizadas.</p>
            <Button className="mt-6" onClick={onNew}>Criar Primeiro Orçamento</Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Funcionários</TableHead>
                <TableHead className="text-right">Rotas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">
                    <button onClick={() => onSelect(b.id)} className="hover:underline text-left">{b.name}</button>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Settings2 className="h-3 w-3" />
                      {b.strategy === "min_cost" ? "Menor Custo" : b.strategy === "min_vehicles" ? "Menos Veículos" : "Maior Ocupação"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-muted-foreground" />{b.companyName ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(b.status)}</TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center text-muted-foreground">{b.employeeCount} <Users className="ml-1 h-3 w-3" /></span>
                  </TableCell>
                  <TableCell className="text-right">{b.routeCount}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="icon" onClick={() => onSelect(b.id)}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" disabled={deleting === b.id} onClick={() => void handleDelete(b.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ─── New budget form ────────────────────────────────────────────────────── */
function BudgetNewView({ token, onBack, onCreated }: { token: string | null; onBack: () => void; onCreated: (id: number) => void }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [form, setForm] = useState({
    name: "", companyId: "", companyAddress: "", maxRadiusKm: "2", maxRouteMinutes: "120", strategy: "min_cost",
  });

  useEffect(() => {
    void fetch("/api/admin/companies", { headers: hdrs }).then(r => r.json()).then((d: Company[]) => setCompanies(d));
  }, []);

  const handleCompanyChange = (val: string) => {
    const comp = companies.find(c => String(c.id) === val);
    setForm(f => ({ ...f, companyId: val, companyAddress: comp?.address && !f.companyAddress ? comp.address : f.companyAddress }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Nome é obrigatório"); return; }
    if (!form.companyId) { setErr("Selecione uma empresa"); return; }
    setSaving(true); setErr("");
    try {
      const r = await fetch("/api/admin/budgets", {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ ...form, companyId: parseInt(form.companyId), maxRadiusKm: parseFloat(form.maxRadiusKm), maxRouteMinutes: parseInt(form.maxRouteMinutes) }),
      });
      const data = await r.json() as { id?: number; error?: string };
      if (!r.ok || !data.id) { setErr(data.error ?? "Erro ao criar"); return; }
      onCreated(data.id);
    } catch { setErr("Erro de comunicação"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Novo Orçamento</h1>
          <p className="text-muted-foreground">Configure os parâmetros da rota.</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={e => void handleSubmit(e)} className="space-y-6">
            {err && <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2"><AlertCircle size={14} />{err}</div>}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1 space-y-2">
                <Label>Nome do Orçamento</Label>
                <Input placeholder="Ex: Roteirização Q3" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="col-span-2 md:col-span-1 space-y-2">
                <Label>Empresa Cliente</Label>
                <Select value={form.companyId} onValueChange={handleCompanyChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
                  <SelectContent>{companies.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Endereço de Destino (Fábrica/Escritório)</Label>
              <Input placeholder="Ex: Av. Paulista, 1000 - São Paulo, SP" value={form.companyAddress} onChange={e => setForm(f => ({ ...f, companyAddress: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Todos os funcionários serão transportados para este local.</p>
            </div>

            <div className="border-t pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Raio Máximo a pé (km)</Label>
                <Input type="number" step="0.1" value={form.maxRadiusKm} onChange={e => setForm(f => ({ ...f, maxRadiusKm: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Distância máxima até o ponto de embarque.</p>
              </div>
              <div className="space-y-2">
                <Label>Tempo Máximo de Viagem (min)</Label>
                <Input type="number" value={form.maxRouteMinutes} onChange={e => setForm(f => ({ ...f, maxRouteMinutes: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Tempo máximo dentro do veículo.</p>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Estratégia de Otimização</Label>
                <Select value={form.strategy} onValueChange={v => setForm(f => ({ ...f, strategy: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="min_cost">Menor Custo (otimiza valor total em R$)</SelectItem>
                    <SelectItem value="min_vehicles">Menor Quantidade de Veículos</SelectItem>
                    <SelectItem value="max_occupancy">Maior Ocupação (evita assentos vazios)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" size="lg" disabled={saving}>{saving ? "Criando…" : "Criar Orçamento"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Detail view ────────────────────────────────────────────────────────── */
function BudgetDetailView({ id, token, onBack }: { id: number; token: string | null; onBack: () => void }) {
  const [data, setData] = useState<BudgetDetailData | null>(null);
  const [summary, setSummary] = useState<{ totalCost: number | null; totalEmployees: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = async () => {
    setLoading(true);
    try {
      const [det, sum] = await Promise.all([
        fetch(`/api/admin/budgets/${id}`, { headers: hdrs }).then(r => r.json()),
        fetch(`/api/admin/budgets/${id}/summary`, { headers: hdrs }).then(r => r.json()),
      ]);
      setData(det as BudgetDetailData);
      setSummary(sum as typeof summary);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [id]);

  /* ── File upload ── */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadMsg("");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const raw = evt.target?.result as ArrayBuffer;
        const wb = XLSX.read(new Uint8Array(raw), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
        if (rows.length === 0) { setUploadMsg("Planilha vazia."); setUploading(false); return; }

        const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const buildAddress = (n: Record<string, string>): string => {
          const single = n["endereco"] || n["address"] || n["logradouro"] || n["end"] || n["endereço"] || "";
          if (single) return single.trim();
          const parts = [
            (n["rua onde mora"] || n["rua"] || n["logradouro"] || "") + (n["no onde mora"] || n["numero"] || n["número"] ? ", " + (n["no onde mora"] || n["numero"] || n["número"]) : ""),
            n["bairro"] || "", n["cidade"] || n["city"] || "", n["estado"] || n["uf"] || "",
          ].filter(Boolean);
          return parts.join(", ");
        };

        const employees = rows.map(row => {
          const n: Record<string, string> = {};
          for (const [k, v] of Object.entries(row)) n[norm(k)] = String(v ?? "");
          const name = n["nome"] || n["name"] || n["funcionario"] || n["colaborador"] || "";
          const address = buildAddress(n);
          const shift = n["turno"] || n["shift"] || n["periodo"] || n["horario"] || null;
          return { name: name.trim(), address: address.trim(), shift: shift?.trim() || null };
        }).filter(e => e.name);

        if (employees.length === 0) { setUploadMsg("Nenhum funcionário válido encontrado. Verifique a coluna 'Nome'."); setUploading(false); return; }

        void fetch(`/api/admin/budgets/${id}/employees`, {
          method: "POST", headers: hdrs,
          body: JSON.stringify({ employees }),
        }).then(r => r.json()).then((res: { geocoded?: number; failed?: number; total?: number; error?: string }) => {
          if (res.error) { setUploadMsg(`Erro: ${res.error}`); return; }
          setUploadMsg(`✓ ${res.geocoded ?? employees.length} importados (total: ${res.total ?? employees.length}).`);
          void load();
        }).finally(() => { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; });
      } catch { setUploadMsg("Erro ao ler o arquivo."); setUploading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  /* ── Process ── */
  const handleProcess = async () => {
    setProcessing(true);
    try {
      const r = await fetch(`/api/admin/budgets/${id}/process`, { method: "POST", headers: hdrs });
      const res = await r.json() as { routes?: number; error?: string };
      if (!r.ok) { alert(res.error ?? "Erro ao processar"); return; }
      await load();
    } finally { setProcessing(false); }
  };

  if (loading || !data) {
    return <div className="p-8 space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-[400px] w-full" /></div>;
  }

  const { budget, employees, routes } = data;

  /* ── Derived: block schedule ── */
  const shiftGroups = new Map<string, ExtRoute[]>();
  for (const r of routes) {
    const key = r.shiftTime ?? "Sem turno";
    if (!shiftGroups.has(key)) shiftGroups.set(key, []);
    shiftGroups.get(key)!.push(r);
  }
  const sortedShifts = [...shiftGroups.keys()].sort();

  const physicalVehicles = routes.length > 0 ? Math.max(...routes.map(r => r.vehicleBlockId ?? 0)) : 0;

  const blockSchedule = new Map<number, string[]>();
  const blockDurations = new Map<number, Map<string, number>>();
  for (const r of routes) {
    if (!r.vehicleBlockId) continue;
    const b = r.vehicleBlockId;
    const shift = r.shiftTime ?? "Sem turno";
    if (!blockSchedule.has(b)) blockSchedule.set(b, []);
    if (!blockSchedule.get(b)!.includes(shift)) blockSchedule.get(b)!.push(shift);
    if (!blockDurations.has(b)) blockDurations.set(b, new Map());
    const prev = blockDurations.get(b)!.get(shift);
    blockDurations.get(b)!.set(shift, prev === undefined ? r.estimatedMinutes : Math.round((prev + r.estimatedMinutes) / 2));
  }
  const multiShiftBlocks = [...blockSchedule.entries()].filter(([, s]) => s.length > 1);

  const blockTypeMap = new Map<number, string>();
  for (const r of routes) {
    if (r.vehicleBlockId && r.vehicleAssignments.length > 0 && !blockTypeMap.has(r.vehicleBlockId))
      blockTypeMap.set(r.vehicleBlockId, r.vehicleAssignments[0].vehicleType);
  }
  const typeCounters = new Map<string, number>();
  const blockTypeIndex = new Map<number, number>();
  for (const blockId of [...blockTypeMap.keys()].sort((a, b) => a - b)) {
    const type = blockTypeMap.get(blockId)!;
    const n = (typeCounters.get(type) ?? 0) + 1;
    typeCounters.set(type, n);
    blockTypeIndex.set(blockId, n);
  }
  const vehicleLabel = (blockId: number) => {
    const type = blockTypeMap.get(blockId) ?? "Veículo";
    const n = blockTypeIndex.get(blockId) ?? blockId;
    return `${type} ${n}`;
  };

  const TIER_ORDER = ["Ônibus", "Micro-ônibus", "Van", "Mini-Van"];
  const fleetByType = new Map<string, { physicalCount: number; capacity: number }>();
  for (const [, type] of blockTypeMap) {
    const cap = routes.find(r => r.vehicleAssignments[0]?.vehicleType === type)?.vehicleAssignments[0]?.capacity ?? 0;
    if (!fleetByType.has(type)) fleetByType.set(type, { physicalCount: 0, capacity: cap });
    fleetByType.get(type)!.physicalCount += 1;
  }
  const fleetSummary = [...fleetByType.entries()].sort(([a], [b]) => (TIER_ORDER.indexOf(a) + 99) - (TIER_ORDER.indexOf(b) + 99));

  /* ── Shift pair parsing ── */
  const shiftPairMap = new Map<string, string>();
  for (const emp of employees) {
    const shift = emp.shift;
    if (!shift) continue;
    const m = shift.match(/^(\d{1,2}:\d{2})\/(\d{1,2}:\d{2})/);
    if (m) {
      const start = m[1].padStart(5, "0");
      const end = m[2].padStart(5, "0");
      if (!shiftPairMap.has(start)) shiftPairMap.set(start, end);
    }
  }
  const exitingShiftAt = new Map<string, string>();
  for (const [exitStart, exitEnd] of shiftPairMap) {
    const exitEndMins = timeToMins(exitEnd);
    for (const entryShift of sortedShifts) {
      const diff = Math.abs(timeToMins(entryShift) - exitEndMins);
      if (Math.min(diff, 1440 - diff) <= 15) { exitingShiftAt.set(entryShift, exitStart); break; }
    }
  }

  const strategyLabel = budget.strategy === "min_cost" ? "Menor Custo" : budget.strategy === "min_vehicles" ? "Menos Veículos" : "Maior Ocupação";

  /* ── Map employees (geocoded) ── */
  const mapEmployees: MapEmployee[] = employees
    .filter(e => e.lat != null && e.lng != null)
    .map(e => ({ id: e.id, name: e.name, address: e.address, lat: e.lat!, lng: e.lng!, boardingPointId: e.boardingPointId }));

  const mapRoutes: MapRoute[] = routes.map(r => ({
    id: r.id, name: r.name, shiftTime: r.shiftTime, vehicleBlockId: r.vehicleBlockId,
    totalPassengers: r.totalPassengers, boardingPoints: r.boardingPoints, vehicleAssignments: r.vehicleAssignments,
  }));

  /* ── Export passengers ── */
  const exportPassengers = () => {
    const bpMap = new Map<number, BudgetWorker[]>();
    for (const emp of employees) {
      if (!emp.boardingPointId) continue;
      if (!bpMap.has(emp.boardingPointId)) bpMap.set(emp.boardingPointId, []);
      bpMap.get(emp.boardingPointId)!.push(emp);
    }
    const rows: Record<string, string>[] = [];
    for (const route of routes) {
      for (const bp of route.boardingPoints) {
        const emps = bpMap.get(bp.id) ?? [];
        for (const emp of emps) {
          rows.push({ Turno: route.shiftTime ?? "", Veículo: vehicleLabel(route.vehicleBlockId ?? 0), "Ponto de Embarque": bp.name, Nome: emp.name, Endereço: emp.address });
        }
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Passageiros");
    XLSX.writeFile(wb, "passageiros_por_ponto.xlsx");
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{budget.name}</h1>
              {getStatusBadge(budget.status)}
            </div>
            <p className="text-muted-foreground flex items-center gap-2 mt-1"><MapPin className="h-3 w-3" />{budget.companyAddress}</p>
          </div>
        </div>
        {budget.status !== "processing" && (
          <Button
            size="lg"
            className={budget.status === "ready" ? "" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
            disabled={employees.length === 0 || processing}
            onClick={() => void handleProcess()}
          >
            {processing ? <Clock className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
            {processing ? "Processando…" : "Processar Rotas"}
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start h-12 bg-transparent border-b rounded-none mb-6">
          <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6">Visão Geral</TabsTrigger>
          <TabsTrigger value="employees" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6">Funcionários ({employees.length})</TabsTrigger>
          <TabsTrigger value="routes" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6">Rotas ({routes.length})</TabsTrigger>
          <TabsTrigger value="map" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6">Mapa Visual</TabsTrigger>
        </TabsList>

        {/* ── VISÃO GERAL ── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card><CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium text-muted-foreground mb-1">Custo Estimado</p>
                  <p className="text-3xl font-bold">{summary?.totalCost != null ? `R$ ${summary.totalCost.toFixed(2)}` : "—"}</p></div>
                <div className="bg-primary/10 p-3 rounded-xl text-primary"><CheckCircle2 className="h-6 w-6" /></div>
              </div>
            </CardContent></Card>

            <Card><CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Passageiros</p>
                  <p className="text-3xl font-bold">{summary?.totalEmployees || 0}</p>
                  {sortedShifts.length > 0 && routes.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {sortedShifts.map(shift => {
                        const pax = (shiftGroups.get(shift) ?? []).reduce((s, r) => s + r.totalPassengers, 0);
                        return <div key={shift} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground font-mono">{shift}</span>
                          <span className="font-semibold tabular-nums">{pax} Pas</span>
                        </div>;
                      })}
                    </div>
                  )}
                </div>
                <div className="bg-primary/10 p-3 rounded-xl text-primary self-start ml-3"><Users className="h-6 w-6" /></div>
              </div>
            </CardContent></Card>

            <Card><CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium text-muted-foreground mb-1">Rotas / Turnos</p>
                  <p className="text-3xl font-bold">{routes.length}</p>
                  {sortedShifts.length > 0 && <p className="text-xs text-muted-foreground mt-1">{sortedShifts.length} {sortedShifts.length === 1 ? "turno" : "turnos"}</p>}
                </div>
                <div className="bg-primary/10 p-3 rounded-xl text-primary"><Navigation className="h-6 w-6" /></div>
              </div>
            </CardContent></Card>

            <Card><CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium text-muted-foreground mb-1">Veículos Físicos</p>
                  <p className="text-3xl font-bold">{physicalVehicles || "—"}</p>
                  {multiShiftBlocks.length > 0 && <p className="text-xs text-emerald-600 font-medium mt-1">{multiShiftBlocks.length} reutilizado{multiShiftBlocks.length !== 1 ? "s" : ""}</p>}
                </div>
                <div className="bg-primary/10 p-3 rounded-xl text-primary"><Truck className="h-6 w-6" /></div>
              </div>
            </CardContent></Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card><CardHeader><CardTitle>Parâmetros do Orçamento</CardTitle></CardHeader>
              <CardContent><dl className="space-y-4 text-sm">
                <div className="flex justify-between border-b pb-2"><dt className="text-muted-foreground">Raio de Caminhada Máximo</dt><dd className="font-medium">{budget.maxRadiusKm} km</dd></div>
                <div className="flex justify-between border-b pb-2"><dt className="text-muted-foreground">Tempo de Viagem Máximo</dt><dd className="font-medium">{budget.maxRouteMinutes} minutos</dd></div>
                <div className="flex justify-between pb-2"><dt className="text-muted-foreground">Estratégia</dt><dd className="font-medium">{strategyLabel}</dd></div>
              </dl></CardContent>
            </Card>

            <Card><CardHeader><CardTitle>Frota Utilizada</CardTitle><CardDescription>Composição dos veículos nas rotas</CardDescription></CardHeader>
              <CardContent>
                {fleetSummary.length > 0 ? (
                  <div className="space-y-3">
                    {fleetSummary.map(([type, d]) => (
                      <div key={type} className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><Bus className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{type}</span></div>
                        <div className="text-sm text-right">
                          <span className="font-bold">{d.physicalCount}</span>
                          <span className="text-muted-foreground ml-1">{d.physicalCount === 1 ? "veículo" : "veículos"}</span>
                          <span className="text-muted-foreground ml-2 text-xs">({d.capacity} lugares cada)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-center py-6 text-muted-foreground text-sm">As rotas ainda não foram processadas.</div>}
              </CardContent>
            </Card>
          </div>

          {blockSchedule.size > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Roteiro Diário por Veículo</CardTitle>
                <CardDescription>Ao chegar na empresa com um turno, o veículo embarca os que estão saindo — fazendo <strong>entrada + saída em cada horário</strong>.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5"><span className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary text-primary-foreground font-bold text-[10px]">→</span>Entrada: leva funcionários <strong>para a empresa</strong></span>
                  <span className="flex items-center gap-1.5"><span className="inline-flex items-center justify-center w-5 h-5 rounded border-2 border-primary text-primary font-bold text-[10px]">←</span>Saída: traz funcionários <strong>para casa</strong></span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/40">
                        <th className="text-left font-semibold text-muted-foreground py-2 px-3 rounded-tl">Veículo</th>
                        {sortedShifts.map(shift => {
                          const exStart = exitingShiftAt.get(shift);
                          return (
                            <th key={shift} className="py-2 px-3 text-center font-semibold text-muted-foreground min-w-[130px]">
                              <div className="text-primary font-bold text-sm">{shift}</div>
                              {exStart && <div className="text-[10px] text-muted-foreground font-normal">sai turno {exStart}</div>}
                            </th>
                          );
                        })}
                        <th className="py-2 px-3 text-center font-semibold text-muted-foreground rounded-tr">Viagens/dia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...blockSchedule.entries()].sort(([a], [b]) => a - b).map(([blockId, coveredShifts]) => {
                        const color = blockColor(blockId);
                        const totalTrips = coveredShifts.length * 2;
                        return (
                          <tr key={blockId} className="border-t hover:bg-muted/20 transition-colors">
                            <td className="py-3 px-3">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${color.bg} ${color.text} border ${color.border}`}>
                                <span className={`w-2 h-2 rounded-full ${color.dot}`} />{vehicleLabel(blockId)}
                              </span>
                            </td>
                            {sortedShifts.map(shift => {
                              const doesEntry = coveredShifts.includes(shift);
                              const exStart = exitingShiftAt.get(shift);
                              const dur = blockDurations.get(blockId)?.get(shift);
                              if (!doesEntry) return <td key={shift} className="py-3 px-3 text-center"><span className="text-muted-foreground/30">—</span></td>;
                              return (
                                <td key={shift} className="py-3 px-3">
                                  <div className="flex flex-col gap-1">
                                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${color.bg} ${color.text}`}>
                                      <span className="font-bold text-[11px]">→</span>
                                      <span className="text-[11px] font-medium">Entrada {shift}{dur ? <span className="opacity-70 ml-1">({dur}min)</span> : null}</span>
                                    </div>
                                    {exStart && (
                                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded border ${color.border} ${color.text} bg-white`}>
                                        <span className="font-bold text-[11px]">←</span>
                                        <span className="text-[11px] font-medium">Saída turno {exStart}{dur ? <span className="opacity-70 ml-1">({dur}min)</span> : null}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="py-3 px-3 text-center">
                              <span className={`text-base font-bold ${totalTrips >= 4 ? "text-emerald-600" : "text-muted-foreground"}`}>{totalTrips}×</span>
                              <div className="text-[10px] text-muted-foreground">viagens</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {blockSchedule.size > 0 && sortedShifts.length >= 2 && (() => {
                  const [firstBlockId, firstShifts] = [...blockSchedule.entries()].sort(([a], [b]) => a - b)[0];
                  const color = blockColor(firstBlockId);
                  const events: { time: string; label: string; type: "entry" | "exit" }[] = [];
                  for (const shift of [...firstShifts].sort()) {
                    const dur = blockDurations.get(firstBlockId)?.get(shift) ?? 60;
                    const shiftMins = timeToMins(shift);
                    events.push({ time: minsToTime(shiftMins - dur), label: `Saída para buscar T${shift}`, type: "entry" });
                    events.push({ time: shift, label: `Entrega T${shift} na empresa`, type: "entry" });
                    const exStart = exitingShiftAt.get(shift);
                    if (exStart) {
                      events.push({ time: shift, label: `Embarque T${exStart} (saída)`, type: "exit" });
                      events.push({ time: minsToTime(shiftMins + dur), label: `Entrega T${exStart} em casa`, type: "exit" });
                    }
                  }
                  events.sort((a, b) => timeToMins(a.time) - timeToMins(b.time));
                  return (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Exemplo — Roteiro Diário do {vehicleLabel(firstBlockId)}</p>
                      <div className="relative pl-6 space-y-2 border-l-2 border-border ml-2">
                        {events.map((ev, i) => (
                          <div key={i} className="relative flex items-start gap-3">
                            <div className={`absolute w-3 h-3 rounded-full -left-[23px] top-0.5 border-2 border-background ${ev.type === "entry" ? color.dot : "bg-amber-500"}`} />
                            <span className="text-xs font-mono font-bold text-muted-foreground w-12 flex-shrink-0">{ev.time}</span>
                            <span className={`text-xs font-medium ${ev.type === "entry" ? color.text : "text-amber-700"}`}>{ev.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {multiShiftBlocks.length > 0 && (
                  <p className="text-xs text-emerald-600 font-medium">
                    ✓ {multiShiftBlocks.length} {multiShiftBlocks.length === 1 ? "veículo faz" : "veículos fazem"} entrada + saída em múltiplos turnos — máxima utilização da frota.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── FUNCIONÁRIOS ── */}
        <TabsContent value="employees">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
              <div>
                <CardTitle>Base de Funcionários</CardTitle>
                <CardDescription>Formatos aceitos: Excel (.xlsx, .xls), CSV, LibreOffice (.ods) — colunas: Nome, Endereço, Turno</CardDescription>
              </div>
              <div className="flex gap-2">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.ods,.xlsm,.tsv"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload className="mr-2 h-4 w-4" />{uploading ? "Importando…" : "Importar Planilha"}
                </Button>
                {employees.length > 0 && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (!confirm("Limpar todos os funcionários?")) return;
                      void fetch(`/api/admin/budgets/${id}/employees`, { method: "DELETE", headers: hdrs }).then(() => load());
                    }}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />Limpar
                  </Button>
                )}
              </div>
            </CardHeader>

            {uploadMsg && (
              <div className={`mx-6 mt-4 text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${uploadMsg.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>
                {uploadMsg.startsWith("✓") ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{uploadMsg}
              </div>
            )}

            <CardContent className="pt-4">
              {employees.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Nenhum funcionário importado</p>
                  <p className="text-sm mt-1">Importe uma planilha para começar.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Endereço</TableHead>
                        <TableHead>Turno</TableHead>
                        <TableHead>Ponto</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map((emp, i) => (
                        <TableRow key={emp.id}>
                          <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                          <TableCell className="font-medium">{emp.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{emp.address || "—"}</TableCell>
                          <TableCell className="text-xs">{emp.shift || "—"}</TableCell>
                          <TableCell className="text-xs">{emp.boardingPointId ? `#${emp.boardingPointId}` : "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              onClick={() => void fetch(`/api/admin/budgets/${id}/employees/${emp.id}`, { method: "DELETE", headers: hdrs }).then(() => load())}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ROTAS ── */}
        <TabsContent value="routes" className="space-y-4">
          {routes.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Navigation className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhuma rota processada</p>
              <p className="text-sm mt-1">Importe funcionários e clique em "Processar Rotas".</p>
            </CardContent></Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{routes.length} rota{routes.length !== 1 ? "s" : ""} · {routes.reduce((s, r) => s + r.totalPassengers, 0)} passageiros</p>
                <Button variant="outline" size="sm" onClick={exportPassengers}><Download className="mr-2 h-4 w-4" />Exportar Excel</Button>
              </div>
              <PassengerListCard routes={routes} employees={employees} vehicleLabel={vehicleLabel} />
            </>
          )}
        </TabsContent>

        {/* ── MAPA VISUAL ── */}
        <TabsContent value="map">
          {routes.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Processe as rotas para visualizar o mapa</p>
            </CardContent></Card>
          ) : (
            <Suspense fallback={<div className="h-[640px] flex items-center justify-center text-muted-foreground"><span>Carregando mapa…</span></div>}>
              <RouteMapLazy
                routes={mapRoutes}
                employees={mapEmployees}
                companyLat={budget.companyLat}
                companyLng={budget.companyLng}
                maxRadiusKm={budget.maxRadiusKm}
                vehicleLabel={vehicleLabel}
              />
            </Suspense>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Passenger list card (Rotas tab) ────────────────────────────────────── */
function PassengerListCard({
  routes, employees, vehicleLabel,
}: { routes: ExtRoute[]; employees: BudgetWorker[]; vehicleLabel: (id: number) => string }) {
  const [search, setSearch] = useState("");
  const [filterShift, setFilterShift] = useState("");
  const [openPoints, setOpenPoints] = useState<Set<number>>(new Set());

  const bpEmpMap = useMemo(() => {
    const m = new Map<number, BudgetWorker[]>();
    for (const emp of employees) {
      if (emp.boardingPointId == null) continue;
      if (!m.has(emp.boardingPointId)) m.set(emp.boardingPointId, []);
      m.get(emp.boardingPointId)!.push(emp);
    }
    return m;
  }, [employees]);

  const shifts = useMemo(() => [...new Set(routes.map(r => r.shiftTime).filter(Boolean) as string[])].sort(), [routes]);
  const filtered = routes.filter(r => !filterShift || r.shiftTime === filterShift);
  const q = search.toLowerCase().trim();

  const togglePoint = (bpId: number) => setOpenPoints(prev => {
    const n = new Set(prev); n.has(bpId) ? n.delete(bpId) : n.add(bpId); return n;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lista de Passageiros por Ponto</CardTitle>
        <CardDescription>{routes.reduce((s, r) => s + r.totalPassengers, 0)} passageiros · {routes.flatMap(r => r.boardingPoints).length} pontos de embarque</CardDescription>
        <div className="flex gap-2 mt-2">
          <input
            type="text" placeholder="Buscar funcionário ou endereço…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <select value={filterShift} onChange={e => setFilterShift(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none">
            <option value="">Todos os turnos</option>
            {shifts.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
        {filtered.map(route => (
          <div key={route.id} className="rounded-xl border overflow-hidden">
            <div className="bg-muted/40 px-4 py-2 flex items-center gap-3 text-sm font-medium">
              <span className="text-muted-foreground">Turno</span>
              <span className="font-bold">{route.shiftTime ?? "—"}</span>
              <span className="text-muted-foreground">·</span>
              {route.vehicleAssignments[0] && <span>{route.vehicleAssignments[0].count > 1 ? `${route.vehicleAssignments[0].count}× ` : ""}{route.vehicleAssignments[0].vehicleType}</span>}
              <span className="text-muted-foreground">·</span>
              <span className="font-bold text-primary">{route.totalPassengers} Pas</span>
              {route.vehicleBlockId && <span className="ml-auto text-xs text-muted-foreground">{vehicleLabel(route.vehicleBlockId)}</span>}
            </div>

            {[...route.boardingPoints].sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0)).map(bp => {
              const allEmps = bpEmpMap.get(bp.id) ?? [];
              const emps = q ? allEmps.filter(e => e.name.toLowerCase().includes(q) || e.address.toLowerCase().includes(q)) : allEmps;
              if (q && emps.length === 0) return null;
              const isOpen = openPoints.has(bp.id);
              return (
                <div key={bp.id} className="border-t">
                  <button onClick={() => togglePoint(bp.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{bp.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{allEmps.length} passageiro{allEmps.length !== 1 ? "s" : ""}</span>
                    <span className="ml-2 text-muted-foreground">{isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t bg-muted/10">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b bg-muted/20">
                          <th className="text-left px-8 py-1.5 font-medium text-muted-foreground w-6">#</th>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Nome</th>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Endereço</th>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Turno</th>
                        </tr></thead>
                        <tbody>
                          {emps.map((emp, i) => (
                            <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="px-8 py-1.5 text-muted-foreground">{i + 1}</td>
                              <td className="px-2 py-1.5 font-medium">{emp.name}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{emp.address}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{emp.shift ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
