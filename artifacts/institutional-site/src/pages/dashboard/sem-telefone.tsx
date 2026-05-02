import { useState } from "react";
import DashboardLayout from "./layout";
import { useDashboard, type Colaborador } from "./context";
import { PhoneOff, Pencil, X, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SemTelefonePage() {
  const { colaboradoresDaFilial: colaboradores, updateColaborador, turnos } = useDashboard();
  const semTelefone = colaboradores.filter(c => !c.telefone.trim() && c.status !== "Desligado");
  const [editing, setEditing] = useState<Colaborador | null>(null);
  const [fTelefone, setFTelefone] = useState("");
  const [fTurno, setFTurno] = useState("");
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState<number | null>(null);

  function openEdit(c: Colaborador) {
    setEditing(c);
    setFTelefone(c.telefone);
    setFTurno(c.turno === "—" ? "" : c.turno);
    setError("");
  }

  function save() {
    if (!fTelefone.trim()) { setError("Informe um número de telefone."); return; }
    if (!editing) return;
    updateColaborador({ ...editing, telefone: fTelefone.trim(), turno: fTurno || editing.turno });
    setSavedId(editing.id);
    setEditing(null);
    setTimeout(() => setSavedId(null), 2000);
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">
        <div className="flex items-center gap-2 mb-1">
          <PhoneOff size={18} className="text-amber-500" />
          <h1 className="text-xl font-bold text-foreground">Sem telefone</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-8">
          {semTelefone.length} colaborador{semTelefone.length !== 1 ? "es" : ""} sem número de telefone cadastrado.
        </p>

        {semTelefone.length === 0 ? (
          <div className="bg-card border rounded-xl p-12 text-center shadow-sm">
            <Check size={32} className="text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-foreground">Todos os colaboradores têm telefone cadastrado!</p>
          </div>
        ) : (
          <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    {["Nome", "CPF", "Turno", "Status", ""].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {semTelefone.map(c => (
                    <tr key={c.id} className={`hover:bg-muted/20 transition-colors ${savedId === c.id ? "bg-green-50" : ""}`}>
                      <td className="px-5 py-3.5 font-medium text-foreground">{c.nome}</td>
                      <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{c.cpf}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{c.turno}</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-gray-100 text-gray-600 border-gray-200">{c.status}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-accent hover:text-accent/80 font-semibold" onClick={() => openEdit(c)}>
                          <Pencil size={12} />Atualizar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-bold text-lg text-foreground">Atualizar telefone</h2>
                <p className="text-xs text-muted-foreground">{editing.nome} · {editing.codigo}</p>
              </div>
              <button onClick={() => setEditing(null)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted"><X size={15} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Telefone *</label>
                <Input
                  placeholder="(11) 9 0000-0000"
                  value={fTelefone}
                  onChange={e => { setFTelefone(e.target.value); setError(""); }}
                  className={error ? "border-destructive" : ""}
                  autoFocus
                />
                {error && <p className="text-destructive text-xs mt-1 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Turno (opcional)</label>
                <select
                  className="w-full border rounded-lg px-3 py-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/50"
                  value={fTurno}
                  onChange={e => setFTurno(e.target.value)}
                >
                  <option value="">— Manter atual ({editing.turno}) —</option>
                  {turnos.map(t => <option key={t.id} value={t.nome}>{t.nome} ({t.entrada}–{t.saida})</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold" onClick={save}>Salvar</Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
