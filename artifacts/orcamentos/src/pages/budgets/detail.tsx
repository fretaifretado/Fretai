import { useState, useRef, Suspense, useMemo } from "react";
import { RouteMap } from "@/components/RouteMap";
import type { MapEmployee } from "@/components/RouteMap";
import { useParams, Link } from "wouter";
import * as XLSX from "xlsx";
import { 
  useGetBudget, 
  getGetBudgetQueryKey,
  useGetBudgetSummary,
  getGetBudgetSummaryQueryKey,
  useUploadEmployees,
  useProcessBudget
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Upload, Play, Users, MapPin, Bus, Navigation,
  CheckCircle2, Clock, AlertCircle, Truck, Download, ChevronDown, ChevronUp
} from "lucide-react";
import type { EmployeeInput } from "@workspace/api-client-react";

// ─── Tipos estendidos com campos de turno e bloco ───────────────────────────

interface ExtRoute {
  id: number;
  name: string;
  shiftTime?: string | null;
  direction?: string | null;
  vehicleBlockId?: number | null;
  totalPassengers: number;
  totalDistanceKm: number;
  estimatedMinutes: number;
  occupancyPct: number;
  totalCost: number | null;
  vehicleAssignments: Array<{ vehicleType: string; count: number; capacity: number }>;
  boardingPoints: Array<{ id: number; name: string; lat: number; lng: number; passengerCount: number; sequenceOrder?: number | null }>;
}

// ─── Paleta de cores por bloco de veículo ───────────────────────────────────

