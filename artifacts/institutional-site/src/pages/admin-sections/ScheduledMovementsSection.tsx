"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Calendar, ChevronDown, ChevronUp, Filter, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PendingScheduledMovement {
  id: number;
  companyId: number;
  companyName: string;
  tipo: "status" | "turno" | "filial";
  valorNovo: string;
  filialNova?: string;
  inicio: string;
  fim: string;
  alvosCount: number;
  estado: "pendente" | "ativo" | "concluido";
  createdAt: string;
  createdByEmail: string;
}

const TIPO_LABELS: Record<string, string> = {
  status: "Status",
  turno: "Turno",
  filial: "Filial",
};

const ESTADO_COLORS: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-700 border-amber-200",
  ativo: "bg-green-100 text-green-700 border-green-200",
  concluido: "bg-gray-100 text-gray-700 border-gray-200",
};

const ESTADO_LABELS: Record<string, string> = {
  pendente: "Pendente",
  ativo: "Ativo",
  concluido: "Concluído",
};

export function ScheduledMovementsSection({ token }: { token: string }) {
  const [movements, setMovements] = useState<PendingScheduledMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [filterTipo, setFilterTipo] = useState<"" | "status" | "turno" | "filial">("");
  const [filterEstado, setFilterEstado] = useState<"" | "pendente" | "ativo" | "concluido">("");
  const [filterCompany, setFilterCompany] = useState("");
  const [searchText, setSearchText] = useState("");
  
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/pending-scheduled-movements", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao carregar agendamentos");
      const data = await res.json() as { movements: PendingScheduledMovement[] };
      setMovements(data.movements || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  const handleDelete = async (id: number) => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/pending-scheduled-movements/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao cancelar agendamento");
      setMovements(prev => prev.filter(m => m.id !== id));
      setDeletingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cancelar");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Obter lista de empresas únicas
  const companies = Array.from(new Set(movements.map(m => m.companyName))).sort();

  // Filtrar movimentos
  const filtered = movements.filter(m => {
    if (filterTipo && m.tipo !== filterTipo) return false;
    if (filterEstado && m.estado !== filterEstado) return false;
    if (filterCompany && m.companyName !== filterCompany) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!m.companyName.toLowerCase().includes(q) &&
          !m.valorNovo.toLowerCase().includes(q) &&
          !m.createdByEmail.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  // Agrupar por estado
  const grouped = {
    pendente: filtered.filter(m => m.estado === "pendente"),
    ativo: filtered.filter(m => m.estado === "ativo"),
    concluido: filtered.filter(m => m.estado === "concluido"),
  };

  const totalAfetados = filtered.reduce((sum, m) => sum + m.alvosCount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Calendar size={20} className="text-accent" />
          <h1 className="text-2xl font-bold text-foreground">Agendamentos Pendentes</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Acompanhe as alterações de status, turno e filial agendadas pelas empresas. 
          Você tem 2 dias para ajustar as rotas antes da aplicação.
        </p>
      </div>

      {/* Resumo */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide">Pendentes</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{grouped.pendente.length}</p>
            <p className="text-xs text-amber-600 mt-1">{grouped.pendente.reduce((sum, m) => sum + m.alvosCount, 0)} colaboradores</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">Ativos</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{grouped.ativo.length}</p>
            <p className="text-xs text-green-600 mt-1">{grouped.ativo.reduce((sum, m) => sum + m.alvosCount, 0)} colaboradores</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-600 font-semibold uppercase tracking-wide">Concluídos</p>
            <p className="text-2xl font-bold text-gray-700 mt-1">{grouped.concluido.length}</p>
            <p className="text-xs text-gray-600 mt-1">{grouped.concluido.reduce((sum, m) => sum + m.alvosCount, 0)} colaboradores</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-card border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Filter size={14} className="text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Filtros</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Buscar por empresa, valor ou e-mail..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          <select
            value={filterTipo}
            onChange={e => setFilterTipo(e.target.value as any)}
            className="border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="">Todos os tipos</option>
            <option value="status">Status</option>
            <option value="turno">Turno</option>
            <option value="filial">Filial</option>
          </select>
          <select
            value={filterEstado}
            onChange={e => setFilterEstado(e.target.value as any)}
            className="border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="">Todos os estados</option>
            <option value="pendente">Pendente</option>
            <option value="ativo">Ativo</option>
            <option value="concluido">Concluído</option>
          </select>
          <select
            value={filterCompany}
            onChange={e => setFilterCompany(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="">Todas as empresas</option>
            {companies.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle size={16} className="text-red-600 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Carregando */}
      {loading && (
        <div className="bg-card border rounded-lg p-8 text-center">
          <p className="text-muted-foreground text-sm">Carregando agendamentos...</p>
        </div>
      )}

      {/* Vazio */}
      {!loading && filtered.length === 0 && (
        <div className="bg-card border rounded-lg p-12 text-center">
          <Calendar size={32} className="text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {movements.length === 0 ? "Nenhum agendamento criado." : "Nenhum agendamento corresponde aos filtros."}
          </p>
        </div>
      )}

      {/* Lista */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(movement => (
            <div
              key={movement.id}
              className="bg-card border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <button
                onClick={() => setExpandedId(expandedId === movement.id ? null : movement.id)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-foreground">{movement.companyName}</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      {TIPO_LABELS[movement.tipo]}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${ESTADO_COLORS[movement.estado]}`}>
                      {ESTADO_LABELS[movement.estado]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                    <span className="font-mono">→ {movement.valorNovo}</span>
                    <span className="text-xs">
                      {new Date(movement.inicio).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                      {movement.alvosCount} colaborador{movement.alvosCount !== 1 ? "es" : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {expandedId === movement.id ? (
                    <ChevronUp size={18} className="text-muted-foreground" />
                  ) : (
                    <ChevronDown size={18} className="text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Detalhes */}
              {expandedId === movement.id && (
                <div className="border-t bg-muted/20 px-5 py-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1">Tipo</p>
                      <p className="font-semibold text-foreground">{TIPO_LABELS[movement.tipo]}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1">Novo Valor</p>
                      <p className="font-semibold text-foreground">{movement.valorNovo}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1">Início</p>
                      <p className="font-mono text-foreground">
                        {new Date(movement.inicio).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1">Fim</p>
                      <p className="font-mono text-foreground">
                        {movement.fim === "9999-12-31" ? "Permanente" : new Date(movement.fim).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1">Colaboradores</p>
                      <p className="font-semibold text-foreground">{movement.alvosCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1">Criado por</p>
                      <p className="text-sm text-foreground">{movement.createdByEmail}</p>
                    </div>
                  </div>

                  {/* Ações */}
                  {movement.estado === "pendente" && (
                    <div className="pt-3 border-t flex gap-2">
                      {deletingId === movement.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(movement.id)}
                            disabled={deleteLoading}
                            className="flex-1"
                          >
                            {deleteLoading ? "Cancelando..." : "Confirmar cancelamento"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeletingId(null)}
                            className="flex-1"
                          >
                            Voltar
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-2"
                          onClick={() => setDeletingId(movement.id)}
                        >
                          <Trash2 size={14} />
                          Cancelar agendamento
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
