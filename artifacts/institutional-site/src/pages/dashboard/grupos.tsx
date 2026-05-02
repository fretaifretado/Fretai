import { useState } from "react";
import DashboardLayout from "./layout";
import { useDashboard, type Grupo } from "./context";
import { Users2, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function GruposPage() {
  const { grupos, addGrupo, updateGrupo, deleteGrupo, colaboradores } = useDashboard();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Grupo | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  function openCreate() { setEditing(null); setNome(""); setDescricao(""); setShowForm(true); }
  function openEdit(g: Grupo) { setEditing(g); setNome(g.nome); setDescricao(g.descricao); setShowForm(true); }

  function save() {
    if (!nome.trim()) return;
    if (editing) updateGrupo({ ...editing, nome: nome.trim(), descricao: descricao.trim() });
    else addGrupo({ nome: nome.trim(), descricao: descricao.trim() });
    setShowForm(false);
  }

  function del(id: number) { deleteGrupo(id); setDeleteId(null); }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1"><Users2 size={18} className="text-accent" /><h1 className="text-xl font-bold text-foreground">Grupos</h1></div>
            <p className="text-muted-foreground text-sm">Organize colaboradores em grupos funcionais.</p>
          </div>
          <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-white font-semibold shrink-0"><Plus size={16} className="mr-1.5" />Novo grupo</Button>
        </div>

        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  {["Grupo", "Descrição", "Membros", ""].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {grupos.map(g => {
                  const count = colaboradores.filter(c => c.grupoId === g.id).length;
                  return (
                    <tr key={g.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-foreground">{g.nome}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{g.descricao || "—"}</td>
                      <td className="px-5 py-3.5 font-medium text-foreground">{count}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1 justify-end">
                          {deleteId === g.id ? (
                            <>
                              <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => del(g.id)}><Check size={12} className="mr-1" />Confirmar</Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDeleteId(null)}><X size={12} /></Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => openEdit(g)}><Pencil size={12} />Editar</Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(g.id)}><Trash2 size={13} /></Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {grupos.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum grupo cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-lg text-foreground">{editing ? `Editar: ${editing.nome}` : "Novo grupo"}</h2>
                <button onClick={() => setShowForm(false)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted"><X size={15} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Nome do grupo *</label>
                  <Input placeholder="Ex: Produção — Linha A" value={nome} onChange={e => setNome(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && save()} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Descrição</label>
                  <Input placeholder="Descrição opcional" value={descricao} onChange={e => setDescricao(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold" onClick={save} disabled={!nome.trim()}>
                  {editing ? "Salvar alterações" : "Criar grupo"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
