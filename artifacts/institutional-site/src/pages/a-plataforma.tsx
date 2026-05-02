import { PageWrapper } from "@/components/layout/PageWrapper";
import { CheckCircle2, Cpu, Network, RefreshCw, Server, Settings2 } from "lucide-react";
import { motion } from "framer-motion";
import { TypingText } from "@/components/ui/TypingText.tsx";

export default function APlataforma() {
  return (
    <PageWrapper 
      title="A Plataforma" 
      description="Sistema inteligente de gestão de malha logística para corporações."
    >
      {/* Header */}
      <section className="bg-primary text-primary-foreground py-20 border-b border-primary-foreground/10">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl font-bold mb-6">O cérebro por trás da malha logística.</h1>
            <p className="text-xl text-primary-foreground/70">
              O Fretai não é apenas um software de rotas. É um motor de inteligência que analisa, projeta e reconfigura o transporte fretado baseando-se em dados reais.
            </p>
          </div>
        </div>
      </section>

      {/* Image / Visualization */}
      <section className="py-12 bg-background border-b">
        <div className="container mx-auto px-4">
          <div className="rounded-2xl overflow-hidden border shadow-lg max-w-5xl mx-auto bg-primary aspect-[16/9] relative">
            <img src="/images/route-optimization.png" alt="Otimização de rotas" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent flex items-end p-8">
              <div className="bg-background/10 backdrop-blur-md border border-white/20 rounded-xl p-6 text-white max-w-md">
                <h3 className="font-bold text-lg mb-2">Processamento de Vértices</h3>
                <p className="text-sm text-white/80">O algoritmo recalcula milhares de coordenadas diariamente, encontrando o balanço ideal entre tempo de trajeto e custo operacional.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Systems */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Server />}
              title={<TypingText text="Sistema de Gestão Central" />}
              desc="Painel de controle unificado. Todas as rotas, passageiros, veículos e métricas financeiras integradas em uma única fonte da verdade."
            />
            <FeatureCard 
              icon={<Cpu />}
              title={<TypingText text="Processamento de Dados" />}
              desc="Ingestão contínua de dados de RH, catracas e telemetria para garantir que as decisões logísticas sejam baseadas no headcount ativo atual."
            />
            <FeatureCard 
              icon={<Network />}
              title={<TypingText text="Otimização Dinâmica" />}
              desc="Criação automática de roteirizações eficientes. O sistema identifica interseções onde veículos podem ser unificados para ganho de escala."
            />
            <FeatureCard 
              icon={<RefreshCw />}
              title={<TypingText text="Ajuste Automático" />}
              desc="Ao identificar a perda de 15 passageiros em uma rota, o sistema redimensiona automaticamente o trajeto e redefine a capacidade ideal do veículo para o dia seguinte."
            />
            <FeatureCard 
              icon={<Settings2 />}
              title={<TypingText text="Redimensionamento" />}
              desc="A seleção do ativo (van, micro-ônibus, ônibus) deixa de ser estática e passa a ser uma variável do algoritmo para minimizar custo."
            />
            <FeatureCard 
              icon={<CheckCircle2 />}
              title={<TypingText text="Validação de Conformidade" />}
              desc="Garantia de que todas as alterações respeitam os SLAs de tempo máximo de viagem e qualidade acordados."
            />
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: React.ReactNode, desc: string }) {
  return (
    <div className="bg-card border rounded-xl p-8 shadow-sm">
      <div className="text-accent mb-6 bg-accent/10 w-12 h-12 flex items-center justify-center rounded-lg">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-muted-foreground">{desc}</p>
    </div>
  )
}
