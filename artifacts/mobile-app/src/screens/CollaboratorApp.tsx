import { useState } from "react";
import { Bell, BusFront, CircleUserRound, Clock3, Home, MapPin } from "lucide-react-native";
import { useAuth } from "../auth/AuthContext";
import { AppHeader, BottomTabs, Shell, type TabItem } from "../components/AppShell";
import { EmptyState, Screen, SectionHeader } from "../components/ui";
import { ProfileScreen } from "./ProfileScreen";

type Tab = "home" | "journeys" | "alerts" | "profile";
const tabs: TabItem<Tab>[] = [
  { key: "home", label: "Início", icon: Home },
  { key: "journeys", label: "Viagens", icon: BusFront },
  { key: "alerts", label: "Avisos", icon: Bell },
  { key: "profile", label: "Conta", icon: CircleUserRound },
];

export function CollaboratorApp() {
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>("home");
  const content = tab === "profile" ? <ProfileScreen /> : (
    <Screen>
      <SectionHeader eyebrow="Transporte" title={tab === "home" ? "Sua próxima viagem" : tab === "journeys" ? "Minhas viagens" : "Avisos"} />
      <EmptyState
        icon={tab === "alerts" ? Bell : tab === "journeys" ? Clock3 : MapPin}
        title={tab === "alerts" ? "Nenhum aviso novo" : "Nenhuma viagem disponível"}
        text={tab === "alerts" ? "Alterações de horário, veículo e ponto de embarque aparecerão aqui." : "Seu ponto de embarque e os dados do veículo aparecerão quando a rota for publicada."}
      />
    </Screen>
  );

  return (
    <Shell
      header={<AppHeader greeting={`Olá, ${session?.name.split(" ")[0] ?? ""}`} detail="Colaborador" />}
      tabs={<BottomTabs<Tab> items={tabs} current={tab} onChange={setTab} />}
    >
      {content}
    </Shell>
  );
}
