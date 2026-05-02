import { PageWrapper } from "@/components/layout/PageWrapper";
import { Building2, Cpu, Globe, Target } from "lucide-react";
import { TypingText } from "@/components/ui/TypingText.tsx";

export default function Sobre() {
  return (
    <PageWrapper 
      title="Sobre Nós" 
      description="A tecnologia por trás da evolução do transporte corporativo."
    >
      <section className="bg-primary text-primary-foreground py-24">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h1 className="text-4xl lg:text-6xl font-bold mb-8">Nascemos para resolver a ineficiência estrutural.</h1>
          <p className="text-xl text-primary-foreground/80 leading-relaxed">
            Somos uma empresa de tecnologia especializada em transporte fretafo. Não possuímos frota — nossa atuação é baseada em parceiros operadores, enquanto nossa plataforma orquestra, otimiza e controla toda a eficiência da operação.
          </p>
        </div>
      </section>

      <section className="py-24 bg-background border-b">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6 text-lg text-muted-foreground">
              <p>
                Durante décadas, as indústrias trataram o fretamento corporativo como um mal necessário e inflexível. Assinavam contratos milionários baseados em ônibus cheios, enquanto as planilhas de RH mostravam outra realidade: absenteísmo, trabalho híbrido e turnos flutuantes.
              </p>
              <p>
                A Fretai foi fundada por profissionais de tecnologia e gestores comerciais para atacar esse ralo financeiro. Construímos a primeira plataforma B2B que precifica o transporte pela demanda real (colaborador) e não pelo ativo (veículo).
              </p>
              <p className="font-medium text-foreground">
                A Fretai está sendo construída para se tornar a infraestrutura inteligente do fretado corporativo, oferecendo previsibilidade financeira para CFOs e estabilidade operacional para o RH.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <FocusArea icon={<Cpu size={24}/>} title={<TypingText text="Tecnologia Proprietária" />}></FocusArea>
              <FocusArea icon={<Target size={24}/>} title={<TypingText text="Foco em Eficiência" />}></FocusArea>
              <FocusArea icon={<Building2 size={24}/>} title={<TypingText text="Governança B2B" />}></FocusArea>
              <FocusArea icon={<Globe size={24}/>} title={<TypingText text="Escalabilidade Nacional" />}></FocusArea>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-muted/30">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-12">Escalabilidade Nacional</h2>
          <div className="max-w-3xl mx-auto">
            <p className="text-lg text-muted-foreground mb-8">
              Nossa plataforma é cloud-native e agnóstica de geografia. Seja sua operação no polo industrial de Manaus, ABC Paulista ou no Sul do país, o algoritmo atua com a mesma precisão em escala.
            </p>

             {/*<div className="h-64 rounded-xl border bg-card flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-[url('https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Brazil_map_modern.svg/1200px-Brazil_map_modern.svg.png')] bg-contain bg-center bg-no-repeat"></div>
              <p className="relative z-10 font-mono text-accent font-bold tracking-widest">+50 PLATAS INDUSTRIAIS ATENDIDAS</p>
            </div>*/}
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}

function FocusArea({ icon, title }: { icon: React.ReactNode, title: React.ReactNode }) {
  return (
    <div className="bg-card border p-6 rounded-xl text-center shadow-sm">
      <div className="inline-flex items-center justify-center p-3 bg-secondary text-secondary-foreground rounded-lg mb-4">
        {icon}
      </div>
      <h3 className="font-bold">{title}</h3>
    </div>
  )
}
