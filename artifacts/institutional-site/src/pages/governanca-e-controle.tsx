import { PageWrapper } from "@/components/layout/PageWrapper";
import { TypingText } from "@/components/ui/TypingText.tsx";
import { BadgeCheck, FileSearch, History, Lock, ShieldAlert, SlidersHorizontal } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function GovernancaEControle() {
  return (
    <PageWrapper 
      title="Governança e Controle" 
      description="Transparência total e relatórios auditáveis para a diretoria."
    >
      <section className="bg-background py-20 border-b">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <div className="inline-flex items-center justify-center p-3 bg-secondary rounded-xl mb-6">
            <Lock className="text-white" size={32} />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold mb-6">Governança rígida. Transparência absoluta.</h1>
          <p className="text-xl text-muted-foreground">
            A eliminação da assimetria de informação. O Fretai entrega controle granular e trilhas de auditoria para compliance corporativo.
          </p>
        </div>
      </section>

      <section className="py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-24">
            <PillarCard 
              icon={<SlidersHorizontal />}
              title={<TypingText text="Controle Parametrizado" />}
              desc="Definição de SLAs, limites de custo e regras de aprovação diretamente no sistema."
            />
            <PillarCard 
              icon={<BadgeCheck />}
              title={<TypingText text="Conciliação Automatizada" />}
              desc="A fatura reflete exatamente o que a plataforma roteirizou e executou."
            />
            <PillarCard 
              icon={<FileSearch />}
              title={<TypingText text="Relatórios Auditáveis" />}
              desc="Exportação de dados detalhados para sistemas de ERP e equipes de compliance."
            />
            <PillarCard 
              icon={<ShieldAlert />}
              title={<TypingText text="Monitoramento de Ocupação" />}
              desc="Métricas antifraude que cruzam dados de presença do RH com catracas."
            />
            <PillarCard 
              icon={<History />}
              title={<TypingText text="Histórico Comparativo" />}
              desc="Análise de evolução de custos mês a mês normalizada pelo headcount."
            />
            <PillarCard 
              icon={<Lock />}
              title={<TypingText text="Transparência Total" />}
              desc="O dashboard não esconde dados. Visualização clara de ociosidades residuais e gargalos."
            />
          </div>

          <div className="bg-card border rounded-xl overflow-hidden shadow-sm max-w-5xl mx-auto">
            <div className="p-6 border-b bg-muted/50">
              <h3 className="font-bold text-lg">Trilha de Auditoria - Rota 44B (Outubro)</h3>
              <p className="text-sm text-muted-foreground">Comparativo de execução vs. planejamento</p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Rota</TableHead>
                    <TableHead>Planejado (Capacidade)</TableHead>
                    <TableHead>Realizado (Embarques)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação Sistêmica</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">10/10/2023</TableCell>
                    <TableCell>44B - Leste</TableCell>
                    <TableCell>Micro (32)</TableCell>
                    <TableCell>31</TableCell>
                    <TableCell><span className="text-green-600 font-medium">Conforme</span></TableCell>
                    <TableCell className="text-right text-muted-foreground">-</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">11/10/2023</TableCell>
                    <TableCell>44B - Leste</TableCell>
                    <TableCell>Micro (32)</TableCell>
                    <TableCell>29</TableCell>
                    <TableCell><span className="text-green-600 font-medium">Conforme</span></TableCell>
                    <TableCell className="text-right text-muted-foreground">-</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">12/10/2023</TableCell>
                    <TableCell>44B - Leste</TableCell>
                    <TableCell>Micro (32)</TableCell>
                    <TableCell>14</TableCell>
                    <TableCell><span className="text-destructive font-medium">Baixa Ocupação</span></TableCell>
                    <TableCell className="text-right text-accent font-medium">Redimensionado p/ Van</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">13/10/2023</TableCell>
                    <TableCell>44B - Leste</TableCell>
                    <TableCell>Van (15)</TableCell>
                    <TableCell>14</TableCell>
                    <TableCell><span className="text-green-600 font-medium">Conforme</span></TableCell>
                    <TableCell className="text-right text-muted-foreground">Nova baseline (Economia 42%)</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}

function PillarCard({ icon, title, desc }: { icon: React.ReactNode, title: React.ReactNode, desc: string }) {
  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm hover:border-accent/50 transition-colors">
      <div className="text-primary mb-4">
        {icon}
      </div>
      <h4 className="text-lg font-bold mb-2">{title}</h4>
      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  )
}
