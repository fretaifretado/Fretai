import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";

export type Status = "Ativo" | "Inativo" | "Férias" | "Licença" | "Afastado" | "Desligado";

export type TipoAgendamento = "turno" | "status" | "filial";
export type EstadoAgendamento = "pendente" | "ativo" | "concluido";

export interface AgendamentoAlvo {
  colaboradorId: number;
  /** Valor do campo afetado capturado no momento da aplicação (turno, status ou nome do local). */
  valorAnterior: string;
  /** Apenas usado quando `tipo === "filial"` para reverter `filialId`. */
  filialIdAnterior?: number | null;
  /**
   * Timestamps autoritativos vindos do servidor que indicam se o efeito do
   * agendamento já foi aplicado/revertido no banco. O cliente apenas projeta
   * esses valores na tela — não decide localmente quando aplicar/reverter.
   */
  appliedAt?: string | null;
  revertedAt?: string | null;
}

export interface Agendamento {
  id: number;
  tipo: TipoAgendamento;
  /** Para turno: nome do turno; para status: status novo; para filial: nome da filial destino. */
  valorNovo: string;
  /** Apenas para `tipo === "filial"`. */
  filialIdNovo?: number | null;
  /** Datas em ISO yyyy-mm-dd. */
  inicio: string;
  fim: string;
  alvos: AgendamentoAlvo[];
  estado: EstadoAgendamento;
  criadoEm: string;
}

export interface Turno {
  id: number;
  nome: string;
  entrada: string;
  saida: string;
  colaboradores: number;
  /** Período de trabalho semanal, ex: "SEG/SAB", "SEG/SEX", "DOM/SEX". Vazio para escalas rotativas. */
  escala: string;
  /** Padrão de escala derivado do período: "5x2", "6x1", "12x36", "24x48" ou "". */
  tipoEscala: string;
}

export interface Grupo {
  id: number;
  nome: string;
  descricao: string;
}

export interface Filial {
  id: number;
  empresaId: number;
  tipo: "matriz" | "filial";
  nome: string;
  cidade: string;
  estado: string;
  cnpj: string;
}

export interface Empresa {
  id: number;
  nome: string;
  /** Valor unitário do vale em R$ (string decimal vinda do banco, ex: "8.50"). */
  valeValue: string;
}

export interface Colaborador {
  id: number;
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  nascimento: string;
  matricula: string;
  dataNascimento: string;
  codigo: string;
  status: Status;
  turno: string;
  local: string;
  filialId: number | null;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  horarioEntrada: string;
  horarioSaida: string;
  inicioOperacao: string;
  vale: string;
  grupoId: number | null;
}

export function normalizeCpf(cpf: string): string {
  return (cpf || "").replace(/\D/g, "");
}

/**
 * Formats a CPF as `000.000.000-00` if it has 11 digits.
 * Any non-digit input is stripped first. If the resulting digit
 * count is anything other than 11, the digits-only string is
 * returned unchanged so the user can fix it later without losing
 * information.
 */
