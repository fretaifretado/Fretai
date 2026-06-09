import { PageWrapper } from "@/components/layout/PageWrapper";
import { TypingText } from "@/components/ui/TypingText.tsx";
import { ArrowDownRight, ArrowUpRight, DollarSign, PieChart, TrendingDown } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const costData = [
  { month: 'Jan', fixo: 100, variavel: 100 },
  { month: 'Fev', fixo: 100, variavel: 94 },
  { month: 'Mar', fixo: 100, variavel: 88 },
  { month: 'Abr', fixo: 100, variavel: 85 },
  { month: 'Mai', fixo: 100, variavel: 79 },
  { month: 'Jun', fixo: 100, variavel: 76 },
  { month: 'Jul', fixo: 100, variavel: 72 },
];

const empCostData = [
  { dept: 'Produção', cost: 450 },
  { dept: 'Manutenção', cost: 380 },
  { dept: 'Administrativo', cost: 210 },
  { dept: 'Logística', cost: 320 },
];

export default function SolucaoFinanceira() {
  return (
    <PageWrapper 
      title="Solução Financeira" 
      description="Transformando despesa logística em indicador estratégico auditável."
    >
      {/* Header */}
      <section className="bg-primary text-primary-foreground py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 text-green-400 font-mono text-xs font-semibold mb-6">
              <DollarSign size={14} />
              CFO DASHBOARD
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold mb-6">Transporte como indicador estratégico, não apenas despesa operacional.</h1>
            <p className="text-xl text-primary-foreground/70">
              Pare de pagar por capacidade ociosa. Nossa plataforma precifica sua logística baseada estritamente no custo unitário por colaborador ativo.
            </p>
          </div>
        </div>
      </section>

      {/* Main Dashboard UI Mockup */}
      <section className="py-16 bg-muted/30 border-b">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <MetricCard title="Economia Gerada (R$)" value="R$ 1.2M" trend="-28.4%" positive />
            <MetricCard title="Custo Médio / Colaborador" value="R$ 384,50" trend="-12.1%" positive />
            <MetricCard title="Taxa de Ocupação da Frota" value="94.2%" trend="+26.6%" positive />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-card border rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold mb-6">Custo Fixo Tradicional vs. Modelo Variável Fretai</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={costData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorVar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Area type="monotone" dataKey="fixo" stroke="hsl(var(--destructive))" fill="none" strokeWidth={2} name="Custo Fixo" />
                    <Area type="monotone" dataKey="variavel" stroke="hsl(var(--accent))" fillOpacity={1} fill="url(#colorVar)" strokeWidth={2} name="Custo Fretai" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-card border rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold mb-6">Rateio por Centro de Custo</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={empCostData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="dept" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip 
                      cursor={{ fill: 'hsl(var(--muted))' }}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    />
                    <Bar dataKey="cost" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} name="Custo (R$)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Financial Features */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
              <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mb-6 text-primary-foreground">
                <PieChart />
              </div>
              <h3 className="text-2xl font-bold mb-4"><TypingText text="Rateio Preciso por Centro de Custo"/></h3>
              <p className="text-muted-foreground mb-6">
                Encerre as planilhas complexas. A plataforma entrega relatórios mensais que atrelam exatamente o custo logístico de cada colaborador ao seu respectivo centro de custo de forma automatizada e auditável.
              </p>
            </div>
            
            <div>
              <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mb-6 text-primary-foreground">
                <TrendingDown />
              </div>
              <h3 className="text-2xl font-bold mb-4"><TypingText text="Projeção Orçamentária"/></h3>
              <p className="text-muted-foreground mb-6">
                Simule o impacto financeiro de aumentos de quadro, implantação de novos turnos ou redução de operações. A plataforma projeta os custos baseando-se no algoritmo de roteirização.
              </p>
            </div>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}

function MetricCard({ title, value, trend, positive }: { title: string, value: string, trend: string, positive: boolean }) {
  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      <div className="flex items-end justify-between">
        <span className="text-3xl font-bold">{value}</span>
        <span className={`flex items-center text-sm font-semibold ${positive ? 'text-green-600' : 'text-destructive'}`}>
          {positive ? <ArrowDownRight size={16} className="mr-1" /> : <ArrowUpRight size={16} className="mr-1" />}
          {trend}
        </span>
      </div>
    </div>
  )
}
