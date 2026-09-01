import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { CircleUserRound, Home, MapPinned, Navigation, Radio, ShieldCheck } from "lucide-react-native";
import { useAuth } from "../auth/AuthContext";
import { AppHeader, BottomTabs, Shell, type TabItem } from "../components/AppShell";
import { Badge, EmptyState, PrimaryButton, Screen, SectionHeader } from "../components/ui";
import { getMobileIdentity } from "../services/api";
import { colors } from "../theme";
import type { MobileIdentity } from "../types";
import { ProfileScreen } from "./ProfileScreen";

type Tab = "home" | "route" | "profile";
const tabs: TabItem<Tab>[] = [
  { key: "home", label: "Início", icon: Home },
  { key: "route", label: "Minha rota", icon: Navigation },
  { key: "profile", label: "Conta", icon: CircleUserRound },
];

export function DriverApp() {
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>("home");
  const [identity, setIdentity] = useState<MobileIdentity | null>(null);
  const [gps, setGps] = useState<"idle" | "loading" | "ready">("idle");

  useEffect(() => {
    if (session) getMobileIdentity(session.token).then(setIdentity).catch(() => undefined);
  }, [session]);

  async function prepareGps() {
    setGps("loading");
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) {
      setGps("idle");
      Alert.alert("Localização necessária", "Libere a localização para acompanhar a rota.");
      return;
    }
    await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setGps("ready");
  }

  const content = tab === "profile" ? <ProfileScreen /> : (
    <Screen>
      <SectionHeader eyebrow="Operação" title={tab === "home" ? "Próxima viagem" : "Minha rota"} />
      {tab === "home" ? (
        <>
          <View style={styles.status}>
            <View style={styles.statusIcon}><ShieldCheck size={23} color={colors.green} /></View>
            <View style={styles.statusText}>
              <Text style={styles.statusTitle}>Cadastro ativo</Text>
              <Text style={styles.statusDetail}>{identity?.partner?.name ?? "Parceiro Fretai"}</Text>
            </View>
            <Badge>Pronto</Badge>
          </View>
          <SectionHeader title="Agenda" />
          <EmptyState icon={Navigation} title="Nenhuma viagem atribuída" text="Quando uma rota for vinculada ao seu veículo, os horários e pontos aparecerão aqui." />
        </>
      ) : (
        <>
          <View style={styles.mapPlaceholder}>
            <MapPinned size={34} color={colors.blue} />
            <Text style={styles.mapTitle}>{gps === "ready" ? "GPS pronto para a viagem" : "Prepare o rastreamento"}</Text>
            <Text style={styles.mapText}>{gps === "ready" ? "A localização foi validada neste aparelho." : "A rota aparecerá no mapa quando estiver atribuída."}</Text>
          </View>
          <View style={styles.action}>
            <PrimaryButton label={gps === "ready" ? "GPS validado" : "Validar localização"} icon={Radio} onPress={prepareGps} loading={gps === "loading"} disabled={gps === "ready"} />
          </View>
        </>
      )}
    </Screen>
  );

  return (
    <Shell
      header={<AppHeader greeting={`Olá, ${identity?.driver?.name.split(" ")[0] ?? session?.name.split(" ")[0] ?? ""}`} detail={identity?.partner?.name ?? "Motorista Fretai"} />}
      tabs={<BottomTabs<Tab> items={tabs} current={tab} onChange={setTab} />}
    >
      {content}
    </Shell>
  );
}

const styles = StyleSheet.create({
  status: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  statusIcon: { width: 44, height: 44, borderRadius: 7, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center" },
  statusText: { flex: 1 },
  statusTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  statusDetail: { color: colors.muted, fontSize: 12, marginTop: 3 },
  mapPlaceholder: { height: 320, borderRadius: 8, backgroundColor: "#e8eef4", borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", padding: 30 },
  mapTitle: { color: colors.ink, fontWeight: "800", fontSize: 17, marginTop: 16 },
  mapText: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 6 },
  action: { marginTop: 14 },
});
