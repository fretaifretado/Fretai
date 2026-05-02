import { useState, useMemo, useEffect, useCallback } from "react";
import DashboardLayout from "./layout";
import { useDashboard } from "./context";
import {
  BarChart2, CheckCircle2, XCircle, DollarSign, TrendingDown, FileSpreadsheet,
  RefreshCw,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("jwt_token") ?? "";
  return { Authorization: `Bearer ${token}` };
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MESES_CURTO = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

type StatusPedido = "Processando" | "Aprovado" | "Cancelado";

interface PedidoApi {
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
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

function calcNextPeriodo() {
  const hoje = new Date();
  const ano = hoje.getDate() >= 28
    ? (hoje.getMonth() === 11 ? hoje.getFullYear() + 1 : hoje.getFullYear())
    : hoje.getFullYear();
  const mes = hoje.getDate() >= 28
    ? (hoje.getMonth() === 11 ? 1 : hoje.getMonth() + 2)
    : hoje.getMonth() + 1;
  return { ano, mes, label: `${MESES_CURTO[mes - 1]}/${ano}` };
}

interface CardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  color: string;
  bg: string;
  loading?: boolean;
}

function ReportCard({ icon: Icon, label, value, sub, color, bg, loading }: CardProps) {
  return (
    <div className={`rounded-2xl border p-6 shadow-sm flex flex-col gap-3 ${bg}`}>
      <div className={`flex items-center gap-2 ${color}`}>
        <div className="p-2 rounded-xl bg-white/60">
          <Icon size={18} />
        </div>
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <div className="h-9 w-28 bg-white/40 rounded-lg animate-pulse" />
      ) : (
        <p className={`text-3xl font-bold leading-none ${color}`}>{value}</p>
      )}
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

export default function RelatoriosPage() {
  const { colaboradores, empresaAtiva, filialAtiva, turnos } = useDashboard();

  const [pedidos, setPedidos] = useState<PedidoApi[]>([]);
  const [loading, setLoading] = useState(true);

  const companyId = filialAtiva?.id ?? null;
  const valeDiario = parseFloat(empresaAtiva.valeValue ?? "8.50");
  const nextPeriodo = useMemo(() => calcNextPeriodo(), []);

  const fetchPedidos = useCallback(async (cid: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/me/purchase-orders?companyId=${cid}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json() as PedidoApi[];
        setPedidos(data);
      }
    } catch {
      /* silently ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (companyId) {
      void fetchPedidos(companyId);
    } else {
      setLoading(false);
    }
  }, [companyId, fetchPedidos]);

  /* ── Métricas calculadas ── */

  const valesUtilizados = useMemo(
    () => pedidos
      .filter(p => p.status !== "Cancelado")
      .reduce((sum, p) => sum + p.vales, 0),
    [pedidos],
  );

  const valorTotalCompras = useMemo(
    () => pedidos
      .filter(p => p.status !== "Cancelado")
      .reduce((sum, p) => sum + parseFloat(p.total), 0),
    [pedidos],
  );

  const inativosHoje = useMemo(
    () => colaboradores.filter(c =>
      ["Férias", "Licença", "Afastado", "Desligado", "Inativo"].includes(c.status)
    ),
    [colaboradores],
  );

  const diasMesAtual = useMemo(() => {
    const hoje = new Date();
    return ultimoDiaDoMes(hoje.getFullYear(), hoje.getMonth() + 1);
  }, []);

  const economiaMensal = useMemo(() => {
    return inativosHoje.length * valeDiario * 2 * diasMesAtual;
  }, [inativosHoje, valeDiario, diasMesAtual]);

  function normalizeTurnoKey(name: string) {
    return (name || "").toLowerCase().replace(/\s+/g, "");
  }

  const notaASerGerada = useMemo(() => {
    const ativos = colaboradores.filter(c => c.status === "Ativo" && c.turno !== "—");
    return ativos.reduce((sum, c) => {
      const t = turnos.find(x => normalizeTurnoKey(x.nome) === normalizeTurnoKey(c.turno));
      const tipoEscala = t?.tipoEscala ?? "";
      let dias = 22;
      switch (tipoEscala) {
        case "5x2":   dias = 22; break;
        case "6x1":   dias = 26; break;
        case "12x36": dias = 15; break;
        case "24x48": dias = 10; break;
        default:      dias = 22;
      }
      return sum + dias * 2 * valeDiario;
    }, 0);
  }, [colaboradores, turnos, valeDiario]);

  const valesNaoUtilizados = useMemo(
    () => inativosHoje.length * 2 * diasMesAtual,
    [inativosHoje, diasMesAtual],
  );

  const cards: CardProps[] = [
    {
      icon: CheckCircle2,
      label: "Vales utilizados",
      value: valesUtilizados.toLocaleString("pt-BR"),
      sub: "Total de vales emitidos (pedidos aprovados e em processamento)",
      color: "text-green-700",
      bg: "bg-green-50 border-green-100",
    },
    {
      icon: XCircle,
      label: "Vales não utilizados",
      value: valesNaoUtilizados.toLocaleString("pt-BR"),
      sub: `${inativosHoje.length} colaborador(es) inativo(s) × 2 vales/dia × ${diasMesAtual} dias`,
      color: "text-orange-600",
      bg: "bg-orange-50 border-orange-100",
    },
    {
      icon: DollarSign,
      label: "Valor total das compras",
      value: fmt(valorTotalCompras),
      sub: "Soma de todos os pedidos não cancelados",
      color: "text-blue-700",
      bg: "bg-blue-50 border-blue-100",
    },
    {
      icon: TrendingDown,
      label: "Economia atual",
      value: fmt(economiaMensal),
      sub: `Estimativa mensal — colaboradores fora do sistema × R$ ${valeDiario.toFixed(2)}/dia`,
      color: "text-emerald-700",
      bg: "bg-emerald-50 border-emerald-100",
    },
    {
      icon: FileSpreadsheet,
      label: "Nota a ser gerada",
      value: fmt(notaASerGerada),
      sub: `Previsão para ${nextPeriodo.label} com base nos colaboradores ativos e seus turnos`,
      color: "text-violet-700",
      bg: "bg-violet-50 border-violet-100",
    },
  ];

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">

        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 size={18} className="text-accent" />
              <h1 className="text-xl font-bold text-foreground">Relatórios</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Resumo financeiro e de utilização de vale-transporte.
            </p>
          </div>
          <button
            onClick={() => companyId && void fetchPedidos(companyId)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
            title="Atualizar dados"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Atualizar
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {cards.map(card => (
            <ReportCard key={card.label} {...card} loading={loading} />
          ))}
        </div>

        {!loading && pedidos.length === 0 && colaboradores.length === 0 && (
          <div className="mt-16 flex flex-col items-center text-center">
            <BarChart2 size={36} className="text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhum dado disponível ainda. Importe colaboradores para ver os relatórios.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
