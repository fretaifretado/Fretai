import { useState } from "react";
import { Link } from "wouter";
import { useListCompanies, useDeleteCompany, getListCompaniesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, MapPin } from "lucide-react";
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

export default function CompaniesList() {
  const { data: companies, isLoading } = useListCompanies();
  const deleteCompany = useDeleteCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [companyToDelete, setCompanyToDelete] = useState<number | null>(null);

  const handleDelete = () => {
    if (!companyToDelete) return;
    deleteCompany.mutate({ id: companyToDelete }, {
      onSuccess: () => {
        toast({ title: "Empresa excluída", description: "A empresa foi removida com sucesso." });
        queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
        setCompanyToDelete(null);
      },
      onError: () => {
        toast({ title: "Erro", description: "Não foi possível excluir a empresa. Pode haver orçamentos vinculados.", variant: "destructive" });
        setCompanyToDelete(null);
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Empresas Clientes</h1>
          <p className="text-muted-foreground">Gerencie as empresas e seus endereços base.</p>
        </div>
        <Button asChild>
          <Link href="/empresas/nova">
            <Plus className="mr-2 h-4 w-4" />
            Nova Empresa
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
        ) : !companies?.length ? (
          <div className="p-12 text-center text-muted-foreground">
            <p>Nenhuma empresa cadastrada.</p>
            <Button variant="link" asChild className="mt-2">
              <Link href="/empresas/nova">Cadastre a primeira empresa</Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Endereço Padrão</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    {c.address ? (
                      <span className="flex items-center text-sm text-muted-foreground">
                        <MapPin className="mr-1 h-3 w-3" /> {c.address}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setCompanyToDelete(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <AlertDialog open={!!companyToDelete} onOpenChange={(o) => !o && setCompanyToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação excluirá a empresa. Não é possível excluir empresas que possuem orçamentos vinculados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteCompany.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
