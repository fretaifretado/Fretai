import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import DashboardLayout from "./layout";
import { useDashboard, normalizeCpf, formatCpf, type Status, type Colaborador } from "./context";
import {
  Shuffle, Clock, Users, GitBranch, Check, Search, ChevronRight,
  FileSpreadsheet, FileText, Hash, Upload, X, AlertCircle, CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Operacao = "turno" | "status" | "filial" | null;
type ModoSelecao = "tabela" | "planilha" | "txt" | "cpf";

const OPCOES_STATUS: Status[] = ["Ativo", "Home Office", "Férias", "Licença", "Afastado", "Desligado"];

/* ---------- xlsx loader (mesmo padrão de colaboradores.tsx) ---------- */

type XlsxModule = {
  read: (data: ArrayBuffer, opts: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: {
    sheet_to_json: <T = Record<string, unknown>>(sheet: unknown, opts?: { defval?: unknown; raw?: boolean }) => T[];
  };
};
let xlsxPromise: Promise<XlsxModule> | null = null;
function loadXlsx(): Promise<XlsxModule> {
  if (!xlsxPromise) {
    // @ts-expect-error — módulo carregado por URL CDN, sem tipos
    xlsxPromise = import(/* @vite-ignore */ "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs") as Promise<XlsxModule>;
  }
  return xlsxPromise;
}

/* ---------- helpers de extração de CPFs ---------- */

/** Extrai todos os CPFs (11 dígitos consecutivos) de um texto livre, deduplicando. */
function extractCpfsFromText(text: string): string[] {
  const tokens = text.split(/[\s,;\n\r\t]+/g);
  const out = new Set<string>();
  for (const tok of tokens) {
    const d = tok.replace(/\D/g, "");
    if (d.length === 11) out.add(d);
  }
  return [...out];
}

/** Normaliza header (sem acento, minúsculo) — mesmo critério de colaboradores.tsx. */
function norm(h: string): string {
  return h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/** Lê CPFs de uma planilha xlsx/csv: identifica a coluna "cpf" e extrai os 11 dígitos. */
async function extractCpfsFromSpreadsheet(file: File): Promise<string[]> {
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  const out = new Set<string>();
  if (isCsv) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return [];
    const headers = lines[0].split(/[,;\t]/).map(h => norm(h));
    const cpfIdx = headers.findIndex(h => h === "cpf" || h.includes("cpf"));
    const startIdx = cpfIdx >= 0 ? 1 : 0; // se não tem header CPF, varre tudo como texto
    for (let i = startIdx; i < lines.length; i++) {
      const cells = lines[i].split(/[,;\t]/);
      const candidate = cpfIdx >= 0 ? (cells[cpfIdx] ?? "") : lines[i];
      const d = (candidate || "").replace(/\D/g, "");
      if (d.length === 11) out.add(d);
    }
    return [...out];
  }
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
    if (rows.length === 0) continue;
    const cpfKey = Object.keys(rows[0]).find(k => {
      const n = norm(k);
      return n === "cpf" || n.includes("cpf");
    });
    if (cpfKey) {
      for (const r of rows) {
        const d = String(r[cpfKey] ?? "").replace(/\D/g, "");
        if (d.length === 11) out.add(d);
      }
    } else {
      // varre todas as células
      for (const r of rows) {
        for (const v of Object.values(r)) {
          const d = String(v ?? "").replace(/\D/g, "");
          if (d.length === 11) out.add(d);
        }
      }
    }
  }
  return [...out];
}

/** Casa CPFs contra a lista de colaboradores: retorna IDs encontrados e CPFs não encontrados. */
function matchCpfs(
  cpfs: string[],
  colaboradores: Colaborador[],
): { encontradosIds: number[]; naoEncontrados: string[] } {
  const byCpf = new Map<string, number>();
  for (const c of colaboradores) {
    const k = normalizeCpf(c.cpf);
    if (k) byCpf.set(k, c.id);
  }
  const encontradosIds: number[] = [];
  const naoEncontrados: string[] = [];
  const seenIds = new Set<number>();
  for (const cpf of cpfs) {
    const id = byCpf.get(cpf);
    if (id !== undefined) {
      if (!seenIds.has(id)) { seenIds.add(id); encontradosIds.push(id); }
    } else {
      naoEncontrados.push(cpf);
    }
  }
  return { encontradosIds, naoEncontrados };
}

/* --------------------------------- página --------------------------------- */

export default function MovimentacaoPage() {
  const { colaboradoresDaFilial: colaboradores, turnos, filiais, addAgendamento } = useDashboard();

  const [operacao, setOperacao]     = useState<Operacao>(null);
  const [valorNovo, setValorNovo]   = useState("");
  const [filialNova, setFilialNova] = useState<number | null>(null);

  const [modo, setModo] = useState<ModoSelecao>("tabela");
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [naoEncontrados, setNaoEncontrados] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [cpfTexto, setCpfTexto] = useState("");
  const [importInfo, setImportInfo] = useState<string>("");
  const [importErro, setImportErro] = useState<string>("");
  const fileSheetRef = useRef<HTMLInputElement | null>(null);
  const fileTxtRef   = useRef<HTMLInputElement | null>(null);

  // "Afastado" pode ser agendado a partir de 24h (amanhã).
  // Todos os outros status exigem mínimo 48h (depois de amanhã).
  const minDate = useMemo(() => {
    const d = new Date();
    const isAfastado = operacao === "status" && valorNovo === "Afastado";
    d.setDate(d.getDate() + (isAfastado ? 1 : 2));
    return d.toISOString().split("T")[0];
  }, [operacao, valorNovo]);

  const [inicio, setInicio] = useState("");
  const [fim, setFim]       = useState("");

  const [sucesso, setSucesso] = useState(false);
  const [resumoSucesso, setResumoSucesso] = useState<{ qtd: number; inicio: string; fim: string } | null>(null);

  const ativos   = colaboradores.filter(c => c.status !== "Desligado");
  const filtered = ativos.filter(c => c.nome.toLowerCase().includes(search.toLowerCase()));
  const colabsSelecionados = useMemo(
    () => selecionados.map(id => colaboradores.find(c => c.id === id)).filter((c): c is Colaborador => !!c),
    [selecionados, colaboradores],
  );

  function resetTudo() {
    setOperacao(null); setValorNovo(""); setFilialNova(null);
    setModo("tabela"); setSelecionados([]); setNaoEncontrados([]);
    setSearch(""); setCpfTexto(""); setImportInfo(""); setImportErro("");
    setInicio(""); setFim("");
  }

  function toggleSel(id: number) {
    setSelecionados(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }
  function toggleAll() {
    setSelecionados(p => p.length === filtered.length ? [] : filtered.map(c => c.id));
  }

  async function handleSheetUpload(file: File) {
    setImportErro(""); setImportInfo("");
    try {
      const cpfs = await extractCpfsFromSpreadsheet(file);
      if (cpfs.length === 0) { setImportErro("Nenhum CPF válido encontrado na planilha."); return; }
      const { encontradosIds, naoEncontrados } = matchCpfs(cpfs, colaboradores);
      setSelecionados(encontradosIds);
      setNaoEncontrados(naoEncontrados);
      setImportInfo(`${cpfs.length} CPF${cpfs.length !== 1 ? "s" : ""} lido${cpfs.length !== 1 ? "s" : ""} de "${file.name}".`);
    } catch (e) {
      setImportErro(e instanceof Error ? e.message : "Erro ao processar planilha.");
    }
  }

  async function handleTxtUpload(file: File) {
    setImportErro(""); setImportInfo("");
    try {
      const text = await file.text();
      const cpfs = extractCpfsFromText(text);
      if (cpfs.length === 0) { setImportErro("Nenhum CPF válido encontrado no arquivo."); return; }
      const { encontradosIds, naoEncontrados } = matchCpfs(cpfs, colaboradores);
      setSelecionados(encontradosIds);
      setNaoEncontrados(naoEncontrados);
      setImportInfo(`${cpfs.length} CPF${cpfs.length !== 1 ? "s" : ""} lido${cpfs.length !== 1 ? "s" : ""} de "${file.name}".`);
    } catch (e) {
      setImportErro(e instanceof Error ? e.message : "Erro ao processar arquivo.");
    }
  }

  function handleProcessarTexto() {
    setImportErro(""); setImportInfo("");
    const cpfs = extractCpfsFromText(cpfTexto);
    if (cpfs.length === 0) { setImportErro("Nenhum CPF válido (11 dígitos) detectado no texto."); return; }
    const { encontradosIds, naoEncontrados } = matchCpfs(cpfs, colaboradores);
    setSelecionados(encontradosIds);
    setNaoEncontrados(naoEncontrados);
    setImportInfo(`${cpfs.length} CPF${cpfs.length !== 1 ? "s" : ""} processado${cpfs.length !== 1 ? "s" : ""}.`);
  }

  function removerSelecionado(id: number) {
    setSelecionados(p => p.filter(x => x !== id));
  }
  function removerNaoEncontrado(cpf: string) {
    setNaoEncontrados(p => p.filter(x => x !== cpf));
  }

  /* ---------- validações finais ---------- */

  const isDesligado = operacao === "status" && valorNovo === "Desligado";
  const valorOk =
    operacao === "filial" ? filialNova !== null
    : operacao === "turno" || operacao === "status" ? !!valorNovo
    : false;
  const datasOk = !!inicio && inicio >= minDate && (isDesligado || (!!fim && fim >= inicio));
  const podeAgendar = operacao && valorOk && selecionados.length > 0 && datasOk;

  async function agendar() {
    if (!operacao || !valorOk) return;
    let valor = "";
    let filialIdNovo: number | null | undefined;
    if (operacao === "filial") {
      const f = filiais.find(x => x.id === filialNova);
      if (!f) return;
      valor = f.nome;
      filialIdNovo = f.id;
    } else {
      valor = valorNovo;
    }
    const fimEfetivo = isDesligado ? "9999-12-31" : fim;
    const created = await addAgendamento({
      tipo: operacao,
      valorNovo: valor,
      filialIdNovo,
      inicio,
      fim: fimEfetivo,
      alvos: selecionados.map(id => ({ colaboradorId: id, valorAnterior: "" })),
    });
    if (!created) return;
    setResumoSucesso({ qtd: selecionados.length, inicio, fim: fimEfetivo });
    setSucesso(true);
    setTimeout(() => { setSucesso(false); setResumoSucesso(null); resetTudo(); }, 3500);
  }

  /* ---------- cards iniciais ---------- */

  const CARDS = [
    { tipo: "turno"  as Operacao, icon: Clock,     label: "Alterar Turno",    desc: "Mova colaboradores entre os turnos da empresa." },
    { tipo: "status" as Operacao, icon: Users,     label: "Alterar Status",   desc: "Férias, licença, afastamento ou reativação." },
    { tipo: "filial" as Operacao, icon: GitBranch, label: "Troca de Filial",  desc: "Remaneje colaboradores entre filiais da empresa." },
  ];

  const labelOperacao =
    operacao === "turno" ? "Alterar Turno"
    : operacao === "status" ? "Alterar Status"
    : "Troca de Filial";

  const MODOS: { id: ModoSelecao; icon: React.ElementType; label: string }[] = [
    { id: "tabela",   icon: Search,          label: "Buscar na lista" },
    { id: "planilha", icon: FileSpreadsheet, label: "Importar planilha" },
    { id: "txt",      icon: FileText,        label: "Arquivo .txt" },
    { id: "cpf",      icon: Hash,            label: "Digitar CPFs" },
  ];

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Shuffle size={18} className="text-accent" />
            <h1 className="text-xl font-bold text-foreground">Movimentação em Bloco</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Agende alterações de turno, status ou filial com data de início e fim.
          </p>
        </div>

        {/* Step 1 — escolher operação */}
        {!operacao && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CARDS.map(card => (
              <button key={card.tipo} onClick={() => setOperacao(card.tipo)}
                className="bg-card border rounded-xl p-5 text-left hover:border-accent/60 hover:shadow-md transition-all group">
                <div className="p-2.5 rounded-lg bg-accent/10 w-fit mb-3"><card.icon size={20} className="text-accent" /></div>
                <h3 className="font-semibold text-foreground text-sm mb-1">{card.label}</h3>
                <p className="text-xs text-muted-foreground">{card.desc}</p>
                <div className="flex items-center gap-1 mt-3 text-accent text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                  Selecionar <ChevronRight size={12} />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — montar agendamento */}
        {operacao && !sucesso && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <button onClick={resetTudo} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Voltar</button>
              <span className="text-muted-foreground">/</span>
              <span className="text-sm font-medium text-foreground">{labelOperacao}</span>
            </div>

            {/* Valor novo */}
            <div className="bg-card border rounded-xl p-5 shadow-sm">
              <p className="text-sm font-semibold text-foreground mb-3">
                {operacao === "turno" ? "Selecione o novo turno:" : operacao === "status" ? "Selecione o novo status:" : "Selecione a filial de destino:"}
              </p>

              {operacao === "filial" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filiais.map(f => (
                    <button key={f.id} onClick={() => setFilialNova(f.id)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                        filialNova === f.id ? "bg-accent text-white border-accent" : "bg-card border hover:border-accent/50 text-foreground"
                      }`}>
                      <GitBranch size={15} className={filialNova === f.id ? "text-white" : "text-accent"} />
                      <div className="text-left">
                        <p className="font-semibold text-sm">{f.nome}</p>
                        <p className={`text-xs ${filialNova === f.id ? "text-white/70" : "text-muted-foreground"}`}>{f.cidade} · {f.tipo === "matriz" ? "Matriz" : "Filial"}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {operacao === "turno" && (
                turnos.length === 0
                  ? <p className="text-sm text-amber-600">Nenhum turno cadastrado. <a href="/painel/turnos" className="underline font-semibold">Criar turnos →</a></p>
                  : <div className="flex flex-wrap gap-2">
                    {turnos.map(t => (
                      <button key={t.id} onClick={() => setValorNovo(t.nome)}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${valorNovo === t.nome ? "bg-accent text-white border-accent" : "bg-card border hover:border-accent/50 text-foreground"}`}>
                        {t.nome} <span className="text-xs opacity-70">({t.entrada}–{t.saida})</span>
                      </button>
                    ))}
                  </div>
              )}

              {operacao === "status" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {OPCOES_STATUS.map(s => (
                      <button key={s} onClick={() => setValorNovo(s)}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${valorNovo === s ? "bg-accent text-white border-accent" : "bg-card border hover:border-accent/50 text-foreground"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                  {valorNovo === "Afastado" && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                      ⚡ <strong>Afastado</strong> pode ser agendado com apenas <strong>24h</strong> de antecedência. Os demais status exigem 48h.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modos de seleção */}
            <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
              <p className="text-sm font-semibold text-foreground">Como quer escolher os colaboradores?</p>
              <div className="flex flex-wrap gap-2">
                {MODOS.map(m => (
                  <button key={m.id} onClick={() => setModo(m.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      modo === m.id ? "bg-accent text-white border-accent" : "bg-card border hover:border-accent/50 text-foreground"
                    }`}>
                    <m.icon size={14} />{m.label}
                  </button>
                ))}
              </div>

              {/* Painel — buscar na lista */}
              {modo === "tabela" && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Marque os colaboradores na tabela{selecionados.length > 0 && <span className="ml-2 text-accent font-semibold">({selecionados.length} selecionados)</span>}
                    </p>
                    <div className="relative flex-1 max-w-xs">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input className="pl-8 h-8 text-sm" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/30 border-b">
                          <th className="w-10 px-4 py-2"><input type="checkbox" checked={selecionados.length === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded" /></th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nome</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">CPF</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Turno</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filtered.map(c => (
                          <tr key={c.id} onClick={() => toggleSel(c.id)} className={`cursor-pointer transition-colors ${selecionados.includes(c.id) ? "bg-accent/5" : "hover:bg-muted/20"}`}>
                            <td className="px-4 py-2"><input type="checkbox" checked={selecionados.includes(c.id)} onChange={() => toggleSel(c.id)} onClick={e => e.stopPropagation()} className="rounded" /></td>
                            <td className="px-4 py-2 font-medium text-foreground">{c.nome}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground font-mono">{formatCpf(c.cpf)}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">{c.turno}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">{c.status}</td>
                          </tr>
                        ))}
                        {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum colaborador encontrado.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Painel — planilha */}
              {modo === "planilha" && (
                <div className="border rounded-lg p-5 text-center bg-muted/10">
                  <FileSpreadsheet className="mx-auto text-accent mb-2" size={28} />
                  <p className="text-sm text-foreground font-medium mb-1">Envie uma planilha (.xlsx ou .csv)</p>
                  <p className="text-xs text-muted-foreground mb-4">A coluna "CPF" é detectada automaticamente. Caso não exista, qualquer célula com 11 dígitos é considerada CPF.</p>
                  <input ref={fileSheetRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleSheetUpload(f); e.target.value = ""; }} />
                  <Button onClick={() => fileSheetRef.current?.click()} variant="outline" size="sm" className="gap-2">
                    <Upload size={14} />Selecionar planilha
                  </Button>
                </div>
              )}

              {/* Painel — txt */}
              {modo === "txt" && (
                <div className="border rounded-lg p-5 text-center bg-muted/10">
                  <FileText className="mx-auto text-accent mb-2" size={28} />
                  <p className="text-sm text-foreground font-medium mb-1">Envie um arquivo .txt</p>
                  <p className="text-xs text-muted-foreground mb-4">Um CPF por linha (também aceita CPFs separados por vírgula ou espaço).</p>
                  <input ref={fileTxtRef} type="file" accept=".txt,text/plain" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleTxtUpload(f); e.target.value = ""; }} />
                  <Button onClick={() => fileTxtRef.current?.click()} variant="outline" size="sm" className="gap-2">
                    <Upload size={14} />Selecionar arquivo
                  </Button>
                </div>
              )}

              {/* Painel — digitação */}
              {modo === "cpf" && (
                <div className="border rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-2">Cole ou digite os CPFs (um por linha, ou separados por vírgula/espaço):</p>
                  <textarea
                    rows={5}
                    value={cpfTexto}
                    onChange={e => setCpfTexto(e.target.value)}
                    placeholder="Ex.: 111.111.111-11&#10;222.222.222-22&#10;333.333.333-33"
                    className="w-full text-sm font-mono border rounded-md p-2 bg-background focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <div className="flex justify-end mt-3">
                    <Button onClick={handleProcessarTexto} variant="outline" size="sm" disabled={!cpfTexto.trim()}>
                      Processar CPFs
                    </Button>
                  </div>
                </div>
              )}

              {importInfo && <p className="text-xs text-muted-foreground">{importInfo}</p>}
              {importErro && (
                <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={12} />{importErro}</p>
              )}
            </div>

            {/* Resumo: encontrados / não encontrados (só aparece quando há algo) */}
            {(colabsSelecionados.length > 0 || naoEncontrados.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b bg-green-50/50">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Check size={14} className="text-green-600" />
                      Encontrados ({colabsSelecionados.length})
                    </p>
                  </div>
                  <div className="max-h-72 overflow-auto divide-y divide-border">
                    {colabsSelecionados.length === 0 && (
                      <p className="px-4 py-6 text-xs text-muted-foreground text-center">Nenhum colaborador selecionado ainda.</p>
                    )}
                    {colabsSelecionados.map(c => (
                      <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{c.nome}</p>
                          <p className="text-xs text-muted-foreground font-mono">{formatCpf(c.cpf)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">
                            {operacao === "turno" ? `Turno: ${c.turno || "—"}` : operacao === "status" ? `Status: ${c.status}` : `Filial: ${c.local || "—"}`}
                          </p>
                          <button onClick={() => removerSelecionado(c.id)} className="text-xs text-muted-foreground hover:text-red-600 inline-flex items-center gap-1 mt-0.5">
                            <X size={11} />remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b bg-amber-50/50">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <AlertCircle size={14} className="text-amber-600" />
                      CPFs não encontrados ({naoEncontrados.length})
                    </p>
                  </div>
                  <div className="max-h-72 overflow-auto divide-y divide-border">
                    {naoEncontrados.length === 0 && (
                      <p className="px-4 py-6 text-xs text-muted-foreground text-center">Todos os CPFs enviados foram encontrados.</p>
                    )}
                    {naoEncontrados.map(cpf => (
                      <div key={cpf} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                        <p className="text-xs font-mono text-muted-foreground">{formatCpf(cpf)}</p>
                        <button onClick={() => removerNaoEncontrado(cpf)} className="text-xs text-muted-foreground hover:text-red-600 inline-flex items-center gap-1">
                          <X size={11} />ocultar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Datas + agendar */}
            <div className="bg-card border rounded-xl p-5 shadow-sm">
              <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <CalendarClock size={14} className="text-accent" />Período do agendamento
              </p>
              <div className={`grid grid-cols-1 ${isDesligado ? "" : "sm:grid-cols-2"} gap-4 mb-4`}>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Início</label>
                  <Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} min={minDate} className="text-sm" />
                </div>
                {!isDesligado && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Fim</label>
                    <Input type="date" value={fim} onChange={e => setFim(e.target.value)} min={inicio || undefined} className="text-sm" />
                  </div>
                )}
              </div>
              {inicio && inicio < minDate && (
                <p className="text-xs text-red-600 mb-3 flex items-center gap-1.5">
                  <AlertCircle size={12} />
                  {operacao === "status" && valorNovo === "Afastado"
                    ? "Afastamento precisa ser agendado com pelo menos 1 dia de antecedência."
                    : "O agendamento precisa ser feito com pelo menos 2 dias de antecedência."}
                </p>
              )}
              {!isDesligado && inicio && fim && fim < inicio && (
                <p className="text-xs text-red-600 mb-3 flex items-center gap-1.5"><AlertCircle size={12} />A data de fim precisa ser igual ou posterior ao início.</p>
              )}
              <p className="text-xs text-muted-foreground mb-4">
                {isDesligado
                  ? "A alteração será aplicada automaticamente a partir do início e não será revertida automaticamente."
                  : "A alteração será aplicada automaticamente a partir do início e revertida ao valor anterior depois do fim."}
              </p>
              <div className="flex justify-end">
                <Button onClick={agendar} disabled={!podeAgendar}
                  className="bg-accent hover:bg-accent/90 text-white font-semibold px-6">
                  Agendar para {selecionados.length || "..."} colaborador{selecionados.length !== 1 ? "es" : ""}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Sucesso */}
        {sucesso && resumoSucesso && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4"><Check size={28} className="text-green-600" /></div>
            <h3 className="text-lg font-bold text-foreground mb-1">Agendamento criado!</h3>
            <p className="text-muted-foreground text-sm">
              {resumoSucesso.qtd} colaborador{resumoSucesso.qtd !== 1 ? "es" : ""} agendado{resumoSucesso.qtd !== 1 ? "s" : ""}{" "}
              {resumoSucesso.fim === "9999-12-31"
                ? <>a partir de {new Date(resumoSucesso.inicio + "T00:00:00").toLocaleDateString("pt-BR")} (permanente).</>
                : <>de {new Date(resumoSucesso.inicio + "T00:00:00").toLocaleDateString("pt-BR")} a {new Date(resumoSucesso.fim + "T00:00:00").toLocaleDateString("pt-BR")}.</>
              }
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              Acompanhe em <Link href="/painel/status-agendados" className="text-accent font-semibold underline">Status agendados</Link>.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}