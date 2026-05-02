import { useState } from "react";
import DashboardLayout from "./layout";
import { useDashboard, formatCepProgressive, type Colaborador } from "./context";
import { AlertTriangle, Pencil, CheckCircle, XCircle, X, AlertCircle, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function StatusCell({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle size={16} className="text-green-600 mx-auto" />
    : <XCircle size={16} className="text-red-500 mx-auto" />;
}

export default function PendenciasPage() {
  const { colaboradoresDaFilial: colaboradores, updateColaborador, turnos, empresaAtiva } = useDashboard();
  const [editing, setEditing] = useState<Colaborador | null>(null);
  const [fTelefone, setFTelefone] = useState("");
  const [fEndereco, setFEndereco] = useState("");
  const [fCep, setFCep] = useState("");
  const [fTurno, setFTurno] = useState("");
  const [error, setError] = useState("");
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  const empresaTemVale = !!(empresaAtiva.valeValue && parseFloat(empresaAtiva.valeValue) > 0);

  function valeOk(c: Colaborador) {
    return empresaTemVale || (!(!c.vale || c.vale === "—"));
  }

  function hasPendencias(c: Colaborador) {
    return !c.telefone?.trim() ||
      !valeOk(c) ||
      !c.endereco.trim() ||
      !c.turno || c.turno === "—";
  }

  const lista = colaboradores.filter(c => c.status !== "Desligado" && hasPendencias(c));

  function countP(c: Colaborador) {
    return [
      !!c.telefone?.trim(),
      valeOk(c),
      !!c.endereco.trim(),
      !(!c.turno || c.turno === "—"),
    ].filter(v => !v).length;
  }

  function openEdit(c: Colaborador) {
    setEditing(c);
    setFTelefone(c.telefone);
    setFEndereco(c.endereco);
    setFCep(c.cep);
    setFTurno(c.turno === "—" ? "" : c.turno);
    setError("");
  }

  function save() {
    if (!editing) return;
    const turnoSel = turnos.find(t => t.nome === fTurno);
    updateColaborador({
      ...editing,
      telefone: fTelefone.trim(),
      endereco: fEndereco.trim(),
      cep: fCep.trim(),
      turno: fTurno || editing.turno,
      vale: turnoSel && ["Ativo", "Inativo"].includes(editing.status) ? "R$ 8,50/dia" : editing.vale,
    });
    setSavedIds(prev => new Set([...prev, editing.id]));
    setEditing(null);
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={18} className="text-amber-500" />
            <h1 className="text-xl font-bold text-foreground">Pendências Cadastrais</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            {lista.length} colaborador{lista.length !== 1 ? "es" : ""} com informações incompletas.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Sem telefone",         icon: PhoneOff, count: colaboradores.filter(c => c.status !== "Desligado" && !c.telefone?.trim()).length },
            { label: "Vale não configurado", icon: null,     count: colaboradores.filter(c => c.status !== "Desligado" && !valeOk(c)).length },
            { label: "Endereço incompleto",  icon: null,     count: colaboradores.filter(c => c.status !== "Desligado" && !c.endereco.trim()).length },
            { label: "Turno não definido",   icon: null,     count: colaboradores.filter(c => c.status !== "Desligado" && (!c.turno || c.turno === "—")).length },
          ].map(item => (
            <div key={item.label} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-2xl font-bold text-amber-700">{item.count}</p>
              <p className="text-xs text-amber-600 font-medium mt-1">{item.label}</p>
            </div>
          ))}
        </div>

        {lista.length === 0 ? (
          <div className="bg-card border rounded-xl p-12 text-center shadow-sm">
            <CheckCircle size={32} className="text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-foreground">Nenhuma pendência cadastral!</p>
          </div>
        ) : (
          <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Colaborador</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Telefone</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vale</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endereço</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Turno</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pendências</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lista.map(p => {
                    const n = countP(p);
                    const resolved = savedIds.has(p.id);
                    return (
                      <tr key={p.id} className={`transition-colors ${resolved ? "bg-green-50/40" : n >= 3 ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-muted/20"}`}>
                        <td className="px-5 py-4 font-medium text-foreground">{p.nome}</td>
                        <td className="px-4 py-4 text-center"><StatusCell ok={!!p.telefone?.trim()} /></td>
                        <td className="px-4 py-4 text-center"><StatusCell ok={valeOk(p)} /></td>
                        <td className="px-4 py-4 text-center"><StatusCell ok={!!p.endereco.trim()} /></td>
                        <td className="px-4 py-4 text-center"><StatusCell ok={!(!p.turno || p.turno === "—")} /></td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${n >= 3 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{n}</span>
                        </td>
                        <td className="px-5 py-4">
                          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-accent hover:text-accent/80 font-semibold" onClick={() => openEdit(p)}>
                            <Pencil size={12} />Corrigir
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card z-10">
              <div>
                <h2 className="font-bold text-lg text-foreground">Corrigir pendências</h2>
                <p className="text-xs text-muted-foreground">{editing.nome} · {editing.codigo}</p>
              </div>
              <button onClick={() => setEditing(null)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted"><X size={15} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Telefone</label>
                <Input placeholder="(11) 9 0000-0000" value={fTelefone} onChange={e => setFTelefone(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Turno</label>
                <select className="w-full border rounded-lg px-3 py-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/50" value={fTurno} onChange={e => setFTurno(e.target.value)}>
                  <option value="">— Sem turno —</option>
                  {turnos.map(t => <option key={t.id} value={t.nome}>{t.nome} ({t.entrada}–{t.saida})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Logradouro</label>
                <Input placeholder="Rua, Av, Alameda..." value={fEndereco} onChange={e => setFEndereco(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">CEP</label>
                <Input
                  placeholder="00000-000"
                  value={fCep}
                  onChange={e => setFCep(formatCepProgressive(e.target.value))}
                  inputMode="numeric"
                  maxLength={9}
                />
              </div>
              {error && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"><AlertCircle size={14} />{error}</div>}
            </div>
            <div className="flex gap-3 px-6 pb-6 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold" onClick={save}>Salvar correções</Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
