import { useState, useEffect, useCallback } from "react";
import ParceiroLayout from "./parceiro-layout.tsx";
import {
  Users, Plus, X, AlertCircle, Car, User,
  ChevronDown, ChevronUp, Trash2, Check, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Driver {
  id: number;
  name: string;
  cpf: string;
  cnh: string;
  cnhCategory: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}

interface Vehicle {
  id: number;
  type: string;
  capacity: number;
  plate: string;
  internalId: string | null;
  status: string;
  createdAt: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const API_URL = import.meta.env.VITE_API_URL ?? "";

function getHeaders(): HeadersInit {
  const token = localStorage.getItem("jwt_token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function getPartnerId(): number | null {
  // entityId is stored when login response is processed
  const raw = localStorage.getItem("jwt_entity_id");
  return raw ? parseInt(raw, 10) : null;
}

function formatCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatPlate(v: string) {
  // Accepts ABC1234 or ABC1D23 (Mercosul)
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

const VEHICLE_TYPE_LABEL: Record<string, string> = {
  van: "Van",
  micro_onibus: "Micro-ônibus",
  onibus: "Ônibus",
};

const CNH_CATEGORIES = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"];

const EMPTY_DRIVER = { name: "", cpf: "", cnh: "", cnhCategory: "", email: "" };
const EMPTY_VEHICLE = { type: "", capacity: "", plate: "", internalId: "" };

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function MotoristasPage() {
  const partnerId = getPartnerId();

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  /* modal state */
  const [modal, setModal] = useState<"driver" | "vehicle" | null>(null);
  const [driverForm, setDriverForm] = useState(EMPTY_DRIVER);
  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ name: string; email: string; password: string } | null>(null);

  /* expanded driver row */
  const [expandedDriver, setExpandedDriver] = useState<number | null>(null);
  const [deleteDriverId, setDeleteDriverId] = useState<number | null>(null);

  /* ── Fetch ── */
  const load = useCallback(async () => {
    if (!partnerId) { setError("Parceiro não identificado. Faça login novamente."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const [drRes, vhRes] = await Promise.all([
        fetch(`${API_URL}/api/partners/${partnerId}/drivers`, { headers: getHeaders() }),
        fetch(`${API_URL}/api/partners/${partnerId}/vehicles`, { headers: getHeaders() }),
      ]);
      if (!drRes.ok || !vhRes.ok) throw new Error("Erro ao carregar dados");
      setDrivers(await drRes.json() as Driver[]);
      setVehicles(await vhRes.json() as Vehicle[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => { void load(); }, [load]);

  /* ── Submit motorista ── */
  async function submitDriver(e: React.FormEvent) {
    e.preventDefault(); setFormError(""); setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/partners/${partnerId}/drivers`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(driverForm),
      });
      const data = await res.json() as Driver & { initialPassword?: string; error?: string };
      if (!res.ok) { setFormError(data.error ?? "Erro ao cadastrar."); return; }
      setCreatedInfo(data.initialPassword
        ? { name: data.name, email: data.email, password: data.initialPassword }
        : null);
      setModal(null);
      setDriverForm(EMPTY_DRIVER);
      await load();
    } catch { setFormError("Erro de conexão."); }
    finally { setSaving(false); }
  }

  /* ── Submit veículo ── */
  async function submitVehicle(e: React.FormEvent) {
    e.preventDefault(); setFormError(""); setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/partners/${partnerId}/vehicles`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ ...vehicleForm, capacity: parseInt(vehicleForm.capacity || "0", 10) }),
      });
      const data = await res.json() as Vehicle & { error?: string };
      if (!res.ok) { setFormError(data.error ?? "Erro ao cadastrar."); return; }
      setModal(null);
      setVehicleForm(EMPTY_VEHICLE);
      await load();
    } catch { setFormError("Erro de conexão."); }
    finally { setSaving(false); }
  }

  /* ── Delete motorista ── */
  async function deleteDriver(id: number) {
    try {
      await fetch(`${API_URL}/api/partners/${partnerId}/drivers/${id}`, {
        method: "DELETE", headers: getHeaders(),
      });
      setDeleteDriverId(null);
      await load();
    } catch { setError("Erro ao excluir motorista."); }
  }

  const filtered = drivers.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.cpf.includes(search) ||
    d.email.toLowerCase().includes(search.toLowerCase())
  );

  function openModal(type: "driver" | "vehicle") {
    setDriverForm(EMPTY_DRIVER);
    setVehicleForm(EMPTY_VEHICLE);
    setFormError("");
    setCreatedInfo(null);
    setModal(type);
  }

  return (
    <ParceiroLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users size={18} className="text-accent" />
              <h1 className="text-xl font-bold text-foreground">Motoristas</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              {drivers.length} motorista{drivers.length !== 1 ? "s" : ""} cadastrado{drivers.length !== 1 ? "s" : ""} ·{" "}
              {vehicles.length} veículo{vehicles.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-1.5 text-sm font-semibold shrink-0"
              onClick={() => openModal("vehicle")}
            >
              <Car size={15} /> Novo Veículo
            </Button>
            <Button
              className="bg-accent hover:bg-accent/90 text-white font-semibold gap-1.5 shrink-0"
              onClick={() => openModal("driver")}
            >
              <Plus size={15} /> Novo Motorista
            </Button>
          </div>
        </div>

        {/* Created info banner */}
        {createdInfo && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <Check size={16} className="text-green-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-green-800 text-sm">Motorista cadastrado com sucesso!</p>
              <p className="text-green-700 text-sm mt-1">
                <strong>{createdInfo.name}</strong> · E-mail: <strong>{createdInfo.email}</strong> ·{" "}
                Senha inicial: <code className="bg-green-100 px-1.5 py-0.5 rounded font-mono">{createdInfo.password}</code>
              </p>
              <p className="text-xs text-green-600 mt-1">Troca de senha obrigatória no primeiro acesso.</p>
            </div>
            <button onClick={() => setCreatedInfo(null)}><X size={14} className="text-green-600" /></button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 mb-4">
            <AlertCircle size={15} />{error}
          </div>
        )}

        {/* Veículos mini-list */}
        {vehicles.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Veículos cadastrados</p>
            <div className="flex flex-wrap gap-2">
              {vehicles.map(v => (
                <div key={v.id} className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 text-sm shadow-sm">
                  <Car size={14} className="text-accent" />
                  <span className="font-mono font-semibold">{v.plate}</span>
                  <span className="text-muted-foreground">{VEHICLE_TYPE_LABEL[v.type] ?? v.type}</span>
                  <span className="text-xs text-muted-foreground">· {v.capacity} lugares</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${v.status === "ativo" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {v.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9 bg-card"
            placeholder="Buscar motorista por nome, CPF ou e-mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Drivers table */}
        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <User size={36} className="text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium text-sm">
                {search ? "Nenhum motorista encontrado" : "Nenhum motorista cadastrado ainda"}
              </p>
              {!search && (
                <Button className="mt-4 bg-accent hover:bg-accent/90 text-white font-semibold gap-1.5" onClick={() => openModal("driver")}>
                  <Plus size={14} /> Cadastrar primeiro motorista
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Nome", "CPF", "CNH", "Categoria", "E-mail", "Status", ""].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(d => (
                    <>
                      <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-foreground">
                          <button
                            className="hover:text-accent transition-colors flex items-center gap-1.5"
                            onClick={() => setExpandedDriver(expandedDriver === d.id ? null : d.id)}
                          >
                            {expandedDriver === d.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            {d.name}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">
                          {d.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{d.cnh}</td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-accent/10 text-accent text-xs font-bold border border-accent/20">
                            {d.cnhCategory}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">{d.email}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${d.isActive ? "bg-green-100 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border"}`}>
                            {d.isActive ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {deleteDriverId === d.id ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => void deleteDriver(d.id)}>
                                <Check size={11} className="mr-1" />Confirmar
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDeleteDriverId(null)}>
                                <X size={11} />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteDriverId(d.id)}>
                              <Trash2 size={13} />
                            </Button>
                          )}
                        </td>
                      </tr>
                      {expandedDriver === d.id && (
                        <tr key={`${d.id}-detail`} className="bg-muted/10">
                          <td colSpan={7} className="px-8 py-4">
                            <div className="flex flex-wrap gap-6 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">CNH completa</p>
                                <p className="font-mono">{d.cnh} — Categoria {d.cnhCategory}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Cadastrado em</p>
                                <p>{new Date(d.createdAt).toLocaleDateString("pt-BR")}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">E-mail de acesso</p>
                                <p>{d.email}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal: Novo Motorista ── */}
      {modal === "driver" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card z-10">
              <div>
                <h2 className="font-bold text-lg text-foreground">Novo Motorista</h2>
                <p className="text-xs text-muted-foreground">Preencha os dados do motorista</p>
              </div>
              <button onClick={() => setModal(null)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted">
                <X size={15} />
              </button>
            </div>
            <form onSubmit={e => void submitDriver(e)} className="p-6 space-y-4">
              {/* Nome */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Nome completo *</label>
                <Input
                  placeholder="José da Silva"
                  value={driverForm.name}
                  onChange={e => setDriverForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* CPF */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">CPF *</label>
                  <Input
                    placeholder="000.000.000-00"
                    value={driverForm.cpf}
                    onChange={e => setDriverForm(f => ({ ...f, cpf: formatCPF(e.target.value) }))}
                    inputMode="numeric"
                    required
                  />
                </div>
                {/* E-mail */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">E-mail *</label>
                  <Input
                    type="email"
                    placeholder="motorista@email.com"
                    value={driverForm.email}
                    onChange={e => setDriverForm(f => ({ ...f, email: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* CNH */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Número da CNH *</label>
                  <Input
                    placeholder="00000000000"
                    value={driverForm.cnh}
                    onChange={e => setDriverForm(f => ({ ...f, cnh: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
                    inputMode="numeric"
                    required
                  />
                </div>
                {/* Categoria CNH */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Categoria CNH *</label>
                  <Select value={driverForm.cnhCategory} onValueChange={v => setDriverForm(f => ({ ...f, cnhCategory: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {CNH_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                A senha inicial do motorista será os <strong>6 primeiros dígitos do CPF</strong>. Troca obrigatória no 1º acesso.
              </p>

              {formError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  <AlertCircle size={14} />{formError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setModal(null)}>Cancelar</Button>
                <Button type="submit" className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold" disabled={saving}>
                  {saving ? "Cadastrando..." : "Cadastrar Motorista"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Novo Veículo ── */}
      {modal === "vehicle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card z-10">
              <div>
                <h2 className="font-bold text-lg text-foreground">Novo Veículo</h2>
                <p className="text-xs text-muted-foreground">Cadastre um veículo da frota</p>
              </div>
              <button onClick={() => setModal(null)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted">
                <X size={15} />
              </button>
            </div>
            <form onSubmit={e => void submitVehicle(e)} className="p-6 space-y-4">
              {/* Tipo */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Tipo de veículo *</label>
                <Select value={vehicleForm.type} onValueChange={v => setVehicleForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="van">Van</SelectItem>
                    <SelectItem value="micro_onibus">Micro-ônibus</SelectItem>
                    <SelectItem value="onibus">Ônibus</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Placa */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Placa *</label>
                  <Input
                    placeholder="ABC1234"
                    value={vehicleForm.plate}
                    onChange={e => setVehicleForm(f => ({ ...f, plate: formatPlate(e.target.value) }))}
                    maxLength={7}
                    required
                  />
                </div>
                {/* Capacidade */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Capacidade *</label>
                  <Input
                    type="number"
                    placeholder="15"
                    min={1}
                    max={100}
                    value={vehicleForm.capacity}
                    onChange={e => setVehicleForm(f => ({ ...f, capacity: e.target.value }))}
                    required
                  />
                </div>
              </div>

              {/* ID interno */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Identificação interna</label>
                <Input
                  placeholder="VH-001 (opcional)"
                  value={vehicleForm.internalId}
                  onChange={e => setVehicleForm(f => ({ ...f, internalId: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">Código interno da sua frota, se houver.</p>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  <AlertCircle size={14} />{formError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setModal(null)}>Cancelar</Button>
                <Button type="submit" className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold" disabled={saving}>
                  {saving ? "Cadastrando..." : "Cadastrar Veículo"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ParceiroLayout>
  );
}