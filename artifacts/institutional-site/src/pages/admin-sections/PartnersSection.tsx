import { useState, useEffect, useCallback } from "react";
import { Truck, Plus, Trash2, X, Check, AlertCircle, Search, Car, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Partner {
  id: number;
  name: string;
  cnpj: string;
  address: string;
  phone: string;
  email: string;
  createdAt: string;
}

interface Props { token: string }

function formatCNPJ(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function formatCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

const EMPTY_PARTNER = { name: "", cnpj: "", address: "", phone: "", email: "", masterName: "", masterCpf: "", masterEmail: "" };
const EMPTY_VEHICLE = { type: "", capacity: "", plate: "", internalId: "", status: "ativo" };
const EMPTY_DRIVER = { name: "", cpf: "", cnh: "", cnhCategory: "", email: "" };

export default function PartnersSection({ token }: Props) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState<"partner" | "vehicle" | "driver" | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [partnerForm, setPartnerForm] = useState(EMPTY_PARTNER);
  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE);
  const [driverForm, setDriverForm] = useState(EMPTY_DRIVER);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string } | null>(null);

  const fetchPartners = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/partners", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erro");
      setPartners(await res.json() as Partner[]);
    } catch { setError("Erro ao carregar parceiros."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchPartners(); }, [fetchPartners]);

  async function submitPartner(e: React.FormEvent) {
    e.preventDefault(); setFormError(""); setFormLoading(true);
    try {
      const res = await fetch("/api/admin/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(partnerForm),
      });
      const data = await res.json() as Partner & { masterUser?: { email: string; initialPassword: string }; error?: string };
      if (!res.ok) { setFormError(data.error ?? "Erro."); return; }
      setCreatedInfo(data.masterUser ? { email: data.masterUser.email, password: data.masterUser.initialPassword } : null);
      setShowForm(null); setPartnerForm(EMPTY_PARTNER); await fetchPartners();
    } catch { setFormError("Erro de conexão."); }
    finally { setFormLoading(false); }
  }

  async function submitVehicle(e: React.FormEvent) {
    e.preventDefault(); setFormError(""); setFormLoading(true);
    try {
      const res = await fetch(`/api/partners/${selectedPartnerId}/vehicles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(vehicleForm),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setFormError(data.error ?? "Erro."); return; }
      setShowForm(null); setVehicleForm(EMPTY_VEHICLE);
    } catch { setFormError("Erro de conexão."); }
    finally { setFormLoading(false); }
  }

  async function submitDriver(e: React.FormEvent) {
    e.preventDefault(); setFormError(""); setFormLoading(true);
    try {
      const res = await fetch(`/api/partners/${selectedPartnerId}/drivers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(driverForm),
      });
      const data = await res.json() as { initialPassword?: string; error?: string };
      if (!res.ok) { setFormError(data.error ?? "Erro."); return; }
      setCreatedInfo(data.initialPassword ? { email: driverForm.email, password: data.initialPassword } : null);
      setShowForm(null); setDriverForm(EMPTY_DRIVER);
    } catch { setFormError("Erro de conexão."); }
    finally { setFormLoading(false); }
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`/api/admin/partners/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setDeleteId(null); await fetchPartners();
    } catch { setError("Erro ao excluir."); }
  }

  const filtered = partners.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Truck size={18} className="text-accent" />
            <h1 className="text-xl font-bold text-foreground">Parceiros Transportadores</h1>
          </div>
          <p className="text-muted-foreground text-sm">Gerencie empresas de transporte, veículos e motoristas.</p>
        </div>
        <Button onClick={() => { setShowForm("partner"); setCreatedInfo(null); }} className="bg-accent hover:bg-accent/90 text-white font-semibold shrink-0">
          <Plus size={16} className="mr-2" /> Novo Parceiro
        </Button>
      </div>

      {createdInfo && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <User size={18} className="text-green-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-green-800 text-sm">Cadastro realizado!</p>
            <p className="text-green-700 text-sm mt-1">
              E-mail: <strong>{createdInfo.email}</strong> · Senha inicial: <code className="bg-green-100 px-1.5 py-0.5 rounded font-mono">{createdInfo.password}</code>
            </p>
          </div>
          <button onClick={() => setCreatedInfo(null)}><X size={15} className="text-green-600" /></button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 mb-4">
          <AlertCircle size={15} /><span>{error}</span>
        </div>
      )}

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9 bg-card" placeholder="Buscar parceiro..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Truck size={36} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium text-sm">{search ? "Nenhum parceiro encontrado" : "Nenhum parceiro cadastrado"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["Empresa", "CNPJ", "E-mail", "Telefone", "Veículos", "Motoristas", ""].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-foreground">{p.name}</td>
                    <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{formatCNPJ(p.cnpj)}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{p.email}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{p.phone}</td>
                    <td className="px-5 py-3.5">
                      <button className="text-xs text-accent hover:underline flex items-center gap-1" onClick={() => { setSelectedPartnerId(p.id); setShowForm("vehicle"); setFormError(""); }}>
                        <Car size={12} /> Veículos
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <button className="text-xs text-accent hover:underline flex items-center gap-1" onClick={() => { setSelectedPartnerId(p.id); setShowForm("driver"); setFormError(""); }}>
                        <User size={12} /> Motoristas
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      {deleteId === p.id ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => handleDelete(p.id)}><Check size={12} className="mr-1" />Confirmar</Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDeleteId(null)}><X size={12} /></Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(p.id)}>
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal parceiro */}
      {showForm === "partner" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card">
              <h2 className="font-bold text-lg text-foreground">Novo Parceiro Transportador</h2>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowForm(null)}><X size={16} /></Button>
            </div>
            <form onSubmit={submitPartner} className="p-6 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados da Empresa</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-foreground block mb-1.5">Nome da empresa *</label>
                  <Input placeholder="Transportes Exemplo Ltda." value={partnerForm.name} onChange={e => setPartnerForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">CNPJ *</label>
                  <Input placeholder="00.000.000/0000-00" value={partnerForm.cnpj} onChange={e => setPartnerForm(f => ({ ...f, cnpj: formatCNPJ(e.target.value) }))} required />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Telefone *</label>
                  <Input placeholder="(11) 99999-9999" value={partnerForm.phone} onChange={e => setPartnerForm(f => ({ ...f, phone: e.target.value }))} required />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">E-mail principal *</label>
                  <Input type="email" placeholder="contato@transportadora.com" value={partnerForm.email} onChange={e => setPartnerForm(f => ({ ...f, email: e.target.value }))} required />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-foreground block mb-1.5">Endereço completo *</label>
                  <Input placeholder="Rua Exemplo, 123, São Paulo - SP" value={partnerForm.address} onChange={e => setPartnerForm(f => ({ ...f, address: e.target.value }))} required />
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Administrador Master</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-foreground block mb-1.5">Nome completo *</label>
                    <Input placeholder="João da Silva" value={partnerForm.masterName} onChange={e => setPartnerForm(f => ({ ...f, masterName: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">CPF *</label>
                    <Input placeholder="000.000.000-00" value={partnerForm.masterCpf} onChange={e => setPartnerForm(f => ({ ...f, masterCpf: formatCPF(e.target.value) }))} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">E-mail *</label>
                    <Input type="email" placeholder="admin@transportadora.com" value={partnerForm.masterEmail} onChange={e => setPartnerForm(f => ({ ...f, masterEmail: e.target.value }))} required />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  A senha inicial será os <strong>6 primeiros dígitos do CPF</strong>. Troca obrigatória no 1º acesso.
                </p>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  <AlertCircle size={14} /><span>{formError}</span>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(null)}>Cancelar</Button>
                <Button type="submit" className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold" disabled={formLoading}>
                  {formLoading ? "Cadastrando..." : "Cadastrar Parceiro"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal veículo */}
      {showForm === "vehicle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-lg text-foreground">Cadastrar Veículo</h2>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowForm(null)}><X size={16} /></Button>
            </div>
            <form onSubmit={submitVehicle} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">Tipo *</label>
                <Select value={vehicleForm.type} onValueChange={v => setVehicleForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="van">Van</SelectItem>
                    <SelectItem value="micro_onibus">Micro-ônibus</SelectItem>
                    <SelectItem value="onibus">Ônibus</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1.5">Placa *</label>
                  <Input placeholder="ABC-1234" value={vehicleForm.plate} onChange={e => setVehicleForm(f => ({ ...f, plate: e.target.value }))} required />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">Capacidade *</label>
                  <Input type="number" placeholder="15" value={vehicleForm.capacity} onChange={e => setVehicleForm(f => ({ ...f, capacity: e.target.value }))} required />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Identificação interna</label>
                <Input placeholder="VH-001" value={vehicleForm.internalId} onChange={e => setVehicleForm(f => ({ ...f, internalId: e.target.value }))} />
              </div>
              {formError && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"><AlertCircle size={14} />{formError}</div>}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(null)}>Cancelar</Button>
                <Button type="submit" className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold" disabled={formLoading}>{formLoading ? "Salvando..." : "Cadastrar Veículo"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal motorista */}
      {showForm === "driver" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-lg text-foreground">Cadastrar Motorista</h2>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowForm(null)}><X size={16} /></Button>
            </div>
            <form onSubmit={submitDriver} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">Nome completo *</label>
                <Input value={driverForm.name} onChange={e => setDriverForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1.5">CPF *</label>
                  <Input value={driverForm.cpf} onChange={e => setDriverForm(f => ({ ...f, cpf: formatCPF(e.target.value) }))} required />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">CNH *</label>
                  <Input value={driverForm.cnh} onChange={e => setDriverForm(f => ({ ...f, cnh: e.target.value }))} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1.5">Categoria CNH *</label>
                  <Select value={driverForm.cnhCategory} onValueChange={v => setDriverForm(f => ({ ...f, cnhCategory: v }))}>
                    <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent>
                      {["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">E-mail *</label>
                  <Input type="email" value={driverForm.email} onChange={e => setDriverForm(f => ({ ...f, email: e.target.value }))} required />
                </div>
              </div>
              {formError && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"><AlertCircle size={14} />{formError}</div>}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(null)}>Cancelar</Button>
                <Button type="submit" className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold" disabled={formLoading}>{formLoading ? "Salvando..." : "Cadastrar Motorista"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
