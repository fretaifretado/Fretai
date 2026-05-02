import { PageWrapper } from "@/components/layout/PageWrapper";
import { ArrowRight } from "lucide-react";
import { TypingText } from "@/components/ui/TypingText.tsx";

export default function EstruturaDeCapacidade() {
  return (
    <PageWrapper 
      title="Estrutura de Capacidade" 
      description="Alocação dinâmica de veículos baseada na ocupação real."
    >
      <section className="bg-background py-20 border-b">
        <div className="container mx-auto px-4 text-center max-w-3xl">
          <h1 className="text-4xl lg:text-5xl font-bold mb-6">Eficiência Dinâmica Aplicada ao Fretado</h1>
          <p className="text-xl text-muted-foreground">
            A inteligência do software se traduz na frota. Cada rota é dimensionada conforme a ocupação real. A plataforma ajusta automaticamente a categoria do veículo conforme a necessidade operacional diária.
          </p>
        </div>
      </section>

      <section className="py-24 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <VehicleCard 
              image="/images/minivan.png"
              title="Mini Vans"
              capacity="A partir de 7 lugares"
              desc="Para micro-rotas, executivos ou captação em zonas de difícil acesso."
            />
            <VehicleCard 
              image="/images/van.png"
              title="Vans"
              capacity="15 a 18 lugares"
              desc="Alta agilidade para rotas capilares de média densidade."
            />
            <VehicleCard 
              image="/images/microbus.jpeg"
              title="Micro-ônibus"
              capacity="27 a 32 lugares"
              desc="O balanço ideal entre custo por assento e penetração urbana."
            />
            <VehicleCard 
              image="/images/bus.jpeg"
              title="Ônibus"
              capacity="44 lugares"
              desc="Rotas troncais de altíssima densidade estrutural."
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold mb-12 text-center">Fluxo de Alocação Automática</h2>
          
          <div className="flex flex-col lg:flex-row items-center justify-center gap-4 lg:gap-8 max-w-5xl mx-auto">
            <FlowBox title="Input de RH" desc="Atualização diária de headcount e turnos" />
            <ArrowRight className="text-accent hidden lg:block" size={32} />
            <div className="h-8 w-[2px] bg-accent lg:hidden"></div>
            
            <FlowBox title="Motor Fretai" desc="Recálculo de vértices e ocupação" active />
            <ArrowRight className="text-accent hidden lg:block" size={32} />
            <div className="h-8 w-[2px] bg-accent lg:hidden"></div>
            
            <FlowBox title="Seleção de Ativo" desc="Ajuste do veículo exato para a demanda" />
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}

function VehicleCard({ image, title, capacity, desc }: { image: string, title: string, capacity: string, desc: string }) {
  return (
    <div className="bg-card border rounded-xl overflow-hidden shadow-sm flex flex-col">
      <div className="aspect-video bg-white flex items-center justify-center p-4 border-b">
        <img src={image} alt={title} className="object-contain w-full h-full mix-blend-multiply" />
      </div>
      <div className="p-6 flex-grow">
        <h3 className="font-bold text-xl mb-1"><TypingText text={title} /></h3>
        <span className="inline-block px-2 py-1 bg-accent/10 text-accent text-xs font-mono font-semibold rounded mb-4">
          {capacity}
        </span>
        <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

function FlowBox({ title, desc, active = false }: { title: string, desc: string, active?: boolean }) {
  return (
    <div className={`p-6 rounded-xl border ${active ? 'bg-accent/20 border-accent/50 shadow-[0_0_30px_rgba(30,144,255,0.15)]' : 'bg-secondary/50 border-white/10'} w-full lg:w-64 text-center`}>
      <h4 className={`font-bold mb-2 ${active ? 'text-white' : 'text-primary-foreground/90'}`}>{title}</h4>
      <p className="text-sm text-primary-foreground/60">{desc}</p>
    </div>
  )
}
