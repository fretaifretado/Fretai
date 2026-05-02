import { useState } from "react";
import { Link } from "wouter";
import { useListBudgets, useDeleteBudget, getListBudgetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Building2, MapPin, Eye, FileText, Settings2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

function getStatusBadge(status: string) {
  switch (status) {
    case "draft": return <Badge variant="secondary">Rascunho</Badge>;
    case "processing": return <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">Processando</Badge>;
    case "ready": return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">Pronto</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

export default function BudgetsList() {
  const { data: budgets, isLoading } = useListBudgets();
  const deleteBudget = useDeleteBudget();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [budgetToDelete, setBudgetToDelete] = useState<number | null>(null);

  const handleDelete = () => {
    if (!budgetToDelete) return;
    deleteBudget.mutate({ id: budgetToDelete }, {
      onSuccess: () => {
        toast({ title: "Orçamento excluído", description: "O orçamento foi removido com sucesso." });
        queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
        setBudgetToDelete(null);
      },
      onError: () => {
        toast({ title: "Erro", description: "Não foi possível excluir o orçamento.", variant: "destructive" });
        setBudgetToDelete(null);
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orçamentos</h1>
          <p className="text-muted-foreground">Planeje e processe rotas de transporte.</p>
        </div>
        <Button asChild>
          <Link href="/orcamentos/novo">
            <Plus className="mr-2 h-4 w-4" />
            Novo Orçamento
          </Link>
        </Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !budgets?.length ? (
          <div className="p-12 flex flex-col items-center justify-center text-center text-muted-foreground border border-dashed rounded-lg bg-muted/20">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhum orçamento</h3>
            <p className="max-w-sm mt-1">Crie um orçamento, importe seus funcionários e gere rotas otimizadas.</p>
            <Button asChild className="mt-6">
              <Link href="/orcamentos/novo">Criar Primeiro Orçamento</Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Funcionários</TableHead>
                <TableHead className="text-right">Rotas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">
                    <Link href={`/orcamentos/${b.id}`} className="hover:underline">
                      {b.name}
                    </Link>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Settings2 className="h-3 w-3" />
                      {b.strategy === "min_cost" ? "Menor Custo" : b.strategy === "min_vehicles" ? "Menos Veículos" : "Maior Ocupação"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {b.companyName}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(b.status)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center text-muted-foreground">
                      {b.employeeCount} <Users className="ml-1 h-3 w-3" />
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {b.routeCount}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="icon" asChild>
                        <Link href={`/orcamentos/${b.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setBudgetToDelete(b.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <AlertDialog open={!!budgetToDelete} onOpenChange={(o) => !o && setBudgetToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação excluirá permanentemente o orçamento e todas as rotas/funcionários associados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteBudget.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
