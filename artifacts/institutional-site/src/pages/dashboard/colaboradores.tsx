import { useState, useRef, useEffect, useCallback } from "react";
import DashboardLayout from "./layout";
import {
  useDashboard,
  normalizeCpf,
  formatCpf,
  formatTelefone,
  formatCep,
  formatCepProgressive,
  type Colaborador,
  type Status,
} from "./context";
import { Search, Pencil, X, Check, AlertCircle, Upload, Download, FileSpreadsheet, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lookupCep } from "@/lib/viacep";

type XlsxModule = {
  read: (data: ArrayBuffer, opts: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: {
    sheet_to_json: <T = Record<string, unknown>>(sheet: unknown, opts?: { defval?: unknown; raw?: boolean }) => T[];
    json_to_sheet: (data: unknown[]) => unknown;
    book_new: () => unknown;
    book_append_sheet: (book: unknown, sheet: unknown, name: string) => void;
  };
  write: (book: unknown, opts: { bookType: string; type: string }) => ArrayBuffer;
};

let xlsxPromise: Promise<XlsxModule> | null = null;
function loadXlsx(): Promise<XlsxModule> {
  if (!xlsxPromise) {
    xlsxPromise = import(/* @vite-ignore */ "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs") as Promise<XlsxModule>;
  }
  return xlsxPromise;
}

const TEMPLATE_HEADERS = [
  "Nome", "CPF", "Matrícula", "Data de Nascimento", "Telefone",
  "Cidade", "Estado", "Endereço", "Nº", "Complemento", "CEP", "Bairro",
  "Turno", "Início da operação",
];
const TEMPLATE_EXAMPLE: Record<string, string> = {
  "Nome":                "Nome do colaborador",
  "CPF":                 "111.111.111-11",
  "Matrícula":           "000001",
  "Data de Nascimento":  "01/01/1990",
  "Telefone":            "(34) 9 8923-2839",
  "Cidade":              "São Paulo",
  "Estado":              "SP",
  "Endereço":            "Rua y",
  "Nº":                  "8888",
  "Complemento":         "",
  "CEP":                 "",
  "Bairro":              "Nome do bairro",
  "Turno":               "06:00/14:00 SEG/SAB",
  "Início da operação":  "10/04/2026",
};

/**
 * Strips diacritics, lowercases and trims a header so columns like
 * "Horário entrada", "horario entrada", "HORARIO ENTRADA" all map to
 * the same canonical key.
 */
function normalizeHeader(h: string): string {
  return (h || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Canonical key for turno-name comparison/dedup. Lowercases and collapses
 * any sequence of whitespace (including internal runs and tabs/newlines)
 * to nothing, so variants like "Manhã", " MANHÃ ", "Ma nhã " and
 * "Manhã\t" all map to the same key.
 */
function normalizeTurnoKey(name: string): string {
  return (name || "").toLowerCase().replace(/\s+/g, "");
}

const DIAS_ORDEM = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"] as const;

function tipoEscalaFromDias(diasStr: string): string {
  const parts = diasStr.toUpperCase().split("/");
  if (parts.length !== 2) return "";
  const fromIdx = DIAS_ORDEM.indexOf(parts[0] as typeof DIAS_ORDEM[number]);
  const toIdx   = DIAS_ORDEM.indexOf(parts[1] as typeof DIAS_ORDEM[number]);
  if (fromIdx < 0 || toIdx < 0) return "";
  const count = toIdx >= fromIdx ? toIdx - fromIdx + 1 : (7 - fromIdx) + toIdx + 1;
  if (count === 5) return "5x2";
  if (count === 6) return "6x1";
  if (count === 7) return "7x0";
  return "";
}

function autoNomeTurno(entrada: string, saida: string): string {
  const k = `${entrada}/${saida}`;
  if (k === "06:00/14:00") return "Primeiro turno";
  if (k === "14:00/22:00") return "Segundo turno";
  if (k === "22:00/06:00") return "Terceiro turno";
  if (k === "08:00/17:30") return "ADM";
  return "Turno extra";
}

interface ParsedTurno {
  nome: string;
  entrada: string;
  saida: string;
  escala: string;
  tipoEscala: string;
  isCombined: boolean;
}

/**
 * Parses the new combined "Turno" column format:
 * - "HH:MM/HH:MM DIA/DIA"  → extracts entrada, saida, escala and derives nome + tipoEscala
 * - "HH:MM/HH:MM"           → extracts entrada/saida, derives nome
 * - "12x36" / "24x48"       → rotative schedule shortcuts
 * - Anything else            → treated as an old-format plain turno name (backward compat)
 */
function parseTurnoCombinado(val: string): ParsedTurno {
  const v = val.trim();
  if (!v) return { nome: "", entrada: "", saida: "", escala: "", tipoEscala: "", isCombined: false };

  if (/^12x36$/i.test(v)) return { nome: "12x36", entrada: "", saida: "", escala: "", tipoEscala: "12x36", isCombined: true };
  if (/^24x48$/i.test(v)) return { nome: "24x48", entrada: "", saida: "", escala: "", tipoEscala: "24x48", isCombined: true };

  const matchFull = v.match(/^(\d{1,2}:\d{2})\/(\d{1,2}:\d{2})\s+([A-Za-z]{3}\/[A-Za-z]{3})$/);
  if (matchFull) {
    const entrada    = matchFull[1]!.padStart(5, "0");
    const saida      = matchFull[2]!.padStart(5, "0");
    const diasStr    = matchFull[3]!.toUpperCase();
    const tipoEscala = tipoEscalaFromDias(diasStr);
    return { nome: autoNomeTurno(entrada, saida), entrada, saida, escala: diasStr, tipoEscala, isCombined: true };
  }

  const matchShort = v.match(/^(\d{1,2}:\d{2})\/(\d{1,2}:\d{2})$/);
  if (matchShort) {
    const entrada = matchShort[1]!.padStart(5, "0");
    const saida   = matchShort[2]!.padStart(5, "0");
    return { nome: autoNomeTurno(entrada, saida), entrada, saida, escala: "", tipoEscala: "", isCombined: true };
  }

  return { nome: v, entrada: "", saida: "", escala: "", tipoEscala: "", isCombined: false };
}

/**
 * Resolves a row's value by trying multiple header aliases. Each alias
 * is normalized the same way as the row's keys for a robust match.
 */
function pick(row: Record<string, string>, ...aliases: string[]): string {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    const v = row[key];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

function downloadBlob(buffer: ArrayBuffer | Blob, filename: string, mime: string) {
  const blob = buffer instanceof Blob ? buffer : new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  const sep = (lines[0] ?? "").includes(";") ? ";" : ",";
  const splitRow = (row: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"') {
        if (inQuotes && row[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === sep && !inQuotes) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const headers = splitRow(lines[0] ?? "").map(normalizeHeader);
  return lines.slice(1).map(l => {
    const cells = splitRow(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

const STATUS_STYLES: Record<Status, string> = {
  "Ativo":     "bg-green-100 text-green-700 border-green-200",
  "Inativo":   "bg-gray-100 text-gray-600 border-gray-200",
  "Férias":    "bg-blue-100 text-blue-700 border-blue-200",
  "Licença":   "bg-yellow-100 text-yellow-700 border-yellow-200",
  "Afastado":  "bg-orange-100 text-orange-700 border-orange-200",
  "Desligado": "bg-red-100 text-red-700 border-red-200",
};
const STATUSES: Status[] = ["Ativo", "Inativo", "Férias", "Licença", "Afastado", "Desligado"];

interface TurnoDetectado {
  nome: string;
  entrada: string;
  saida: string;
  count: number;
  isNew: boolean;
  /** id of the matching turno in the Turnos menu, when it already existed. */
  existingId?: number;
  /** Horários currently saved in the Turnos menu for this turno. */
  existingEntrada?: string;
  existingSaida?: string;
  /**
   * True only when both the existing turno and the spreadsheet rows have a
   * non-empty entrada/saida AND they differ. Surfaces a divergence the user
   * may want to reconcile.
   */
  mismatch?: boolean;
  /** True after the user clicked "Atualizar horários" on this row. */
  overwritten?: boolean;
}

/**
 * Spreadsheet-level conflict: the same turno name appears in multiple rows
 * with different entrada/saida combinations. We block the import until the
 * user confirms, since proceeding would silently keep only the first
 * horário seen and discard the rest.
 */
interface TurnoConflict {
  nome: string;
  variants: Array<{ entrada: string; saida: string; count: number }>;
}

/**
 * Snapshot of an in-progress import that has been parsed but not yet
 * persisted. Stored in state while the duplicate-shift confirmation modal
 * is open, so we can apply or discard it based on the user's choice.
 */
type ColaboradorImportPayload = Omit<Colaborador, "id" | "codigo">;

interface TurnoAggEntry {
  nome: string;
  entrada: string;
  saida: string;
  escala: string;
  tipoEscala: string;
  count: number;
}

interface PendingImport {
  /** Each pending colaborador, ready to be passed to `addColaborador`. */
  actions: ColaboradorImportPayload[];
  /** Aggregated turnos to surface in the result panel and create as needed. */
  turnoAgg: Map<string, TurnoAggEntry>;
  /** Rows whose nome was missing — already counted as skipped. */
  skipped: number;
  /** Conflicts detected during parsing. */
  conflicts: TurnoConflict[];
}

const API_URL = import.meta.env.VITE_API_URL ?? "";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("jwt_token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export default function ColaboradoresPage() {
  const { colaboradoresDaFilial: colaboradores, colaboradores: todosColaboradores, addColaborador, updateColaborador, deleteColaborador, turnos, addTurno, updateTurno, filiais, filialAtiva, nomeEmpresaAtiva } = useDashboard();
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState<Status | "Todos">("Todos");

  /** employeeId → vales do período mais recente com pedido aprovado */
  const [valesMap, setValesMap] = useState<Map<number, number>>(new Map());

  const fetchVales = useCallback(async (companyId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/me/purchase-orders?companyId=${companyId}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json() as {
        employeeId: number | null;
        vales: number;
        status: string;
      }[];
      const map = new Map<number, number>();
      for (const o of data) {
        if (o.employeeId && o.status !== "Cancelado") {
          const prev = map.get(o.employeeId) ?? 0;
          map.set(o.employeeId, prev + o.vales);
        }
      }
      setValesMap(map);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    const cid = filialAtiva?.id;
    if (cid) void fetchVales(cid);
    else setValesMap(new Map());
  }, [filialAtiva?.id, fetchVales]);

  const [editing, setEditing] = useState<Colaborador | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [formError, setFormError] = useState("");

  /* import modal state */
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState<{
    ok: number;
    skipped: number;
    turnosDetectados: TurnoDetectado[];
  } | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleDownloadTemplate() {
    try {
      const XLSX = await loadXlsx();
      const sheet = XLSX.utils.json_to_sheet([TEMPLATE_EXAMPLE], { header: TEMPLATE_HEADERS } as never);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Colaboradores");
      const buf = XLSX.write(book, { bookType: "xlsx", type: "array" });
      downloadBlob(buf, "modelo-colaboradores.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch {
      const csv = [TEMPLATE_HEADERS.join(","), TEMPLATE_HEADERS.map(h => TEMPLATE_EXAMPLE[h] ?? "").join(",")].join("\n");
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "modelo-colaboradores.csv", "text/csv");
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setImportError("");
    setImportResult(null);
    setPendingImport(null);
    try {
      let rows: Record<string, string>[] = [];
      const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
      if (isCsv) {
        rows = parseCsv(await file.text());
      } else {
        const XLSX = await loadXlsx();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const firstSheetName = wb.SheetNames[0];
        if (!firstSheetName) throw new Error("Planilha vazia");
        const sheet = wb.Sheets[firstSheetName];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
        rows = raw.map(r => {
          const out: Record<string, string> = {};
          Object.keys(r).forEach(k => { out[normalizeHeader(k)] = String(r[k] ?? "").trim(); });
          return out;
        });
      }

      let skipped = 0;
      const existingCpfs = new Set(
        todosColaboradores.map(c => normalizeCpf(c.cpf)).filter(Boolean)
      );
      const batchCpfs = new Set<string>();

      // Aggregate distinct turnos found in the spreadsheet so we can both
      // surface them in the result panel and create any missing ones in
      // the Turnos menu. Keyed by the lowercased+trimmed turno name to
      // dedupe variants like "Manhã" / "MANHÃ "/" manhã".
      const turnoAgg = new Map<string, TurnoAggEntry>();
      // Track every distinct (entrada, saida) pair we see per turno key so
      // we can detect rows that share a name but disagree on horário. Only
      // pairs where BOTH entrada and saida are non-empty are considered —
      // empty cells just inherit the first horário seen and aren't a
      // conflict.
      const turnoVariants = new Map<string, Map<string, { entrada: string; saida: string; count: number }>>();
      // Map normalized name → canonical (already-saved) name. Used to
      // make sure colaboradores from this import are stored under the
      // exact turno string already present in the Turnos menu, so
      // variants like "Manhã"/"MANHÃ" all count toward the same turno.
      const turnosCanonicalExistentes = new Map<string, string>();
      for (const t of turnos) {
        turnosCanonicalExistentes.set(normalizeTurnoKey(t.nome), t.nome);
      }

      const actions: ColaboradorImportPayload[] = [];

      for (const r of rows) {
        const nome = pick(r, "Nome").trim();
        if (!nome) { skipped++; continue; }

        const cpfRaw = pick(r, "CPF");
        const cpfNorm = normalizeCpf(cpfRaw);
        // Identify and silently ignore rows whose CPF is already registered or
        // appears earlier in the same file. They are not counted as imported.
        if (cpfNorm && (existingCpfs.has(cpfNorm) || batchCpfs.has(cpfNorm))) {
          continue;
        }
        if (cpfNorm) batchCpfs.add(cpfNorm);

        const turnoRaw = pick(r, "Turno").trim();
        const parsed = parseTurnoCombinado(turnoRaw);

        // Backward compat: for old-format rows (plain turno name + separate
        // "Horário entrada"/"Horário saída" columns), fall back to those columns.
        const horarioEntradaRow = parsed.isCombined
          ? parsed.entrada
          : (pick(r, "Horário entrada", "Horario entrada", "Entrada").trim() || parsed.entrada);
        const horarioSaidaRow = parsed.isCombined
          ? parsed.saida
          : (pick(r, "Horário saída", "Horario saida", "Saída", "Saida").trim() || parsed.saida);

        const turnoNomeDerived = parsed.nome;

        // Canonicalize the turno name: prefer an existing turno's exact
        // spelling, then a name already aggregated from this batch, then
        // the derived/raw value. This guarantees casing variants collapse
        // to a single turno and the collaborator-count on the Turnos page
        // stays correct.
        let turno = turnoNomeDerived;
        if (turnoNomeDerived && turnoNomeDerived !== "—") {
          const key = normalizeTurnoKey(turnoNomeDerived);
          const canonical =
            turnosCanonicalExistentes.get(key) ??
            turnoAgg.get(key)?.nome ??
            turnoNomeDerived;
          turno = canonical;

          const prev = turnoAgg.get(key);
          if (prev) {
            // Keep the first non-empty values seen.
            if (!prev.entrada && horarioEntradaRow) prev.entrada = horarioEntradaRow;
            if (!prev.saida && horarioSaidaRow) prev.saida = horarioSaidaRow;
            if (!prev.escala && parsed.escala) prev.escala = parsed.escala;
            if (!prev.tipoEscala && parsed.tipoEscala) prev.tipoEscala = parsed.tipoEscala;
            prev.count += 1;
          } else {
            turnoAgg.set(key, {
              nome: canonical,
              entrada: horarioEntradaRow,
              saida: horarioSaidaRow,
              escala: parsed.escala,
              tipoEscala: parsed.tipoEscala,
              count: 1,
            });
          }

          if (horarioEntradaRow && horarioSaidaRow) {
            const variantsForKey = turnoVariants.get(key) ?? new Map();
            const variantKey = `${horarioEntradaRow}|${horarioSaidaRow}`;
            const existingVariant = variantsForKey.get(variantKey);
            if (existingVariant) {
              existingVariant.count += 1;
            } else {
              variantsForKey.set(variantKey, {
                entrada: horarioEntradaRow,
                saida: horarioSaidaRow,
                count: 1,
              });
            }
            turnoVariants.set(key, variantsForKey);
          }
        }
        let endereco = pick(r, "Endereço", "Endereco", "Logradouro").trim();
        let bairro = pick(r, "Bairro").trim();
        let cidade = pick(r, "Cidade").trim();
        let estado = pick(r, "Estado", "UF").trim();
        const cep = formatCep(pick(r, "CEP", "Cep"));

        // Autofill missing address parts from ViaCEP. Lookup failures
        // (offline, invalid CEP) are silent so the row is still imported.
        if (cep && (!cidade || !estado || !bairro || !endereco)) {
          const r2 = await lookupCep(cep);
          if (r2) {
            if (!endereco && r2.logradouro) endereco = r2.logradouro;
            if (!bairro && r2.bairro) bairro = r2.bairro;
            if (!cidade && r2.cidade) cidade = r2.cidade;
            if (!estado && r2.estado) estado = r2.estado;
          }
        }

        const matricula      = pick(r, "Matrícula", "Matricula").trim();
        const dataNascimento = pick(r, "Data de Nascimento", "Data de nascimento", "Nascimento", "Data nascimento").trim();

        actions.push({
          nome,
          cpf: formatCpf(cpfRaw),
          email: pick(r, "E-mail", "Email").trim(),
          telefone: formatTelefone(pick(r, "Telefone", "Celular")),
          nascimento: dataNascimento,
          matricula,
          dataNascimento,
          // All collaborators imported via spreadsheet start as Ativo.
          // Any Status column in the file is intentionally ignored.
          status: "Ativo",
          turno: turno || "—",
          local: filialAtiva?.nome ?? nomeEmpresaAtiva ?? "",
          filialId: filialAtiva?.id ?? null,
          endereco,
          numero: pick(r, "Nº", "N°", "Numero", "Número").trim(),
          complemento: pick(r, "Complemento", "onde mora").trim(),
          bairro,
          cidade,
          estado,
          cep,
          horarioEntrada: horarioEntradaRow,
          horarioSaida: horarioSaidaRow,
          inicioOperacao: pick(r, "Início da operação", "Inicio da operacao", "Início operação", "Inicio operacao").trim(),
          vale: "—",
          grupoId: null,
        });
      }

      // Detect conflicts: a turno key with more than one distinct
      // (entrada, saida) pair means the spreadsheet contradicts itself.
      const conflicts: TurnoConflict[] = [];
      turnoVariants.forEach((variantsForKey, key) => {
        if (variantsForKey.size > 1) {
          conflicts.push({
            nome: turnoAgg.get(key)?.nome ?? key,
            variants: Array.from(variantsForKey.values()),
          });
        }
      });

      const pending: PendingImport = { actions, turnoAgg, skipped, conflicts };

      if (conflicts.length > 0) {
        // Don't apply yet — show the confirmation modal. The file input is
        // intentionally NOT cleared so the user could re-upload after fix
        // without re-picking; clearing happens only after apply or cancel.
        setPendingImport(pending);
      } else {
        applyPendingImport(pending);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Erro ao processar a planilha.");
    } finally {
      setImporting(false);
    }
  }

  /**
   * For each conflicting turno in `pending.conflicts`, generate a unique
   * numbered name per variant ("Manhã 1", "Manhã 2", …), skipping names
   * that already exist either in the Turnos menu or in the rest of this
   * import batch. Returns a nested map keyed by the original normalized
   * turno name and then the variantKey ("HH:MM|HH:MM") so callers can
   * look up a row's destination turno from its own (entrada, saida).
   */
  function buildConflictRenameMap(pending: PendingImport): Map<string, Map<string, string>> {
    const renameMap = new Map<string, Map<string, string>>();
    const usedNames = new Set<string>([
      ...turnos.map(t => normalizeTurnoKey(t.nome)),
      ...Array.from(pending.turnoAgg.keys()),
    ]);
    for (const conflict of pending.conflicts) {
      const baseKey = normalizeTurnoKey(conflict.nome);
      const variantMap = new Map<string, string>();
      let counter = 1;
      for (const v of conflict.variants) {
        let candidate = `${conflict.nome} ${counter}`;
        while (usedNames.has(normalizeTurnoKey(candidate))) {
          counter++;
          candidate = `${conflict.nome} ${counter}`;
        }
        usedNames.add(normalizeTurnoKey(candidate));
        variantMap.set(`${v.entrada}|${v.saida}`, candidate);
        counter++;
      }
      renameMap.set(baseKey, variantMap);
    }
    return renameMap;
  }

  /**
   * Persists a parsed import: creates colaboradores, creates any new turnos
   * detected in the file, and surfaces the result in the import modal.
   * Called either directly (no conflicts) or after the user clicks
   * "Prosseguir mesmo assim" on the duplicate-shift confirmation modal.
   * When proceeding with conflicts, each conflicting turno is split into
   * one numbered turno per distinct (entrada, saida) variant — e.g.
   * "Manhã" with two horários becomes "Manhã 1" and "Manhã 2". Each
   * colaborador is reassigned to the numbered turno that matches the
   * horário in their own row, so no horário is silently dropped.
   */
  function applyPendingImport(pending: PendingImport) {
    const renameMap = buildConflictRenameMap(pending);

    // Reassign each colaborador whose turno is in conflict to the numbered
    // name that matches their horário. Rows whose (entrada, saida) doesn't
    // match any variant (e.g. an empty horário on a conflicted turno name)
    // keep the original name untouched.
    const remappedActions = pending.actions.map(a => {
      const variantMapForKey = renameMap.get(normalizeTurnoKey(a.turno));
      if (!variantMapForKey) return a;
      const newName = variantMapForKey.get(`${a.horarioEntrada}|${a.horarioSaida}`);
      if (!newName) return a;
      return { ...a, turno: newName };
    });

    let ok = 0;
    for (const a of remappedActions) {
      const added = addColaborador(a);
      if (added) ok++;
      // duplicates returned from addColaborador are silently ignored by design
    }

    // Replace each conflicted base entry in the aggregation with one entry
    // per numbered variant, so both the result panel and the turno-creation
    // step below see the variants as first-class detected turnos. If any
    // remapped action still references the original base name (e.g. rows
    // with empty horário on a conflicted turno), we KEEP a slimmed-down
    // base entry so that turno is still created and the colaborador isn't
    // pointing to a non-existent turno.
    const baseRemainingCount = new Map<string, number>();
    for (const a of remappedActions) {
      const key = normalizeTurnoKey(a.turno);
      if (renameMap.has(key)) {
        baseRemainingCount.set(key, (baseRemainingCount.get(key) ?? 0) + 1);
      }
    }
    const augmentedAgg = new Map(pending.turnoAgg);
    renameMap.forEach((_, baseKey) => {
      const remaining = baseRemainingCount.get(baseKey) ?? 0;
      if (remaining === 0) {
        augmentedAgg.delete(baseKey);
      } else {
        const prev = augmentedAgg.get(baseKey);
        if (prev) {
          // Reset horário to empty since the only rows still mapped to
          // the base name are those without a complete horário.
          augmentedAgg.set(baseKey, { ...prev, entrada: "", saida: "", count: remaining });
        }
      }
    });
    for (const conflict of pending.conflicts) {
      const variantMap = renameMap.get(normalizeTurnoKey(conflict.nome));
      if (!variantMap) continue;
      for (const v of conflict.variants) {
        const newName = variantMap.get(`${v.entrada}|${v.saida}`);
        if (!newName) continue;
        augmentedAgg.set(normalizeTurnoKey(newName), {
          nome: newName,
          entrada: v.entrada,
          saida: v.saida,
          escala: "",
          tipoEscala: "",
          count: v.count,
        });
      }
    }

    // For every distinct turno detected in the spreadsheet, create a new
    // record in the Turnos menu unless one with the same name (case- and
    // whitespace-insensitive) already exists. Existing turnos are kept
    // intact to avoid silently overwriting user-curated horários, but we
    // flag entrada/saida divergences so the user can choose to overwrite.
    const turnosDetectados: TurnoDetectado[] = Array.from(augmentedAgg.values())
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .map(t => {
        const key = normalizeTurnoKey(t.nome);
        const existing = turnos.find(x => normalizeTurnoKey(x.nome) === key);
        if (!existing) {
          addTurno({
            nome: t.nome,
            entrada: t.entrada,
            saida: t.saida,
            escala: t.escala ?? "",
            tipoEscala: t.tipoEscala ?? "",
            colaboradores: t.count,
          });
          return { ...t, isNew: true };
        }
        const mismatch =
          !!t.entrada && !!t.saida &&
          (t.entrada !== existing.entrada || t.saida !== existing.saida);
        return {
          ...t,
          isNew: false,
          existingId: existing.id,
          existingEntrada: existing.entrada,
          existingSaida: existing.saida,
          mismatch,
        };
      });

    setImportResult({ ok, skipped: pending.skipped, turnosDetectados });
    setPendingImport(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /**
   * Discards a parsed-but-unconfirmed import without persisting anything.
   * The file input is reset so the user can immediately try a corrected
   * spreadsheet.
   */
  function cancelPendingImport() {
    setPendingImport(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /**
   * Replaces the saved entrada/saida of an existing turno with the values
   * detected in the spreadsheet for the same row. Keeps the turno's id, name
   * and colaboradores count untouched. Updates the import result so the
   * warning disappears and an "Atualizado" badge is shown for that row.
   */
  function handleOverrideTurnoHorario(idx: number) {
    if (!importResult) return;
    const item = importResult.turnosDetectados[idx];
    if (!item || item.existingId === undefined) return;
    const existing = turnos.find(t => t.id === item.existingId);
    if (!existing) return;
    updateTurno({ ...existing, entrada: item.entrada, saida: item.saida });
    setImportResult({
      ...importResult,
      turnosDetectados: importResult.turnosDetectados.map((t, i) =>
        i === idx
          ? {
              ...t,
              existingEntrada: item.entrada,
              existingSaida: item.saida,
              mismatch: false,
              overwritten: true,
            }
          : t,
      ),
    });
  }

  /* edit form fields */
  const [fNome, setFNome] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fTelefone, setFTelefone] = useState("");
  const [fStatus, setFStatus] = useState<Status>("Ativo");
  const [fTurno, setFTurno] = useState("");
  const [fLocal, setFLocal] = useState("");
  const [fMatricula, setFMatricula] = useState("");
  const [fDataNascimento, setFDataNascimento] = useState("");
  const [fEndereco, setFEndereco] = useState("");
  const [fNumero, setFNumero] = useState("");
  const [fComplemento, setFComplemento] = useState("");
  const [fBairro, setFBairro] = useState("");
  const [fCidade, setFCidade] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fCep, setFCep] = useState("");
  const [fHorarioEntrada, setFHorarioEntrada] = useState("");
  const [fHorarioSaida, setFHorarioSaida] = useState("");
  const [fInicioOperacao, setFInicioOperacao] = useState("");
  const [cepLoading, setCepLoading] = useState(false);

  /**
   * Looks up the typed CEP via ViaCEP and autofills empty address fields.
   * Never overwrites values the user already typed and silently ignores
   * network/CEP errors so the form keeps working offline.
   */
  async function handleCepLookup(cep: string) {
    const digits = (cep || "").replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await lookupCep(digits);
      if (!r) return;
      if (!fEndereco.trim() && r.logradouro) setFEndereco(r.logradouro);
      if (!fBairro.trim() && r.bairro) setFBairro(r.bairro);
      if (!fCidade.trim() && r.cidade) setFCidade(r.cidade);
      if (!fEstado.trim() && r.estado) setFEstado(r.estado);
    } finally {
      setCepLoading(false);
    }
  }

  function openEdit(c: Colaborador) {
    setEditing(c);
    setFNome(c.nome);
    setFEmail(c.email);
    setFTelefone(c.telefone);
    setFStatus(c.status);
    setFTurno(c.turno === "—" ? "" : c.turno);
    setFLocal(c.local);
    setFMatricula(c.matricula ?? "");
    setFDataNascimento(c.dataNascimento ?? c.nascimento ?? "");
    setFEndereco(c.endereco);
    setFNumero(c.numero);
    setFComplemento(c.complemento);
    setFBairro(c.bairro);
    setFCidade(c.cidade);
    setFEstado(c.estado);
    setFCep(c.cep);
    setFHorarioEntrada(c.horarioEntrada);
    setFHorarioSaida(c.horarioSaida);
    setFInicioOperacao(c.inicioOperacao);
    setFormError("");
  }

  function saveEdit() {
    if (!fNome.trim()) { setFormError("Nome é obrigatório."); return; }
    if (!editing) return;
    updateColaborador({
      ...editing,
      nome: fNome.trim(),
      // CPF is not editable in the modal but legacy records may carry an
      // unformatted CPF — re-format on save so existing rows get cleaned up.
      cpf: formatCpf(editing.cpf),
      email: fEmail.trim(),
      telefone: formatTelefone(fTelefone),
      nascimento: fDataNascimento.trim(),
      matricula: fMatricula.trim(),
      dataNascimento: fDataNascimento.trim(),
      status: fStatus,
      turno: fTurno || "—",
      local: fLocal,
      endereco: fEndereco.trim(),
      numero: fNumero.trim(),
      complemento: fComplemento.trim(),
      bairro: fBairro.trim(),
      cidade: fCidade.trim(),
      estado: fEstado.trim(),
      cep: formatCep(fCep),
      horarioEntrada: fHorarioEntrada.trim(),
      horarioSaida: fHorarioSaida.trim(),
      inicioOperacao: fInicioOperacao.trim(),
      vale: "—",
    });
    setEditing(null);
  }

  function confirmDelete(id: number) {
    deleteColaborador(id);
    setDeleteId(null);
  }

  const filtered = colaboradores.filter(c => {
    const matchStatus = activeStatus === "Todos" || c.status === activeStatus;
    const q = search.toLowerCase();
    const matchSearch = !q || c.nome.toLowerCase().includes(q) || c.cpf.includes(q) || (c.matricula || "").toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const statusCounts = STATUSES.reduce((acc, s) => {
    acc[s] = colaboradores.filter(c => c.status === s).length;
    return acc;
  }, {} as Record<Status, number>);

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground mb-0.5">Colaboradores</h1>
            <p className="text-muted-foreground text-sm">Gerencie todos os colaboradores cadastrados.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              onClick={handleDownloadTemplate}
              className="font-semibold"
              data-testid="button-download-template"
            >
              <Download size={16} className="mr-1.5" />Baixar modelo
            </Button>
            <Button
              onClick={() => { setImportOpen(true); setImportError(""); setImportResult(null); }}
              className="bg-accent hover:bg-accent/90 text-white font-semibold"
              data-testid="button-import-spreadsheet"
            >
              <Upload size={16} className="mr-1.5" />Importar planilha
            </Button>
          </div>
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {(["Todos", ...STATUSES] as const).map(s => (
            <button
              key={s}
              onClick={() => setActiveStatus(s as Status | "Todos")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                activeStatus === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              {s}
              <span className="ml-1.5 text-xs opacity-60">
                {s === "Todos" ? colaboradores.length : statusCounts[s as Status]}
              </span>
            </button>
          ))}
        </div>

        <div className="relative mb-5">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 bg-card" placeholder="Buscar por nome, CPF, código ou e-mail..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Search size={32} className="text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium text-sm">Nenhum colaborador encontrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    {["Nome", "Matrícula", "Status", "Turno", "Vale", ""].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-foreground">{c.nome}</p>
                        <p className="text-xs text-muted-foreground font-mono">{c.cpf}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground font-mono">{c.matricula || "—"}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${STATUS_STYLES[c.status]}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground text-sm">{c.turno}</td>
                      <td className="px-5 py-3.5 text-sm">
                        {valesMap.has(c.id) ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                            {valesMap.get(c.id)!.toLocaleString("pt-BR")}
                            <span className="text-xs font-normal text-muted-foreground">vales</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1 justify-end">
                          {deleteId === c.id ? (
                            <>
                              <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => confirmDelete(c.id)}>
                                <Check size={11} className="mr-1" />Confirmar
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDeleteId(null)}>
                                <X size={11} />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2"
                                onClick={() => openEdit(c)}
                              >
                                <Pencil size={12} />Editar
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Exibindo <strong>{filtered.length}</strong> de <strong>{colaboradores.length}</strong> colaboradores.
        </p>
      </div>

      {/* ── Edit Modal ── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card z-10">
              <div>
                <h2 className="font-bold text-lg text-foreground">Editar colaborador</h2>
                <p className="text-xs text-muted-foreground">{editing.matricula ? `Matrícula: ${editing.matricula}` : editing.codigo}</p>
              </div>
              <button onClick={() => setEditing(null)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
                <X size={15} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Personal data */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Dados pessoais</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-1">Nome completo *</label>
                    <Input value={fNome} onChange={e => setFNome(e.target.value)} placeholder="Nome completo" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">CPF</label>
                    <Input value={editing.cpf} disabled className="opacity-50 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Código interno</label>
                    <Input value={editing.codigo} disabled className="opacity-50 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">E-mail</label>
                    <Input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="email@empresa.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Telefone</label>
                    <Input value={fTelefone} onChange={e => setFTelefone(e.target.value)} placeholder="(11) 9 0000-0000" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Matrícula</label>
                    <Input value={fMatricula} onChange={e => setFMatricula(e.target.value)} placeholder="000001" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Data de nascimento</label>
                    <Input value={fDataNascimento} onChange={e => setFDataNascimento(e.target.value)} placeholder="DD/MM/AAAA" />
                  </div>
                </div>
              </div>

              {/* Work config */}
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Configuração de trabalho</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Status</label>
                    <select
                      className="w-full border rounded-lg px-3 py-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/50"
                      value={fStatus}
                      onChange={e => setFStatus(e.target.value as Status)}
                    >
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Turno</label>
                    <select
                      className="w-full border rounded-lg px-3 py-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/50"
                      value={fTurno}
                      onChange={e => setFTurno(e.target.value)}
                    >
                      <option value="">— Sem turno —</option>
                      {turnos.map(t => <option key={t.id} value={t.nome}>{t.nome} ({t.entrada}–{t.saida})</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-1">Local de trabalho</label>
                    <select
                      className="w-full border rounded-lg px-3 py-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/50"
                      value={fLocal}
                      onChange={e => setFLocal(e.target.value)}
                    >
                      <option value="">— Sem local —</option>
                      {filiais.map(f => (
                        <option key={f.id} value={f.nome}>
                          {f.nome}{f.tipo === "matriz" ? " (Matriz)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Endereço residencial</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-1">Logradouro</label>
                    <Input value={fEndereco} onChange={e => setFEndereco(e.target.value)} placeholder="Rua, Av, Alameda..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Nº</label>
                    <Input value={fNumero} onChange={e => setFNumero(e.target.value)} placeholder="123" />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-sm font-medium text-foreground mb-1">Complemento</label>
                    <Input value={fComplemento} onChange={e => setFComplemento(e.target.value)} placeholder="Apto, bloco, ponto de referência..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Bairro</label>
                    <Input value={fBairro} onChange={e => setFBairro(e.target.value)} placeholder="Bairro" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Cidade</label>
                    <Input value={fCidade} onChange={e => setFCidade(e.target.value)} placeholder="Cidade" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Estado</label>
                    <Input value={fEstado} onChange={e => setFEstado(e.target.value)} placeholder="UF" maxLength={2} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      CEP
                      {cepLoading && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">Buscando...</span>
                      )}
                    </label>
                    <Input
                      value={fCep}
                      onChange={e => setFCep(formatCepProgressive(e.target.value))}
                      onBlur={e => { void handleCepLookup(e.target.value); }}
                      placeholder="00000-000"
                      inputMode="numeric"
                      maxLength={9}
                    />
                  </div>
                </div>
              </div>

              {/* Operação */}
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Operação</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Horário entrada</label>
                    <Input value={fHorarioEntrada} onChange={e => setFHorarioEntrada(e.target.value)} placeholder="06:20" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Horário saída</label>
                    <Input value={fHorarioSaida} onChange={e => setFHorarioSaida(e.target.value)} placeholder="14:00" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Início da operação</label>
                    <Input value={fInicioOperacao} onChange={e => setFInicioOperacao(e.target.value)} placeholder="DD/MM/AAAA" />
                  </div>
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  <AlertCircle size={14} />{formError}
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-6 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold" onClick={saveEdit}>
                Salvar alterações
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Modal ── */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-accent" />
                <h2 className="font-bold text-lg text-foreground">Importar planilha</h2>
              </div>
              <button
                onClick={() => { setImportOpen(false); setImportError(""); setImportResult(null); }}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                data-testid="button-close-import-modal"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Envie um arquivo <strong>.xlsx</strong> ou <strong>.csv</strong> com as colunas:
              </p>
              <div className="bg-muted/40 border rounded-lg px-3 py-2 text-xs font-mono text-muted-foreground break-all">
                {TEMPLATE_HEADERS.join(", ")}
              </div>
              <p className="text-xs text-muted-foreground">
                Cada linha será registrada como um novo colaborador com status
                <strong> Ativo</strong>. Linhas sem nome são ignoradas e CPFs já
                cadastrados são pulados silenciosamente. CPF, Telefone e CEP
                podem vir em qualquer formato — a plataforma formata
                automaticamente. Use o botão <strong>Baixar modelo</strong> caso
                queira uma planilha de exemplo.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleImportFile(f);
                }}
                className="block w-full text-sm text-foreground
                  file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-accent file:text-white
                  file:hover:bg-accent/90
                  file:cursor-pointer cursor-pointer"
                data-testid="input-import-file"
                disabled={importing}
              />

              {importing && (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                  Processando planilha...
                </div>
              )}

              {importError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  <AlertCircle size={14} />{importError}
                </div>
              )}

              {importResult && (
                <div className="flex items-start gap-2 text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <Check size={14} className="mt-0.5" />
                  <div>
                    <strong>{importResult.ok}</strong> colaborador(es) importado(s).
                    {importResult.skipped > 0 && (
                      <> <span className="text-muted-foreground">{importResult.skipped} linha(s) ignorada(s) por estarem sem nome.</span></>
                    )}
                  </div>
                </div>
              )}

              {importResult && importResult.turnosDetectados.length > 0 && (
                <div className="border rounded-lg bg-card overflow-hidden" data-testid="turnos-detectados">
                  <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
                    <Clock size={14} className="text-accent" />
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                      Turnos detectados
                    </p>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {importResult.turnosDetectados.length}
                    </span>
                  </div>
                  <ul className="divide-y">
                    {importResult.turnosDetectados.map((t, idx) => (
                      <li
                        key={t.nome.toLowerCase()}
                        className="px-3 py-2 text-sm"
                        data-testid={`turno-detectado-${idx}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">{t.nome}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {t.entrada || "—"} → {t.saida || "—"}
                              <span className="ml-2 text-muted-foreground/80">
                                · {t.count} colaborador{t.count !== 1 ? "es" : ""}
                              </span>
                            </p>
                          </div>
                          <span
                            className={`shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${
                              t.isNew
                                ? "bg-green-100 text-green-700 border-green-200"
                                : t.overwritten
                                  ? "bg-blue-100 text-blue-700 border-blue-200"
                                  : "bg-muted text-muted-foreground border"
                            }`}
                          >
                            {t.isNew ? "novo" : t.overwritten ? "atualizado" : "já existia"}
                          </span>
                        </div>

                        {t.mismatch && (
                          <div
                            className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 text-xs text-amber-800"
                            data-testid={`turno-mismatch-${idx}`}
                          >
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p>
                                Horário diferente: existente{" "}
                                <span className="font-mono font-semibold">
                                  {t.existingEntrada || "—"} → {t.existingSaida || "—"}
                                </span>{" "}
                                vs. planilha{" "}
                                <span className="font-mono font-semibold">
                                  {t.entrada || "—"} → {t.saida || "—"}
                                </span>
                                .
                              </p>
                              <button
                                type="button"
                                onClick={() => handleOverrideTurnoHorario(idx)}
                                className="mt-1.5 inline-flex items-center gap-1 font-semibold text-amber-900 hover:text-amber-700 underline underline-offset-2"
                                data-testid={`button-override-turno-${idx}`}
                              >
                                Atualizar para o horário da planilha
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-6 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleDownloadTemplate}
              >
                <Download size={14} className="mr-1.5" />Baixar modelo
              </Button>
              <Button
                className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold"
                onClick={() => { setImportOpen(false); setImportError(""); setImportResult(null); }}
              >
                {importResult ? "Concluir" : "Fechar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate-shift confirmation modal: appears when the spreadsheet
          contains the same turno name with conflicting horários. The
          import is held in `pendingImport` until the user resolves it.
          Shows a preview of the numbered turno names that will be created
          if the user proceeds. */}
      {pendingImport && pendingImport.conflicts.length > 0 && (() => {
        const previewRenameMap = buildConflictRenameMap(pendingImport);
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-start gap-3 px-6 pt-6 pb-2">
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} className="text-amber-600" />
                </div>
                <div>
                  <h2 className="font-bold text-base text-foreground">
                    Turnos com horários conflitantes
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    A planilha tem o mesmo nome de turno com horários
                    diferentes. Se prosseguir, será criado um turno separado
                    para cada variante de horário, com nome numerado
                    (ex.: Manhã 1, Manhã 2).
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 space-y-3">
                {pendingImport.conflicts.map(c => {
                  const variantMap = previewRenameMap.get(normalizeTurnoKey(c.nome));
                  return (
                    <div key={c.nome} className="border rounded-lg p-3 bg-amber-50/50">
                      <p className="font-semibold text-sm text-foreground mb-2">{c.nome}</p>
                      <ul className="space-y-1.5">
                        {c.variants.map(v => {
                          const newName = variantMap?.get(`${v.entrada}|${v.saida}`);
                          return (
                            <li
                              key={`${v.entrada}-${v.saida}`}
                              className="flex items-center justify-between text-sm gap-3"
                            >
                              <span className="font-mono text-foreground">
                                {v.entrada} → {v.saida}
                              </span>
                              <span className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap justify-end">
                                {v.count} colaborador{v.count !== 1 ? "es" : ""}
                                {newName && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold tracking-wide">
                                    → {newName}
                                  </span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 px-6 pb-6 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={cancelPendingImport}
                >
                  Cancelar importação
                </Button>
                <Button
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                  onClick={() => applyPendingImport(pendingImport)}
                >
                  Prosseguir mesmo assim
                </Button>
              </div>
            </div>
          </div>
        );
      })()}
    </DashboardLayout>
  );
}
