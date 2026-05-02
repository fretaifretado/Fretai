import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import DashboardLayout from "./layout";
import { CreditCard, CalendarClock } from "lucide-react";
import { useDashboard, type Colaborador } from "./context";

type StatusPedido = "Processando" | "Aprovado" | "Cancelado";

interface PedidoCompra {
  id: number;
  colaboradorId: number;
  nome: string;
  turno: string;
  periodo: string;
  dataInicio: string;
  dataFim: string;
  dias: number;
  vales: number;
  valorUnit: number;
  total: number;
  status: StatusPedido;
  proRata: boolean;
}

interface PreviewItem {
  colaborador: Colaborador;
  turnoNome: string;
  dias: number;
  vales: number;
  valorUnit: number;
  total: number;
  dataInicio: string;
  dataFim: string;
  periodo: string;
  proRata: boolean;
}

const STATUS_STYLE: Record<StatusPedido, string> = {
  "Processando": "bg-blue-100 text-blue-700 border-blue-200",
  "Aprovado":    "bg-green-100 text-green-700 border-green-200",
  "Cancelado":   "bg-red-100 text-red-700 border-red-200",
};

const MESES_CURTO = [
  "Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez",
];

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizeTurnoKey(name: string): string {
  return (name || "").toLowerCase().replace(/\s+/g, "");
}

