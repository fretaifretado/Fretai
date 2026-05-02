import { useState } from "react";
import DashboardLayout from "./layout";
import { useDashboard, type Filial } from "./context";
import { GitBranch, Plus, Pencil, Trash2, X, Check, Building2, Users, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const UF_LIST = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

function cnpjMask(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export default function FiliaisPage() {
  const { filiais, addFilial, updateFilial, deleteFilial, colaboradores, empresaAtiva } = useDashboard();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Filial | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Filial | null>(null);

  /* Form fields */
  const [fNome, setFNome] = useState("");
  const [fTipo, setFTipo] = useState<"matriz" | "filial">("filial");
  const [fCidade, setFCidade] = useState("");
  const [fEstado, setFEstado] = useState("SP");
  const [fCnpj, setFCnpj] = useState("");

  function openCreate() {
    setEditing(null); setFNome(""); setFTipo("filial"); setFCidade(""); setFEstado("SP"); setFCnpj(""); setShowForm(true);
  }
  function openEdit(f: Filial) {
    setEditing(f); setFNome(f.nome); setFTipo(f.tipo); setFCidade(f.cidade); setFEstado(f.estado); setFCnpj(f.cnpj); setShowForm(true);
  }

  function save() {
    if (!fNome.trim() || !fCidade.trim()) return;
    const data = { empresaId: empresaAtiva.id, tipo: fTipo, nome: fNome.trim(), cidade: fCidade.trim(), estado: fEstado, cnpj: fCnpj };
    if (editing) updateFilial({ ...editing, ...data });
    else addFilial(data);
    setShowForm(false);
  }

  const filiaisEmpresa = filiais.filter(f => f.empresaId === empresaAtiva.id);
  const matriz = filiaisEmpresa.find(f => f.tipo === "matriz");
  const branches = filiaisEmpresa.filter(f => f.tipo === "filial");
  const selectedColabs = selected ? colaboradores.filter(c => c.filialId === selected.id) : [];

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1"><GitBranch size={18} className="text-accent" /><h1 className="text-xl font-bold text-foreground">Filiais</h1></div>
            <p className="text-muted-foreground text-sm">Gerencie a estrutura de filiais de <strong>{empresaAtiva.nome}</strong>.</p>
          </div>
          <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-white font-semibold shrink-0"><Plus size={16} className="mr-1.5" />Nova filial</Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total de unidades",    value: filiaisEmpresa.length },
            { label: "Matrizes",             value: filiaisEmpresa.filter(f => f.tipo === "matriz").length },
            { label: "Filiais",              value: branches.length },
            { label: "Colaboradores total",  value: colaboradores.filter(c => filiaisEmpresa.some(f => f.id === c.filialId)).length },
          ].map(item => (
            <div key={item.label} className="bg-card border rounded-xl p-4 shadow-sm">
              <p className="text-2xl font-bold text-foreground">{item.value}</p>
              <p className="text-xs text-muted-foreground font-medium mt-1">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Matriz card */}
        {matriz && (
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Sede / Matriz</p>
            <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary/10"><Building2 size={22} className="text-primary" /></div>
                <div>
                  <h3 className="font-bold text-foreground">{matriz.nome}</h3>
                  <p className="text-sm text-muted-foreground">{matriz.cidade} — {matriz.estado} · CNPJ: {matriz.cnpj || "—"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{colaboradores.filter(c => c.filialId === matriz.id).length} colaboradores</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => openEdit(matriz)}><Pencil size={12} />Editar</Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setSelected(selected?.id === matriz.id ? null : matriz)}><Users size={12} />Ver colaboradores</Button>
              </div>
            </div>
          </div>
        )}

        {/* Branches */}
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Filiais</p>
        {branches.length === 0 ? (
          <div className="bg-card border rounded-xl p-10 text-center shadow-sm mb-6">
            <GitBranch size={28} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhuma filial cadastrada.</p>
            <Button onClick={openCreate} variant="outline" size="sm" className="mt-3"><Plus size={13} className="mr-1" />Criar filial</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {branches.map(f => {
              const count = colaboradores.filter(c => c.filialId === f.id).length;
              return (
                <div key={f.id} className={`bg-card border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow ${selected?.id === f.id ? "border-accent/50 ring-1 ring-accent/20" : ""}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-accent/10"><GitBranch size={16} className="text-accent" /></div>
                      <div>
                        <h3 className="font-semibold text-foreground text-sm">{f.nome}</h3>
                        <p className="text-xs text-muted-foreground">{f.cidade} — {f.estado}</p>
                      </div>
                    </div>
                    <div className="flex gap-0.5">
                      <button onClick={() => openEdit(f)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Pencil size={12} /></button>
                      {deleteId === f.id ? (
                        <>
                          <button onClick={() => { deleteFilial(f.id); setDeleteId(null); }} className="h-7 w-7 flex items-center justify-center rounded hover:bg-red-50 text-red-500"><Check size={12} /></button>
                          <button onClick={() => setDeleteId(null)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
                        </>
                      ) : (
                        <button onClick={() => setDeleteId(f.id)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 size={12} /></button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mb-3">CNPJ: {f.cnpj || "—"}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users size={12} />{count} colaboradores</div>
                    <button onClick={() => setSelected(selected?.id === f.id ? null : f)} className="text-xs text-accent hover:text-accent/80 font-semibold transition-colors">
                      {selected?.id === f.id ? "Ocultar" : "Ver colaboradores"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Selected filial collaborators panel */}
        {selected && (
          <div className="bg-card border rounded-xl shadow-sm overflow-hidden mb-4">
            <div className="px-5 py-4 border-b bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin size={15} className="text-accent" />
                <p className="font-semibold text-foreground text-sm">Colaboradores — {selected.nome}</p>
                <span className="text-xs text-muted-foreground">({selectedColabs.length})</span>
              </div>
              <button onClick={() => setSelected(null)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted"><X size={13} /></button>
            </div>
            {selectedColabs.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum colaborador nesta filial.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted/10 border-b">
                    {["Nome", "Turno", "Status", "Vale"].map(h => <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {selectedColabs.map(c => (
                      <tr key={c.id} className="hover:bg-muted/10">
                        <td className="px-5 py-3 font-medium text-foreground">{c.nome}</td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">{c.turno}</td>
                        <td className="px-5 py-3"><span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-green-100 text-green-700 border-green-200">{c.status}</span></td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">{c.vale}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg text-foreground">{editing ? `Editar: ${editing.nome}` : "Nova unidade"}</h2>
              <button onClick={() => setShowForm(false)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted"><X size={15} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Tipo</label>
                <div className="flex gap-2">
                  {(["matriz", "filial"] as const).map(t => (
                    <button key={t} onClick={() => setFTipo(t)}
                      className={`flex-1 py-2.5 rounded-lg border text-sm font-semibold capitalize transition-colors ${fTipo === t ? "bg-accent text-white border-accent" : "bg-card hover:border-accent/50"}`}>
                      {t === "matriz" ? "Matriz" : "Filial"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Nome *</label>
                <Input placeholder="Ex: Filial Campinas" value={fNome} onChange={e => setFNome(e.target.value)} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Cidade *</label>
                  <Input placeholder="Ex: Campinas" value={fCidade} onChange={e => setFCidade(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Estado</label>
                  <select className="w-full border rounded-lg px-3 py-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/50" value={fEstado} onChange={e => setFEstado(e.target.value)}>
                    {UF_LIST.map(uf => <option key={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">CNPJ</label>
                <Input placeholder="00.000.000/0000-00" value={fCnpj} onChange={e => setFCnpj(cnpjMask(e.target.value))} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold" onClick={save} disabled={!fNome.trim() || !fCidade.trim()}>
                {editing ? "Salvar alterações" : "Criar unidade"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
