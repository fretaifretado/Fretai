import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Mail, MapPin, Phone } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

const formSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  empresa: z.string().min(2, "Empresa é obrigatória"),
  cargo: z.string().min(2, "Cargo é obrigatório"),
  telefone: z.string().min(10, "Telefone válido é obrigatório"),
  email: z.string().email("E-mail inválido"),
  colaboradores: z.string().min(1, "Selecione uma faixa"),
  cidade: z.string().min(2, "Cidade é obrigatória")
});

export default function Contato() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      empresa: "",
      cargo: "",
      telefone: "",
      email: "",
      colaboradores: "",
      cidade: ""
    }
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values);
    setSubmitted(true);
  }

  return (
    <PageWrapper 
      title="Contato Institucional" 
      description="Solicite uma apresentação da plataforma Fretai."
    >
      <section className="bg-background py-20 border-b">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h1 className="text-4xl lg:text-5xl font-bold mb-6">Contato Institucional</h1>
          <p className="text-xl text-muted-foreground">
            Veja como a Plataforma Fretai otimiza o fretado da sua indústria, reduzindo custos e aumentando a previsibilidade financeira.
          </p>
        </div>
      </section>

      <section className="py-24 bg-muted/20">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            
            <div className="lg:col-span-2 bg-card border shadow-sm rounded-xl p-8">
              {submitted ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12">
                  <CheckCircle2 size={64} className="text-green-500 mb-6" />
                  <h3 className="text-2xl font-bold mb-2">Solicitação Recebida</h3>
                  <p className="text-muted-foreground mb-8">
                    Nossa equipe executiva entrará em contato em breve para agendar a demonstração.
                  </p>
                  <Button variant="outline" onClick={() => setSubmitted(false)}>
                    Enviar nova solicitação
                  </Button>
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <h3 className="text-xl font-bold border-b pb-4 mb-6">Solicitar Apresentação</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="nome"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome Completo</FormLabel>
                            <FormControl><Input placeholder="Ex: João Silva" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>E-mail Corporativo</FormLabel>
                            <FormControl><Input placeholder="joao@empresa.com" type="email" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="empresa"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Empresa</FormLabel>
                            <FormControl><Input placeholder="Nome da Indústria" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="cargo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cargo</FormLabel>
                            <FormControl><Input placeholder="Ex: CFO, Diretor de RH, Gestor de Logística" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="telefone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Telefone</FormLabel>
                            <FormControl><Input placeholder="(11) 90000-0000" type="tel" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="cidade"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cidade / Estado</FormLabel>
                            <FormControl><Input placeholder="Ex: Campinas - SP" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="colaboradores"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número aproximado de colaboradores</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o tamanho da operação" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="ate100">Até 100</SelectItem>
                              <SelectItem value="100a500">100 a 500</SelectItem>
                              <SelectItem value="500a1000">500 a 1.000</SelectItem>
                              <SelectItem value="1000a5000">1.000 a 5.000</SelectItem>
                              <SelectItem value="acima5000">Acima de 5.000</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="pt-4">
                      <Button type="submit" size="lg" className="w-full h-14 text-base bg-primary">
                        Solicitar Apresentação
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </div>

            <div className="space-y-8">
              <div className="bg-primary text-primary-foreground p-8 rounded-xl shadow-sm">
                <h3 className="font-bold text-xl mb-6">Escritório Central</h3>
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <MapPin className="text-accent shrink-0 mt-1" />
                    <div>
                      <p className="font-semibold mb-1">Minas Gerais</p>
                      <p className="text-primary-foreground/70 text-sm">Brasil</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Mail className="text-accent shrink-0" />
                    <p className="text-sm">comercial@fretai.com.br</p>
                  </div>
                </div>
              </div>

              <div className="bg-card border p-6 rounded-xl shadow-sm">
                <h4 className="font-bold mb-2">Canal de Denúncias</h4>
                <p className="text-sm text-muted-foreground mb-4">Para fornecedores e colaboradores reportarem inconformidades corporativas.</p>
                <a href="#" className="text-sm text-accent font-medium hover:underline">Acessar portal de compliance →</a>
              </div>
            </div>

          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