function parseInicioOp(raw: string): Date | null {
  if (!raw) return null;
  const dmY = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmY) {
    const d = new Date(Number(dmY[3]), Number(dmY[2]) - 1, Number(dmY[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

function formatDate(ano: number, mes: number, dia: number): string {
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
}

function diasCiclicosNoMes(
  tipoEscala: "12x36" | "24x48",
  inicioOp: string,
  ano: number,
  mes: number,
  fromDay = 1,
): number {
  const start = parseInicioOp(inicioOp);
  if (!start) return tipoEscala === "12x36" ? 15 : 10;

  const cyclePeriod = tipoEscala === "12x36" ? 2 : 3;
  const startTime = start.getTime();
  const ms = 1000 * 60 * 60 * 24;

  let count = 0;
  const daysInMonth = ultimoDiaDoMes(ano, mes);
  for (let day = fromDay; day <= daysInMonth; day++) {
    const current = new Date(ano, mes - 1, day).getTime();
    const diffDays = Math.round((current - startTime) / ms);
    if (diffDays >= 0 && diffDays % cyclePeriod === 0) count++;
  }
  return count || (tipoEscala === "12x36" ? 15 : 10);
}

function calcularDiasNoMes(
  tipoEscala: string,
  inicioOp: string,
  ano: number,
  mes: number,
): { dias: number; proRata: boolean; fromDay: number } {
  const start = parseInicioOp(inicioOp);

  if (start) {
    const sy = start.getFullYear();
    const sm = start.getMonth() + 1;
    if (sy > ano || (sy === ano && sm > mes)) {
      return { dias: 0, proRata: false, fromDay: 1 };
    }
  }

  const isFirstMonth =
    !!start && start.getFullYear() === ano && start.getMonth() + 1 === mes;
  const fromDay = isFirstMonth ? start!.getDate() : 1;

  let dias: number;

  if (tipoEscala === "12x36" || tipoEscala === "24x48") {
    dias = diasCiclicosNoMes(tipoEscala as "12x36" | "24x48", inicioOp, ano, mes, fromDay);
  } else if (isFirstMonth) {
    const daysInMonth = ultimoDiaDoMes(ano, mes);
    dias = 0;
    for (let day = fromDay; day <= daysInMonth; day++) {
      const wd = new Date(ano, mes - 1, day).getDay();
      if (tipoEscala === "5x2" && wd >= 1 && wd <= 5) dias++;
      else if (tipoEscala === "6x1" && wd >= 1 && wd <= 6) dias++;
      else if (tipoEscala !== "5x2" && tipoEscala !== "6x1") dias++;
    }
    if (!dias) dias = tipoEscala === "6x1" ? 26 : 22;
  } else {
    switch (tipoEscala) {
      case "5x2":   dias = 22; break;
      case "6x1":   dias = 26; break;
      case "12x36": dias = 15; break;
      case "24x48": dias = 10; break;
      default:      dias = 22;
    }
  }

  return { dias, proRata: isFirstMonth, fromDay };
}

const API_URL = import.meta.env.VITE_API_URL ?? "";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("jwt_token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export default function ComprasPage() {
  const { colaboradoresDaFilial: colaboradores, empresaAtiva, turnos, filialAtiva } = useDashboard();

  const hoje = new Date();

  const defaultAno = hoje.getDate() >= 28
    ? (hoje.getMonth() === 11 ? hoje.getFullYear() + 1 : hoje.getFullYear())
    : hoje.getFullYear();
  const defaultMes = hoje.getDate() >= 28
    ? (hoje.getMonth() === 11 ? 1 : hoje.getMonth() + 2)
    : hoje.getMonth() + 1;

  const [pedidos, setPedidos] = useState<PedidoCompra[]>([]);
  const [loadingPedidos, setLoadingPedidos] = useState(true);
  const [savingPedidos, setSavingPedidos] = useState(false);
  const [periodoAno] = useState(defaultAno);
  const [periodoMes] = useState(defaultMes);

  const valeDiario = parseFloat(empresaAtiva.valeValue ?? "8.50");
  const companyId = filialAtiva?.id ?? null;

  const fetchPedidos = useCallback(async (cid: number) => {
    setLoadingPedidos(true);
    try {
      const res = await fetch(`${API_URL}/api/me/purchase-orders?companyId=${cid}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        setPedidos([]);
        return;
      }
      const data = await res.json() as {
        id: number;
        employeeId: number | null;
        nome: string;
        turno: string;
        periodo: string;
        dataInicio: string;
        dataFim: string;
        dias: number;
        vales: number;
        valorUnit: string;
        total: string;
        status: StatusPedido;
        proRata: boolean;
      }[];
      setPedidos(
        data.map(o => ({
          id: o.id,
          colaboradorId: o.employeeId ?? 0,
          nome: o.nome,
          turno: o.turno,
          periodo: o.periodo,
          dataInicio: o.dataInicio,
          dataFim: o.dataFim,
          dias: o.dias,
          vales: o.vales,
          valorUnit: parseFloat(o.valorUnit),
          total: parseFloat(o.total),
          status: o.status,
          proRata: o.proRata,
        })),
      );
    } catch (err) {
      console.error("[compras] erro ao carregar pedidos:", err);
    } finally {
      setLoadingPedidos(false);
    }
  }, []);

  useEffect(() => {
    if (companyId) {
      void fetchPedidos(companyId);
    } else {
      setLoadingPedidos(false);
    }
  }, [companyId, fetchPedidos]);

  const colaboradoresElegiveis = useMemo(() =>
    colaboradores.filter(c => c.status === "Ativo" && c.turno !== "—"),
    [colaboradores]);

  const previewItems = useMemo((): PreviewItem[] =>
    colaboradoresElegiveis
      .map(c => {
        const t = turnos.find(x => normalizeTurnoKey(x.nome) === normalizeTurnoKey(c.turno));
        const escala = t?.tipoEscala ?? "";
        const { dias, proRata, fromDay } = calcularDiasNoMes(escala, c.inicioOperacao, periodoAno, periodoMes);
        const vales = dias * 2;
        const total = vales * valeDiario;
        const dataInicio = formatDate(periodoAno, periodoMes, fromDay);
        const dataFim    = formatDate(periodoAno, periodoMes, ultimoDiaDoMes(periodoAno, periodoMes));
        const periodo    = `${MESES_CURTO[periodoMes - 1]}/${periodoAno}`;
        return { colaborador: c, turnoNome: c.turno, dias, vales, valorUnit: valeDiario, total, dataInicio, dataFim, periodo, proRata };
      })
      .filter(item => item.dias > 0),
    [colaboradoresElegiveis, turnos, periodoAno, periodoMes, valeDiario]);

  const autoGeradoParaRef = useRef<string>("");

  async function salvarItens(items: PreviewItem[], cid: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/me/purchase-orders`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        companyId: cid,
        items: items.map(item => ({
          employeeId: item.colaborador.id,
          nome: item.colaborador.nome,
          turno: item.turnoNome,
          periodo: item.periodo,
          dataInicio: item.dataInicio,
          dataFim: item.dataFim,
          dias: item.dias,
          vales: item.vales,
          valorUnit: item.valorUnit,
          total: item.total,
          proRata: item.proRata,
        })),
      }),
    });

    if (res.ok) {
      const saved = await res.json() as {
        id: number;
        employeeId: number | null;
        nome: string;
        turno: string;
        periodo: string;
        dataInicio: string;
        dataFim: string;
        dias: number;
        vales: number;
        valorUnit: string;
        total: string;
        status: StatusPedido;
        proRata: boolean;
      }[];
      const novos: PedidoCompra[] = saved.map(o => ({
        id: o.id,
        colaboradorId: o.employeeId ?? 0,
        nome: o.nome,
        turno: o.turno,
        periodo: o.periodo,
        dataInicio: o.dataInicio,
        dataFim: o.dataFim,
        dias: o.dias,
        vales: o.vales,
        valorUnit: parseFloat(o.valorUnit),
        total: parseFloat(o.total),
        status: o.status,
        proRata: o.proRata,
      }));
      setPedidos(prev => [...novos, ...prev]);
    } else {
      console.error("[compras] erro ao salvar pedidos:", await res.text());
    }
  }

  /**
   * Current period label used to detect which orders already exist for this period.
   * e.g. "Mai/2026"
   */
  const periodoLabel = `${MESES_CURTO[periodoMes - 1]}/${periodoAno}`;

  /**
   * Key representing all eligible collaborator IDs + current period.
   * Changes whenever collaborators are added/removed or the period changes.
   */
  const colaboradoresKey = `${periodoLabel}:${colaboradoresElegiveis.map(c => c.id).sort().join(",")}`;

  useEffect(() => {
    if (loadingPedidos || savingPedidos || companyId === null) return;
    if (previewItems.length === 0) return;
    if (autoGeradoParaRef.current === colaboradoresKey) return;

    // IDs dos colaboradores que já têm pedido no período atual
    const jaGeradosIds = new Set(
      pedidos
        .filter(p => p.periodo === periodoLabel && p.colaboradorId > 0)
        .map(p => p.colaboradorId),
    );

    // Itens sem pedido ainda
    const faltando = previewItems.filter(item => !jaGeradosIds.has(item.colaborador.id));

    if (faltando.length === 0) {
      autoGeradoParaRef.current = colaboradoresKey;
      return;
    }

    autoGeradoParaRef.current = colaboradoresKey;
    setSavingPedidos(true);
    salvarItens(faltando, companyId)
      .catch(err => console.error("[compras] auto-geração falhou:", err))
      .finally(() => setSavingPedidos(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingPedidos, savingPedidos, pedidos, previewItems, companyId, colaboradoresKey, periodoLabel]);

  const totalGasto          = pedidos.reduce((a, p) => a + p.total, 0);
  const totalValesHistorico = pedidos.reduce((a, p) => a + p.vales, 0);
  const ultimoPedido        = pedidos.length > 0 ? pedidos[0].periodo : "—";

  const proxDia28 = (() => {
    const candidate = new Date(hoje.getFullYear(), hoje.getMonth(), 28);
    if (candidate > hoje) return candidate;
    return new Date(hoje.getFullYear(), hoje.getMonth() + 1, 28);
  })();
  const proxDia28Str = formatDate(proxDia28.getFullYear(), proxDia28.getMonth() + 1, 28);

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CreditCard size={18} className="text-accent" />
              <h1 className="text-xl font-bold text-foreground">Compras</h1>
            </div>
            <p className="text-muted-foreground text-sm">Histórico e gestão de compras de vale-transporte.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total em compras", value: fmt(totalGasto) },
            { label: "Total de vales",   value: totalValesHistorico.toLocaleString("pt-BR") },
            { label: "Último pedido",    value: ultimoPedido },
          ].map(item => (
            <div key={item.label} className="bg-card border rounded-xl p-5 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">{item.label}</p>
              <p className="text-2xl font-bold text-foreground">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-card border rounded-xl shadow-sm overflow-hidden mb-5">
          {loadingPedidos || (savingPedidos && pedidos.length === 0) ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {savingPedidos && pedidos.length === 0 ? "Gerando compras automaticamente…" : "Carregando histórico…"}
            </div>
          ) : pedidos.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Nenhuma compra realizada ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    {["Colaborador", "Turno", "Período", "Vales", "Valor unit.", "Total", "Status"].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pedidos.map(p => (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-foreground">{p.nome}</p>
                        <p className="text-xs text-muted-foreground font-mono">{p.dataInicio} – {p.dataFim}</p>
                        {p.proRata && (
                          <span className="inline-flex items-center mt-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium border border-amber-200">
                            1ª compra
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground text-xs">{p.turno}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{p.periodo}</td>
                      <td className="px-5 py-3.5 font-medium text-foreground">{p.vales.toLocaleString("pt-BR")}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{fmt(p.valorUnit)}</td>
                      <td className="px-5 py-3.5 font-semibold text-foreground">{fmt(p.total)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${STATUS_STYLE[p.status]}`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <CalendarClock size={15} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-700">
            Próxima compra programada: <strong>{proxDia28Str}</strong> —{" "}
            {colaboradoresElegiveis.length} colaborador{colaboradoresElegiveis.length !== 1 ? "es" : ""} elegível{colaboradoresElegiveis.length !== 1 ? "is" : ""}.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
