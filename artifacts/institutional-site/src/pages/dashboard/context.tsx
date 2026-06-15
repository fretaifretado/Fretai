import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { usePurchaseOrderAutomation } from "./purchaseAutomation";
 
export type Status = "Ativo" | "Home Office" | "Férias" | "Licença" | "Afastado" | "Desligado" | "Admissão";

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
  addTurno: (t: Omit<Turno, "id">) => Promise<void>;
  updateTurno: (t: Turno) => Promise<void>;
  deleteTurno: (id: number) => Promise<void>;

  grupos: Grupo[];
  addGrupo: (g: Omit<Grupo, "id">) => void;
  updateGrupo: (g: Grupo) => void;
  deleteGrupo: (id: number) => void;

  colaboradores: Colaborador[];
  colaboradoresDaFilial: Colaborador[];
  isCpfDuplicate: (cpf: string, exceptId?: number) => boolean;
  addColaborador: (c: Omit<Colaborador, "id" | "codigo">) => boolean;
  addColaboradorLocal: (items: { c: Omit<Colaborador, "id" | "codigo">; id: number }[]) => void;
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
  const [jwtToken, setJwtToken] = useState<string | null>(() => localStorage.getItem("jwt_token"));
  let colabSeq = 1;

  const colaboradoresRef = useRef(colaboradores);
  const agendamentosRef  = useRef(agendamentos);

  // Detecta troca de usuário (novo login) observando mudanças no jwt_token.
  // Quando o token muda, reseta todo o estado e recarrega os dados da nova empresa.
  useEffect(() => {
    function checkToken() {
      const current = localStorage.getItem("jwt_token");
      setJwtToken(prev => (prev !== current ? current : prev));
    }
    window.addEventListener("storage", checkToken);
    // Poll a cada segundo para detectar login na mesma aba
    const interval = window.setInterval(checkToken, 1000);
    return () => {
      window.removeEventListener("storage", checkToken);
      window.clearInterval(interval);
    };
  }, []);
  useEffect(() => { colaboradoresRef.current = colaboradores; }, [colaboradores]);
  useEffect(() => { agendamentosRef.current  = agendamentos;  }, [agendamentos]);

  useEffect(() => {
    // Reseta estado quando o token muda (troca de usuário/empresa)
    setEmpresas([]);
    setEmpresaAtiva({ id: 0, nome: "", valeValue: "8.50" });
    setFiliais([]);
    setFilialAtiva(null);
    setTurnos([]);
    setColaboradores([]);
    setAgendamentos([]);

    const token = jwtToken;
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
      localStorage.removeItem("jwt_user_id");
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
      localStorage.removeItem("jwt_user_id");
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

    async function loadData() {
      let loadedFiliais: Filial[] = [];
      try {
        const brRes = await fetch(`${API_URL}/api/me/branches`, { headers });
        if (brRes.status === 401) { handleUnauthorized(); return; }
        if (brRes.ok) {
          const branches: BranchApi[] = await brRes.json();
          const mapped: Filial[] = branches.map(b => ({
            id: b.id,
            empresaId: b.parentCompanyId ?? b.id,
            tipo: b.tipo,
            nome: b.name,
            cidade: b.city ?? "",
            estado: b.state ?? "",
            cnpj: b.cnpj,
          }));
          loadedFiliais = mapped;
          setFiliais(mapped);
          const matriz = mapped.find(m => m.tipo === "matriz") ?? mapped[0];
          if (matriz) setFilialAtiva(matriz);
        }
      } catch (err) { console.error("[dashboard] erro ao carregar filiais:", err); }

      try {
        const empRes = await fetch(`${API_URL}/api/me/employees`, { headers });
        if (empRes.status === 401) { handleUnauthorized(); return; }
        if (empRes.ok) {
          const employees: Record<string, unknown>[] = await empRes.json();
          setColaboradores(employees.map(e => apiToColab(e, loadedFiliais)));
        }
      } catch (err) { console.error("[dashboard] erro ao carregar colaboradores:", err); }

      try {
        const shiftsRes = await fetch(`${API_URL}/api/me/shifts`, { headers });
        if (shiftsRes.ok) {
          const shiftsData = await shiftsRes.json() as Array<{
            id: number; nome: string; entrada: string; saida: string;
            escala: string; tipoEscala: string;
          }>;
          setTurnos(shiftsData.map(s => ({
            id: s.id,
            nome: s.nome,
            entrada: s.entrada,
            saida: s.saida,
            escala: s.escala ?? "",
            tipoEscala: s.tipoEscala ?? "",
            colaboradores: 0,
          })));
        }
      } catch (err) { console.error("[dashboard] erro ao carregar turnos:", err); }
    }

    void loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwtToken]);

  const addFilial    = (f: Omit<Filial, "id">) => setFiliais(p => [...p, { ...f, id: Date.now() }]);
  const updateFilial = (f: Filial)              => setFiliais(p => p.map(x => x.id === f.id ? f : x));
  const deleteFilial = (id: number)             => setFiliais(p => p.filter(x => x.id !== id));

  async function addTurno(t: Omit<Turno, "id">) {
    const token = getToken();
    if (!token) {
      setTurnos(p => [...p, { ...t, id: Date.now() }]);
      return;
    }
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(`${API_URL}/api/me/shifts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ nome: t.nome, entrada: t.entrada, saida: t.saida, escala: t.escala, tipoEscala: t.tipoEscala }),
      });
      if (res.ok) {
        const saved = await res.json() as { id: number; nome: string; entrada: string; saida: string; escala: string; tipoEscala: string };
        setTurnos(p => [...p, { ...t, id: saved.id }]);
      }
    } catch (err) {
      console.error("[dashboard] erro ao criar turno:", err);
    }
  }

  async function updateTurno(t: Turno) {
    setTurnos(p => p.map(x => x.id === t.id ? t : x));
    const token = getToken();
    if (!token) return;
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? "";
      await fetch(`${API_URL}/api/me/shifts/${t.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ nome: t.nome, entrada: t.entrada, saida: t.saida, escala: t.escala, tipoEscala: t.tipoEscala }),
      });
    } catch (err) {
      console.error("[dashboard] erro ao atualizar turno:", err);
    }
  }

  async function deleteTurno(id: number) {
    setTurnos(p => p.filter(x => x.id !== id));
    const token = getToken();
    if (!token) return;
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? "";
      await fetch(`${API_URL}/api/me/shifts/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error("[dashboard] erro ao excluir turno:", err);
    }
  }

  const addGrupo    = (g: Omit<Grupo, "id">) => setGrupos(p => [...p, { ...g, id: Date.now() }]);
  const updateGrupo = (g: Grupo)             => setGrupos(p => p.map(x => x.id === g.id ? g : x));
  const deleteGrupo = (id: number)           => setGrupos(p => p.filter(x => x.id !== id));

  function isCpfDuplicate(cpf: string, exceptId?: number): boolean {
    const norm = normalizeCpf(cpf);
    if (!norm) return false;
    const companyId = filialAtiva?.id ?? getEntityId();
    // Verifica se o CPF já existe na empresa/filial atual
    return colaboradores.some(c => 
      normalizeCpf(c.cpf) === norm && 
      c.id !== exceptId && 
      c.filialId === companyId
    );
  }

  function getToken(): string | null { return localStorage.getItem("jwt_token"); }
  function getEntityId(): number | null {
    const token = getToken();
    if (!token) return null;
    const payload = decodeJwt(token);
    return typeof payload?.entityId === "number" ? payload.entityId : null;
  }

  /** Converts dd/mm/yyyy (frontend format) to yyyy-mm-dd (ISO, required by the API/DB).
   *  Passes through values already in ISO format or returns today as fallback. */
  /** yyyy-mm-dd (banco) → dd/mm/yyyy (exibição no app). */
  function isoToDisplay(raw: string | null | undefined): string {
    if (!raw) return "";
    const s = String(raw).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    // Se já estiver no formato dd/mm/yyyy ou dd/mm/yy, retorna como está
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return s;
    return s;
  }

  /** dd/mm/yyyy → yyyy-mm-dd para enviar ao banco. Retorna null se vazio/inválido. */
  function toIsoDate(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const dmY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (dmY) {
      let d = dmY[1].padStart(2,"0"), m = dmY[2].padStart(2,"0"), y = Number(dmY[3]);
      if (y < 100) y += (y > 50 ? 1900 : 2000);
      return `${y}-${m}-${d}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return null;
  }

  /** toIsoDate com fallback para hoje — apenas para campos NOT NULL no banco. */
  function toIsoDateOrToday(raw: string | null | undefined): string {
    return toIsoDate(raw) ?? new Date().toISOString().slice(0, 10);
  }

  function colabToApiBody(c: Omit<Colaborador, "id" | "codigo">, codigo: string, companyId: number) {
    return {
      name: c.nome,
      cpf: normalizeCpf(c.cpf),
      matricula: c.matricula || "000000",
      admissionDate: toIsoDateOrToday(c.inicioOperacao),
      route: c.turno && c.turno !== "—" ? c.turno : null,
      status: c.status,
      email: c.email || null,
      phone: c.telefone ? c.telefone.replace(/\D/g, "") : null,
      birthDate: c.dataNascimento || c.nascimento || null,
      address: c.endereco || null,
      addressNumber: c.numero || null,
      addressComplement: c.complemento || null,
      neighborhood: c.bairro || null,
      city: c.cidade || null,
      state: c.estado || null,
      zipCode: c.cep ? c.cep.replace(/\D/g, "") : null,
      shiftStart: c.horarioEntrada || null,
      shiftEnd: c.horarioSaida || null,
      operationStart: c.inicioOperacao ? toIsoDate(c.inicioOperacao) : null,
      valeValue: c.vale && c.vale !== "—" ? c.vale : null,
      codigo,
      grupoId: c.grupoId ? String(c.grupoId) : null,
    };
  }

  function apiToColab(e: Record<string, unknown>, filiais: Filial[]): Colaborador {
    const companyId = e.companyId as number;
    const filial = filiais.find(f => f.id === companyId) ?? null;
    return {
      id: e.id as number,
      nome: (e.name as string) ?? "",
      cpf: formatCpf((e.cpf as string) ?? ""),
      email: (e.email as string) ?? "",
      telefone: formatTelefone((e.phone as string) ?? ""),
      nascimento: (e.birthDate as string) ?? "",
      matricula: (e.matricula as string) ?? "",
      dataNascimento: (e.birthDate as string) ?? "",
      codigo: (e.codigo as string) ?? `COL-${String(e.id).padStart(4, "0")}`,
      status: ((e.status as string) ?? "Ativo") as Status,
      turno: (e.turno as string) ?? "—",
      local: filial?.nome ?? "",
      filialId: companyId,
      endereco: (e.address as string) ?? "",
      numero: (e.addressNumber as string) ?? "",
      complemento: (e.addressComplement as string) ?? "",
      bairro: (e.neighborhood as string) ?? "",
      cidade: (e.city as string) ?? "",
      estado: (e.state as string) ?? "",
      cep: formatCep((e.zipCode as string) ?? ""),
      horarioEntrada: (e.shiftStart as string) ?? "",
      horarioSaida: (e.shiftEnd as string) ?? "",
      inicioOperacao: isoToDisplay((e.admissionDate as string) ?? ""),
      vale: (e.valeValue as string) ?? "—",
      grupoId: (e.grupoId as number | null) ?? null,
    };
  }

  function addColaborador(c: Omit<Colaborador, "id" | "codigo">): boolean {
    if (isCpfDuplicate(c.cpf)) return false;
    const codigo = `COL-${String(colabSeq++).padStart(4, "0")}`;
    const filialId = c.filialId ?? filialAtiva?.id ?? null;
    const local = c.local?.trim() || filialAtiva?.nome || empresaAtiva.nome || "";
    const tempId = Date.now() + Math.floor(Math.random() * 1000);
    const newColab: Colaborador = { ...c, id: tempId, codigo, filialId, local };
    setColaboradores(p => [...p, newColab]);

    const token = getToken();
    const companyId = filialId ?? getEntityId();
    if (token && companyId) {
      const API_URL = import.meta.env.VITE_API_URL ?? "";
      fetch(`${API_URL}/api/companies/${companyId}/employees`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(colabToApiBody(c, codigo, companyId)),
      })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then((saved: Record<string, unknown>) => {
          if (saved?.id) {
            // Substitui o ID temporário pelo ID real persistido no banco
            setColaboradores(p => p.map(x => x.id === tempId ? { ...x, id: saved.id as number } : x));
          }
        })
        .catch((err) => {
          console.error("[dashboard] erro ao salvar colaborador, revertendo estado local:", err);
          // Remove o registro temporário — ele não foi salvo no banco
          setColaboradores(p => p.filter(x => x.id !== tempId));
        });
    }
    return true;
  }

  /** Insere colaboradores no estado local em lote, sem chamar a API.
   *  Evita o POST duplicado que ocorre quando addColaborador é chamado após batch bem-sucedido. */
  function addColaboradorLocal(items: { c: Omit<Colaborador, "id" | "codigo">; id: number }[]): void {
    setColaboradores(prev => {
      const existingCpfs = new Set(prev.map(x => x.cpf.replace(/\D/g, "")));
      const novos: Colaborador[] = [];
      for (const { c, id } of items) {
        const cpfClean = c.cpf.replace(/\D/g, "");
        if (existingCpfs.has(cpfClean)) continue;
        existingCpfs.add(cpfClean);
        const codigo = `COL-${String(id).padStart(4, "0")}`;
        const filialId = c.filialId ?? filialAtiva?.id ?? null;
        const local = c.local?.trim() || filialAtiva?.nome || empresaAtiva.nome || "";
        novos.push({ ...c, id, codigo, filialId, local });
      }
      return novos.length > 0 ? [...prev, ...novos] : prev;
    });
  }

  const updateColaborador = (c: Colaborador) => {
    // Guarda o estado anterior para poder reverter em caso de falha da API
    const previous = colaboradoresRef.current.find(x => x.id === c.id);
    setColaboradores(p => p.map(x => x.id === c.id ? c : x));
    const token = getToken();
    const companyId = c.filialId ?? getEntityId();
    if (token && companyId) {
      const API_URL = import.meta.env.VITE_API_URL ?? "";
      const body: Record<string, unknown> = {
        name: c.nome,
        matricula: c.matricula || "000000",
        route: c.turno && c.turno !== "—" ? c.turno : null,
        status: c.status,
        email: c.email || null,
        phone: c.telefone ? c.telefone.replace(/\D/g, "") : null,
        birthDate: c.dataNascimento || c.nascimento || null,
        address: c.endereco || null,
        addressNumber: c.numero || null,
        addressComplement: c.complemento || null,
        neighborhood: c.bairro || null,
        city: c.cidade || null,
        state: c.estado || null,
        zipCode: c.cep ? c.cep.replace(/\D/g, "") : null,
        shiftStart: c.horarioEntrada || null,
        shiftEnd: c.horarioSaida || null,
        operationStart: c.inicioOperacao ? toIsoDate(c.inicioOperacao) : null,
        valeValue: c.vale && c.vale !== "—" ? c.vale : null,
        codigo: c.codigo,
        grupoId: c.grupoId ? String(c.grupoId) : null,
      };
      fetch(`${API_URL}/api/companies/${companyId}/employees/${c.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
        .catch((err) => {
          console.error("[dashboard] erro ao atualizar colaborador, revertendo estado local:", err);
          // Restaura o estado anterior se a API falhou
          if (previous) setColaboradores(p => p.map(x => x.id === c.id ? previous : x));
        });
    }
  };

  const deleteColaborador = (id: number) => {
    const c = colaboradoresRef.current.find(x => x.id === id);
    setColaboradores(p => p.filter(x => x.id !== id));
    const token = getToken();
    const companyId = c?.filialId ?? getEntityId();
    if (token && companyId) {
      const API_URL = import.meta.env.VITE_API_URL ?? "";
      fetch(`${API_URL}/api/companies/${companyId}/employees/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
        .catch((err) => {
          console.error("[dashboard] erro ao excluir colaborador, revertendo estado local:", err);
          // Restaura o colaborador removido se a API falhou
          if (c) setColaboradores(p => [...p, c].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
        });
    }
  };

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
      // Auto-purge: remove concluídos com mais de 1 mês
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const purged = list.filter(ag => {
        if (ag.estado !== "concluido") return true;
        const fim = new Date(ag.fim + "T00:00:00");
        return fim >= oneMonthAgo; // keep if concluded less than 1 month ago
      });
      setAgendamentos(purged);
      reconcileColaboradoresWithAgendamentos(purged);
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

  usePurchaseOrderAutomation({
    colaboradores,
    empresas,
    empresaAtiva,
    filiais,
    turnos,
    enabled: !!jwtToken && localStorage.getItem("jwt_role") !== "platform_admin",
  });

  return (
    <DashboardContext.Provider value={{
      empresas, empresaAtiva, setEmpresaAtiva,
      filiais, filialAtiva, setFilialAtiva, addFilial, updateFilial, deleteFilial,
      turnos, addTurno, updateTurno, deleteTurno,
      grupos, addGrupo, updateGrupo, deleteGrupo,
      colaboradores, colaboradoresDaFilial, isCpfDuplicate, addColaborador, addColaboradorLocal, updateColaborador, deleteColaborador,
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
