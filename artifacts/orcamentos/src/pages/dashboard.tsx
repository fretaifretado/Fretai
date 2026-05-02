import { useGetBudgetsStats, getGetBudgetsStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calculator, Building2, Car, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

function getStatusBadge(status: string) {
  switch (status) {
    case "draft": return <Badge variant="secondary">Rascunho</Badge>;
    case "processing": return <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">Processando</Badge>;
    case "ready": return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">Pronto</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

export default function Dashboard() {
  const { data: stats, isLoading } = useGetBudgetsStats();

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Visão Geral</h1>
        <p className="text-muted-foreground">Estatísticas do sistema de orçamentos de transporte.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Orçamentos Totais</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalBudgets}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Orçamentos Prontos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.readyBudgets}</div>
            <p className="text-xs text-muted-foreground">
              {stats.draftBudgets} em rascunho
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Empresas Clientes</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCompanies}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tipos de Veículo</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalVehicleTypes}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Orçamentos Recentes</h2>
        <Card>
          <div className="divide-y border-t-0">
            {stats.recentBudgets.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhum orçamento recente.</div>
            ) : (
              stats.recentBudgets.map(budget => (
                <div key={budget.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                  <div className="space-y-1">
                    <Link href={`/orcamentos/${budget.id}`} className="font-medium hover:underline">
                      {budget.name}
                    </Link>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Building2 className="h-3 w-3" />
                      {budget.companyName || "Empresa"}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(budget.createdAt).toLocaleDateString("pt-BR")}
                    </div>
                    <div className="w-24 text-right">
                      {getStatusBadge(budget.status)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
