import { useState, useEffect, useCallback } from "react";
import { Car, Plus, Trash2, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api";

interface VehicleType {
  id: number;
  type: string;
  capacity: number;
  costPerKm: string;
  fixedCost: string | null;
  createdAt: string;
}

interface Props { token: string }

const EMPTY_FORM = { type: "", capacity: "", costPerKm: "", fixedCost: "" };

export default function VehicleTypesSection({ token }: Props) {
  const [items, setItems] = useState<VehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(apiUrl("/api/admin/vehicle-types"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erro");
      setItems(await res.json() as VehicleType[]);
    } catch { setError("Erro ao carregar veículos."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setFormError(""); setFormLoading(true);
    try {
      const res = await fetch(apiUrl("/api/admin/vehicle-types"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json() as VehicleType & { error?: string };
      if (!res.ok) { setFormError(data.error ?? "Erro ao salvar."); return; }
      setShowForm(false); setForm(EMPTY_FORM); await fetchItems();
    } catch { setFormError("Erro de conexão."); }
    finally { setFormLoading(false); }
  }

  async function handleDelete(id: number) {
    try {
      await fetch(apiUrl(`/api/admin/vehicle-types/${id}`), { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setDeleteId(null); await fetchItems();
    } catch { setError("Erro ao excluir."); }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Car size={18} className="text-accent" />
            <h1 className="text-xl font-bold text-foreground">Veículos</h1>
          </div>
          <p className="text-muted-foreground text-sm">Gerencie a frota e capacidades disponíveis.</p>
        </div>
        <Button onClick={() => { setShowForm(true); setForm(EMPTY_FORM); setFormError(""); }} className="gap-2 shrink-0">
          <Plus size={16} /> Novo Veículo
        </Button>
      </div>

      {/* Modal de novo veículo */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-6 border">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-foreground text-lg">Novo Tipo de Veículo</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Tipo</label>
                <Input name="type" value={form.type} onChange={handleChange} placeholder="Ex: Mini-Van, Ônibus…" required />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Capacidade (passageiros)</label>
                <Input name="capacity" type="number" min="1" value={form.capacity} onChange={handleChange} placeholder="Ex: 15" required />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Custo por Km (R$)</label>
                <Input name="costPerKm" type="number" step="0.01" min="0" value={form.costPerKm} onChange={handleChange} placeholder="Ex: 1.80" required />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Custo Fixo (R$) — opcional</label>
                <Input name="fixedCost" type="number" step="0.01" min="0" value={form.fixedCost} onChange={handleChange} placeholder="Deixe em branco se não houver" />
              </div>
              {formError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  <AlertCircle size={14} />{formError}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" className="flex-1" disabled={formLoading}>{formLoading ? "Salvando…" : "Salvar"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 border text-center">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-destructive" />
            </div>
            <h2 className="font-bold text-foreground mb-2">Excluir veículo?</h2>
            <p className="text-sm text-muted-foreground mb-6">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>Cancelar</Button>
              <Button variant="destructive" className="flex-1" onClick={() => void handleDelete(deleteId)}>Excluir</Button>
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
          <Car size={32} className="text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum tipo de veículo cadastrado ainda.</p>
          <Button size="sm" variant="outline" className="mt-4 gap-2" onClick={() => setShowForm(true)}><Plus size={14} />Cadastrar primeiro veículo</Button>
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Tipo</th>
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Capacidade</th>
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Custo/Km</th>
                <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Custo Fixo</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-4 font-medium text-foreground">{item.type}</td>
                  <td className="px-5 py-4 text-muted-foreground">{item.capacity} Pas</td>
                  <td className="px-5 py-4 text-muted-foreground">
                    R$ {parseFloat(item.costPerKm).toFixed(2).replace(".", ",")}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {item.fixedCost ? `R$ ${parseFloat(item.fixedCost).toFixed(2).replace(".", ",")}` : "—"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => setDeleteId(item.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
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
