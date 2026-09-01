import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Bell, ChevronRight, LogOut, ShieldCheck, UserRound, type LucideIcon } from "lucide-react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "../auth/AuthContext";
import { Screen, SectionHeader } from "../components/ui";
import { colors } from "../theme";

export function ProfileScreen() {
  const { session, signOut } = useAuth();

  async function enableNotifications() {
    const result = await Notifications.requestPermissionsAsync();
    Alert.alert(
      result.granted ? "Notificações ativadas" : "Permissão não concedida",
      result.granted ? "Você receberá atualizações importantes da operação." : "Você pode liberar a permissão nos ajustes do aparelho.",
    );
  }

  return (
    <Screen>
      <SectionHeader eyebrow="Conta" title="Meu perfil" />
      <View style={styles.identity}>
        <View style={styles.avatar}><UserRound size={30} color={colors.white} /></View>
        <View style={styles.identityText}>
          <Text numberOfLines={1} style={styles.name}>{session?.name}</Text>
          <Text numberOfLines={1} style={styles.email}>
            {session?.role === "colaborador" && session.cpf ? `CPF ${session.cpf}` : session?.email}
          </Text>
        </View>
      </View>
      <View style={styles.menu}>
        <MenuItem icon={Bell} label="Ativar notificações" onPress={enableNotifications} />
        <MenuItem icon={ShieldCheck} label="Segurança da conta" onPress={() => Alert.alert("Segurança", "A troca de senha estará disponível nesta tela na próxima etapa.")} />
        <MenuItem icon={LogOut} label="Sair da conta" danger onPress={() => void signOut()} />
      </View>
      <Text style={styles.version}>Fretai para Android e iOS · versão 0.1.0</Text>
    </Screen>
  );
}

function MenuItem({ icon: Icon, label, onPress, danger }: { icon: LucideIcon; label: string; onPress(): void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
      <Icon size={20} color={danger ? colors.red : colors.blue} />
      <Text style={[styles.menuLabel, danger && styles.danger]}>{label}</Text>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  identity: { backgroundColor: colors.navy, borderRadius: 8, padding: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" },
  identityText: { flex: 1, minWidth: 0 },
  name: { color: colors.white, fontSize: 18, fontWeight: "800" },
  email: { color: "#aebed0", fontSize: 13, marginTop: 4 },
  menu: { marginTop: 18, borderWidth: 1, borderColor: colors.line, borderRadius: 8, overflow: "hidden", backgroundColor: colors.white },
  menuItem: { minHeight: 58, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  menuLabel: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: "700" },
  danger: { color: colors.red },
  pressed: { backgroundColor: colors.canvas },
  version: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 24 },
});