export function formatCpf(cpf: string): string {
  const d = normalizeCpf(cpf);
  if (d.length !== 11) return d;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Formats a Brazilian phone number:
 *   - 11 digits → `(XX) X XXXX-XXXX` (mobile)
 *   - 10 digits → `(XX) XXXX-XXXX` (landline)
 *   - anything else → digits only
 */
export function formatTelefone(tel: string): string {
  const d = (tel || "").replace(/\D/g, "");
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return d;
}

/**
 * Formats a Brazilian CEP as `00000-000` if it has 8 digits.
 * Anything else is returned as digits only.
 */
export function formatCep(cep: string): string {
  const d = (cep || "").replace(/\D/g, "");
  if (d.length !== 8) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/**
 * Progressive CEP mask intended for `onChange` handlers. Strips
 * non-digits, caps at 8 digits and inserts the dash as soon as the
 * sixth digit is typed. Examples:
 *   ""        → ""
 *   "0"       → "0"
 *   "01310"   → "01310"
 *   "013109"  → "01310-9"
 *   "01310900"→ "01310-900"
 *   "01310-900extra" → "01310-900"  (extra digits/chars discarded)
 */
export function formatCepProgressive(cep: string): string {
  const d = (cep || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

interface ApiAgendamento {
  id: number;
  tipo: TipoAgendamento;
  valorNovo: string;
  filialIdNovo: number | null;
  inicio: string;
  fim: string;
  estado: EstadoAgendamento;
  criadoEm: string;
  alvos: {
    colaboradorId: number;
    valorAnterior: string;
    filialIdAnterior: number | null;
    appliedAt: string | null;
    revertedAt: string | null;
  }[];
}

interface DashboardContextValue {
  empresas: Empresa[];
  empresaAtiva: Empresa;
  setEmpresaAtiva: (e: Empresa) => void;

  filiais: Filial[];
  filialAtiva: Filial | null;
  setFilialAtiva: (f: Filial) => void;
  addFilial: (f: Omit<Filial, "id">) => void;
  updateFilial: (f: Filial) => void;
  deleteFilial: (id: number) => void;

  turnos: Turno[];
  addTurno: (t: Omit<Turno, "id">) => void;
  updateTurno: (t: Turno) => void;
  deleteTurno: (id: number) => void;

  grupos: Grupo[];
  addGrupo: (g: Omit<Grupo, "id">) => void;
  updateGrupo: (g: Grupo) => void;
  deleteGrupo: (id: number) => void;

  colaboradores: Colaborador[];
  colaboradoresDaFilial: Colaborador[];
  isCpfDuplicate: (cpf: string, exceptId?: number) => boolean;
  addColaborador: (c: Omit<Colaborador, "id" | "codigo">) => boolean;
  updateColaborador: (c: Colaborador) => void;
  deleteColaborador: (id: number) => void;

  agendamentos: Agendamento[];
  /**
   * Cria um agendamento no servidor. O snapshot do `valorAnterior` de cada alvo
   * é capturado aqui (a partir do colaborador atual) e enviado ao servidor para
   * que o ciclo de aplicar/reverter sobreviva a recarregar a página ou abrir em
   * outro navegador. Retorna o agendamento já com o id atribuído pelo servidor,
   * ou `null` em caso de falha.
   */
  addAgendamento: (a: Omit<Agendamento, "id" | "estado" | "criadoEm">) => Promise<Agendamento | null>;
  cancelAgendamento: (id: number) => Promise<void>;
  /**
   * Updates a still-pending agendamento. Only `inicio`, `fim` and the list of
   * `alvos` (colaboradores afetados) may be changed; tipo/valorNovo/filialIdNovo
   * are intentionally immutable. Returns false if the agendamento doesn't exist,
   * is no longer "pendente", the dates are invalid (fim < inicio) or the alvos
   * list would be empty.
   */
  updateAgendamento: (
    id: number,
    patch: { inicio: string; fim: string; alvos: AgendamentoAlvo[] },
  ) => Promise<boolean>;

  activeCompanyId: number | null;
  nomeEmpresaAtiva: string;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaAtiva, setEmpresaAtiva] = useState<Empresa>({ id: 0, nome: "", valeValue: "8.50" });
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [filialAtiva, setFilialAtiva] = useState<Filial | null>(null);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  let colabSeq = 1;

  const colaboradoresRef = useRef(colaboradores);
  const agendamentosRef  = useRef(agendamentos);
  useEffect(() => { colaboradoresRef.current = colaboradores; }, [colaboradores]);
  useEffect(() => { agendamentosRef.current  = agendamentos;  }, [agendamentos]);

  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    const role = localStorage.getItem("jwt_role");
    if (!token || role === "platform_admin") return;

    const payload = decodeJwt(token);
    if (!payload) return;

    if (typeof payload.entityId !== "number") {
      console.warn("[dashboard] JWT sem entityId — sessão obsoleta, redirecionando para login");
      localStorage.removeItem("jwt_token");
      localStorage.removeItem("jwt_username");
      localStorage.removeItem("jwt_displayname");
      localStorage.removeItem("jwt_role");
      window.location.href = "/login";
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL ?? "";
    const headers = { Authorization: `Bearer ${token}` };

    function handleUnauthorized() {
      localStorage.removeItem("jwt_token");
      localStorage.removeItem("jwt_username");
      localStorage.removeItem("jwt_displayname");
      localStorage.removeItem("jwt_role");
      window.location.href = "/login";
    }

    fetch(`${API_URL}/api/me/company`, { headers })
      .then(res => {
        if (res.status === 401) { handleUnauthorized(); return null; }
        return res.ok ? res.json() : null;
      })
      .then((company: { id: number; name: string; valeValue?: string; vale_value?: string } | null) => {
        if (!company) return;
        const empresa: Empresa = {
          id: company.id,
          nome: company.name,
          valeValue: company.valeValue ?? company.vale_value ?? "8.50",
        };
        setEmpresas([empresa]);
        setEmpresaAtiva(empresa);
      })
      .catch(err => console.error("[dashboard] erro ao carregar empresa:", err));

    interface BranchApi {
      id: number;
      name: string;
      cnpj: string;
      city: string | null;
      state: string | null;
      parentCompanyId: number | null;
      tipo: "matriz" | "filial";
    }
    fetch(`${API_URL}/api/me/branches`, { headers })
      .then(res => {
        if (res.status === 401) { handleUnauthorized(); return null; }
        return res.ok ? res.json() : null;
      })
      .then((branches: BranchApi[] | null) => {
        if (!branches || !Array.isArray(branches)) return;
        const mapped: Filial[] = branches.map(b => ({
          id: b.id,
          empresaId: b.parentCompanyId ?? b.id,
          tipo: b.tipo,
          nome: b.name,
          cidade: b.city ?? "",
          estado: b.state ?? "",
          cnpj: b.cnpj,
        }));
        setFiliais(mapped);
        const matriz = mapped.find(m => m.tipo === "matriz") ?? mapped[0];
        if (matriz) setFilialAtiva(matriz);
      })
      .catch(err => console.error("[dashboard] erro ao carregar filiais:", err));
  }, []);

  const addFilial    = (f: Omit<Filial, "id">) => setFiliais(p => [...p, { ...f, id: Date.now() }]);
  const updateFilial = (f: Filial)              => setFiliais(p => p.map(x => x.id === f.id ? f : x));
  const deleteFilial = (id: number)             => setFiliais(p => p.filter(x => x.id !== id));

  const addTurno    = (t: Omit<Turno, "id">) => setTurnos(p => [...p, { ...t, id: Date.now() }]);
  const updateTurno = (t: Turno)             => setTurnos(p => p.map(x => x.id === t.id ? t : x));
  const deleteTurno = (id: number)           => setTurnos(p => p.filter(x => x.id !== id));

  const addGrupo    = (g: Omit<Grupo, "id">) => setGrupos(p => [...p, { ...g, id: Date.now() }]);
  const updateGrupo = (g: Grupo)             => setGrupos(p => p.map(x => x.id === g.id ? g : x));
  const deleteGrupo = (id: number)           => setGrupos(p => p.filter(x => x.id !== id));

  function isCpfDuplicate(cpf: string, exceptId?: number): boolean {
    const norm = normalizeCpf(cpf);
    if (!norm) return false;
    return colaboradores.some(c => normalizeCpf(c.cpf) === norm && c.id !== exceptId);
  }

  function addColaborador(c: Omit<Colaborador, "id" | "codigo">): boolean {
    if (isCpfDuplicate(c.cpf)) return false;
    const codigo = `COL-${String(colabSeq++).padStart(4, "0")}`;
    const filialId = c.filialId ?? filialAtiva?.id ?? null;
    const local = c.local?.trim() || filialAtiva?.nome || empresaAtiva.nome || "";
    const newId = Date.now() + Math.floor(Math.random() * 1000);
    setColaboradores(p => [...p, { ...c, id: newId, codigo, filialId, local }]);
    return true;
  }
  const updateColaborador = (c: Colaborador) => setColaboradores(p => p.map(x => x.id === c.id ? c : x));
  const deleteColaborador = (id: number)     => setColaboradores(p => p.filter(x => x.id !== id));

  /* ---------------------------- Agendamentos -----------------------------
   * Persistência e source of truth ficam no servidor: tabelas
   * `scheduled_movements` + `scheduled_movement_targets`. Cada target tem
   * dois timestamps autoritativos no banco — `applied_at` e `reverted_at` —
   * que o backend grava em transação quando o agendamento entra em vigor
   * ou termina (cron-on-read em `advanceStatesForCompany`).
   *
   * O cliente projeta esses dois flags **uma vez por transição**:
   *   - quando vê pela primeira vez `applied_at` em um target → aplica
   *     `valorNovo` no colaborador
   *   - quando vê pela primeira vez `reverted_at` em um target → restaura
   *     `valorAnterior`
   * Depois disso, ele lembra da assinatura `appliedAt|revertedAt` que já
   * projetou e não mexe mais — assim, edições manuais posteriores (até
   * mesmo que voltem para o mesmo valor de `valorNovo`) não são clobradas
   * por polls subsequentes vendo um agendamento concluído antigo.
   *
   * Em outro navegador / após reload o Map começa vazio: a primeira
   * leitura projeta o estado final correto (apply + revert se ambos
   * existem) e a partir daí a assinatura é registrada e respeitada.
   */
  const projectedAgendamentoSigsRef = useRef<Map<number, string>>(new Map());

  function reconcileColaboradoresWithAgendamentos(serverAgs: Agendamento[]) {
    let cols = colaboradoresRef.current;
    let mutated = false;
    const projected = projectedAgendamentoSigsRef.current;

    // Ordem determinística: inicio asc, criadoEm asc. Assim, quando vários
    // agendamentos disputam o mesmo campo do mesmo colaborador, o mais
    // recentemente aplicado/revertido vence (last-write-wins por aplicação).
    const sorted = [...serverAgs].sort((a, b) => {
      const di = a.inicio.localeCompare(b.inicio);
      if (di !== 0) return di;
      return a.criadoEm.localeCompare(b.criadoEm);
    });

    for (const ag of sorted) {
      // Cada alvo do mesmo agendamento sempre tem os mesmos timestamps
      // (são gravados juntos no servidor); usamos o primeiro como assinatura.
      const sample = ag.alvos[0];
      if (!sample) continue;
      const sig = `${sample.appliedAt ?? ""}|${sample.revertedAt ?? ""}`;
      if (sig === "|") continue; // pendente, nada a fazer
      if (projected.get(ag.id) === sig) continue; // já projetamos esta transição

      const next = cols.map(c => {
        const alvo = ag.alvos.find(a => a.colaboradorId === c.id);
        if (!alvo || !alvo.appliedAt) return c;
        if (!alvo.revertedAt) {
          // Primeira vez que vemos applied_at sem reverted_at → aplica valorNovo.
          if (ag.tipo === "turno"  && c.turno  !== ag.valorNovo)
            return { ...c, turno: ag.valorNovo };
          if (ag.tipo === "status" && c.status !== (ag.valorNovo as Status))
            return { ...c, status: ag.valorNovo as Status };
          if (ag.tipo === "filial" && (c.local !== ag.valorNovo || c.filialId !== (ag.filialIdNovo ?? null)))
            return { ...c, local: ag.valorNovo, filialId: ag.filialIdNovo ?? null };
          return c;
        }
        // Primeira vez que vemos reverted_at → restaura valorAnterior.
        // Só sobrescreve se o valor atual ainda é o valorNovo (evita pisar
        // edições manuais feitas entre apply e revert).
        if (ag.tipo === "turno"  && c.turno  === ag.valorNovo)
          return { ...c, turno: alvo.valorAnterior };
        if (ag.tipo === "status" && c.status === (ag.valorNovo as Status))
          return { ...c, status: alvo.valorAnterior as Status };
        if (ag.tipo === "filial" && c.local  === ag.valorNovo)
          return { ...c, local: alvo.valorAnterior, filialId: alvo.filialIdAnterior ?? null };
        return c;
      });
      if (next !== cols) {
        for (let i = 0; i < cols.length; i++) {
          if (next[i] !== cols[i]) { mutated = true; break; }
        }
        cols = next;
      }
      projected.set(ag.id, sig);
    }

    // Limpa assinaturas de agendamentos que sumiram (ex.: pendente cancelado).
    const serverIds = new Set(serverAgs.map(a => a.id));
    for (const id of [...projected.keys()]) {
      if (!serverIds.has(id)) projected.delete(id);
    }

    if (mutated) setColaboradores(cols);
  }

  function mapApiAgendamento(a: ApiAgendamento): Agendamento {
    return {
      id: a.id,
      tipo: a.tipo,
      valorNovo: a.valorNovo,
      filialIdNovo: a.filialIdNovo,
      inicio: a.inicio,
      fim: a.fim,
      alvos: a.alvos.map(t => ({
        colaboradorId: t.colaboradorId,
        valorAnterior: t.valorAnterior,
        filialIdAnterior: t.filialIdAnterior,
        appliedAt: t.appliedAt,
        revertedAt: t.revertedAt,
      })),
      estado: a.estado,
      criadoEm: a.criadoEm,
    };
  }

  function getAuthHeaders(): { Authorization: string } | null {
    const token = localStorage.getItem("jwt_token");
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  }

  async function fetchAgendamentos(): Promise<void> {
    const headers = getAuthHeaders();
    if (!headers) return;
    const role = localStorage.getItem("jwt_role");
    if (role === "platform_admin") return;
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(`${API_URL}/api/me/scheduled-movements`, { headers });
      if (!res.ok) return;
      const data = (await res.json()) as ApiAgendamento[];
      const list = data.map(mapApiAgendamento);
      setAgendamentos(list);
      reconcileColaboradoresWithAgendamentos(list);
    } catch (err) {
      console.error("[dashboard] erro ao carregar agendamentos:", err);
    }
  }

  useEffect(() => {
    fetchAgendamentos();
    const interval = window.setInterval(fetchAgendamentos, 60_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addAgendamento(a: Omit<Agendamento, "id" | "estado" | "criadoEm">): Promise<Agendamento | null> {
    const headers = getAuthHeaders();
    if (!headers) return null;

    // Captura snapshot do valor atual de cada colaborador para enviar ao
    // servidor — assim a reversão funciona mesmo se o app for fechado.
    const colsAtuais = colaboradoresRef.current;
    const alvosComSnapshot: AgendamentoAlvo[] = a.alvos.map(alvo => {
      const c = colsAtuais.find(x => x.id === alvo.colaboradorId);
      if (!c) return { ...alvo, valorAnterior: alvo.valorAnterior ?? "" };
      if (a.tipo === "turno")  return { ...alvo, valorAnterior: c.turno };
      if (a.tipo === "status") return { ...alvo, valorAnterior: c.status };
      return { ...alvo, valorAnterior: c.local, filialIdAnterior: c.filialId };
    });

    try {
      const API_URL = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(`${API_URL}/api/me/scheduled-movements`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: a.tipo,
          valorNovo: a.valorNovo,
          filialIdNovo: a.filialIdNovo ?? null,
          inicio: a.inicio,
          fim: a.fim,
          alvos: alvosComSnapshot,
        }),
      });
      if (!res.ok) return null;
      const created = (await res.json()) as ApiAgendamento | null;
      // Recarrega lista para já refletir transições imediatas (ex.: hoje em janela).
      await fetchAgendamentos();
      return created ? mapApiAgendamento(created) : null;
    } catch (err) {
      console.error("[dashboard] erro ao criar agendamento:", err);
      return null;
    }
  }

  async function updateAgendamento(
    id: number,
    patch: { inicio: string; fim: string; alvos: AgendamentoAlvo[] },
  ): Promise<boolean> {
    if (!patch.inicio || !patch.fim) return false;
    if (patch.fim < patch.inicio) return false;
    if (!patch.alvos || patch.alvos.length === 0) return false;
    const ag = agendamentosRef.current.find(a => a.id === id);
    if (!ag || ag.estado !== "pendente") return false;

    // Para alvos novos (sem snapshot ainda), captura do colaborador atual.
    const colsAtuais = colaboradoresRef.current;
    const alvosComSnapshot: AgendamentoAlvo[] = patch.alvos.map(alvo => {
      if (alvo.valorAnterior) return alvo;
      const c = colsAtuais.find(x => x.id === alvo.colaboradorId);
      if (!c) return alvo;
      if (ag.tipo === "turno")  return { ...alvo, valorAnterior: c.turno };
      if (ag.tipo === "status") return { ...alvo, valorAnterior: c.status };
      return { ...alvo, valorAnterior: c.local, filialIdAnterior: c.filialId };
    });

    const headers = getAuthHeaders();
    if (!headers) return false;
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(`${API_URL}/api/me/scheduled-movements/${id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          inicio: patch.inicio,
          fim: patch.fim,
          alvos: alvosComSnapshot,
        }),
      });
      if (!res.ok) return false;
      await fetchAgendamentos();
      return true;
    } catch (err) {
      console.error("[dashboard] erro ao atualizar agendamento:", err);
      return false;
    }
  }

  async function cancelAgendamento(id: number): Promise<void> {
    const ag = agendamentosRef.current.find(a => a.id === id);
    if (!ag) return;
    const headers = getAuthHeaders();
    if (!headers) return;

    // Para responsividade: se for pendente, some já da lista (servidor vai
    // deletar a linha). Para ativo/concluido o servidor é quem manda — vamos
    // reler logo a seguir e o `reconcile` projetará o `revertedAt` no estado.
    if (ag.estado === "pendente") {
      setAgendamentos(p => p.filter(a => a.id !== id));
    }

    try {
      const API_URL = import.meta.env.VITE_API_URL ?? "";
      await fetch(`${API_URL}/api/me/scheduled-movements/${id}`, {
        method: "DELETE",
        headers,
      });
    } catch (err) {
      console.error("[dashboard] erro ao cancelar agendamento:", err);
    } finally {
      await fetchAgendamentos();
    }
  }

  /* ----------------------------------------------------------------------- */

  const activeCompanyId = filialAtiva?.id ?? empresaAtiva.id ?? null;
  const nomeEmpresaAtiva = filialAtiva?.nome ?? empresaAtiva.nome ?? "";
  const colaboradoresDaFilial = filialAtiva
    ? colaboradores.filter(c => c.filialId === filialAtiva.id)
    : colaboradores;

  return (
    <DashboardContext.Provider value={{
      empresas, empresaAtiva, setEmpresaAtiva,
      filiais, filialAtiva, setFilialAtiva, addFilial, updateFilial, deleteFilial,
      turnos, addTurno, updateTurno, deleteTurno,
      grupos, addGrupo, updateGrupo, deleteGrupo,
      colaboradores, colaboradoresDaFilial, isCpfDuplicate, addColaborador, updateColaborador, deleteColaborador,
      agendamentos, addAgendamento, cancelAgendamento, updateAgendamento,
      activeCompanyId, nomeEmpresaAtiva,
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be inside DashboardProvider");
  return ctx;
}