const BLOCK_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300", dot: "bg-blue-500" },
  { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300", dot: "bg-emerald-500" },
  { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300", dot: "bg-amber-500" },
  { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300", dot: "bg-purple-500" },
  { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-300", dot: "bg-rose-500" },
  { bg: "bg-cyan-100", text: "text-cyan-800", border: "border-cyan-300", dot: "bg-cyan-500" },
  { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300", dot: "bg-orange-500" },
  { bg: "bg-teal-100", text: "text-teal-800", border: "border-teal-300", dot: "bg-teal-500" },
];

function blockColor(vehicleBlockId: number) {
  return BLOCK_COLORS[(vehicleBlockId - 1) % BLOCK_COLORS.length];
}

// blockLabel é calculado dinamicamente no componente (blockTypeLabel)

// ─── Componente principal ───────────────────────────────────────────────────

export default function BudgetDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);

  const { data: detail, isLoading: isLoadingDetail } = useGetBudget(id, { 
    query: { enabled: !!id, queryKey: getGetBudgetQueryKey(id) } 
  });
  
  const { data: summary } = useGetBudgetSummary(id, {
    query: { enabled: !!id, queryKey: getGetBudgetSummaryQueryKey(id) }
  });

  const uploadEmployees = useUploadEmployees();
  const processBudget = useProcessBudget();

  // ─── Upload de planilha ───────────────────────────────────────────────────

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = () => {
      toast({ title: "Erro na leitura", description: "Não foi possível ler o arquivo.", variant: "destructive" });
    };

    reader.onload = (evt) => {
      try {
        const raw = evt.target?.result as ArrayBuffer;
        const data = new Uint8Array(raw);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });

        if (rows.length === 0) {
          toast({ title: "Planilha vazia", description: "A planilha não contém dados.", variant: "destructive" });
          return;
        }

        const normalize = (s: string) =>
          s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

        const colMap = (row: Record<string, string>) => {
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(row)) out[normalize(k)] = String(v ?? "");
          return out;
        };

        const buildAddress = (n: Record<string, string>): string => {
          const single = n["endereco"] || n["address"] || n["logradouro"] || n["end"] || n["endere\u00e7o"];
          if (single) return single.trim();

          const street = n["rua onde mora"] || n["rua"] || n["logradouro"] || n["avenida"] || n["av"] || "";
          const num = n["n\u00b0 onde mora"] || n["numero"] || n["n\u00famero"] || n["no onde mora"] || n["n"] || "";
          const bairro = n["bairro"] || n["district"] || "";
          const cidade = n["cidade"] || n["city"] || n["municipio"] || "";
          const estado = n["estado"] || n["uf"] || n["state"] || "";
          const cep = n["cep"] || n["zipcode"] || n["zip"] || "";

          const parts = [
            street && num ? `${street}, ${num}` : street || num,
            bairro, cidade, estado, cep,
          ].filter(Boolean);

          return parts.join(", ");
        };

        const employees: EmployeeInput[] = rows.map(row => {
          const n = colMap(row);
          const name = n["nome"] || n["name"] || n["funcionario"] || n["colaborador"] || "";
          const address = buildAddress(n);
          const shift = n["turno"] || n["shift"] || n["periodo"] || n["horario"] || null;
          return { name: name.trim(), address: address.trim(), shift: shift?.trim() || null };
        }).filter(e => e.name && e.address);

        if (employees.length === 0) {
          toast({
            title: "Planilha inválida",
            description: `Colunas encontradas: ${Object.keys(rows[0]).join(", ")}. São necessárias colunas de nome e endereço.`,
            variant: "destructive"
          });
          return;
        }

        uploadEmployees.mutate({ id, data: { employees } }, {
          onSuccess: (res) => {
            toast({
              title: "Upload Concluído",
              description: `${res.geocoded} funcionários importados.${res.failed > 0 ? ` ${res.failed} falharam na geolocalização.` : ""}`
            });
            queryClient.invalidateQueries({ queryKey: getGetBudgetQueryKey(id) });
            queryClient.invalidateQueries({ queryKey: getGetBudgetSummaryQueryKey(id) });
          },
          onError: () => {
            toast({ title: "Erro no upload", description: "Falha ao enviar os dados para o servidor.", variant: "destructive" });
          }
        });
      } catch (err) {
        console.error("Spreadsheet parse error:", err);
        toast({ title: "Erro na leitura", description: "Não foi possível ler o arquivo. Verifique se é uma planilha válida.", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleProcess = () => {
    processBudget.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Processamento concluído", description: "Rotas geradas com sucesso." });
        queryClient.invalidateQueries({ queryKey: getGetBudgetQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetBudgetSummaryQueryKey(id) });
      },
      onError: () => {
        toast({ title: "Erro", description: "Falha ao processar rotas.", variant: "destructive" });
      }
    });
  };

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (isLoadingDetail || !detail) {
    return <div className="p-8 space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-[400px] w-full" /></div>;
  }

  const { budget, employees, routes: rawRoutes } = detail;
  const routes = rawRoutes as unknown as ExtRoute[];

  // ─── Cálculos derivados ───────────────────────────────────────────────────

  const strategyLabel = budget.strategy === "min_cost" ? "Menor Custo" 
                      : budget.strategy === "min_vehicles" ? "Menos Veículos" 
                      : "Maior Ocupação";

  // Agrupa rotas por turno (mantém ordem cronológica)
  const shiftGroups: Map<string, ExtRoute[]> = new Map();
  for (const r of routes) {
    const key = r.shiftTime ?? "Sem turno";
    if (!shiftGroups.has(key)) shiftGroups.set(key, []);
    shiftGroups.get(key)!.push(r);
  }
  const sortedShifts = [...shiftGroups.keys()].sort();

  // Veículos físicos = maior vehicleBlockId único
  const physicalVehicles = routes.length > 0
    ? Math.max(...routes.map(r => r.vehicleBlockId ?? 0))
    : 0;

  // Mapa bloco → turnos cobertos
  const blockSchedule: Map<number, string[]> = new Map();
  // Mapa bloco → turno → duração média da rota (min)
  const blockDurations: Map<number, Map<string, number>> = new Map();
  for (const r of routes) {
    if (!r.vehicleBlockId) continue;
    const b = r.vehicleBlockId;
    const shift = r.shiftTime ?? "Sem turno";
    if (!blockSchedule.has(b)) blockSchedule.set(b, []);
    if (!blockSchedule.get(b)!.includes(shift)) blockSchedule.get(b)!.push(shift);
    if (!blockDurations.has(b)) blockDurations.set(b, new Map());
    const prev = blockDurations.get(b)!.get(shift);
    blockDurations.get(b)!.set(shift, prev === undefined ? r.estimatedMinutes : Math.round((prev + r.estimatedMinutes) / 2));
  }

  // Veículos que cobrem mais de 1 turno
  const multiShiftBlocks = [...blockSchedule.entries()].filter(([, shifts]) => shifts.length > 1);

  // Mapa bloco → tipo de veículo (ex: "Ônibus", "Micro-ônibus")
  const blockTypeMap = new Map<number, string>();
  for (const r of routes) {
    if (r.vehicleBlockId && r.vehicleAssignments.length > 0 && !blockTypeMap.has(r.vehicleBlockId)) {
      blockTypeMap.set(r.vehicleBlockId, r.vehicleAssignments[0].vehicleType);
    }
  }

  // Numeração sequencial por tipo: Ônibus 1, Ônibus 2, Micro-ônibus 1, ...
  const typeCounters = new Map<string, number>();
  const blockTypeIndex = new Map<number, number>();
  for (const blockId of [...blockTypeMap.keys()].sort((a, b) => a - b)) {
    const type = blockTypeMap.get(blockId)!;
    const n = (typeCounters.get(type) ?? 0) + 1;
    typeCounters.set(type, n);
    blockTypeIndex.set(blockId, n);
  }

  // Mapa boardingPointId → endereço representativo (primeiro funcionário do ponto)
  const bpAddressMap = new Map<number, string>();
  for (const emp of employees as unknown as MapEmployee[]) {
    if (emp.boardingPointId != null && !bpAddressMap.has(emp.boardingPointId)) {
      bpAddressMap.set(emp.boardingPointId, emp.address);
    }
  }

  // Rótulo legível: "Ônibus 1", "Micro-ônibus 2", etc.
  const vehicleLabel = (blockId: number) => {
    const type = blockTypeMap.get(blockId) ?? "Veículo";
    const n = blockTypeIndex.get(blockId) ?? blockId;
    // Abrevia para caber na célula
    const short = type === "Micro-ônibus" ? "Micro-ônibus" : type;
    return `${short} ${n}`;
  };

  // Frota física por tipo (para exibição resumida)
  const TIER_ORDER = ["Ônibus", "Micro-ônibus", "Van", "Mini-Van"];
  const fleetByType = new Map<string, { physicalCount: number; capacity: number }>();
  for (const [, type] of blockTypeMap) {
    const cap = routes.find(r => r.vehicleAssignments[0]?.vehicleType === type)?.vehicleAssignments[0]?.capacity ?? 0;
    if (!fleetByType.has(type)) fleetByType.set(type, { physicalCount: 0, capacity: cap });
    fleetByType.get(type)!.physicalCount += 1;
  }
  const fleetSummary = [...fleetByType.entries()]
    .sort(([a], [b]) => {
      const ia = TIER_ORDER.indexOf(a), ib = TIER_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

  // ─── Parsing de horários de entrada/saída dos turnos ─────────────────────
  // "06:00/14:20 SEG/SAB" → start="06:00", end="14:20"
  const timeToMins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const minsToTime = (m: number) => {
    const hh = Math.floor(m / 60) % 24;
    const mm = m % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  // Extrai pares (início, fim) de turno dos dados dos funcionários
  const shiftPairMap = new Map<string, string>(); // startTime → endTime
  for (const emp of employees) {
    const shift = (emp as { shift?: string | null }).shift;
    if (!shift) continue;
    const m = shift.match(/^(\d{1,2}:\d{2})\/(\d{1,2}:\d{2})/);
    if (m) {
      const start = m[1].padStart(5, "0");
      const end = m[2].padStart(5, "0");
      if (!shiftPairMap.has(start)) shiftPairMap.set(start, end);
    }
  }

  // Para cada horário de entrada (coluna), qual turno está SAINDO nesse momento?
  // Ex: às 06:00 entra T1 e sai T3 (que termina às 06:00)
  // O mesmo veículo faz os dois: entrega T1 e embarca T3 de volta para casa
  const exitingShiftAt = new Map<string, string>(); // entryTime → shiftStartTime que sai
  for (const [exitStart, exitEnd] of shiftPairMap) {
    const exitEndMins = timeToMins(exitEnd);
    for (const entryShift of sortedShifts) {
      const entryMins = timeToMins(entryShift);
      const diff = Math.abs(entryMins - exitEndMins);
      const diffWrapped = Math.min(diff, 24 * 60 - diff); // considera virada de meia-noite
      if (diffWrapped <= 15) {
        exitingShiftAt.set(entryShift, exitStart);
        break;
      }
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/orcamentos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{budget.name}</h1>
              {budget.status === "ready" ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-700">Pronto</Badge>
              ) : budget.status === "processing" ? (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">Processando</Badge>
              ) : (
                <Badge variant="secondary">Rascunho</Badge>
              )}
            </div>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              <MapPin className="h-3 w-3" /> {budget.companyAddress}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {budget.status !== "processing" && (
            <Button 
              size="lg"
              className={budget.status === "ready" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
              disabled={employees.length === 0 || processBudget.isPending}
              onClick={handleProcess}
            >
              {processBudget.isPending ? (
                <Clock className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Play className="mr-2 h-5 w-5" />
              )}
              Processar Rotas
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start h-12 bg-transparent border-b rounded-none mb-6">
          <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6">Visão Geral</TabsTrigger>
          <TabsTrigger value="employees" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6">
            Funcionários ({employees.length})
          </TabsTrigger>
          <TabsTrigger value="routes" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6">
            Rotas ({routes.filter(r => r.direction !== "volta").length}↑ · {routes.filter(r => r.direction === "volta").length}↓)
          </TabsTrigger>
          <TabsTrigger value="map" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6">Mapa Visual</TabsTrigger>
        </TabsList>

        {/* ── VISÃO GERAL ─────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Custo Estimado</p>
                    <p className="text-3xl font-bold">{summary?.totalCost ? `R$ ${summary.totalCost.toFixed(2)}` : "-"}</p>
                  </div>
                  <div className="bg-primary/10 p-3 rounded-xl text-primary">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Passageiros</p>
                    <p className="text-3xl font-bold">{summary?.totalEmployees || 0}</p>
                    {sortedShifts.length > 0 && routes.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        {sortedShifts.map(shift => {
                          const pax = (shiftGroups.get(shift) ?? []).reduce((s, r) => s + r.totalPassengers, 0);
                          return (
                            <div key={shift} className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-muted-foreground font-mono">{shift}</span>
                              <span className="font-semibold tabular-nums">{pax} Pas</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="bg-primary/10 p-3 rounded-xl text-primary self-start ml-3">
                    <Users className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Rotas / Turnos</p>
                    <p className="text-3xl font-bold">{routes.length}</p>
                    {sortedShifts.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">{sortedShifts.length} {sortedShifts.length === 1 ? "turno" : "turnos"}</p>
                    )}
                    {routes.length > 0 && (() => {
                      const idaCnt = routes.filter(r => r.direction !== "volta").length;
                      const voltaCnt = routes.filter(r => r.direction === "volta").length;
                      return voltaCnt > 0 ? (
                        <div className="flex gap-2 mt-1.5">
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">↑ {idaCnt} ida p/ empresa</span>
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700">↓ {voltaCnt} volta p/ casa</span>
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <div className="bg-primary/10 p-3 rounded-xl text-primary">
                    <Navigation className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Veículos Físicos</p>
                    <p className="text-3xl font-bold">{physicalVehicles || "-"}</p>
                    {multiShiftBlocks.length > 0 && (
                      <p className="text-xs text-emerald-600 font-medium mt-1">
                        {multiShiftBlocks.length} {multiShiftBlocks.length === 1 ? "reutilizado" : "reutilizados"}
                      </p>
                    )}
                  </div>
                  <div className="bg-primary/10 p-3 rounded-xl text-primary">
                    <Truck className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Parâmetros do Orçamento</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4 text-sm">
                  <div className="flex justify-between border-b pb-2">
                    <dt className="text-muted-foreground">Raio de Caminhada Máximo</dt>
                    <dd className="font-medium">{budget.maxRadiusKm} km</dd>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <dt className="text-muted-foreground">Tempo de Viagem Máximo</dt>
                    <dd className="font-medium">{budget.maxRouteMinutes} minutos</dd>
                  </div>
                  <div className="flex justify-between pb-2">
                    <dt className="text-muted-foreground">Estratégia</dt>
                    <dd className="font-medium">{strategyLabel}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Frota Utilizada</CardTitle>
                <CardDescription>Composição dos veículos nas rotas</CardDescription>
              </CardHeader>
              <CardContent>
                {fleetSummary.length ? (
                  <div className="space-y-3">
                    {fleetSummary.map(([type, data]) => (
                      <div key={type} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Bus className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{type}</span>
                        </div>
                        <div className="text-sm text-right">
                          <span className="font-bold">{data.physicalCount}</span>
                          <span className="text-muted-foreground ml-1">
                            {data.physicalCount === 1 ? "veículo" : "veículos"}
                          </span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            ({data.capacity} lugares cada)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    As rotas ainda não foram processadas.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Escalonamento de veículos por turno — entrada + saída */}
          {blockSchedule.size > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Roteiro Diário por Veículo</CardTitle>
                <CardDescription>
                  Ao chegar na empresa com um turno, o veículo imediatamente embarca os que estão saindo —
                  fazendo <strong>entrada + saída em cada horário</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">

                {/* Legenda */}
                <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary text-primary-foreground font-bold text-[10px]">→</span>
                    Entrada: leva funcionários <strong>para a empresa</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded border-2 border-primary text-primary font-bold text-[10px]">←</span>
                    Saída: traz funcionários <strong>para casa</strong>
                  </span>
                </div>

                {/* Tabela: veículo × horário — mostra entrada e saída em cada slot */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/40">
                        <th className="text-left font-semibold text-muted-foreground py-2 px-3 rounded-tl">Veículo</th>
                        {sortedShifts.map(shift => {
                          const exitingStart = exitingShiftAt.get(shift);
                          const exitEnd = exitingStart ? shiftPairMap.get(exitingStart) : undefined;
                          return (
                            <th key={shift} className="py-2 px-3 text-center font-semibold text-muted-foreground min-w-[130px]">
                              <div className="text-primary font-bold text-sm">{shift}</div>
                              {exitEnd && (
                                <div className="text-[10px] text-muted-foreground font-normal">
                                  sai turno {exitingStart}
                                </div>
                              )}
                            </th>
                          );
                        })}
                        <th className="py-2 px-3 text-center font-semibold text-muted-foreground rounded-tr">Viagens/dia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...blockSchedule.entries()].sort(([a], [b]) => a - b).map(([blockId, coveredShifts]) => {
                        const color = blockColor(blockId);
                        const totalTrips = coveredShifts.length * 2; // entrada + saída por turno
                        return (
                          <tr key={blockId} className="border-t hover:bg-muted/20 transition-colors">
                            <td className="py-3 px-3">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${color.bg} ${color.text} border ${color.border}`}>
                                <span className={`w-2 h-2 rounded-full ${color.dot}`} />
                                {vehicleLabel(blockId)}
                              </span>
                            </td>
                            {sortedShifts.map(shift => {
                              const doesEntry = coveredShifts.includes(shift);
                              const exitingStart = exitingShiftAt.get(shift);
                              const doesExit = doesEntry && !!exitingStart;
                              const dur = blockDurations.get(blockId)?.get(shift);
                              if (!doesEntry) {
                                return <td key={shift} className="py-3 px-3 text-center"><span className="text-muted-foreground/30">—</span></td>;
                              }
                              return (
                                <td key={shift} className="py-3 px-3">
                                  <div className="flex flex-col gap-1">
                                    {/* Entrada */}
                                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${color.bg} ${color.text}`}>
                                      <span className="font-bold text-[11px]">→</span>
                                      <span className="text-[11px] font-medium">
                                        Entrada {shift}
                                        {dur && <span className="opacity-70 ml-1">({dur}min)</span>}
                                      </span>
                                    </div>
                                    {/* Saída (se existir turno saindo nesse horário) */}
                                    {doesExit && (
                                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded border ${color.border} ${color.text} bg-white`}>
                                        <span className="font-bold text-[11px]">←</span>
                                        <span className="text-[11px] font-medium">
                                          Saída turno {exitingStart}
                                          {dur && <span className="opacity-70 ml-1">({dur}min)</span>}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="py-3 px-3 text-center">
                              <span className={`text-base font-bold ${totalTrips >= 4 ? "text-emerald-600" : "text-muted-foreground"}`}>
                                {totalTrips}×
                              </span>
                              <div className="text-[10px] text-muted-foreground">viagens</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Roteiro horário para o primeiro veículo (exemplo) */}
                {blockSchedule.size > 0 && sortedShifts.length >= 2 && (() => {
                  const [firstBlockId, firstShifts] = [...blockSchedule.entries()].sort(([a],[b]) => a-b)[0];
                  const color = blockColor(firstBlockId);
                  const events: { time: string; label: string; type: "entry" | "exit" }[] = [];
                  for (const shift of firstShifts.slice().sort()) {
                    const dur = blockDurations.get(firstBlockId)?.get(shift) ?? 60;
                    const shiftMins = timeToMins(shift);
                    // Entrada: sai para buscar dur min antes
                    events.push({ time: minsToTime(shiftMins - dur), label: `Saída para buscar T${shift}`, type: "entry" });
                    events.push({ time: shift, label: `Entrega T${shift} na empresa`, type: "entry" });
                    // Saída: embarque imediato de quem está saindo
                    const exitingStart = exitingShiftAt.get(shift);
                    if (exitingStart) {
                      events.push({ time: shift, label: `Embarque T${exitingStart} (saída)`, type: "exit" });
                      events.push({ time: minsToTime(shiftMins + dur), label: `Entrega T${exitingStart} em casa`, type: "exit" });
                    }
                  }
                  events.sort((a,b) => timeToMins(a.time) - timeToMins(b.time));

                  return (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        Exemplo — Roteiro Diário do {vehicleLabel(firstBlockId)}
                      </p>
                      <div className="relative pl-6 space-y-2 border-l-2 border-border ml-2">
                        {events.map((ev, i) => (
                          <div key={i} className="relative flex items-start gap-3">
                            <div className={`absolute w-3 h-3 rounded-full -left-[23px] top-0.5 border-2 border-background ${ev.type === "entry" ? color.dot : "bg-amber-500"}`} />
                            <span className="text-xs font-mono font-bold text-muted-foreground w-12 flex-shrink-0">{ev.time}</span>
                            <span className={`text-xs font-medium ${ev.type === "entry" ? color.text : "text-amber-700"}`}>{ev.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {multiShiftBlocks.length > 0 && (
                  <p className="text-xs text-emerald-600 font-medium">
                    ✓ {multiShiftBlocks.length} {multiShiftBlocks.length === 1 ? "veículo faz" : "veículos fazem"} entrada + saída em múltiplos turnos — máxima utilização da frota.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── FUNCIONÁRIOS ────────────────────────────────────────────────── */}
        <TabsContent value="employees">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
              <div>
                <CardTitle>Base de Funcionários</CardTitle>
                <CardDescription>Formatos aceitos: Excel (.xlsx, .xls), CSV, LibreOffice (.ods) — colunas: Nome, Endereço, Turno</CardDescription>
              </div>
              <div>
                <input 
                  type="file" 
                  accept=".csv,.xlsx,.xls,.ods,.xlsm,.xlsb,.tsv"
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
                <Button 
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadEmployees.isPending}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {uploadEmployees.isPending ? "Importando..." : "Importar Planilha"}
                </Button>
              </div>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Endereço Original</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead className="text-center">Geocodificado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Nenhum funcionário importado. Use o botão acima para enviar uma planilha.
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell className="max-w-xs truncate" title={e.address}>{e.address}</TableCell>
                      <TableCell>{e.shift || "-"}</TableCell>
                      <TableCell className="text-center">
                        {e.geocoded ? (
                          <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">Sim</Badge>
                        ) : (
                          <Badge variant="outline" className="text-destructive border-destructive bg-destructive/10">Falha</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ── ROTAS (agrupadas por turno) ──────────────────────────────────── */}
        <TabsContent value="routes">
          {routes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center flex flex-col items-center">
                <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Nenhuma rota gerada</p>
                <p className="text-muted-foreground mt-1">Importe funcionários e clique em "Processar Rotas".</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {sortedShifts.map(shift => {
                const shiftRoutes = shiftGroups.get(shift) ?? [];
                const shiftPassengers = shiftRoutes.reduce((s, r) => s + r.totalPassengers, 0);
                const shiftVehicles = new Set(shiftRoutes.map(r => r.vehicleBlockId).filter(Boolean)).size;

                return (
                  <div key={shift}>
                    {/* Cabeçalho do turno */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-full">
                        <Clock className="h-4 w-4 text-primary" />
                        <span className="font-bold text-primary text-sm">Turno {shift}</span>
                      </div>
                      <span className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                        {(() => {
                          const idaC = shiftRoutes.filter(r => r.direction !== "volta").length;
                          const voltaC = shiftRoutes.filter(r => r.direction === "volta").length;
                          return voltaC > 0 ? (
                            <>
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">↑ {idaC} ida p/ empresa</span>
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700">↓ {voltaC} volta p/ casa</span>
                            </>
                          ) : (
                            <>{shiftRoutes.length} {shiftRoutes.length === 1 ? "rota" : "rotas"}</>
                          );
                        })()}
                        <span>· {shiftPassengers} passageiros · {shiftVehicles} {shiftVehicles === 1 ? "veículo" : "veículos"}</span>
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    {/* Cards de rota do turno — separados por direção */}
                    {(() => {
                      const idaR = shiftRoutes.filter(r => r.direction !== "volta");
                      const voltaR = shiftRoutes.filter(r => r.direction === "volta");
                      return (
                        <>
                          {idaR.length > 0 && voltaR.length > 0 && (
                            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">↑ Entrada</p>
                          )}
                          <div className="space-y-3">
                          {idaR.map(r => {
                            // renderRouteCard(r) inline below
                            const blockId = r.vehicleBlockId ?? 0;
                            const color = blockId > 0 ? blockColor(blockId) : null;
                            const isExpanded = expandedRoute === r.id;
                            return (
                              <Card key={r.id} className={`overflow-hidden transition-shadow hover:shadow-md ${color ? `border-l-4 ${color.border}` : ""}`}>
                                <CardHeader className="pb-3 pt-4 px-5">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <button onClick={() => setExpandedRoute(isExpanded ? null : r.id)} className="text-left flex-1 min-w-0 flex items-center gap-2">
                                        <span className="font-semibold text-sm truncate">{r.name}</span>
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 shrink-0">↑ Ida</span>
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {blockId > 0 && color && (<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color.bg} ${color.text}`}><span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />{vehicleLabel(blockId)}</span>)}
                                      {r.vehicleAssignments.map((v, i) => { const perVehicle = v.count > 1 ? Math.round(r.totalPassengers / v.count) : r.totalPassengers; return (<Badge key={i} variant="secondary" className="text-xs font-semibold">{perVehicle} Pas · {v.count > 1 ? `${v.count}× ` : ""}{v.vehicleType}{v.count > 1 && <span className="ml-1 font-normal opacity-70">({perVehicle}/uni)</span>}</Badge>); })}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                    <span><span className="font-medium text-foreground">{r.totalPassengers}</span> Pas</span>
                                    <span><span className="font-medium text-foreground">{r.occupancyPct.toFixed(0)}%</span> ocup.</span>
                                    <span><span className="font-medium text-foreground">{r.totalDistanceKm}</span> km</span>
                                    <span><span className="font-medium text-foreground">{r.estimatedMinutes}</span> min</span>
                                    {r.totalCost && <span><span className="font-medium text-foreground">R$ {r.totalCost.toFixed(2)}</span></span>}
                                    <button onClick={() => setExpandedRoute(isExpanded ? null : r.id)} className="ml-auto text-primary hover:underline">{isExpanded ? "Recolher" : "Ver pontos"}</button>
                                  </div>
                                </CardHeader>
                                {isExpanded && (
                                  <CardContent className="pt-0 px-5 pb-4">
                                    <div className="relative pl-4 space-y-3 border-l-2 border-border ml-2 mt-2">
                                      {r.boardingPoints.sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0)).map(pt => (
                                        <div key={pt.id} className="relative">
                                          <div className="absolute w-2.5 h-2.5 bg-primary rounded-full -left-[21px] top-1 border-2 border-background" />
                                          <div className="flex justify-between items-start gap-2">
                                            <div className="min-w-0"><p className="text-sm font-medium">{pt.name}</p>{bpAddressMap.get(pt.id) && <p className="text-xs text-muted-foreground truncate">{bpAddressMap.get(pt.id)}</p>}</div>
                                            <Badge variant="outline" className="text-xs shrink-0">{pt.passengerCount} Pas</Badge>
                                          </div>
                                        </div>
                                      ))}
                                      <div className="relative">
                                        <div className="absolute w-3.5 h-3.5 bg-emerald-600 rounded-full -left-[23px] top-0 border-2 border-background flex items-center justify-center"><div className="w-1 h-1 bg-white rounded-full" /></div>
                                        <p className="text-sm font-medium text-emerald-700">Destino: {budget.companyAddress}</p>
                                      </div>
                                    </div>
                                  </CardContent>
                                )}
                              </Card>
                            );
                          })}
                          </div>
                          {voltaR.length > 0 && (
                            <>
                              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mt-4 mb-2">↓ Saída</p>
                              <div className="space-y-3">
                              {voltaR.map(r => {
                                const blockId = r.vehicleBlockId ?? 0;
                                const color = blockId > 0 ? blockColor(blockId) : null;
                                const isExpanded = expandedRoute === r.id;
                                return (
                                  <Card key={r.id} className={`overflow-hidden transition-shadow hover:shadow-md border-orange-200 ${color ? `border-l-4 border-l-orange-400` : "border-l-4 border-l-orange-300"}`}>
                                    <CardHeader className="pb-3 pt-4 px-5">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                          <button onClick={() => setExpandedRoute(isExpanded ? null : r.id)} className="text-left flex-1 min-w-0 flex items-center gap-2">
                                            <span className="font-semibold text-sm truncate">{r.name}</span>
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 shrink-0">↓ Volta</span>
                                          </button>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          {blockId > 0 && color && (<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color.bg} ${color.text}`}><span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />{vehicleLabel(blockId)}</span>)}
                                          {r.vehicleAssignments.map((v, i) => { const perVehicle = v.count > 1 ? Math.round(r.totalPassengers / v.count) : r.totalPassengers; return (<Badge key={i} variant="secondary" className="text-xs font-semibold">{perVehicle} Pas · {v.count > 1 ? `${v.count}× ` : ""}{v.vehicleType}{v.count > 1 && <span className="ml-1 font-normal opacity-70">({perVehicle}/uni)</span>}</Badge>); })}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                        <span><span className="font-medium text-foreground">{r.totalPassengers}</span> Pas</span>
                                        <span><span className="font-medium text-foreground">{r.occupancyPct.toFixed(0)}%</span> ocup.</span>
                                        <span><span className="font-medium text-foreground">{r.totalDistanceKm}</span> km</span>
                                        <span><span className="font-medium text-foreground">{r.estimatedMinutes}</span> min</span>
                                        {r.totalCost && <span><span className="font-medium text-foreground">R$ {r.totalCost.toFixed(2)}</span></span>}
                                        <button onClick={() => setExpandedRoute(isExpanded ? null : r.id)} className="ml-auto text-primary hover:underline">{isExpanded ? "Recolher" : "Ver pontos"}</button>
                                      </div>
                                    </CardHeader>
                                    {isExpanded && (
                                      <CardContent className="pt-0 px-5 pb-4">
                                        <div className="relative pl-4 space-y-3 border-l-2 border-orange-200 ml-2 mt-2">
                                          <div className="relative">
                                            <div className="absolute w-3.5 h-3.5 bg-orange-500 rounded-full -left-[23px] top-0 border-2 border-background flex items-center justify-center"><div className="w-1 h-1 bg-white rounded-full" /></div>
                                            <p className="text-sm font-medium text-orange-700">Partida: {budget.companyAddress}</p>
                                          </div>
                                          {r.boardingPoints.sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0)).map(pt => (
                                            <div key={pt.id} className="relative">
                                              <div className="absolute w-2.5 h-2.5 bg-orange-400 rounded-full -left-[21px] top-1 border-2 border-background" />
                                              <div className="flex justify-between items-start gap-2">
                                                <div className="min-w-0"><p className="text-sm font-medium">{pt.name}</p>{bpAddressMap.get(pt.id) && <p className="text-xs text-muted-foreground truncate">{bpAddressMap.get(pt.id)}</p>}</div>
                                                <Badge variant="outline" className="text-xs shrink-0">{pt.passengerCount} Pas</Badge>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </CardContent>
                                    )}
                                  </Card>
                                );
                              })}
                              </div>
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── MAPA VISUAL ─────────────────────────────────────────────────── */}
        <TabsContent value="map">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Mapa de Rotas</CardTitle>
                <CardDescription>Rotas traçadas por vias reais — círculos mostram o raio de caminhada, pontos cinzas são funcionários georreferenciados</CardDescription>
              </CardHeader>
              <CardContent>
                {routes.length === 0 ? (
                  <div className="h-[620px] bg-muted/20 border border-dashed rounded-xl flex items-center justify-center text-muted-foreground">
                    Nenhuma rota para visualizar. Processe o orçamento primeiro.
                  </div>
                ) : (
                  <RouteMap
                    routes={routes}
                    employees={(employees as unknown as MapEmployee[]).filter(
                      (e) => e.lat != null && e.lng != null && e.boardingPointId != null
                    )}
                    companyLat={(budget as any).companyLat ?? -23.5505}
                    companyLng={(budget as any).companyLng ?? -46.6333}
                    maxRadiusKm={(budget as any).maxRadiusKm ?? 1}
                    vehicleLabel={vehicleLabel}
                  />
                )}
              </CardContent>
            </Card>

            {/* ── Lista de passageiros por ponto ── */}
            {routes.length > 0 && (
              <PassengerListCard
                routes={routes}
                employees={employees as unknown as MapEmployee[]}
                vehicleLabel={vehicleLabel}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Lista de passageiros por ponto de embarque ────────────────────────────

interface PassengerListCardProps {
  routes: ExtRoute[];
  employees: MapEmployee[];
  vehicleLabel: (blockId: number) => string;
}

function PassengerListCard({ routes, employees, vehicleLabel }: PassengerListCardProps) {
  const [search, setSearch] = useState("");
  const [filterShift, setFilterShift] = useState("");
  const [openPoints, setOpenPoints] = useState<Set<number>>(new Set());

  // Map boardingPointId → employees
  const empByBP = useMemo(() => {
    const m = new Map<number, MapEmployee[]>();
    for (const emp of employees) {
      if (emp.boardingPointId == null) continue;
      if (!m.has(emp.boardingPointId)) m.set(emp.boardingPointId, []);
      m.get(emp.boardingPointId)!.push(emp);
    }
    return m;
  }, [employees]);

  const shifts = useMemo(
    () => [...new Set(routes.map((r) => r.shiftTime).filter(Boolean) as string[])].sort(),
    [routes]
  );

  const filteredRoutes = useMemo(() => {
    return routes.filter((r) => !filterShift || r.shiftTime === filterShift);
  }, [routes, filterShift]);

  // Flatten all passengers for export
  const allRows = useMemo(() => {
    const rows: { turno: string; veiculo: string; ponto: string; nome: string; endereco: string }[] = [];
    for (const r of routes) {
      for (const bp of r.boardingPoints) {
        const emps = empByBP.get(bp.id) ?? [];
        for (const emp of emps) {
          rows.push({
            turno: r.shiftTime ?? "",
            veiculo: r.vehicleBlockId ? vehicleLabel(r.vehicleBlockId) : "",
            ponto: bp.name,
            nome: emp.name,
            endereco: emp.address,
          });
        }
      }
    }
    return rows;
  }, [routes, empByBP, vehicleLabel]);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(allRows.map((r) => ({
      Turno: r.turno,
      Veículo: r.veiculo,
      "Ponto de Embarque": r.ponto,
      Nome: r.nome,
      Endereço: r.endereco,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Passageiros");
    XLSX.writeFile(wb, "passageiros_por_ponto.xlsx");
  };

  const togglePoint = (bpId: number) =>
    setOpenPoints((prev) => {
      const next = new Set(prev);
      next.has(bpId) ? next.delete(bpId) : next.add(bpId);
      return next;
    });

  const q = search.toLowerCase().trim();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Lista de Passageiros por Ponto</CardTitle>
            <CardDescription>
              {allRows.length} passageiros · {routes.flatMap((r) => r.boardingPoints).length} pontos de embarque — compare com sua planilha
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} className="shrink-0">
            <Download className="w-4 h-4 mr-2" />
            Exportar Excel
          </Button>
        </div>
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            placeholder="Buscar funcionário ou endereço…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <select
            value={filterShift}
            onChange={(e) => setFilterShift(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none"
          >
            <option value="">Todos os turnos</option>
            {shifts.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
        {filteredRoutes.map((route) => (
          <div key={route.id} className="rounded-xl border overflow-hidden">
            {/* Cabeçalho da rota */}
            <div className="bg-muted/40 px-4 py-2 flex items-center gap-3 text-sm font-medium">
              <span className="text-muted-foreground">Turno</span>
              <span className="font-bold">{route.shiftTime}</span>
              <span className="text-muted-foreground">·</span>
              {route.vehicleAssignments[0] && (
                <span>
                  {route.vehicleAssignments[0].count > 1
                    ? `${route.vehicleAssignments[0].count}× `
                    : ""}
                  {route.vehicleAssignments[0].vehicleType}
                </span>
              )}
              <span className="text-muted-foreground">·</span>
              <span className="font-bold text-primary">{route.totalPassengers} Pas</span>
              {route.vehicleBlockId && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {vehicleLabel(route.vehicleBlockId)}
                </span>
              )}
            </div>

            {/* Pontos de embarque da rota */}
            {[...route.boardingPoints]
              .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0))
              .map((bp) => {
                const emps = (empByBP.get(bp.id) ?? []).filter(
                  (e) =>
                    !q ||
                    e.name.toLowerCase().includes(q) ||
                    e.address.toLowerCase().includes(q)
                );
                if (q && emps.length === 0) return null;
                const isOpen = openPoints.has(bp.id);
                const allEmps = empByBP.get(bp.id) ?? [];

                return (
                  <div key={bp.id} className="border-t">
                    {/* Linha do ponto de embarque (clicável) */}
                    <button
                      onClick={() => togglePoint(bp.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{bp.name}</span>
                        {allEmps[0]?.address && (
                          <span className="text-xs text-muted-foreground ml-2">{allEmps[0].address}</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {allEmps.length} passageiro{allEmps.length !== 1 ? "s" : ""}
                      </span>
                      <span className="ml-auto text-muted-foreground">
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </button>

                    {/* Lista de passageiros do ponto */}
                    {isOpen && (
                      <div className="border-t bg-muted/10">
                        {emps.length === 0 && q ? (
                          <p className="px-8 py-2 text-xs text-muted-foreground">Nenhum resultado para "{search}"</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/20">
                                <th className="text-left px-8 py-1.5 font-medium text-muted-foreground w-6">#</th>
                                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Nome</th>
                                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Endereço</th>
                              </tr>
                            </thead>
                            <tbody>
                              {emps.map((emp, i) => (
                                <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/20">
                                  <td className="px-8 py-1.5 text-muted-foreground">{i + 1}</td>
                                  <td className="px-2 py-1.5 font-medium">{emp.name}</td>
                                  <td className="px-2 py-1.5 text-muted-foreground">{emp.address}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
