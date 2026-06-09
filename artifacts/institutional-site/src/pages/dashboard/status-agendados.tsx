import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "./layout";
import { useDashboard, type Agendamento, type AgendamentoAlvo, type EstadoAgendamento, type TipoAgendamento } from "./context";
import { CalendarClock, Clock, Users, GitBranch, X, ArrowRight, AlertTriangle, Pencil, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

const STATUS_STYLE: Record<string, string> = {
  "Inativo":   "bg-gray-100 text-gray-700 border-gray-200",
  "Pendente":  "bg-cyan-100 text-cyan-700 border-cyan-200",
  "Férias":    "bg-blue-100 text-blue-700 border-blue-200",
  "Licença":   "bg-yellow-100 text-yellow-700 border-yellow-200",
  "Admissão":  "bg-purple-100 text-purple-700 border-purple-200",
  "Afastado":  "bg-orange-100 text-orange-700 border-orange-200",
  "Desligado": "bg-red-100 text-red-700 border-red-200",
};

// Únicos status permitidos nesta página — "Ativo" é excluído intencionalmente
const STATUS_DISPONIVEIS = [
  "Inativo",
  "Pendente",
  "Férias",
  "Afastado",
  "Licença",
  "Desligado",
] as const;

type StatusDisponivel = typeof STATUS_DISPONIVEIS[number];

const ESTADO_STYLE: Record<EstadoAgendamento, string> = {
  pendente:  "bg-blue-50 text-blue-700 border-blue-200",
  ativo:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  concluido: "bg-gray-100 text-gray-600 border-gray-200",
};
const ESTADO_LABEL: Record<EstadoAgendamento, string> = {
  pendente:  "Pendente",
  ativo:     "Executando",
  concluido: "Concluído",
};

const TIPO_META: Record<TipoAgendamento, { label: string; icon: React.ElementType; color: string }> = {
  turno:  { label: "Turno",  icon: Clock,      color: "text-violet-600 bg-violet-50 border-violet-200" },
  status: { label: "Status", icon: Users,      color: "text-blue-600 bg-blue-50 border-blue-200" },
  filial: { label: "Filial", icon: GitBranch,  color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
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

// Filtro de tipo nunca tem "todos"; filtro de estado apenas pendente/concluido
type FiltroTipo   = TipoAgendamento;
type FiltroEstado = "pendente" | "executando" | "concluido";

export default function StatusAgendadosPage() {
  const { agendamentos, colaboradores, cancelAgendamento, updateAgendamento } = useDashboard();
  const [confirmCancel, setConfirmCancel] = useState<{ ag: Agendamento; nomeColab: string; alvoId: number } | null>(null);
  const [editing, setEditing] = useState<Agendamento | null>(null);
  const [editInicio, setEditInicio] = useState("");
  const [editFim, setEditFim] = useState("");
  const [editAlvos, setEditAlvos] = useState<AgendamentoAlvo[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  // ── Filtros ──
  const [busca, setBusca]               = useState("");
  const [filtroTipo, setFiltroTipo]     = useState<FiltroTipo>("status");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("pendente");
  const [filtroValor, setFiltroValor]   = useState<StatusDisponivel>("Inativo");

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
    if (!editInicio) { setEditError("Informe o início."); return; }
    if (!editIsPermanente) {
      if (!editFim) { setEditError("Informe o fim."); return; }
      if (editFim < editInicio) { setEditError("A data de fim deve ser igual ou posterior ao início."); return; }
    }
    if (editAlvos.length === 0) { setEditError("O agendamento precisa ter pelo menos um colaborador."); return; }
    const ok = await updateAgendamento(editing.id, {
      inicio: editInicio,
      fim: editIsPermanente ? FIM_PERMANENTE : editFim,
      alvos: editAlvos,
    });
    if (!ok) { setEditError("Não foi possível salvar (o agendamento pode já ter iniciado)."); return; }
    setEditing(null);
  }

  // Achata: cada linha = (agendamento × alvo), aplica filtros
  // Exclui agendamentos cujo valorNovo seja "Ativo"
  const linhas = useMemo(() => {
    const buscaNorm = busca.trim().toLowerCase();
    const arr: { ag: Agendamento; alvoId: number; nomeColab: string; valorDe: string }[] = [];
    for (const ag of agendamentos) {
      if (ag.tipo !== filtroTipo) continue;
      // "executando" in UI = "ativo" in data model
      const estadoReal = filtroEstado === "executando" ? "ativo" : filtroEstado;
      if (ag.estado !== estadoReal) continue;
      // Nunca exibe agendamentos para "Ativo" nem para valores fora da lista permitida
      if (filtroTipo === "status") {
        if (!STATUS_DISPONIVEIS.includes(ag.valorNovo as StatusDisponivel)) continue;
        if (ag.valorNovo !== filtroValor) continue;
      } else {
        if (ag.valorNovo !== filtroValor) continue;
      }
      for (const alvo of ag.alvos) {
        const c = colaboradores.find(x => x.id === alvo.colaboradorId);
        const nome = c?.nome ?? "Colaborador removido";
        if (buscaNorm && !nome.toLowerCase().includes(buscaNorm)) continue;
        let valorDe = alvo.valorAnterior ?? "";
        if (!valorDe && c) {
          valorDe = ag.tipo === "turno" ? c.turno : ag.tipo === "status" ? c.status : c.local;
        }
        arr.push({ ag, alvoId: alvo.colaboradorId, nomeColab: nome, valorDe });
      }
    }
    const peso: Record<EstadoAgendamento, number> = { ativo: 0, pendente: 1, concluido: 2 };
    arr.sort((a, b) => {
      const p = peso[a.ag.estado] - peso[b.ag.estado];
      if (p !== 0) return p;
      return a.ag.inicio.localeCompare(b.ag.inicio);
    });
    return arr;
  }, [agendamentos, colaboradores, busca, filtroTipo, filtroEstado, filtroValor]);

  // Contagens por status disponível (exclui "Ativo")
  const contagensStatus = useMemo(() => {
    const map = new Map<string, number>(STATUS_DISPONIVEIS.map(s => [s, 0]));
    // "executando" maps to estado "ativo" in the data model
    const estadoReal = filtroEstado === "executando" ? "ativo" : filtroEstado;
    for (const ag of agendamentos) {
      if (ag.tipo !== "status") continue;
      if (ag.estado !== estadoReal) continue;
      if (!STATUS_DISPONIVEIS.includes(ag.valorNovo as StatusDisponivel)) continue;
      map.set(ag.valorNovo, (map.get(ag.valorNovo) ?? 0) + ag.alvos.length);
    }
    return map;
  }, [agendamentos, filtroEstado]);

  // Contagens por tipo e estado para badges
  const counts = useMemo(() => {
    const r = { turno: 0, status: 0, filial: 0 };
    const e = { pendente: 0, executando: 0, concluido: 0 };
    for (const ag of agendamentos) {
      if (ag.tipo === "status" && !STATUS_DISPONIVEIS.includes(ag.valorNovo as StatusDisponivel)) continue;
      const n = ag.alvos.length;
      r[ag.tipo] += n;
      if (ag.estado === "pendente")  e.pendente  += n;
      if (ag.estado === "ativo")     e.executando += n;
      if (ag.estado === "concluido") e.concluido  += n;
    }
    return { tipo: r, estado: e };
  }, [agendamentos]);

  // Quando o tipo muda, reseta filtroValor para o primeiro disponível
  function handleSetFiltroTipo(t: FiltroTipo) {
    setFiltroTipo(t);
    if (t === "status") {
      setFiltroValor("Inativo");
    } else {
      // Para turno/filial usa string vazia — valores serão derivados dos agendamentos
      setFiltroValor("" as StatusDisponivel);
    }
  }

  // Valores únicos de valorNovo para turno/filial
  const valoresNaoStatus = useMemo(() => {
    if (filtroTipo === "status") return [];
    const mapa = new Map<string, number>();
    for (const ag of agendamentos) {
      if (ag.tipo !== filtroTipo) continue;
      // "executando" in UI = "ativo" in data model
      const estadoReal = filtroEstado === "executando" ? "ativo" : filtroEstado;
      if (ag.estado !== estadoReal) continue;
      mapa.set(ag.valorNovo, (mapa.get(ag.valorNovo) ?? 0) + ag.alvos.length);
    }
    return Array.from(mapa.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [agendamentos, filtroTipo, filtroEstado]);

  // Ao montar ou mudar tipo para turno/filial, seleciona o primeiro valor disponível
  useEffect(() => {
    if (filtroTipo !== "status" && valoresNaoStatus.length > 0 && !valoresNaoStatus.find(([v]) => v === filtroValor)) {
      setFiltroValor((valoresNaoStatus[0]?.[0] ?? "") as StatusDisponivel);
    }
  }, [filtroTipo, valoresNaoStatus, filtroValor]);

  const hasFilters = busca.trim() !== "";

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

        {/* ── Filtros ── */}
        <div className="bg-card border rounded-xl shadow-sm p-4 mb-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <SlidersHorizontal size={14} />
            Filtros
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Busca */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 h-9 text-sm"
                placeholder="Buscar colaborador…"
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
            </div>

            {/* Filtro Tipo — sem "Todos" */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-muted-foreground mr-1">Tipo:</span>
              {(["turno", "status", "filial"] as const).map(t => {
                const active = filtroTipo === t;
                const meta = TIPO_META[t];
                const Icon = meta.icon;
                return (
                  <button
                    key={t}
                    onClick={() => handleSetFiltroTipo(t)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? "bg-accent text-white border-accent"
                        : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"
                    }`}
                  >
                    <Icon size={11} />
                    {meta.label}
                    <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? "bg-white/20" : "bg-muted"}`}>
                      {counts.tipo[t]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Filtro Estado — Pendente, Executando e Concluído */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-muted-foreground mr-1">Estado:</span>
              {([
                { key: "pendente",    label: "Pendente",    count: counts.estado.pendente,    color: "bg-blue-500" },
                { key: "executando",  label: "Executando",  count: counts.estado.executando,  color: "bg-emerald-500" },
                { key: "concluido",   label: "Concluído",   count: counts.estado.concluido,   color: "bg-gray-500" },
              ] as const).map(({ key, label, count, color }) => {
                const active = filtroEstado === key;
                return (
                  <button
                    key={key}
                    onClick={() => setFiltroEstado(key)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? `${color} text-white border-transparent`
                        : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"
                    }`}
                  >
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" />}
                    {label}
                    <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? "bg-white/20" : "bg-muted"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Filtro de valor — Status: botões fixos sem "Todos" */}
            {filtroTipo === "status" && (
              <div className="flex items-center gap-1 flex-wrap w-full pt-1 border-t border-border/50">
                <span className="text-xs text-muted-foreground mr-1">Status:</span>
                {STATUS_DISPONIVEIS.map(status => {
                  const active = filtroValor === status;
                  const badgeCls = STATUS_STYLE[status] ?? "";
                  const count = contagensStatus.get(status) ?? 0;
                  return (
                    <button
                      key={status}
                      onClick={() => setFiltroValor(status)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        active
                          ? "bg-accent text-white border-accent"
                          : `${badgeCls} hover:opacity-80`
                      }`}
                    >
                      {status}
                      <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? "bg-white/20" : "bg-black/10"}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Filtro de valor — Turno / Filial: botões dinâmicos sem "Todos" */}
            {filtroTipo !== "status" && valoresNaoStatus.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap w-full pt-1 border-t border-border/50">
                <span className="text-xs text-muted-foreground mr-1">
                  {filtroTipo === "turno" ? "Turno:" : "Filial:"}
                </span>
                {valoresNaoStatus.map(([valor, count]) => {
                  const active = filtroValor === valor;
                  return (
                    <button
                      key={valor}
                      onClick={() => setFiltroValor(valor as StatusDisponivel)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        active
                          ? "bg-accent text-white border-accent"
                          : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"
                      }`}
                    >
                      {valor}
                      <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? "bg-white/20" : "bg-muted"}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Limpar busca */}
            {hasFilters && (
              <button
                onClick={() => setBusca("")}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
              >
                <X size={12} /> Limpar busca
              </button>
            )}
          </div>
        </div>

        {/* ── Tabela ── */}
        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          {linhas.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {hasFilters ? "Nenhum agendamento encontrado com os filtros selecionados." : "Nenhum agendamento criado ainda."}
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
                    const { icon: Icon, color } = TIPO_META[ag.tipo];
                    const podeCancelar = ag.estado !== "concluido";
                    return (
                      <tr key={`${ag.id}-${alvoId}`} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{nomeColab}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium ${color}`}>
                            <Icon size={11} />{TIPO_META[ag.tipo].label}
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
              <div className="px-4 py-2 border-t bg-muted/10 text-xs text-muted-foreground">
                {linhas.length} registro{linhas.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Editar ── */}
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
                <p><span className="text-muted-foreground">Tipo:</span>{" "}<span className="font-medium">{TIPO_META[editing.tipo].label}</span></p>
                <p><span className="text-muted-foreground">Novo valor:</span>{" "}<span className="font-medium">{editing.valorNovo}</span></p>
                <p><span className="text-muted-foreground">Janela atual:</span>{" "}<span className="font-medium">{fmtDate(editing.inicio)} – {fmtDate(editing.fim)}</span></p>
              </div>

              <div className={`grid gap-3 ${editIsPermanente ? "grid-cols-1" : "grid-cols-2"}`}>
                <div className="space-y-1">
                  <Label htmlFor="edit-inicio">Início</Label>
                  <Input id="edit-inicio" type="date" value={editInicio} onChange={e => { setEditInicio(e.target.value); setEditError(null); }} />
                </div>
                {!editIsPermanente && (
                  <div className="space-y-1">
                    <Label htmlFor="edit-fim">Fim</Label>
                    <Input id="edit-fim" type="date" value={editFim} min={editInicio || undefined} onChange={e => { setEditFim(e.target.value); setEditError(null); }} />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Colaboradores ({editAlvos.length})</Label>
                  {editAlvos.length === 0 && <span className="text-xs text-red-600">Nenhum colaborador</span>}
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                  {editAlvos.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">Remova o agendamento se não houver colaboradores.</div>
                  ) : (
                    editAlvos.map(alvo => {
                      const c = colaboradores.find(x => x.id === alvo.colaboradorId);
                      return (
                        <div key={alvo.colaboradorId} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span className="truncate">{c?.nome ?? "Colaborador removido"}</span>
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-red-600"
                            onClick={() => { removeAlvo(alvo.colaboradorId); setEditError(null); }}>
                            <X size={12} />Remover
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {editError && <p className="text-xs text-red-600">{editError}</p>}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Voltar</Button>
            <Button onClick={handleSaveEdit} disabled={editAlvos.length === 0}>Salvar alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal Cancelar ── */}
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
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleCancelar}>
              {confirmCancel?.ag.estado === "ativo" ? "Reverter e cancelar" : "Cancelar agendamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}