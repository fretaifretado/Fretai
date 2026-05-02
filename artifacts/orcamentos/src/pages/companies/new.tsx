import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useCreateCompany, getListCompaniesQueryKey } from "@workspace/api-client-react";
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
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  name: z.string().min(2, "Nome da empresa é obrigatório"),
  address: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewCompany() {
  const [, setLocation] = useLocation();
  const createCompany = useCreateCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      address: "",
    },
  });

  const onSubmit = (data: FormValues) => {
    createCompany.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Empresa cadastrada", description: "A empresa foi salva com sucesso." });
        queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
        setLocation("/empresas");
      },
      onError: () => {
        toast({ title: "Erro", description: "Não foi possível salvar a empresa.", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/empresas">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nova Empresa</h1>
          <p className="text-muted-foreground">Cadastre um novo cliente.</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Empresa</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Acme Corp" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço de Destino (Opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Av. Paulista, 1000 - São Paulo" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormDescription>
                      Será usado como destino padrão para as rotas desta empresa.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createCompany.isPending}>
                  {createCompany.isPending ? "Salvando..." : "Salvar Empresa"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
