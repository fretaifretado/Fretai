import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "./layout";
import { AlertCircle, CheckCircle, Plus, ShieldCheck, Trash2, UserCog, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api";

interface CompanyUser {
  id: number;
  name: string | null;
  cpf: string | null;
  email: string;
  role: "cliente_master" | "cliente_subadmin";
  createdAt: string;
}

const EMPTY_FORM = { name: "", cpf: "", email: "", role: "cliente_master" as CompanyUser["role"] };

function cleanCpf(value: string) {
  return value.replace(/\D/g, "");
}

function maskCpf(value: string) {
  const d = cleanCpf(value).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatCpf(value: string | null | undefined) {
  const d = cleanCpf(value ?? "").slice(0, 11);
  if (d.length !== 11) return d || "—";
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function roleLabel(role: CompanyUser["role"]) {
  return role === "cliente_master" ? "Master" : "Subadmin";
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("jwt_token") ?? "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export default function UsuariosPage() {
  const role = localStorage.getItem("jwt_role") ?? "";
  const currentEmail = localStorage.getItem("jwt_username") ?? "";
  const currentUserId = Number(localStorage.getItem("jwt_user_id") ?? "0");
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string; role: CompanyUser["role"] } | null>(null);
  const [deleteUser, setDeleteUser] = useState<CompanyUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const isMaster = role === "cliente_master";
  const masterCount = useMemo(() => users.filter(user => user.role === "cliente_master").length, [users]);

  async function loadUsers() {
    if (!isMaster) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/me/users"), { headers: authHeaders() });
      const data = await response.json().catch(() => []) as CompanyUser[] | { error?: string };
      if (!response.ok) {
        setError(Array.isArray(data) ? "Erro ao carregar usuários." : data.error ?? "Erro ao carregar usuários.");
        setUsers([]);
        return;
      }
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setError("Erro de conexão.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, [isMaster]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");
    setCreatedInfo(null);
    if (cleanCpf(form.cpf).length !== 11) {
      setFormError("Informe um CPF válido.");
      return;
    }
    if (users.some(user => cleanCpf(user.cpf ?? "") === cleanCpf(form.cpf))) {
      setFormError("CPF já cadastrado para esta empresa.");
      return;
    }
    setFormLoading(true);
    try {
      const response = await fetch(apiUrl("/api/me/users"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ ...form, cpf: cleanCpf(form.cpf) }),
      });
      const data = await response.json().catch(() => ({})) as CompanyUser & { initialPassword?: string; error?: string };
      if (!response.ok) {
        setFormError(data.error ?? "Erro ao criar usuário.");
        return;
      }
      setCreatedInfo({ email: data.email, password: data.initialPassword ?? "", role: data.role });
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadUsers();
    } catch {
      setFormError("Erro de conexão.");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteUser) return;
    setDeleteLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl(`/api/me/users/${deleteUser.id}`), {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Erro ao excluir usuário.");
        return;
      }
      setDeleteUser(null);
      await loadUsers();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <UserCog size={18} className="text-accent" />
              <h1 className="text-xl font-bold text-foreground">Usuários</h1>
            </div>
            <p className="text-muted-foreground text-sm">Gerencie as contas com acesso ao painel da empresa.</p>
          </div>
          {isMaster && (
            <Button onClick={() => { setShowForm(true); setForm(EMPTY_FORM); setFormError(""); setCreatedInfo(null); }} className="bg-accent hover:bg-accent/90 text-white font-semibold shrink-0">
              <Plus size={16} className="mr-1.5" />Novo usuário
            </Button>
          )}
        </div>

        {!isMaster ? (
          <div className="bg-card border rounded-xl p-12 text-center shadow-sm">
            <ShieldCheck size={32} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-semibold text-foreground">Acesso restrito ao master da empresa.</p>
          </div>
        ) : (
          <>
            {createdInfo && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                <CheckCircle size={18} className="text-green-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-green-800 text-sm">Usuário criado com sucesso.</p>
                  <p className="text-green-700 text-sm mt-1">
                    {createdInfo.email} · {roleLabel(createdInfo.role)} · Senha inicial:{" "}
                    <code className="bg-white px-1.5 py-0.5 rounded font-mono">{createdInfo.password}</code>
                  </p>
                </div>
                <button onClick={() => setCreatedInfo(null)}><X size={15} className="text-green-600" /></button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 mb-4">
                <AlertCircle size={16} />{error}
              </div>
            )}

            <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
              {loading ? (
                <div className="py-16 text-center text-sm text-muted-foreground">Carregando usuários...</div>
              ) : users.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">Nenhum usuário cadastrado.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b">
                        {["Nome", "CPF", "E-mail", "Perfil", "Criado em", ""].map(header => (
                          <th key={header} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {users.map(user => {
                        const isSelf = currentUserId > 0 ? user.id === currentUserId : user.email === currentEmail;
                        const isLastMaster = user.role === "cliente_master" && masterCount <= 1;
                        return (
                          <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-5 py-4 font-medium text-foreground">{user.name || "—"}</td>
                            <td className="px-5 py-4 text-muted-foreground font-mono text-xs">{formatCpf(user.cpf)}</td>
                            <td className="px-5 py-4 text-muted-foreground">{user.email}</td>
                            <td className="px-5 py-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${user.role === "cliente_master" ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-slate-100 text-slate-700 border-slate-200"}`}>
                                {roleLabel(user.role)}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-muted-foreground">{new Date(user.createdAt).toLocaleDateString("pt-BR")}</td>
                            <td className="px-5 py-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive disabled:opacity-40"
                                disabled={isSelf || isLastMaster}
                                onClick={() => setDeleteUser(user)}
                              >
                                <Trash2 size={12} />Excluir
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-md p-6 border">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-foreground text-lg">Novo usuário</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Nome</label>
                <Input value={form.name} onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">CPF</label>
                <Input value={form.cpf} onChange={event => setForm(prev => ({ ...prev, cpf: maskCpf(event.target.value) }))} placeholder="000.000.000-00" required />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">E-mail</label>
                <Input type="email" value={form.email} onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Perfil</label>
                <select
                  value={form.role}
                  onChange={event => setForm(prev => ({ ...prev, role: event.target.value as CompanyUser["role"] }))}
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="cliente_master">Master</option>
                  <option value="cliente_subadmin">Subadmin</option>
                </select>
              </div>
              {formError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  <AlertCircle size={14} />{formError}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" className="flex-1" disabled={formLoading}>{formLoading ? "Criando..." : "Criar"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm p-6 border text-center">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-destructive" />
            </div>
            <h2 className="font-bold text-foreground mb-2">Excluir conta?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              A conta de {deleteUser.email} será apagada do banco de dados.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteUser(null)} disabled={deleteLoading}>Cancelar</Button>
              <Button variant="destructive" className="flex-1" onClick={() => void handleDelete()} disabled={deleteLoading}>{deleteLoading ? "Excluindo..." : "Excluir"}</Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
