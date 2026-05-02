import { Link, useLocation } from "wouter";
import { LayoutDashboard, Car, Building2, Calculator } from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { ReactNode } from "react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Orçamentos", href: "/orcamentos", icon: Calculator },
  { name: "Empresas", href: "/empresas", icon: Building2 },
  { name: "Veículos", href: "/veiculos", icon: Car },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <SidebarProvider>
      <div className="min-h-[100dvh] flex w-full bg-background text-foreground">
        <Sidebar className="border-r border-border">
          <SidebarHeader className="p-4 flex h-16 items-center justify-between border-b border-border">
            <div className="flex items-center gap-2 px-2">
              <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
                <Calculator className="h-5 w-5" />
              </div>
              <span className="font-semibold tracking-tight">CorpTransport</span>
            </div>
            <SidebarTrigger />
          </SidebarHeader>
          <SidebarContent className="p-2">
            <SidebarMenu>
              {navigation.map((item) => {
                const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                      <Link href={item.href} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4" />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <main className="flex-1 flex flex-col min-h-[100dvh] overflow-hidden relative">
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="mx-auto max-w-6xl w-full">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
