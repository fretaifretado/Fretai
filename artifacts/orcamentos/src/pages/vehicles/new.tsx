import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useCreateVehicle, getListVehiclesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  type: z.string().min(2, "Tipo é obrigatório"),
  capacity: z.coerce.number().min(1, "Capacidade deve ser maior que 0"),
  costPerKm: z.coerce.number().optional().nullable(),
  costPerRoute: z.coerce.number().optional().nullable(),
  availableCount: z.coerce.number().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewVehicle() {
  const [, setLocation] = useLocation();
  const createVehicle = useCreateVehicle();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "",
      capacity: 15,
      costPerKm: null,
      costPerRoute: null,
      availableCount: null,
    },
  });

  const onSubmit = (data: FormValues) => {
    createVehicle.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Veículo cadastrado", description: "O veículo foi salvo com sucesso." });
        queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
        setLocation("/veiculos");
      },
      onError: () => {
        toast({ title: "Erro", description: "Não foi possível salvar o veículo.", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/veiculos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Novo Veículo</h1>
          <p className="text-muted-foreground">Cadastre um novo tipo de veículo na frota.</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Veículo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Van, Micro-ônibus" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacidade (Passageiros)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="availableCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantidade Disponível (opcional)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="costPerKm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custo por KM (R$)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormDescription>Usado na otimização de custo.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="costPerRoute"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custo Fixo por Rota (R$)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormDescription>Custo fixo de acionamento.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createVehicle.isPending}>
                  {createVehicle.isPending ? "Salvando..." : "Salvar Veículo"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
