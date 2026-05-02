import { Fragment, useState, useEffect, useCallback } from "react";
import { Building2, Plus, Trash2, X, Check, AlertCircle, Search, User, GitBranch, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Company {
  id: number;
  name: string;
  cnpj: string;
  address: string;
  phone: string;
  email: string;
  valeValue: number;
  masterUserId: number | null;
  createdAt: string;
}

interface Branch {
  id: number;
  name: string;
  cnpj: string;
  city: string | null;
  state: string | null;
  parentCompanyId: number | null;
  createdAt: string;
}

interface Props { token: string }

function formatCNPJ(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function formatCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

const EMPTY_FORM = { name: "", cnpj: "", address: "", phone: "", email: "", masterName: "", masterCpf: "", masterEmail: "", valeValue: "8.50"  };
const EMPTY_BRANCH_FORM = { name: "", cnpj: "", city: "", state: "", address: "", phone: "", email: "" };

export default function CompaniesSection({ token }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string } | null>(null);

  /* branch (filial) state */
  const [branchParent, setBranchParent] = useState<Company | null>(null);
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH_FORM);
  const [branchError, setBranchError] = useState("");
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchSuccess, setBranchSuccess] = useState<string | null>(null);

  /* expanded rows + branches per company */
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [branchesByCompany, setBranchesByCompany] = useState<Record<number, Branch[]>>({});
  const [branchesLoading, setBranchesLoading] = useState<Record<number, boolean>>({});

  const fetchBranches = useCallback(async (companyId: number) => {
    setBranchesLoading(p => ({ ...p, [companyId]: true }));
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/branches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro");
      const data = await res.json() as Branch[];
      setBranchesByCompany(p => ({ ...p, [companyId]: data }));
    } catch {
      setBranchesByCompany(p => ({ ...p, [companyId]: [] }));
    } finally {
      setBranchesLoading(p => ({ ...p, [companyId]: false }));
    }
  }, [token]);

  function toggleExpand(company: Company) {
    const isOpen = !!expanded[company.id];
    setExpanded(p => ({ ...p, [company.id]: !isOpen }));
    if (!isOpen && !branchesByCompany[company.id]) {
      void fetchBranches(company.id);
    }
  }

  function setBranchField(k: keyof typeof EMPTY_BRANCH_FORM, v: string) {
    setBranchForm(f => ({ ...f, [k]: v }));
  }

  function openBranchModal(parent: Company) {
    setBranchParent(parent);
    setBranchForm({ ...EMPTY_BRANCH_FORM, address: parent.address ?? "", phone: parent.phone ?? "", email: parent.email ?? "" });
    setBranchError("");
    setBranchSuccess(null);
  }

  function closeBranchModal() {
    setBranchParent(null);
    setBranchForm(EMPTY_BRANCH_FORM);
    setBranchError("");
    setBranchLoading(false);
  }

  async function handleBranchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!branchParent) return;
    setBranchError("");
    setBranchLoading(true);
    try {
      const res = await fetch(`/api/admin/companies/${branchParent.id}/branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(branchForm),
      });
      const data = await res.json() as Company & { error?: string };
      if (!res.ok) { setBranchError(data.error ?? "Erro ao salvar filial."); return; }
      setBranchSuccess(`Filial "${data.name}" cadastrada para ${branchParent.name}.`);
      setBranchForm(EMPTY_BRANCH_FORM);
      const parentId = branchParent.id;
      setExpanded(p => ({ ...p, [parentId]: true }));
      await fetchBranches(parentId);
      setTimeout(() => closeBranchModal(), 1200);
    } catch { setBranchError("Erro de conexão."); }
    finally { setBranchLoading(false); }
  }

  const fetchCompanies = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/companies", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erro");
      setCompanies(await res.json() as Company[]);
    } catch { setError("Erro ao carregar empresas."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  function setField(k: keyof typeof EMPTY_FORM, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(""); setFormLoading(true);
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json() as Company & { masterUser?: { email: string; initialPassword: string }; error?: string };
      if (!res.ok) { setFormError(data.error ?? "Erro ao salvar."); return; }
      setCreatedInfo(data.masterUser ? { email: data.masterUser.email, password: data.masterUser.initialPassword } : null);
      setShowForm(false);
      setForm(EMPTY_FORM);
      await fetchCompanies();
    } catch { setFormError("Erro de conexão."); }
    finally { setFormLoading(false); }
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`/api/admin/companies/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setDeleteId(null); await fetchCompanies();
    } catch { setError("Erro ao excluir."); }
  }

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.cnpj.includes(search.replace(/\D/g, ""))
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={18} className="text-accent" />
            <h1 className="text-xl font-bold text-foreground">Empresas Clientes</h1>
          </div>
          <p className="text-muted-foreground text-sm">Cadastre as indústrias clientes e seus administradores.</p>
        </div>
        <Button onClick={() => { setShowForm(true); setCreatedInfo(null); }} className="bg-accent hover:bg-accent/90 text-white font-semibold shrink-0">
          <Plus size={16} className="mr-2" /> Nova Empresa
        </Button>
      </div>

      {/* Alerta de credenciais criadas */}
      {createdInfo && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <User size={18} className="text-green-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-green-800 text-sm">Empresa criada com sucesso!</p>
            <p className="text-green-700 text-sm mt-1">
              Administrador: <strong>{createdInfo.email}</strong><br />
              Senha inicial: <code className="bg-green-100 px-1.5 py-0.5 rounded font-mono">{createdInfo.password}</code>
              <span className="text-green-600 ml-2 text-xs">(6 primeiros dígitos do CPF — troca obrigatória no 1º acesso)</span>
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
        <Input className="pl-9 bg-card" placeholder="Buscar por nome, e-mail ou CNPJ..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 size={36} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium text-sm">{search ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="w-10 px-3 py-3"></th>
                  {["Empresa", "CNPJ", "E-mail", "Telefone", "Cadastro", ""].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(company => {
                  const isOpen = !!expanded[company.id];
                  const companyBranches = branchesByCompany[company.id] ?? [];
                  const loadingBranches = !!branchesLoading[company.id];
                  return (
                    <Fragment key={company.id}>
                      <tr className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-3.5">
                          <button
                            onClick={() => toggleExpand(company)}
                            className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            title={isOpen ? "Ocultar filiais" : "Mostrar filiais"}
                            data-testid={`button-toggle-branches-${company.id}`}
                          >
                            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 font-medium text-foreground">{company.name}</td>
                        <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{formatCNPJ(company.cnpj)}</td>
                        <td className="px-5 py-3.5 text-muted-foreground">{company.email}</td>
                        <td className="px-5 py-3.5 text-muted-foreground">{company.phone}</td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs">{new Date(company.createdAt).toLocaleDateString("pt-BR")}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1 justify-end">
                            {deleteId === company.id ? (
                              <>
                                <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => handleDelete(company.id)}>
                                  <Check size={12} className="mr-1" />Confirmar
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDeleteId(null)}><X size={12} /></Button>
                              </>
                            ) : (
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(company.id)}>
                                <Trash2 size={13} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-muted/20">
                          <td colSpan={7} className="px-5 py-4">
                            <div className="ml-6 border-l-2 border-accent/30 pl-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <GitBranch size={14} className="text-accent" />
                                  <p className="text-sm font-semibold text-foreground">
                                    Filiais de {company.name}
                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                      ({companyBranches.length})
                                    </span>
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  className="h-8 bg-accent hover:bg-accent/90 text-white text-xs font-semibold"
                                  onClick={() => openBranchModal(company)}
                                  data-testid={`button-add-branch-${company.id}`}
                                >
                                  <Plus size={13} className="mr-1" /> Adicionar filial
                                </Button>
                              </div>

                              {loadingBranches ? (
                                <p className="text-xs text-muted-foreground py-3">Carregando filiais...</p>
                              ) : companyBranches.length === 0 ? (
                                <div className="bg-card border border-dashed rounded-lg py-6 text-center">
                                  <GitBranch size={20} className="text-muted-foreground/40 mx-auto mb-1.5" />
                                  <p className="text-xs text-muted-foreground">Nenhuma filial cadastrada</p>
                                </div>
                              ) : (
                                <div className="bg-card border rounded-lg overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b bg-muted/30">
                                        {["Filial", "CNPJ", "Cidade", "UF", "Cadastro"].map(h => (
                                          <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                      {companyBranches.map(b => (
                                        <tr key={b.id} className="hover:bg-muted/20" data-testid={`row-branch-${b.id}`}>
                                          <td className="px-3 py-2 font-medium text-foreground">{b.name}</td>
                                          <td className="px-3 py-2 text-muted-foreground font-mono">{formatCNPJ(b.cnpj)}</td>
                                          <td className="px-3 py-2 text-muted-foreground">{b.city ?? "—"}</td>
                                          <td className="px-3 py-2 text-muted-foreground uppercase">{b.state ?? "—"}</td>
                                          <td className="px-3 py-2 text-muted-foreground">{new Date(b.createdAt).toLocaleDateString("pt-BR")}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de cadastro */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card">
              <h2 className="font-bold text-lg text-foreground">Nova Empresa Cliente</h2>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowForm(false)}><X size={16} /></Button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados da Empresa</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-foreground block mb-1.5">Nome da empresa *</label>
                  <Input placeholder="Fretai Indústrias S.A." value={form.name} onChange={e => setField("name", e.target.value)} required />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">CNPJ *</label>
                  <Input placeholder="00.000.000/0000-00" value={form.cnpj} onChange={e => setField("cnpj", formatCNPJ(e.target.value))} required />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Telefone *</label>
                  <Input placeholder="(11) 99999-9999" value={form.phone} onChange={e => setField("phone", e.target.value)} required />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">E-mail principal *</label>
                  <Input type="email" placeholder="contato@empresa.com" value={form.email} onChange={e => setField("email", e.target.value)} required />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-foreground block mb-1.5">Endereço completo *</label>
                  <Input placeholder="Rua Exemplo, 123, São Paulo - SP" value={form.address} onChange={e => setField("address", e.target.value)} required />
                </div>
                <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Valor unitário do vale (R$) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="8.50"
                    value={form.valeValue}
                    onChange={e => setField("valeValue", e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Valor pago por vale-transporte por dia útil.</p>
              </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Administrador Master</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-foreground block mb-1.5">Nome completo *</label>
                    <Input placeholder="João da Silva" value={form.masterName} onChange={e => setField("masterName", e.target.value)} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">CPF *</label>
                    <Input placeholder="000.000.000-00" value={form.masterCpf} onChange={e => setField("masterCpf", formatCPF(e.target.value))} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">E-mail *</label>
                    <Input type="email" placeholder="admin@empresa.com" value={form.masterEmail} onChange={e => setField("masterEmail", e.target.value)} required />
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
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold" disabled={formLoading}>
                  {formLoading ? "Cadastrando..." : "Cadastrar Empresa"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Filial */}
      {branchParent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card">
              <div className="flex items-center gap-2">
                <GitBranch size={18} className="text-accent" />
                <div>
                  <h2 className="font-bold text-lg text-foreground leading-tight">Nova Filial</h2>
                  <p className="text-xs text-muted-foreground">Vinculada a <strong>{branchParent.name}</strong></p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={closeBranchModal} data-testid="button-close-branch-modal">
                <X size={16} />
              </Button>
            </div>

            <form onSubmit={handleBranchSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-foreground block mb-1.5">Nome da filial *</label>
                  <Input
                    placeholder="Filial Campinas"
                    value={branchForm.name}
                    onChange={e => setBranchField("name", e.target.value)}
                    required
                    data-testid="input-branch-name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">CNPJ *</label>
                  <Input
                    placeholder="00.000.000/0000-00"
                    value={branchForm.cnpj}
                    onChange={e => setBranchField("cnpj", formatCNPJ(e.target.value))}
                    required
                    data-testid="input-branch-cnpj"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Telefone</label>
                  <Input
                    placeholder="(11) 99999-9999"
                    value={branchForm.phone}
                    onChange={e => setBranchField("phone", e.target.value)}
                    data-testid="input-branch-phone"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-foreground block mb-1.5">E-mail de contato</label>
                  <Input
                    type="email"
                    placeholder="filial@empresa.com"
                    value={branchForm.email}
                    onChange={e => setBranchField("email", e.target.value)}
                    data-testid="input-branch-email"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-foreground block mb-1.5">Endereço</label>
                  <Input
                    placeholder="Av. das Indústrias, 500"
                    value={branchForm.address}
                    onChange={e => setBranchField("address", e.target.value)}
                    data-testid="input-branch-address"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Cidade *</label>
                  <Input
                    placeholder="Campinas"
                    value={branchForm.city}
                    onChange={e => setBranchField("city", e.target.value)}
                    required
                    data-testid="input-branch-city"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Estado (UF) *</label>
                  <Input
                    placeholder="SP"
                    maxLength={2}
                    value={branchForm.state}
                    onChange={e => setBranchField("state", e.target.value.toUpperCase())}
                    required
                    data-testid="input-branch-state"
                  />
                </div>
              </div>

              {branchError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  <AlertCircle size={14} /><span>{branchError}</span>
                </div>
              )}
              {branchSuccess && (
                <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <Check size={14} /><span>{branchSuccess}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={closeBranchModal}
                  data-testid="button-cancel-branch"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold"
                  disabled={branchLoading}
                  data-testid="button-submit-branch"
                >
                  {branchLoading ? "Cadastrando..." : "Cadastrar Filial"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
