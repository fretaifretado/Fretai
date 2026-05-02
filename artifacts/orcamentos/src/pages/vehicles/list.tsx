import { useState } from "react";
import { Link } from "wouter";
import { useListVehicles, useDeleteVehicle, getListVehiclesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit2 } from "lucide-react";
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

export default function VehiclesList() {
  const { data: vehicles, isLoading } = useListVehicles();
  const deleteVehicle = useDeleteVehicle();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [vehicleToDelete, setVehicleToDelete] = useState<number | null>(null);

  const handleDelete = () => {
    if (!vehicleToDelete) return;
    deleteVehicle.mutate({ id: vehicleToDelete }, {
      onSuccess: () => {
        toast({ title: "Veículo excluído", description: "O veículo foi removido com sucesso." });
        queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
        setVehicleToDelete(null);
      },
      onError: () => {
        toast({ title: "Erro", description: "Não foi possível excluir o veículo.", variant: "destructive" });
        setVehicleToDelete(null);
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Veículos</h1>
          <p className="text-muted-foreground">Gerencie a frota e capacidades disponíveis.</p>
        </div>
        <Button asChild>
          <Link href="/veiculos/novo">
            <Plus className="mr-2 h-4 w-4" />
            Novo Veículo
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
        ) : !vehicles?.length ? (
          <div className="p-12 text-center text-muted-foreground">
            <p>Nenhum veículo cadastrado.</p>
            <Button variant="link" asChild className="mt-2">
              <Link href="/veiculos/novo">Cadastre o primeiro veículo</Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Capacidade</TableHead>
                <TableHead className="text-right">Custo/Km</TableHead>
                <TableHead className="text-right">Custo Fixo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.type}</TableCell>
                  <TableCell className="text-right">{v.capacity} Pas</TableCell>
                  <TableCell className="text-right">
                    {v.costPerKm ? `R$ ${v.costPerKm.toFixed(2)}` : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {v.costPerRoute ? `R$ ${v.costPerRoute.toFixed(2)}` : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setVehicleToDelete(v.id)}>
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

      <AlertDialog open={!!vehicleToDelete} onOpenChange={(o) => !o && setVehicleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir veículo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteVehicle.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
