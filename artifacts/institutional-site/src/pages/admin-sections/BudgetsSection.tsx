import { useState, useEffect, useRef, useMemo, lazy, Suspense, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  ArrowLeft, Plus, Trash2, Eye, Upload, Users, MapPin,
  Navigation, Bus, CheckCircle2, Download, ChevronDown, ChevronUp,
  FileText, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import type { MapWorker } from "@/components/ManualRouteBuilder";

const ManualRouteBuilderLazy = lazy(() =>
  import("@/components/ManualRouteBuilder").then(m => ({ default: m.ManualRouteBuilder }))
);

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Props { token: string | null }
type View = "list" | "new" | "builder";
type BuilderStep = "upload" | "map" | "finalize" | "routes";

interface BudgetListItem {
  id: number; name: string; status: string;
  companyName: string | null; companyAddress: string;
  employeeCount: number; routeCount: number;
}
interface BudgetInfo {
  id: number; name: string; status: string;
  companyAddress: string; companyName: string | null;
  companyLat: number; companyLng: number;
}
interface BudgetWorker {
  id: number; name: string; address: string; shift: string | null;
  lat: number | null; lng: number | null; boardingPointId: number | null;
}
interface VehicleType {
  id: number; type: string; capacity: number;
  costPerKm: string; fixedCost: string | null;
}
interface ManualBP {
  id: number; name: string; lat: number; lng: number;
  radiusKm: number; shiftTime: string | null;
  passengerCount: number; sequenceOrder: number | null; workerIds: number[];
}
interface ExtRoute {
  id: number; name: string; shiftTime: string | null; vehicleBlockId: number | null;
  totalPassengers: number; totalDistanceKm: number; estimatedMinutes: number;
  occupancyPct: number; totalCost: number | null;
  vehicleAssignments: Array<{ vehicleType: string; count: number; capacity: number }>;
  boardingPoints: Array<{ id: number; name: string; lat: number; lng: number; passengerCount: number; sequenceOrder: number | null }>;
}
interface Company { id: number; name: string; address?: string | null }

/* ─── Constants ──────────────────────────────────────────────────────────── */
const BUILDER_STEPS: { key: BuilderStep; label: string }[] = [
  { key: "upload", label: "1 · Importar" },
  { key: "map", label: "2 · Mapa" },
  { key: "finalize", label: "3 · Finalizar" },
  { key: "routes", label: "4 · Rotas" },
];

function getStatusBadge(status: string) {
  if (status === "ready") return <Badge className="bg-emerald-600 hover:bg-emerald-700">Pronto</Badge>;
  if (status === "processing") return <Badge variant="secondary" className="bg-amber-100 text-amber-800">Processando</Badge>;
  return <Badge variant="secondary">Rascunho</Badge>;
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function BudgetsSection({ token }: Props) {
  const [view, setView] = useState<View>("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  if (view === "new")
    return <BudgetNewView token={token} onBack={() => setView("list")} onCreated={id => { setSelectedId(id); setView("builder"); }} />;
  if (view === "builder" && selectedId)
    return <BudgetBuilderView id={selectedId} token={token} onBack={() => setView("list")} />;
  return <BudgetListView token={token} onNew={() => setView("new")} onSelect={id => { setSelectedId(id); setView("builder"); }} />;
}

/* ─── List view ──────────────────────────────────────────────────────────── */
function BudgetListView({ token, onNew, onSelect }: { token: string | null; onNew: () => void; onSelect: (id: number) => void }) {
  const [items, setItems] = useState<BudgetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = async () => {
    setLoading(true);
    try { setItems(await fetch("/api/admin/budgets", { headers: hdrs }).then(r => r.json()) as BudgetListItem[]); }
    finally { setLoading(false); }
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
          <p className="text-muted-foreground">Crie e gerencie rotas de transporte de funcionários.</p>
        </div>
        <Button onClick={onNew}><Plus className="mr-2 h-4 w-4" />Novo Orçamento</Button>
      </div>
      <Card>
        {loading ? (
          <div className="p-8 space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : items.length === 0 ? (
          <div className="p-12 flex flex-col items-center text-center text-muted-foreground border border-dashed rounded-lg bg-muted/20">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhum orçamento</h3>
            <p className="max-w-sm mt-1">Crie um orçamento, importe funcionários com geolocalização e monte as rotas manualmente no mapa.</p>
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
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-muted-foreground" />{b.companyName ?? "—"}</div>
                  </TableCell>
                  <TableCell>{getStatusBadge(b.status)}</TableCell>
                  <TableCell className="text-right"><span className="inline-flex items-center text-muted-foreground">{b.employeeCount} <Users className="ml-1 h-3 w-3" /></span></TableCell>
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
  const [form, setForm] = useState({ name: "", companyId: "", companyAddress: "" });

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
        body: JSON.stringify({ ...form, companyId: parseInt(form.companyId), maxRadiusKm: 1, maxRouteMinutes: 120, strategy: "min_cost" }),
      });
      const data = await r.json() as { id?: number; error?: string };
      if (!r.ok || !data.id) { setErr(data.error ?? "Erro ao criar"); return; }
      onCreated(data.id);
    } catch { setErr("Erro de comunicação"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Novo Orçamento</h1>
          <p className="text-muted-foreground">Defina o nome e a empresa de destino.</p>
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={e => void handleSubmit(e)} className="space-y-6">
            {err && <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2"><AlertCircle size={14} />{err}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1 space-y-2">
                <Label>Nome do Orçamento</Label>
                <Input placeholder="Ex: Roteirização Junho" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
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
              <Input placeholder="Ex: Rodovia Anhanguera, km 128, Limeira, SP" value={form.companyAddress} onChange={e => setForm(f => ({ ...f, companyAddress: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Usado para centralizar o mapa e calcular distâncias.</p>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" size="lg" disabled={saving}>{saving ? "Criando…" : "Criar e Importar Funcionários →"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Builder view ───────────────────────────────────────────────────────── */
function BudgetBuilderView({ id, token, onBack }: { id: number; token: string | null; onBack: () => void }) {
  const [step, setStep] = useState<BuilderStep>("upload");
  const [budget, setBudget] = useState<BudgetInfo | null>(null);
  const [workers, setWorkers] = useState<BudgetWorker[]>([]);
  const [routes, setRoutes] = useState<ExtRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch(`/api/admin/budgets/${id}`, { headers: hdrs }).then(r => r.json()) as {
        budget: BudgetInfo; employees: BudgetWorker[]; routes: ExtRoute[];
      };
      setBudget(data.budget);
      setWorkers(data.employees);
      setRoutes(data.routes);
      if (!initialized) {
        if (data.routes.length > 0) setStep("routes");
        else if (data.employees.length > 0) setStep("map");
        setInitialized(true);
      }
    } finally { setLoading(false); }
  }, [id, initialized]);

  useEffect(() => { void load(); }, [load]);

  const mapWorkers: MapWorker[] = useMemo(() =>
    workers.filter(w => w.lat != null && w.lng != null).map(w => ({
      id: w.id, name: w.name, lat: w.lat!, lng: w.lng!, shift: w.shift, boardingPointId: w.boardingPointId,
    })), [workers]);

  if (loading && !budget) return (
    <div className="space-y-4 p-4"><Skeleton className="h-12 w-48" /><Skeleton className="h-96 w-full" /></div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" className="mt-0.5" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{budget?.name ?? "Carregando…"}</h1>
            {budget && getStatusBadge(budget.status)}
          </div>
          <p className="text-muted-foreground text-sm flex items-center gap-1 mt-0.5">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            {budget?.companyAddress ?? "—"}
          </p>
        </div>
        {/* Step indicator */}
        <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
          {BUILDER_STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground text-xs">›</span>}
              <button
                onClick={() => { if (s.key === "upload" || (s.key === "map" && workers.length > 0) || (s.key === "routes" && routes.length > 0)) setStep(s.key); }}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${step === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {s.label}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      {step === "upload" && (
        <UploadStep
          budgetId={id} token={token} existingWorkers={workers}
          onComplete={() => { void load(); setStep("map"); }}
          onSkip={() => setStep("map")}
        />
      )}

      {step === "map" && budget && (
        <Suspense fallback={<div className="h-96 flex items-center justify-center text-muted-foreground">Carregando mapa…</div>}>
          <ManualRouteBuilderLazy
            budgetId={id} token={token}
            workers={mapWorkers}
            companyLat={budget.companyLat}
            companyLng={budget.companyLng}
            onFinalize={() => setStep("finalize")}
          />
        </Suspense>
      )}

      {step === "finalize" && budget && (
        <FinalizeStep
          budgetId={id} token={token}
          onComplete={() => { void load(); setStep("routes"); }}
          onBack={() => setStep("map")}
        />
      )}

      {step === "routes" && (
        <RoutesStep
          routes={routes} workers={workers}
          onBack={() => setStep("map")}
          onReimport={() => setStep("upload")}
        />
      )}
    </div>
  );
}

/* ─── Upload step ────────────────────────────────────────────────────────── */
interface ParsedEmployee { name: string; address: string; shift: string | null; lat?: number; lng?: number }
type GeoSource = "coords" | "geocoded" | "failed" | "manual";
interface ValidatedEmployee { name: string; address: string; shift: string | null; lat?: number; lng?: number; source: GeoSource; editAddress: string; origIdx: number }
type UploadSub = "idle" | "parsed" | "geocoding" | "review" | "importing";

function UploadStep({ budgetId, token, existingWorkers, onComplete, onSkip }: {
  budgetId: number; token: string | null; existingWorkers: BudgetWorker[];
  onComplete: () => void; onSkip: () => void;
}) {
  const [sub, setSub] = useState<UploadSub>("idle");
  const [parsed, setParsed] = useState<ParsedEmployee[]>([]);
  const [validated, setValidated] = useState<ValidatedEmployee[]>([]);
  const [geoProgress, setGeoProgress] = useState({ current: 0, total: 0 });
  const [regeocoding, setRegeocoding] = useState<number | null>(null);
  const [reviewTab, setReviewTab] = useState<"errors" | "all">("errors");
  const [acceptFailed, setAcceptFailed] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);
  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const normKey = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const LAT_COLS = ["lat", "latitude", "lat.", "latitude (graus decimais)", "coord_lat", "coordenada lat"];
  const LNG_COLS = ["lng", "lon", "longitude", "lng.", "longitude (graus decimais)", "coord_lng", "coordenada lon", "long"];

  const parseFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target?.result as ArrayBuffer), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]!]!;
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
        if (!rows.length) { setMsg("Planilha vazia."); return; }
        const buildAddr = (n: Record<string, string>) => {
          const single = n["endereco"] || n["address"] || n["logradouro"] || n["endereço"] || "";
          if (single) return single.trim();
          return [(n["rua"] || n["logradouro"] || "") + (n["numero"] ? ", " + n["numero"] : ""), n["bairro"] || "", n["cidade"] || n["city"] || "", n["estado"] || n["uf"] || ""].filter(Boolean).join(", ");
        };
        const employees: ParsedEmployee[] = rows.map(row => {
          const n: Record<string, string> = {};
          for (const [k, v] of Object.entries(row)) n[normKey(k)] = String(v ?? "");
          const name = n["nome"] || n["name"] || n["funcionario"] || n["colaborador"] || "";
          const shift = n["turno"] || n["shift"] || n["periodo"] || n["horario"] || null;
          const latRaw = LAT_COLS.map(c => n[c]).find(v => v && v.trim());
          const lngRaw = LNG_COLS.map(c => n[c]).find(v => v && v.trim());
          const lat = latRaw ? parseFloat(latRaw.replace(",", ".")) : NaN;
          const lng = lngRaw ? parseFloat(lngRaw.replace(",", ".")) : NaN;
          const hasCoords = !isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
          return { name: name.trim(), address: buildAddr(n), shift: shift?.trim() || null, ...(hasCoords ? { lat, lng } : {}) };
        }).filter(e => e.name);
        if (!employees.length) { setMsg("Nenhum funcionário encontrado. Verifique a coluna 'Nome'."); return; }
        setParsed(employees); setMsg(""); setSub("parsed");
      } catch { setMsg("Erro ao ler o arquivo."); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setParsed([]); setValidated([]); setMsg(""); setSub("idle"); parseFile(f);
  };

  async function nominatim(addr: string): Promise<{ lat: number; lng: number } | null> {
    if (!addr.trim()) return null;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1&countrycodes=br&accept-language=pt-BR`);
      const d = await r.json() as Array<{ lat: string; lon: string }>;
      if (d.length && d[0]) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
      return null;
    } catch { return null; }
  }

  const startGeocoding = async (employees: ParsedEmployee[]) => {
    cancelRef.current = false;
    setAcceptFailed(false);
    const init: ValidatedEmployee[] = employees.map((e, i) => ({
      ...e, source: (e.lat != null && e.lng != null ? "coords" : "failed") as GeoSource,
      editAddress: e.address, origIdx: i,
    }));
    const needsGeo = init.filter(e => e.source === "failed");
    setGeoProgress({ current: 0, total: needsGeo.length });
    setValidated([...init]);
    setSub("geocoding");
    const addrCache = new globalThis.Map<string, { lat: number; lng: number } | null>();
    for (let i = 0; i < needsGeo.length; i++) {
      if (cancelRef.current) break;
      const emp = needsGeo[i]!;
      setGeoProgress({ current: i + 1, total: needsGeo.length });
      const key = emp.editAddress.trim().toLowerCase();
      let geo: { lat: number; lng: number } | null;
      if (addrCache.has(key)) { geo = addrCache.get(key)!; }
      else {
        geo = await nominatim(emp.editAddress);
        addrCache.set(key, geo);
        if (i < needsGeo.length - 1) await new Promise(r => setTimeout(r, 1100));
      }
      init[emp.origIdx] = { ...init[emp.origIdx]!, lat: geo?.lat, lng: geo?.lng, source: geo ? "geocoded" : "failed" };
      setValidated([...init]);
    }
    setReviewTab(init.some(e => e.source === "failed") ? "errors" : "all");
    setSub("review");
  };

  const regeocodeOne = async (idx: number) => {
    setRegeocoding(idx);
    const emp = validated[idx]; if (!emp) { setRegeocoding(null); return; }
    const geo = await nominatim(emp.editAddress);
    setValidated(prev => prev.map((e, i) => i !== idx ? e : { ...e, lat: geo?.lat, lng: geo?.lng, source: (geo ? "manual" : "failed") as GeoSource }));
    setRegeocoding(null);
  };

  const handleImport = async (replace = true) => {
    const employees = validated.map(e => ({
      name: e.name, address: e.editAddress !== e.address ? e.editAddress : e.address,
      shift: e.shift, ...(e.lat != null && e.lng != null ? { lat: e.lat, lng: e.lng } : {}),
    }));
    setSub("importing"); setMsg("");
    try {
      const r = await fetch(`/api/admin/budgets/${budgetId}/employees`, {
        method: "POST", headers: hdrs, body: JSON.stringify({ employees, replace }),
      });
      const res = await r.json() as { total?: number; error?: string };
      if (!r.ok) { setMsg(res.error ?? "Erro ao importar"); setSub("review"); return; }
      setMsg(`✓ ${res.total ?? employees.length} funcionários importados com sucesso.`);
      setTimeout(onComplete, 800);
    } catch { setMsg("Erro de comunicação."); setSub("review"); }
  };

  const coordsCount = validated.filter(e => e.source === "coords").length;
  const geocodedCount = validated.filter(e => e.source === "geocoded").length;
  const manualCount = validated.filter(e => e.source === "manual").length;
  const failCount = validated.filter(e => e.source === "failed").length;
  const parsedWithCoords = parsed.filter(e => e.lat != null).length;

  return (
    <div className="space-y-4">
      {/* Existing workers summary */}
      {existingWorkers.length > 0 && sub === "idle" && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="bg-emerald-50 p-3 rounded-xl"><Users className="h-6 w-6 text-emerald-600" /></div>
              <div className="flex-1">
                <p className="font-semibold">{existingWorkers.length} funcionários já importados</p>
                <p className="text-sm text-muted-foreground">{existingWorkers.filter(w => w.lat).length} com coordenadas · Clique em Continuar para ir ao mapa</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={onSkip} className="bg-emerald-600 hover:bg-emerald-700 text-white">Continuar para o Mapa →</Button>
                <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Re-importar</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />Importar Planilha</CardTitle>
          <CardDescription>
            Formatos aceitos: Excel (.xlsx, .xls), CSV, LibreOffice (.ods)<br />
            Colunas: <strong>Nome</strong> · <strong>Turno</strong> · <strong>Latitude</strong> · <strong>Longitude</strong> (ou Endereço como alternativa)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {msg && (
            <div className={`text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${msg.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>
              {msg.startsWith("✓") ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{msg}
            </div>
          )}

          {/* ── IDLE: drop zone ── */}
          {sub === "idle" && (
            <div className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors" onClick={() => fileRef.current?.click()}>
              <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="font-medium">Clique para selecionar ou arraste o arquivo</p>
              <p className="text-sm text-muted-foreground mt-1">Excel, CSV, ODS</p>
            </div>
          )}

          {/* ── PARSED: preview + validate button ── */}
          {sub === "parsed" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full font-medium">✓ {parsed.length} funcionários detectados</span>
                {parsedWithCoords > 0
                  ? <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full font-medium">✓ {parsedWithCoords} com coordenadas na planilha</span>
                  : <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full font-medium">⚠ Sem coordenadas — endereços serão geocodificados</span>}
                {parsed.length - parsedWithCoords > 0 && parsedWithCoords > 0 && (
                  <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full font-medium">⚠ {parsed.length - parsedWithCoords} precisam geocodificação</span>
                )}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-muted/40">
                    <TableHead className="w-8">#</TableHead><TableHead>Nome</TableHead>
                    <TableHead>Turno</TableHead><TableHead>Endereço</TableHead>
                    <TableHead>Lat</TableHead><TableHead>Lng</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {parsed.slice(0, 5).map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                        <TableCell className="font-medium text-sm">{e.name}</TableCell>
                        <TableCell className="text-xs">{e.shift ?? "—"}</TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate text-muted-foreground">{e.address || "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{e.lat != null ? e.lat.toFixed(4) : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-xs font-mono">{e.lng != null ? e.lng.toFixed(4) : <span className="text-muted-foreground">—</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsed.length > 5 && <p className="text-xs text-muted-foreground text-center py-2">…e mais {parsed.length - 5} funcionários</p>}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void startGeocoding(parsed)} className="flex-1 bg-primary">
                  <Navigation className="mr-2 h-4 w-4" />Validar Geolocalização ({parsed.length - parsedWithCoords} endereços)
                </Button>
                <Button variant="ghost" onClick={() => { setSub("idle"); setParsed([]); if (fileRef.current) fileRef.current.value = ""; }}>Cancelar</Button>
              </div>
            </div>
          )}

          {/* ── GEOCODING: progress ── */}
          {sub === "geocoding" && (
            <div className="space-y-5 py-4">
              <div className="text-center space-y-1">
                <p className="font-semibold">Validando geolocalização dos endereços…</p>
                <p className="text-sm text-muted-foreground">
                  {geoProgress.current} de {geoProgress.total} endereços processados
                  {geoProgress.total > 10 && <span className="text-xs"> · ~{Math.round((geoProgress.total - geoProgress.current) * 1.1)}s restantes</span>}
                </p>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div className="bg-primary h-2.5 rounded-full transition-all duration-500"
                  style={{ width: geoProgress.total > 0 ? `${Math.round(geoProgress.current / geoProgress.total * 100)}%` : "0%" }} />
              </div>
              {/* Live partial results */}
              {validated.length > 0 && (
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="bg-emerald-50 rounded-lg p-3">
                    <p className="text-xl font-bold text-emerald-700">{validated.filter(e => e.source === "coords" || e.source === "geocoded").length}</p>
                    <p className="text-xs text-emerald-600">OK</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3">
                    <p className="text-xl font-bold text-red-700">{validated.filter(e => e.source === "failed").length}</p>
                    <p className="text-xs text-red-600">Erros</p>
                  </div>
                  <div className="bg-muted rounded-lg p-3">
                    <p className="text-xl font-bold text-muted-foreground">{geoProgress.total - geoProgress.current}</p>
                    <p className="text-xs text-muted-foreground">Restantes</p>
                  </div>
                </div>
              )}
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => { cancelRef.current = true; }}>
                Cancelar e revisar resultados parciais
              </Button>
            </div>
          )}

          {/* ── REVIEW: validation results ── */}
          {sub === "review" && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex flex-wrap gap-2 text-xs">
                {coordsCount > 0 && <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full font-medium">📍 {coordsCount} com coordenadas</span>}
                {geocodedCount + manualCount > 0 && <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">🗺 {geocodedCount + manualCount} geocodificados</span>}
                {failCount > 0 && <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-full font-medium">❌ {failCount} endereço{failCount !== 1 ? "s" : ""} não encontrado{failCount !== 1 ? "s" : ""}</span>}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 border-b">
                {failCount > 0 && (
                  <button onClick={() => setReviewTab("errors")}
                    className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px ${reviewTab === "errors" ? "border-destructive text-destructive" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                    Erros ({failCount})
                  </button>
                )}
                <button onClick={() => setReviewTab("all")}
                  className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px ${reviewTab === "all" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  Todos ({validated.length})
                </button>
              </div>

              {/* Table */}
              <div className="border rounded-lg overflow-hidden max-h-[340px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow className="bg-muted/40 sticky top-0">
                    <TableHead className="w-6">#</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Endereço</TableHead>
                    <TableHead className="w-28">Coordenadas</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {validated
                      .filter(e => reviewTab === "errors" ? e.source === "failed" : true)
                      .map((e, _listIdx) => {
                        const rowIdx = e.origIdx;
                        const isFailed = e.source === "failed";
                        const isRegeo = regeocoding === rowIdx;
                        return (
                          <TableRow key={rowIdx} className={isFailed ? "bg-red-50/60" : e.source === "coords" ? "bg-emerald-50/40" : "bg-blue-50/30"}>
                            <TableCell className="text-muted-foreground text-xs py-2">{rowIdx + 1}</TableCell>
                            <TableCell className="py-2">
                              <p className="text-xs font-semibold truncate max-w-[100px]">{e.name}</p>
                              <p className="text-[10px] text-muted-foreground">{e.shift ?? "—"}</p>
                            </TableCell>
                            <TableCell className="py-2 max-w-[200px]">
                              {isFailed ? (
                                <Input
                                  value={e.editAddress}
                                  onChange={ev => setValidated(prev => prev.map((x, i) => i !== rowIdx ? x : { ...x, editAddress: ev.target.value }))}
                                  className="h-7 text-xs px-2 border-destructive/50 focus:border-destructive"
                                  placeholder="Corrija o endereço…"
                                />
                              ) : (
                                <p className="text-xs text-muted-foreground truncate">{e.editAddress}</p>
                              )}
                            </TableCell>
                            <TableCell className="py-2">
                              {e.lat != null && e.lng != null
                                ? <span className="text-[10px] font-mono text-muted-foreground">{e.lat.toFixed(3)}, {e.lng.toFixed(3)}</span>
                                : <span className="text-[10px] text-red-500">Sem coordenadas</span>}
                            </TableCell>
                            <TableCell className="py-2">
                              {e.source === "coords" && <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">Planilha</span>}
                              {e.source === "geocoded" && <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">Geocod.</span>}
                              {e.source === "manual" && <span className="text-[10px] font-semibold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded">Corrigido</span>}
                              {e.source === "failed" && <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">Erro</span>}
                            </TableCell>
                            <TableCell className="py-2">
                              {isFailed && (
                                <Button size="sm" variant="outline" disabled={isRegeo || !e.editAddress.trim()} onClick={() => void regeocodeOne(rowIdx)}
                                  className="h-6 text-[10px] px-2 border-primary/40 text-primary hover:bg-primary/5">
                                  {isRegeo ? "…" : "Re-geocodificar"}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>

              {/* Confirm section */}
              {failCount > 0 && (
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={acceptFailed} onChange={e => setAcceptFailed(e.target.checked)} className="mt-0.5 accent-primary" />
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    Importar os <strong className="text-foreground">{failCount} funcionário{failCount !== 1 ? "s" : ""} sem coordenadas</strong> mesmo assim (posição aproximada pelo endereço)
                  </span>
                </label>
              )}

              <div className="flex gap-2">
                <Button onClick={() => void handleImport(true)} disabled={failCount > 0 && !acceptFailed} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirmar e Importar {validated.length} funcionários
                </Button>
                {existingWorkers.length > 0 && (
                  <Button variant="outline" onClick={() => void handleImport(false)} disabled={failCount > 0 && !acceptFailed}>
                    Adicionar aos existentes
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setParsed([])}>Limpar</Button>
              </div>
            </div>
          )}

          <input type="file" ref={fileRef} className="hidden" accept=".csv,.xlsx,.xls,.ods,.xlsm,.tsv" onChange={handleFileChange} />
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Finalize step ──────────────────────────────────────────────────────── */
function FinalizeStep({ budgetId, token, onComplete, onBack }: {
  budgetId: number; token: string | null; onComplete: () => void; onBack: () => void;
}) {
  const [bps, setBps] = useState<ManualBP[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");
  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  useEffect(() => {
    void Promise.all([
      fetch(`/api/admin/budgets/${budgetId}/boarding-points`, { headers: hdrs }).then(r => r.json()),
      fetch(`/api/admin/budgets/vehicle-types`, { headers: hdrs }).then(r => r.json()),
    ]).then(([bpsData, vtData]: [ManualBP[], VehicleType[]]) => {
      setBps(bpsData);
      const vt = vtData.sort((a, b) => b.capacity - a.capacity);
      setVehicleTypes(vt);
      // Auto-select recommended vehicle per shift
      const shiftPax = new Map<string, number>();
      for (const bp of bpsData) {
        const k = bp.shiftTime ?? "06:00";
        shiftPax.set(k, (shiftPax.get(k) ?? 0) + bp.passengerCount);
      }
      const init: Record<string, number> = {};
      for (const [shift, pax] of shiftPax) {
        const rec = [...vt].reverse().find(v => v.capacity >= pax) ?? vt[vt.length - 1];
        if (rec) init[shift] = rec.id;
      }
      setSelections(init);
    });
  }, [budgetId]);

  const shiftGroups = useMemo(() => {
    const m = new Map<string, ManualBP[]>();
    for (const bp of bps) {
      const k = bp.shiftTime ?? "06:00";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(bp);
    }
    return m;
  }, [bps]);

  const handleCreate = async () => {
    if (!Object.keys(selections).length) { setErr("Selecione um veículo para cada turno."); return; }
    setCreating(true); setErr("");
    try {
      const shiftRoutes = [...shiftGroups.keys()].map(shift => ({
        shiftTime: shift,
        vehicleTypeId: selections[shift] ?? vehicleTypes[0]?.id ?? 3,
      }));
      const r = await fetch(`/api/admin/budgets/${budgetId}/finalize-manual`, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ shiftRoutes }),
      });
      const res = await r.json() as { routes?: number; error?: string };
      if (!r.ok) { setErr(res.error ?? "Erro ao criar rotas"); return; }
      onComplete();
    } finally { setCreating(false); }
  };

  if (bps.length === 0) return (
    <Card><CardContent className="py-12 text-center text-muted-foreground">
      <Navigation className="h-12 w-12 mx-auto mb-3 opacity-30" />
      <p className="font-medium">Nenhum ponto de embarque criado</p>
      <p className="text-sm mt-1">Volte ao mapa e adicione pontos de embarque primeiro.</p>
      <Button variant="outline" className="mt-4" onClick={onBack}>← Voltar ao Mapa</Button>
    </CardContent></Card>
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Selecionar Veículos</h2>
          <p className="text-muted-foreground text-sm">Escolha o tipo de veículo para cada turno. A rota será criada com a sequência definida no mapa.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>← Ajustar Pontos</Button>
      </div>

      {err && <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2"><AlertCircle size={14} />{err}</div>}

      <div className="grid gap-4">
        {[...shiftGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([shift, shiftBps]) => {
          const totalPax = shiftBps.reduce((s, b) => s + b.passengerCount, 0);
          const selectedVt = vehicleTypes.find(v => v.id === selections[shift]);
          const occupancy = selectedVt ? totalPax / selectedVt.capacity * 100 : 0;
          const occupancyColor = occupancy >= 80 ? "text-emerald-600" : occupancy >= 60 ? "text-amber-600" : "text-red-600";

          return (
            <Card key={shift}>
              <CardContent className="pt-5">
                <div className="flex items-start gap-4">
                  <div className="bg-primary/10 px-3 py-2 rounded-lg flex-shrink-0 text-center">
                    <p className="text-xs text-muted-foreground">Turno</p>
                    <p className="text-lg font-bold text-primary">{shift}</p>
                  </div>
                  <div className="flex-1 grid grid-cols-3 gap-4 text-sm">
                    <div><p className="text-xs text-muted-foreground">Passageiros</p><p className="font-bold text-lg">{totalPax}</p></div>
                    <div><p className="text-xs text-muted-foreground">Pontos de Embarque</p><p className="font-bold text-lg">{shiftBps.length}</p></div>
                    <div>
                      <p className="text-xs text-muted-foreground">Ocupação</p>
                      <p className={`font-bold text-lg ${occupancyColor}`}>{selectedVt ? `${occupancy.toFixed(0)}%` : "—"}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 w-48">
                    <Label className="text-xs text-muted-foreground mb-1 block">Tipo de Veículo</Label>
                    <Select value={String(selections[shift] ?? "")} onValueChange={v => setSelections(s => ({ ...s, [shift]: parseInt(v) }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicleTypes.map(vt => {
                          const occ = (totalPax / vt.capacity * 100).toFixed(0);
                          return (
                            <SelectItem key={vt.id} value={String(vt.id)}>
                              <span className="font-medium">{vt.type}</span>
                              <span className="text-muted-foreground ml-2 text-xs">{vt.capacity} lug. · {occ}%</span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {selectedVt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {totalPax}/{selectedVt.capacity} lugares
                        {totalPax > selectedVt.capacity && <span className="text-red-500 ml-1">· Excede capacidade!</span>}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={() => void handleCreate()} disabled={creating} size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {creating ? "Criando Rotas…" : `Criar ${shiftGroups.size} Rota${shiftGroups.size > 1 ? "s" : ""} →`}
        </Button>
      </div>
    </div>
  );
}

/* ─── Routes step ────────────────────────────────────────────────────────── */
function RoutesStep({ routes, workers, onBack, onReimport }: {
  routes: ExtRoute[]; workers: BudgetWorker[];
  onBack: () => void; onReimport: () => void;
}) {
  const exportPassengers = () => {
    const bpMap = new Map<number, BudgetWorker[]>();
    for (const emp of workers) {
      if (!emp.boardingPointId) continue;
      if (!bpMap.has(emp.boardingPointId)) bpMap.set(emp.boardingPointId, []);
      bpMap.get(emp.boardingPointId)!.push(emp);
    }
    const rows: Record<string, string>[] = [];
    for (const route of routes) {
      for (const bp of route.boardingPoints) {
        for (const emp of (bpMap.get(bp.id) ?? [])) {
          rows.push({ Turno: route.shiftTime ?? "", Veículo: route.vehicleAssignments[0]?.vehicleType ?? "", "Ponto de Embarque": bp.name, Nome: emp.name, Endereço: emp.address, Turno_Func: emp.shift ?? "" });
        }
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Passageiros");
    XLSX.writeFile(wb, "passageiros_por_ponto.xlsx");
  };

  if (routes.length === 0) return (
    <Card><CardContent className="py-12 text-center text-muted-foreground">
      <Navigation className="h-12 w-12 mx-auto mb-3 opacity-30" />
      <p className="font-medium">Nenhuma rota criada ainda</p>
      <div className="flex justify-center gap-2 mt-4">
        <Button variant="outline" onClick={onBack}>← Voltar ao Mapa</Button>
        <Button variant="outline" onClick={onReimport}><Upload className="mr-2 h-4 w-4" />Re-importar Planilha</Button>
      </div>
    </CardContent></Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Rotas Criadas</h2>
          <p className="text-sm text-muted-foreground">
            {routes.length} rota{routes.length !== 1 ? "s" : ""} · {routes.reduce((s, r) => s + r.totalPassengers, 0)} passageiros
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>← Ajustar Mapa</Button>
          <Button variant="outline" size="sm" onClick={exportPassengers}><Download className="mr-2 h-4 w-4" />Exportar Excel</Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {routes.map(r => (
          <Card key={r.id} className="border-l-4" style={{ borderLeftColor: r.shiftTime === "06:00" ? "#3b82f6" : r.shiftTime === "14:20" ? "#f59e0b" : "#8b5cf6" }}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Turno {r.shiftTime}</p>
              <p className="text-xl font-bold">{r.totalPassengers} pax</p>
              <p className="text-xs text-muted-foreground">{r.vehicleAssignments[0]?.vehicleType} · {r.totalDistanceKm?.toFixed(1)} km</p>
              {r.totalCost && <p className="text-xs font-medium text-emerald-600 mt-1">R$ {r.totalCost.toFixed(2)}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <PassengerListCard routes={routes} workers={workers} />
    </div>
  );
}

/* ─── Passenger list card ────────────────────────────────────────────────── */
function PassengerListCard({ routes, workers }: { routes: ExtRoute[]; workers: BudgetWorker[] }) {
  const [search, setSearch] = useState("");
  const [filterShift, setFilterShift] = useState("");
  const [openPoints, setOpenPoints] = useState<Set<number>>(new Set());

  const bpEmpMap = useMemo(() => {
    const m = new Map<number, BudgetWorker[]>();
    for (const emp of workers) {
      if (emp.boardingPointId == null) continue;
      if (!m.has(emp.boardingPointId)) m.set(emp.boardingPointId, []);
      m.get(emp.boardingPointId)!.push(emp);
    }
    return m;
  }, [workers]);

  const shifts = useMemo(() => [...new Set(routes.map(r => r.shiftTime).filter(Boolean) as string[])].sort(), [routes]);
  const filtered = routes.filter(r => !filterShift || r.shiftTime === filterShift);
  const q = search.toLowerCase().trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lista de Passageiros por Ponto de Embarque</CardTitle>
        <CardDescription>{routes.reduce((s, r) => s + r.totalPassengers, 0)} passageiros · {routes.flatMap(r => r.boardingPoints).length} pontos</CardDescription>
        <div className="flex gap-2 mt-2">
          <input type="text" placeholder="Buscar funcionário…" value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
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
            <div className="bg-muted/40 px-4 py-2.5 flex items-center gap-3 text-sm font-medium flex-wrap">
              <span className="text-muted-foreground">Turno</span>
              <span className="font-bold">{route.shiftTime ?? "—"}</span>
              <span className="text-muted-foreground">·</span>
              {route.vehicleAssignments[0] && <span className="flex items-center gap-1"><Bus className="h-3.5 w-3.5" />{route.vehicleAssignments[0].vehicleType}</span>}
              <span className="text-muted-foreground">·</span>
              <span className="font-bold text-primary">{route.totalPassengers} passageiros</span>
              {route.totalDistanceKm > 0 && <span className="text-xs text-muted-foreground ml-auto">{route.totalDistanceKm.toFixed(1)} km</span>}
            </div>
            {[...route.boardingPoints].sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0)).map(bp => {
              const allEmps = bpEmpMap.get(bp.id) ?? [];
              const emps = q ? allEmps.filter(e => e.name.toLowerCase().includes(q) || e.address.toLowerCase().includes(q)) : allEmps;
              if (q && !emps.length) return null;
              const isOpen = openPoints.has(bp.id);
              return (
                <div key={bp.id} className="border-t">
                  <button onClick={() => setOpenPoints(prev => { const n = new Set(prev); n.has(bp.id) ? n.delete(bp.id) : n.add(bp.id); return n; })}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">{bp.sequenceOrder}</div>
                    <span className="flex-1 text-sm font-medium truncate">{bp.name}</span>
                    <span className="text-xs text-muted-foreground">{allEmps.length} passageiro{allEmps.length !== 1 ? "s" : ""}</span>
                    <span className="ml-1 text-muted-foreground">{isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t bg-muted/10">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b bg-muted/20">
                          <th className="text-left px-4 py-1.5 font-medium text-muted-foreground w-8">#</th>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Nome</th>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Endereço</th>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Turno</th>
                        </tr></thead>
                        <tbody>
                          {emps.map((emp, i) => (
                            <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="px-4 py-1.5 text-muted-foreground">{i + 1}</td>
                              <td className="px-2 py-1.5 font-medium">{emp.name}</td>
                              <td className="px-2 py-1.5 text-muted-foreground max-w-xs truncate">{emp.address || "—"}</td>
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
