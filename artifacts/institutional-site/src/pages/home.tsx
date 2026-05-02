import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, BarChart3, Users, Maximize, ShieldCheck, Activity, LineChart } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { TypingText } from "@/components/ui/TypingText.tsx";



export default function Home() {
  return (
    <PageWrapper 
      title="Início" 
      description="Fretai usa Inteligência Artificial para transformar o transporte corporativo de custo fixo em custo variável controlado."
    >
      {/* Hero Section */}
      <section className="relative bg-primary text-primary-foreground overflow-hidden py-24 lg:py-32">
        <div className="absolute inset-0 bg-[url('/images/hero-dashboard.png')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-primary/80 to-primary/95"></div>
        
        <div className="container relative mx-auto px-4">
          <div className="max-w-4xl">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent font-mono text-xs font-semibold mb-6"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
              </span>
              LOGÍSTICA COM INTELIGÊNCIA ARTIFICIAL
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-5xl lg:text-7xl font-bold tracking-tight mb-6 leading-tight"
            >
              Inteligência Operacional   <span className="text-accent"><TypingText text="aplicada ao Fretado da sua Indústria"/></span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-xl lg:text-2xl text-primary-foreground/70 mb-10 max-w-3xl leading-relaxed"
            >
              Transformamos o transporte fretado de custo fixo em custo variável controlado, ajustado automaticamente com inteligência artificial à dinâmica da sua operação.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Link href="/a-plataforma">
                <Button size="lg" className="text-base h-14 px-8 group bg-accent hover:bg-accent/90 text-accent-foreground">
                  Conheça a Plataforma
                  <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={18} />
                </Button>
              </Link>
              <Link href="/contato">
                <Button size="lg" variant="outline" className="text-base h-14 px-8 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10">
                  Solicitar Apresentação
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* O Problema Atual */}
      <section className="py-24 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-sm font-bold text-accent uppercase tracking-wider mb-3">O Problema Atual</h2>
              <h3 className="text-3xl lg:text-4xl font-bold mb-6 text-foreground">Você está pagando por assentos vazios.</h3>
              <div className="space-y-6 text-muted-foreground text-lg">
                <p>
                  O modelo tradicional de fretamento cobra por veículo fixo. No entanto, a realidade industrial flutua diariamente baseada em pessoas: turnover, férias, atestados e oscilações de turno.
                </p>
                <p>
                  Essa desconexão entre o contrato rígido e a operação fluida resulta em até 35% de ociosidade estrutural invisível. Dinheiro drenado do orçamento sem geração de valor.
                </p>
              </div>
            </div>
            
            <div className="bg-card rounded-xl border shadow-sm p-8">
              <div className="flex items-center justify-between mb-8">
                <h4 className="font-semibold">Ociosidade Média (Contrato Fixo)</h4>
                <span className="text-destructive font-bold text-xl">32.4%</span>
              </div>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Capacidade Contratada</span>
                    <span className="font-mono">100%</span>
                  </div>
                  <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-secondary w-full"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Ocupação Real Média</span>
                    <span className="font-mono">67.6%</span>
                  </div>
                  <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-destructive w-[67.6%]"></div>
                  </div>
                </div>
                <div className="pt-4 border-t border-dashed">
                  <p className="text-sm text-muted-foreground italic">
                    "Contratos engessados não acompanham a dinâmica do chão de fábrica."
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Nossa Solução */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-sm font-bold text-accent uppercase tracking-wider mb-3">Nossa Solução</h2>
            <h3 className="text-3xl lg:text-4xl font-bold mb-6 text-foreground">Inteligência Artificial que ajusta a capacidade em tempo real.</h3>
            <p className="text-lg text-muted-foreground">
              A Plataforma Fretai utiliza Inteligência Artificial para recalcular rotas automaticamente, consolidar passageiros e redimensionar o tipo de veículo para cada trajeto, garantindo que você pague apenas pelo que realmente utiliza.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: <Activity className="text-accent" size={32} />,
                title: "Otimização Dinâmica",
                desc: "Algoritmos de Inteligência Artificial recalculam as malhas de transporte diariamente baseando-se nas presenças reais."
              },
              {
                icon: <Users className="text-accent" size={32} />,
                title: "Gestão de Headcount",
                desc: "Adição, remoção e remanejamento automático de colaboradores via IA, integrados ao RH em tempo real."
              },
              {
                icon: <Maximize className="text-accent" size={32} />,
                title: "Redimensionamento",
                desc: "Substituição automática do tipo de veículo (ônibus, micro, van) conforme a demanda da rota."
              }
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-4">
                <div className="bg-blue-50 rounded-xl p-3 w-fit">
                  {item.icon}
                </div>
                <h3 className="font-bold text-lg"><TypingText text={item.title} /></h3>
                <p className="text-gray-500 text-sm">{item.desc}</p>
              </div>
            ))}

          </div>
        </div>
      </section>

      {/* Benefícios Estratégicos */}
      <section className="py-24 bg-secondary text-secondary-foreground relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)", backgroundSize: "30px 30px" }}></div>
        <div className="container relative mx-auto px-4">
          <h2 className="text-3xl lg:text-4xl font-bold mb-16 text-center">Benefícios Estratégicos</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: "Redução de Ociosidade", val: <TypingText text="-28%"/>, desc: "Corte drástico na capacidade não utilizada." },
              { title: "Custo por Colaborador", val: <TypingText text="Visível"/>, desc: "Métrica real por passageiro ativo." },
              { title: "Controle Financeiro", val: <TypingText text="Auditável"/>, desc: "Rateio preciso por centro de custo." },
              { title: "Adaptação a Turnover", val: <TypingText text="Imediata"/>, desc: "Ajustes contratuais sem atrito." }
            ].map((benefit, i) => (
              <div key={i} className="bg-secondary-foreground/5 border border-secondary-foreground/10 rounded-xl p-6 backdrop-blur-sm">
                <div className="text-3xl font-bold text-accent mb-2">{benefit.val}</div>
                <h4 className="text-lg font-semibold mb-2 text-white">{benefit.title}</h4>
                <p className="text-secondary-foreground/60 text-sm">{benefit.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-background border-t">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6">Pronto para otimizar sua logística com IA?</h2>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Agende uma demonstração e veja onde sua operação está perdendo dinheiro — e como a IA da Fretai resolve isso.
          </p>
          <Link href="/contato">
            <Button size="lg" className="text-base h-14 px-8 bg-primary text-primary-foreground hover:bg-primary/90">
              Solicitar Apresentação
            </Button>
          </Link>
        </div>
      </section>
    </PageWrapper>
  );
}
