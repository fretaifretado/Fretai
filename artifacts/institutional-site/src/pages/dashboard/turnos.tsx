import { useState } from "react";
import DashboardLayout from "./layout";
import { useDashboard, type Turno } from "./context";
import { Clock, Plus, Pencil, Trash2, X, Check, AlertTriangle, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function normalizeTurnoKey(name: string): string {
  return (name || "").toLowerCase().replace(/\s+/g, "");
}

const DIAS_ORDEM = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"] as const;

/** Conta o número de dias úteis/mês a partir do tipo de escala. */
export function diasPorEscala(tipoEscala: string): number {
  switch (tipoEscala) {
    case "5x2":   return 22;
    case "6x1":   return 26;
    case "12x36": return 15;
    case "24x48": return 10;
    default:      return 22;
  }
}

/** Deriva o tipoEscala a partir de um código DIA/DIA (ex: "SEG/SAB" → "6x1"). */
export function tipoEscalaFromDias(diasStr: string): string {
  if (!diasStr) return "";
  const parts = diasStr.toUpperCase().split("/");
  if (parts.length !== 2) return "";
  const fromIdx = DIAS_ORDEM.indexOf(parts[0] as typeof DIAS_ORDEM[number]);
  const toIdx   = DIAS_ORDEM.indexOf(parts[1] as typeof DIAS_ORDEM[number]);
  if (fromIdx < 0 || toIdx < 0) return "";
  const count = toIdx >= fromIdx
    ? toIdx - fromIdx + 1
    : (7 - fromIdx) + toIdx + 1;
  if (count === 5) return "5x2";
  if (count === 6) return "6x1";
  if (count === 7) return "7x0";
  return "";
}

/** Rótulo legível para o padrão de escala (ex: "SEG/SAB" → "Seg–Sab"). */
function labelEscala(escala: string, tipoEscala: string): string {
  if (tipoEscala === "12x36") return "12×36";
  if (tipoEscala === "24x48") return "24×48";
  if (!escala) return "";
  const parts = escala.toUpperCase().split("/");
  if (parts.length !== 2) return escala;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return `${cap(parts[0] ?? "")}–${cap(parts[1] ?? "")}`;
}

/** Folga implícita de um intervalo DIA/DIA (ex: "SEG/SAB" → "Dom"). */
function folgaLabel(escala: string, tipoEscala: string): string {
  if (tipoEscala === "12x36") return "Variável";
  if (tipoEscala === "24x48") return "Variável";
  if (!escala) return "";
  const parts = escala.toUpperCase().split("/");
  if (parts.length !== 2) return "";
  const fromIdx = DIAS_ORDEM.indexOf(parts[0] as typeof DIAS_ORDEM[number]);
  const toIdx   = DIAS_ORDEM.indexOf(parts[1] as typeof DIAS_ORDEM[number]);
  if (fromIdx < 0 || toIdx < 0) return "";
  const folgas: string[] = [];
  for (let i = 0; i < DIAS_ORDEM.length; i++) {
    const inRange = toIdx >= fromIdx
      ? i >= fromIdx && i <= toIdx
      : i >= fromIdx || i <= toIdx;
    if (!inRange) folgas.push(DIAS_ORDEM[i] ?? "");
  }
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return folgas.map(cap).join(", ");
}

const ESCALA_OPTIONS = [
  { value: "",        label: "— Não definida —" },
  { value: "SEG/SEX", label: "Seg–Sex (5x2 · 22 dias/mês)" },
  { value: "SEG/SAB", label: "Seg–Sab (6x1 · 26 dias/mês)" },
  { value: "TER/DOM", label: "Ter–Dom (6x1 · 26 dias/mês)" },
  { value: "QUA/DOM", label: "Qua–Dom (6x1 · 26 dias/mês)" },
  { value: "DOM/SEX", label: "Dom–Sex (6x1 · 26 dias/mês)" },
  { value: "12x36",   label: "12×36 – rotativo (≈15 dias/mês)" },
  { value: "24x48",   label: "24×48 – plantão (≈10 dias/mês)" },
];

interface DuplicateConfirm {
  existing: Turno;
  sameHorario: boolean;
  isEditConflict: boolean;
}

export default function TurnosPage() {
  const { turnos, addTurno, updateTurno, deleteTurno, colaboradores } = useDashboard();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Turno | null>(null);
  const [nome, setNome] = useState("");
  const [entrada, setEntrada] = useState("");
  const [saida, setSaida] = useState("");
  const [escala, setEscala] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [confirmDup, setConfirmDup] = useState<DuplicateConfirm | null>(null);

  function openCreate() {
    setEditing(null); setNome(""); setEntrada(""); setSaida(""); setEscala(""); setShowForm(true);
  }
  function openEdit(t: Turno) {
    setEditing(t); setNome(t.nome); setEntrada(t.entrada); setSaida(t.saida);
    setEscala(t.tipoEscala === "12x36" || t.tipoEscala === "24x48" ? t.tipoEscala : (t.escala ?? ""));
    setShowForm(true);
  }

  /** Derives tipoEscala from the selected escala value. */
  function deriveTipoEscala(val: string): string {
    if (val === "12x36") return "12x36";
    if (val === "24x48") return "24x48";
    return tipoEscalaFromDias(val);
  }

  function commitSave() {
    const target = normalizeTurnoKey(nome);
    const countColabs = colaboradores.filter(
      c => normalizeTurnoKey(c.turno) === target,
    ).length;
    const escalaDias = (escala === "12x36" || escala === "24x48") ? "" : escala;
    const tipoEscala = deriveTipoEscala(escala);
    if (editing) {
      updateTurno({ ...editing, nome: nome.trim(), entrada, saida, escala: escalaDias, tipoEscala, colaboradores: countColabs });
    } else {
      addTurno({ nome: nome.trim(), entrada, saida, escala: escalaDias, tipoEscala, colaboradores: countColabs });
    }
    setShowForm(false);
    setConfirmDup(null);
  }

  function save() {
    if (!nome.trim() || !entrada || !saida) return;
    const target = normalizeTurnoKey(nome);
    const collision = turnos.find(t => {
      if (editing && t.id === editing.id) return false;
      return normalizeTurnoKey(t.nome) === target;
    });
    if (collision) {
      setConfirmDup({
        existing: collision,
        sameHorario: collision.entrada === entrada && collision.saida === saida,
        isEditConflict: !!editing,
      });
      return;
    }
    commitSave();
  }

  function del(id: number) {
    deleteTurno(id);
    setDeleteId(null);
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock size={18} className="text-accent" />
              <h1 className="text-xl font-bold text-foreground">Turnos</h1>
            </div>
            <p className="text-muted-foreground text-sm">Configure os turnos de trabalho da empresa.</p>
          </div>
          <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-white font-semibold shrink-0">
            <Plus size={16} className="mr-1.5" />Novo turno
          </Button>
        </div>

        {turnos.length === 0 ? (
          <div className="bg-card border rounded-xl p-12 text-center shadow-sm">
            <Clock size={32} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhum turno cadastrado.</p>
            <Button onClick={openCreate} variant="outline" className="mt-4" size="sm">
              <Plus size={13} className="mr-1.5" />Criar primeiro turno
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {turnos.map(t => {
              const target = normalizeTurnoKey(t.nome);
              const count = colaboradores.filter(
                c => normalizeTurnoKey(c.turno) === target,
              ).length;
              const escalaLabel = labelEscala(t.escala ?? "", t.tipoEscala ?? "");
              const folga = folgaLabel(t.escala ?? "", t.tipoEscala ?? "");
              const dias = diasPorEscala(t.tipoEscala ?? "");
              return (
                <div key={t.id} className="bg-card border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-accent" />
                      <h3 className="font-semibold text-foreground">{t.nome}</h3>
                    </div>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => openEdit(t)}
                        className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Editar turno"
                      >
                        <Pencil size={12} />
                      </button>
                      {deleteId === t.id ? (
                        <>
                          <button onClick={() => del(t.id)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-red-50 text-red-500 transition-colors" title="Confirmar exclusão">
                            <Check size={12} />
                          </button>
                          <button onClick={() => setDeleteId(null)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground transition-colors" title="Cancelar">
                            <X size={12} />
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setDeleteId(t.id)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors" title="Excluir turno">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground mb-1 uppercase tracking-wide font-medium">Horário</p>
                  <p className="text-xl font-bold text-foreground font-mono">{t.entrada} – {t.saida}</p>

                  {escalaLabel && (
                    <div className="mt-3 flex items-center gap-1.5">
                      <CalendarDays size={12} className="text-accent shrink-0" />
                      <span className="text-xs text-foreground font-medium">{escalaLabel}</span>
                      {folga && <span className="text-xs text-muted-foreground">· folga {folga}</span>}
                      <span className="ml-auto text-xs text-muted-foreground">{dias} dias/mês</span>
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{count} colaborador{count !== 1 ? "es" : ""}</p>
                    <button
                      onClick={() => openEdit(t)}
                      className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-lg text-foreground">
                  {editing ? `Editar: ${editing.nome}` : "Novo turno"}
                </h2>
                <button onClick={() => setShowForm(false)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
                  <X size={15} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Nome do turno *</label>
                  <Input
                    placeholder="Ex: Manhã, Tarde, Noturno..."
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && save()}
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Entrada *</label>
                    <Input type="time" value={entrada} onChange={e => setEntrada(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Saída *</label>
                    <Input type="time" value={saida} onChange={e => setSaida(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Escala de trabalho</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/50"
                    value={escala}
                    onChange={e => setEscala(e.target.value)}
                  >
                    {ESCALA_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {nome && entrada && saida && (
                  <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                    Preview: <strong className="text-foreground">{nome}</strong> · {entrada} → {saida}
                    {escala && <> · <span className="text-accent font-medium">{labelEscala(escala === "12x36" || escala === "24x48" ? "" : escala, deriveTipoEscala(escala))}</span></>}
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button
                  className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold"
                  onClick={save}
                  disabled={!nome.trim() || !entrada || !saida}
                >
                  {editing ? "Salvar alterações" : "Criar turno"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Duplicate confirmation modal */}
        {confirmDup && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} className="text-amber-600" />
                </div>
                <div>
                  <h2 className="font-bold text-base text-foreground">
                    {confirmDup.sameHorario ? "Turno duplicado" : "Já existe um turno com esse nome"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {confirmDup.sameHorario
                      ? <>Já existe um turno chamado <strong className="text-foreground">{confirmDup.existing.nome}</strong> com exatamente o mesmo horário ({confirmDup.existing.entrada} → {confirmDup.existing.saida}). Criar um turno idêntico pode confundir os relatórios.</>
                      : <>Já existe um turno chamado <strong className="text-foreground">{confirmDup.existing.nome}</strong> com horário <strong className="text-foreground font-mono">{confirmDup.existing.entrada} → {confirmDup.existing.saida}</strong>. Você quer mesmo {confirmDup.isEditConflict ? "renomear este turno para o mesmo nome" : "criar outro turno com o mesmo nome"} mas com horário <strong className="text-foreground font-mono">{entrada} → {saida}</strong>?</>}
                  </p>
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 mt-6">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDup(null)}>
                  Cancelar
                </Button>
                <Button className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold" onClick={commitSave}>
                  {confirmDup.isEditConflict ? "Salvar mesmo assim" : "Criar mesmo assim"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
