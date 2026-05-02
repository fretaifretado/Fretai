import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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

/* ── SaaS Dashboard ── */
import { DashboardProvider } from "@/pages/dashboard/context";
import DashboardPage from "@/pages/dashboard/index";
import ColaboradoresPage from "@/pages/dashboard/colaboradores";
import MovimentacaoPage from "@/pages/dashboard/movimentacao";
import PendenciasPage from "@/pages/dashboard/pendencias";
import StatusAgendadosPage from "@/pages/dashboard/status-agendados";
import RotaAoVivoPage from "@/pages/dashboard/rota-ao-vivo";
import RotasAgendadasPage from "@/pages/dashboard/rotas-agendadas";
import ComprasPage from "@/pages/dashboard/compras";
import NotasFiscaisPage from "@/pages/dashboard/notas-fiscais";
import FeriadosPage from "@/pages/dashboard/feriados";
import TurnosPage from "@/pages/dashboard/turnos";
import GruposPage from "@/pages/dashboard/grupos";
import FiliaisPage from "@/pages/dashboard/filiais";
import DemoGateway from "@/pages/dashboard/demo";
import RelatoriosPage from "@/pages/dashboard/relatorios";

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
      <Route path="/painel-demo" component={DemoGateway} />

      {/* SaaS Dashboard — all routes share one provider for state */}
      <Route>
        <DashboardProvider>
          <Switch>
            <Route path="/painel"                       component={DashboardPage} />
            <Route path="/painel/relatorios"            component={RelatoriosPage} />
            <Route path="/painel/colaboradores"         component={ColaboradoresPage} />
            <Route path="/painel/movimentacao"          component={MovimentacaoPage} />
            <Route path="/painel/pendencias"            component={PendenciasPage} />
            <Route path="/painel/status-agendados"      component={StatusAgendadosPage} />
            <Route path="/painel/rota-ao-vivo"          component={RotaAoVivoPage} />
            <Route path="/painel/rotas-agendadas"       component={RotasAgendadasPage} />
            <Route path="/painel/compras"               component={ComprasPage} />
            <Route path="/painel/notas-fiscais"         component={NotasFiscaisPage} />
            <Route path="/painel/feriados"              component={FeriadosPage} />
            <Route path="/painel/turnos"                component={TurnosPage} />
            <Route path="/painel/grupos"                component={GruposPage} />
            <Route path="/painel/filiais"               component={FiliaisPage} />
          </Switch>
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
