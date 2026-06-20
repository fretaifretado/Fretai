import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import APlataforma from "@/pages/a-plataforma";
import SolucaoFinanceira from "@/pages/solucao-financeira";
import EstruturaDeCapacidade from "@/pages/estrutura-de-capacidade";
import GovernancaEControle from "@/pages/governanca-e-controle";
import Sobre from "@/pages/sobre";
import Contato from "@/pages/contato";
import Login from "@/pages/login";
import Admin from "@/pages/admin";

/* ── Parceiro Dashboard ── */
import MotoristasPage from "@/pages/parceiro/motoristas";

/* ── SaaS Dashboard — lazy loaded para evitar flash branco na navegação ── */
import { DashboardProvider } from "@/pages/dashboard/context";
import DashboardPage       from "@/pages/dashboard/index";

const ColaboradoresPage    = lazy(() => import("@/pages/dashboard/colaboradores"));
const MovimentacaoPage     = lazy(() => import("@/pages/dashboard/movimentacao"));
const PendenciasPage       = lazy(() => import("@/pages/dashboard/pendencias"));
const StatusAgendadosPage  = lazy(() => import("@/pages/dashboard/status-agendados"));
const RotaAoVivoPage       = lazy(() => import("@/pages/dashboard/rota-ao-vivo"));
const RotasAgendadasPage   = lazy(() => import("@/pages/dashboard/rotas-agendadas"));
const ComprasPage          = lazy(() => import("@/pages/dashboard/compras"));
const NotasFiscaisPage     = lazy(() => import("@/pages/dashboard/notas-fiscais"));
const FeriadosPage         = lazy(() => import("@/pages/dashboard/feriados"));
const TurnosPage           = lazy(() => import("@/pages/dashboard/turnos"));
const UsuariosPage         = lazy(() => import("@/pages/dashboard/usuarios"));
const GruposPage           = lazy(() => import("@/pages/dashboard/grupos"));
const FiliaisPage          = lazy(() => import("@/pages/dashboard/filiais"));
const DemoGateway          = lazy(() => import("@/pages/dashboard/demo"));
const RelatoriosPage       = lazy(() => import("@/pages/dashboard/relatorios"));

/* Fallback invisível — mantém o layout montado, sem flash branco */
function PageFallback() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh] bg-muted/30">
      <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin opacity-40" />
    </div>
  );
}

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      {/* Institutional */}
      <Route path="/" component={Home} />
      <Route path="/a-plataforma" component={APlataforma} />
      <Route path="/solucao-financeira" component={SolucaoFinanceira} />
      <Route path="/estrutura-de-capacidade" component={EstruturaDeCapacidade} />
      <Route path="/governanca-e-controle" component={GovernancaEControle} />
      <Route path="/sobre" component={Sobre} />
      <Route path="/contato" component={Contato} />
      <Route path="/login" component={Login} />
      <Route path="/admin" component={Admin} />
      <Route path="/painel-demo">
        <Suspense fallback={<PageFallback />}><DemoGateway /></Suspense>
      </Route>

      {/* Parceiro Dashboard */}
      <Route path="/parceiro" component={MotoristasPage} />
      <Route path="/parceiro/motoristas" component={MotoristasPage} />

      {/* SaaS Dashboard — todas as rotas compartilham um único DashboardProvider */}
      <Route>
        <DashboardProvider>
          <Suspense fallback={<PageFallback />}>
            <Switch>
              <Route path="/painel"                    component={DashboardPage} />
              <Route path="/painel/relatorios"         component={DashboardPage} />
              <Route path="/painel/colaboradores"      component={ColaboradoresPage} />
              <Route path="/painel/movimentacao"       component={MovimentacaoPage} />
              <Route path="/painel/pendencias"         component={PendenciasPage} />
              <Route path="/painel/status-agendados"   component={StatusAgendadosPage} />
              <Route path="/painel/rota-ao-vivo"       component={RotaAoVivoPage} />
              <Route path="/painel/rotas-agendadas"    component={RotasAgendadasPage} />
              <Route path="/painel/compras"            component={ComprasPage} />
              <Route path="/painel/notas-fiscais"      component={NotasFiscaisPage} />
              <Route path="/painel/feriados"           component={FeriadosPage} />
              <Route path="/painel/turnos"             component={TurnosPage} />
              <Route path="/painel/usuarios"           component={UsuariosPage} />
              <Route path="/painel/grupos"             component={GruposPage} />
              <Route path="/painel/filiais"            component={FiliaisPage} />
            </Switch>
          </Suspense>
        </DashboardProvider>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
