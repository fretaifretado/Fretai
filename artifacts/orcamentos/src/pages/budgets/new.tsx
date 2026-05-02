import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useCreateBudget, useListCompanies, getListBudgetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório"),
  companyId: z.coerce.number().min(1, "Selecione uma empresa"),
  companyAddress: z.string().min(5, "Endereço de destino é obrigatório"),
  maxRadiusKm: z.coerce.number().min(0.1, "O raio deve ser maior que 0"),
  maxRouteMinutes: z.coerce.number().min(10, "A duração deve ser maior que 10 min"),
  strategy: z.enum(["min_cost", "min_vehicles", "max_occupancy"]),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewBudget() {
  const [, setLocation] = useLocation();
  const createBudget = useCreateBudget();
  const { data: companies, isLoading: isLoadingCompanies } = useListCompanies();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      companyId: 0,
      companyAddress: "",
      maxRadiusKm: 2,
      maxRouteMinutes: 120,
      strategy: "min_cost",
    },
  });

  // Auto-fill address when company changes
  const watchCompanyId = form.watch("companyId");
  
  const handleCompanyChange = (val: string) => {
    const cid = parseInt(val, 10);
    form.setValue("companyId", cid);
    const comp = companies?.find(c => c.id === cid);
    if (comp && comp.address && !form.getValues("companyAddress")) {
      form.setValue("companyAddress", comp.address);
    }
  };

  const onSubmit = (data: FormValues) => {
    createBudget.mutate({ data }, {
      onSuccess: (res) => {
        toast({ title: "Orçamento criado", description: "Configuração inicial salva com sucesso." });
        queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
        setLocation(`/orcamentos/${res.id}`); // Navigate to detail view to upload employees
      },
      onError: () => {
        toast({ title: "Erro", description: "Não foi possível salvar o orçamento.", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/orcamentos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Novo Orçamento</h1>
          <p className="text-muted-foreground">Configure os parâmetros da rota.</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="col-span-2 md:col-span-1">
                      <FormLabel>Nome do Orçamento</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Roteirização Q3" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="companyId"
                  render={({ field }) => (
                    <FormItem className="col-span-2 md:col-span-1">
                      <FormLabel>Empresa Cliente</FormLabel>
                      <Select 
                        disabled={isLoadingCompanies} 
                        onValueChange={handleCompanyChange}
                        value={field.value ? field.value.toString() : ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma empresa" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {companies?.map(c => (
                            <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="companyAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço de Destino (Fábrica/Escritório)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Av. Paulista, 1000 - São Paulo, SP" {...field} />
                    </FormControl>
                    <FormDescription>
                      Todos os funcionários serão transportados para este local.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="border-t border-border my-6 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="maxRadiusKm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Raio Máximo a pé (KM)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" {...field} />
                      </FormControl>
                      <FormDescription>
                        Distância máxima que o funcionário pode caminhar até o ponto de embarque.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxRouteMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tempo Máximo de Viagem (Minutos)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>
                        Tempo máximo que um funcionário pode passar dentro do veículo.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="strategy"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Estratégia de Otimização</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a estratégia" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="min_cost">Menor Custo (Otimiza valor total em R$)</SelectItem>
                          <SelectItem value="min_vehicles">Menor Quantidade de Veículos</SelectItem>
                          <SelectItem value="max_occupancy">Maior Ocupação (Evita assentos vazios)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end pt-4">
                <Button type="submit" size="lg" disabled={createBudget.isPending}>
                  {createBudget.isPending ? "Criando..." : "Criar Orçamento"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
