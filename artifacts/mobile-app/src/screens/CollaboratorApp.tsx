import { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Bell, BusFront, CircleUserRound, Clock3, Home, House, MapPin, TicketCheck } from "lucide-react-native";
import { useAuth } from "../auth/AuthContext";
import { AppHeader, BottomTabs, Shell, type TabItem } from "../components/AppShell";
import { EmptyState, Screen, SectionHeader } from "../components/ui";
import { getCollaboratorHome } from "../services/api";
import { colors } from "../theme";
import type { CollaboratorHome } from "../types";
import { ProfileScreen } from "./ProfileScreen";

type Tab = "home" | "journeys" | "alerts" | "profile";
const tabs: TabItem<Tab>[] = [
  { key: "home", label: "Início", icon: Home },
  { key: "journeys", label: "Viagens", icon: BusFront },
  { key: "alerts", label: "Avisos", icon: Bell },
  { key: "profile", label: "Conta", icon: CircleUserRound },
];

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

export function CollaboratorApp() {
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>("home");
  const [data, setData] = useState<CollaboratorHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load(refresh = false) {
    if (!session) return;
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      setData(await getCollaboratorHome(session.token));
    } catch {
      setError("Não foi possível carregar seus dados agora.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void load(); }, [session?.token]);

  let content;
  if (tab === "profile") {
    content = <ProfileScreen />;
  } else if (tab === "alerts") {
    content = <Screen><SectionHeader eyebrow="Comunicação" title="Avisos" /><EmptyState icon={Bell} title="Nenhum aviso novo" text="Alterações importantes da operação aparecerão aqui." /></Screen>;
  } else if (tab === "journeys") {
    content = <Screen><SectionHeader eyebrow="Transporte" title="Minhas viagens" /><EmptyState icon={Clock3} title="Histórico em preparação" text="As viagens realizadas serão exibidas nesta área." /></Screen>;
  } else {
    content = (
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}
      >
        {loading ? <ActivityIndicator size="large" color={colors.blue} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && data ? (
          <>
            {data.journey ? (
              <View style={styles.journeyCard}>
                <View style={styles.journeyTop}>
                  <View>
                    <Text style={styles.eyebrow}>PRÓXIMO EMBARQUE</Text>
                    <Text style={styles.date}>{formatDate(data.journey.date)}</Text>
                  </View>
                  <View style={styles.vehicleCode}>
                    <Text style={styles.vehicleCodeText}>{data.journey.vehicleCode ?? "--"}</Text>
                  </View>
                </View>
                <View style={styles.tripRow}>
                  <MapPin size={21} color={colors.blue} />
                  <View style={styles.tripText}>
                    <Text style={styles.tripLabel}>Embarque</Text>
                    <Text style={styles.tripAddress}>{data.journey.pickupAddress}</Text>
                    {data.journey.time ? <Text style={styles.time}>{data.journey.time}</Text> : null}
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.tripRow}>
                  <House size={21} color={colors.green} />
                  <View style={styles.tripText}>
                    <Text style={styles.tripLabel}>Destino</Text>
                    <Text style={styles.tripAddress}>{data.journey.dropoffAddress}</Text>
                    {data.journey.vehicleType ? <Text style={styles.vehicleType}>{data.journey.vehicleType}</Text> : null}
                  </View>
                </View>
              </View>
            ) : (
              <EmptyState icon={MapPin} title="Nenhuma viagem disponível" text="Os dados aparecerão quando uma rota for publicada para você." />
            )}

            <View style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <TicketCheck size={23} color={colors.blue} />
                <Text style={styles.infoTitle}>Seus vales</Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.companyName}>{data.employee.companyName}</Text>
                <View style={styles.balance}><Text style={styles.balanceText}>{data.vouchers.balance}</Text></View>
              </View>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <House size={23} color={colors.green} />
                <Text style={styles.infoTitle}>Seu endereço</Text>
              </View>
              <Text style={styles.homeAddress}>{data.employee.homeAddress || "Endereço não cadastrado"}</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <Shell
      header={<AppHeader greeting={`Olá, ${data?.employee.name.split(" ")[0] ?? session?.name.split(" ")[0] ?? ""}`} detail={data?.employee.companyName ?? "Colaborador"} />}
      tabs={<BottomTabs<Tab> items={tabs} current={tab} onChange={setTab} />}
    >
      {content}
    </Shell>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, gap: 14, paddingBottom: 32 },
  loader: { marginTop: 80 },
  error: { color: colors.red, backgroundColor: colors.redSoft, borderWidth: 1, borderColor: "#ffd1d1", borderRadius: 7, padding: 12 },
  journeyCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 20 },
  journeyTop: { minHeight: 100, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  date: { color: colors.ink, fontSize: 25, fontWeight: "900", marginTop: 5 },
  vehicleCode: { width: 112, height: 92, marginTop: -20, marginRight: -20, backgroundColor: colors.blue, borderBottomLeftRadius: 56, alignItems: "center", justifyContent: "center" },
  vehicleCodeText: { color: colors.white, fontSize: 43, fontWeight: "900" },
  tripRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  tripText: { flex: 1 },
  tripLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  tripAddress: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: "600", marginTop: 3 },
  time: { color: colors.blue, fontSize: 24, fontWeight: "900", marginTop: 7 },
  vehicleType: { color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 6 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 17 },
  infoCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 20 },
  infoHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  balanceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 20 },
  companyName: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: "700" },
  balance: { minWidth: 58, height: 48, borderRadius: 7, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  balanceText: { color: colors.white, fontSize: 20, fontWeight: "900" },
  homeAddress: { color: colors.ink, backgroundColor: colors.canvas, borderRadius: 6, padding: 13, fontSize: 14, lineHeight: 20, marginTop: 18 },
});
