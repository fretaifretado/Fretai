import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";

// Pages
import Dashboard from "@/pages/dashboard";
import VehiclesList from "@/pages/vehicles/list";
import NewVehicle from "@/pages/vehicles/new";
import CompaniesList from "@/pages/companies/list";
import NewCompany from "@/pages/companies/new";
import BudgetsList from "@/pages/budgets/list";
import NewBudget from "@/pages/budgets/new";
import BudgetDetail from "@/pages/budgets/detail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        
        <Route path="/veiculos" component={VehiclesList} />
        <Route path="/veiculos/novo" component={NewVehicle} />
        
        <Route path="/empresas" component={CompaniesList} />
        <Route path="/empresas/nova" component={NewCompany} />
        
        <Route path="/orcamentos" component={BudgetsList} />
        <Route path="/orcamentos/novo" component={NewBudget} />
        <Route path="/orcamentos/:id" component={BudgetDetail} />
        
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
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
