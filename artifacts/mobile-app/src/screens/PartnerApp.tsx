import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BusFront, CircleUserRound, Home, RefreshCw, UsersRound } from "lucide-react-native";
import { useAuth } from "../auth/AuthContext";
import { AppHeader, BottomTabs, Shell, type TabItem } from "../components/AppShell";
import { Badge, EmptyState, Metric, Screen, SectionHeader } from "../components/ui";
import { getMobileIdentity, getPartnerDrivers, getPartnerVehicles } from "../services/api";
import { colors } from "../theme";
import type { Driver, MobileIdentity, Vehicle } from "../types";
import { ProfileScreen } from "./ProfileScreen";

type Tab = "home" | "fleet" | "drivers" | "profile";
const tabs: TabItem<Tab>[] = [
  { key: "home", label: "Início", icon: Home },
  { key: "fleet", label: "Frota", icon: BusFront },
  { key: "drivers", label: "Motoristas", icon: UsersRound },
  { key: "profile", label: "Conta", icon: CircleUserRound },
];

export function PartnerApp() {
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>("home");
  const [identity, setIdentity] = useState<MobileIdentity | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session?.entityId) return;
    setError("");
    try {
      const [me, fleet, team] = await Promise.all([
        getMobileIdentity(session.token),
        getPartnerVehicles(session.token, session.entityId),
        getPartnerDrivers(session.token, session.entityId),
      ]);
      setIdentity(me);
      setVehicles(fleet);
      setDrivers(team);
    } catch {
      setError("Não foi possível atualizar os dados da operação.");
    }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const refreshAction = (
    <Pressable accessibilityLabel="Atualizar dados" onPress={refresh} style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}>
      <RefreshCw size={18} color={colors.blue} />
    </Pressable>
  );

  const content = tab === "profile" ? <ProfileScreen /> : (
    <Screen>
      <SectionHeader
        eyebrow={tab === "home" ? "Operação" : "Gestão"}
        title={tab === "home" ? "Visão de hoje" : tab === "fleet" ? "Frota" : "Motoristas"}
        action={refreshAction}
      />
      {refreshing ? <Text style={styles.refreshing}>Atualizando...</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {tab === "home" ? (
        <>
          <View style={styles.metrics}>
            <Metric icon={BusFront} label="Veículos ativos" value={String(identity?.summary?.activeVehicles ?? vehicles.filter(v => v.status === "ativo").length)} />
            <Metric icon={UsersRound} label="Motoristas ativos" value={String(identity?.summary?.activeDrivers ?? drivers.filter(d => d.isActive).length)} tone="green" />
          </View>
          <SectionHeader title="Rotas em andamento" />
          <EmptyState icon={BusFront} title="Nenhuma rota ativa agora" text="As viagens publicadas para a operação aparecerão aqui." />
        </>
      ) : null}
      {tab === "fleet" ? (
        <View style={styles.list}>
          {vehicles.length ? vehicles.map(vehicle => (
            <View key={vehicle.id} style={styles.row}>
              <View style={styles.rowIcon}><BusFront size={21} color={colors.blue} /></View>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{vehicle.plate}</Text>
                <Text style={styles.rowText}>{vehicle.type.replaceAll("_", " ")} · {vehicle.capacity} lugares</Text>
              </View>
              <Badge tone={vehicle.status === "ativo" ? "green" : "gray"}>{vehicle.status === "ativo" ? "Ativo" : "Inativo"}</Badge>
            </View>
          )) : <EmptyState icon={BusFront} title="Frota vazia" text="Cadastre os veículos pelo painel web do parceiro." />}
        </View>
      ) : null}
      {tab === "drivers" ? (
        <View style={styles.list}>
          {drivers.length ? drivers.map(driver => (
            <View key={driver.id} style={styles.row}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{driver.name.trim().charAt(0).toUpperCase()}</Text></View>
              <View style={styles.rowMain}>
                <Text numberOfLines={1} style={styles.rowTitle}>{driver.name}</Text>
                <Text style={styles.rowText}>CNH {driver.cnh} · {driver.cnhCategory}</Text>
              </View>
              <Badge tone={driver.isActive ? "green" : "gray"}>{driver.isActive ? "Ativo" : "Inativo"}</Badge>
            </View>
          )) : <EmptyState icon={UsersRound} title="Equipe vazia" text="Cadastre os motoristas pelo painel web do parceiro." />}
        </View>
      ) : null}
    </Screen>
  );

  return (
    <Shell
      header={<AppHeader greeting={`Olá, ${session?.name.split(" ")[0] ?? ""}`} detail={identity?.partner?.name ?? "Parceiro transportador"} />}
      tabs={<BottomTabs<Tab> items={tabs} current={tab} onChange={setTab} />}
    >
      {content}
    </Shell>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  list: { gap: 10 },
  row: { minHeight: 78, borderRadius: 8, padding: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: { width: 42, height: 42, borderRadius: 7, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.navy, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.white, fontWeight: "800", fontSize: 17 },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.ink, fontWeight: "800", fontSize: 15 },
  rowText: { color: colors.muted, fontSize: 12, marginTop: 4, textTransform: "capitalize" },
  error: { color: colors.red, backgroundColor: colors.redSoft, padding: 12, borderRadius: 7, marginBottom: 12 },
  refreshing: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  refresh: { width: 38, height: 38, borderRadius: 7, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.65 },
});
