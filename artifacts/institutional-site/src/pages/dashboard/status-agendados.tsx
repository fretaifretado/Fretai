import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "./layout";
import { useDashboard, type Agendamento, type AgendamentoAlvo, type EstadoAgendamento, type TipoAgendamento } from "./context";
import { CalendarClock, Clock, Users, GitBranch, X, ArrowRight, AlertTriangle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

const STATUS_STYLE: Record<string, string> = {
  "Ativo":     "bg-green-100 text-green-700 border-green-200",
  "Inativo":   "bg-gray-100 text-gray-700 border-gray-200",
  "Férias":    "bg-blue-100 text-blue-700 border-blue-200",
  "Licença":   "bg-yellow-100 text-yellow-700 border-yellow-200",
  "Afastado":  "bg-orange-100 text-orange-700 border-orange-200",
  "Desligado": "bg-red-100 text-red-700 border-red-200",
};

const ESTADO_STYLE: Record<EstadoAgendamento, string> = {
  pendente:  "bg-blue-50 text-blue-700 border-blue-200",
  ativo:     "bg-green-50 text-green-700 border-green-200",
  concluido: "bg-gray-100 text-gray-600 border-gray-200",
};
const ESTADO_LABEL: Record<EstadoAgendamento, string> = {
  pendente:  "Pendente",
  ativo:     "Ativo",
  concluido: "Concluído",
};

const TIPO_META: Record<TipoAgendamento, { label: string; icon: React.ElementType }> = {
  turno:  { label: "Turno",  icon: Clock },
  status: { label: "Status", icon: Users },
  filial: { label: "Filial", icon: GitBranch },
};

const FIM_PERMANENTE = "9999-12-31";

function fmtDate(iso: string): string {
  if (!iso || iso === FIM_PERMANENTE) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

function ValorTag({ tipo, valor }: { tipo: TipoAgendamento; valor: string }) {
  if (tipo === "status") {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${STATUS_STYLE[valor] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
        {valor || "—"}
      </span>
    );
  }
  return <span className="text-xs text-foreground">{valor || "—"}</span>;
}

export default function StatusAgendadosPage() {
  const { agendamentos, colaboradores, cancelAgendamento, updateAgendamento } = useDashboard();
  const [confirmCancel, setConfirmCancel] = useState<{ ag: Agendamento; nomeColab: string; alvoId: number } | null>(null);
  const [editing, setEditing] = useState<Agendamento | null>(null);
  const [editInicio, setEditInicio] = useState("");
  const [editFim, setEditFim] = useState("");
  const [editAlvos, setEditAlvos] = useState<AgendamentoAlvo[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  // Mantém o modal sincronizado caso o agendamento mude por trás (ex.: sweeper).
  useEffect(() => {
    if (!editing) return;
    const fresh = agendamentos.find(a => a.id === editing.id);
    if (!fresh) { setEditing(null); return; }
    if (fresh.estado !== "pendente") { setEditing(null); return; }
  }, [agendamentos, editing]);

  function openEdit(ag: Agendamento) {
    setEditing(ag);
    setEditInicio(ag.inicio);
    setEditFim(ag.fim);
    setEditAlvos(ag.alvos.map(a => ({ ...a })));
    setEditError(null);
  }

  function removeAlvo(colabId: number) {
    setEditAlvos(prev => prev.filter(a => a.colaboradorId !== colabId));
  }

  const editIsPermanente = editing?.fim === FIM_PERMANENTE;

  async function handleSaveEdit() {
    if (!editing) return;
    if (!editInicio) {
      setEditError("Informe o início.");
      return;
    }
    if (!editIsPermanente) {
      if (!editFim) {
        setEditError("Informe o fim.");
        return;
      }
      if (editFim < editInicio) {
        setEditError("A data de fim deve ser igual ou posterior ao início.");
        return;
      }
    }
    if (editAlvos.length === 0) {
      setEditError("O agendamento precisa ter pelo menos um colaborador.");
      return;
    }
    const ok = await updateAgendamento(editing.id, {
      inicio: editInicio,
      fim: editIsPermanente ? FIM_PERMANENTE : editFim,
      alvos: editAlvos,
    });
    if (!ok) {
      setEditError("Não foi possível salvar (o agendamento pode já ter iniciado).");
      return;
    }
    setEditing(null);
  }

  // Achata: cada linha = um (agendamento × alvo)
  const linhas = useMemo(() => {
    const arr: { ag: Agendamento; alvoId: number; nomeColab: string; valorDe: string }[] = [];
    for (const ag of agendamentos) {
      for (const alvo of ag.alvos) {
        const c = colaboradores.find(x => x.id === alvo.colaboradorId);
        const nome = c?.nome ?? "Colaborador removido";
        // Para ativo/concluído, usamos o snapshot capturado em valorAnterior (o real "De").
        // Para pendente, o valorAnterior ainda não foi capturado: mostramos o valor atual
        // do colaborador como melhor estimativa do que será o "De" quando aplicar.
        let valorDe = alvo.valorAnterior ?? "";
        if (!valorDe && c) {
          valorDe = ag.tipo === "turno" ? c.turno : ag.tipo === "status" ? c.status : c.local;
        }
        arr.push({ ag, alvoId: alvo.colaboradorId, nomeColab: nome, valorDe });
      }
    }
    // ordena: ativos primeiro, depois pendentes, depois concluídos; dentro de cada grupo por início asc
    const peso: Record<EstadoAgendamento, number> = { ativo: 0, pendente: 1, concluido: 2 };
    arr.sort((a, b) => {
      const p = peso[a.ag.estado] - peso[b.ag.estado];
      if (p !== 0) return p;
      return a.ag.inicio.localeCompare(b.ag.inicio);
    });
    return arr;
  }, [agendamentos, colaboradores]);

  async function handleCancelar() {
    if (!confirmCancel) return;
    await cancelAgendamento(confirmCancel.ag.id);
    setConfirmCancel(null);
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-6xl">
        <div className="flex items-center gap-2 mb-2">
          <CalendarClock size={18} className="text-accent" />
          <h1 className="text-xl font-bold text-foreground">Status Agendados</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-6">
          Alterações de turno, status ou filial agendadas em massa. As pendentes entram em vigor automaticamente
          no início e são revertidas ao valor anterior depois do fim.
        </p>

        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          {linhas.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Nenhum agendamento criado ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    {["Colaborador", "Tipo", "De", "", "Para", "Início", "Fim", "Estado", ""].map((h, i) => (
                      <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {linhas.map(({ ag, alvoId, nomeColab, valorDe }) => {
                    const Icon = TIPO_META[ag.tipo].icon;
                    const podeCancelar = ag.estado !== "concluido";
                    return (
                      <tr key={`${ag.id}-${alvoId}`} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{nomeColab}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Icon size={12} className="text-accent" />{TIPO_META[ag.tipo].label}
                          </span>
                        </td>
                        <td className="px-4 py-3"><ValorTag tipo={ag.tipo} valor={valorDe} /></td>
                        <td className="px-4 py-3 text-muted-foreground"><ArrowRight size={12} /></td>
                        <td className="px-4 py-3"><ValorTag tipo={ag.tipo} valor={ag.valorNovo} /></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{fmtDate(ag.inicio)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{fmtDate(ag.fim)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${ESTADO_STYLE[ag.estado]}`}>
                            {ESTADO_LABEL[ag.estado]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {podeCancelar ? (
                            <div className="flex items-center justify-end gap-1">
                              {ag.estado === "pendente" && (
                                <Button
                                  variant="ghost" size="sm"
                                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => openEdit(ag)}
                                >
                                  <Pencil size={12} />Editar
                                </Button>
                              )}
                              <Button
                                variant="ghost" size="sm"
                                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-red-600"
                                onClick={() => setConfirmCancel({ ag, nomeColab, alvoId })}
                              >
                                <X size={12} />Cancelar
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil size={18} className="text-accent" />
              Editar agendamento
            </DialogTitle>
            <DialogDescription>
              Você pode ajustar a janela de datas ou remover colaboradores enquanto o agendamento ainda
              está pendente. O tipo e o novo valor não podem ser alterados.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 text-sm">
              <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                <p>
                  <span className="text-muted-foreground">Tipo:</span>{" "}
                  <span className="font-medium">{TIPO_META[editing.tipo].label}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Novo valor:</span>{" "}
                  <span className="font-medium">{editing.valorNovo}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Janela atual:</span>{" "}
                  <span className="font-medium">{fmtDate(editing.inicio)} – {fmtDate(editing.fim)}</span>
                </p>
              </div>

              <div className={`grid gap-3 ${editIsPermanente ? "grid-cols-1" : "grid-cols-2"}`}>
                <div className="space-y-1">
                  <Label htmlFor="edit-inicio">Início</Label>
                  <Input
                    id="edit-inicio"
                    type="date"
                    value={editInicio}
                    onChange={e => { setEditInicio(e.target.value); setEditError(null); }}
                  />
                </div>
                {!editIsPermanente && (
                  <div className="space-y-1">
                    <Label htmlFor="edit-fim">Fim</Label>
                    <Input
                      id="edit-fim"
                      type="date"
                      value={editFim}
                      min={editInicio || undefined}
                      onChange={e => { setEditFim(e.target.value); setEditError(null); }}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Colaboradores ({editAlvos.length})</Label>
                  {editAlvos.length === 0 && (
                    <span className="text-xs text-red-600">Nenhum colaborador</span>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                  {editAlvos.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                      Remova o agendamento se não houver colaboradores.
                    </div>
                  ) : (
                    editAlvos.map(alvo => {
                      const c = colaboradores.find(x => x.id === alvo.colaboradorId);
                      const nome = c?.nome ?? "Colaborador removido";
                      return (
                        <div
                          key={alvo.colaboradorId}
                          className="flex items-center justify-between px-3 py-2 text-sm"
                        >
                          <span className="truncate">{nome}</span>
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 gap-1 text-xs text-muted-foreground hover:text-red-600"
                            onClick={() => { removeAlvo(alvo.colaboradorId); setEditError(null); }}
                          >
                            <X size={12} />Remover
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {editError && (
                <p className="text-xs text-red-600">{editError}</p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Voltar</Button>
            <Button onClick={handleSaveEdit} disabled={editAlvos.length === 0}>
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmCancel} onOpenChange={open => { if (!open) setConfirmCancel(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" />
              Cancelar agendamento?
            </DialogTitle>
            <DialogDescription>
              {confirmCancel?.ag.estado === "ativo"
                ? "Este agendamento já está em vigor. Cancelar agora reverterá imediatamente o valor anterior em todos os colaboradores deste agendamento (não só nesta linha)."
                : "Tem certeza que deseja cancelar este agendamento? A ação afeta todos os colaboradores listados abaixo e não pode ser desfeita."}
            </DialogDescription>
          </DialogHeader>
          {confirmCancel && (
            <div className="text-sm bg-muted/30 rounded-lg p-3 space-y-1">
              <p><span className="text-muted-foreground">Tipo:</span> <span className="font-medium">{TIPO_META[confirmCancel.ag.tipo].label}</span></p>
              <p><span className="text-muted-foreground">Novo valor:</span> <span className="font-medium">{confirmCancel.ag.valorNovo}</span></p>
              <p><span className="text-muted-foreground">Período:</span> <span className="font-medium">{fmtDate(confirmCancel.ag.inicio)} – {fmtDate(confirmCancel.ag.fim)}</span></p>
              <p><span className="text-muted-foreground">Colaboradores afetados:</span> <span className="font-medium">{confirmCancel.ag.alvos.length}</span></p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmCancel(null)}>Voltar</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleCancelar}
            >
              {confirmCancel?.ag.estado === "ativo" ? "Reverter e cancelar" : "Cancelar agendamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
