import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "./auth/AuthContext";
import { ChangePasswordScreen } from "./screens/ChangePasswordScreen";
import { CollaboratorApp } from "./screens/CollaboratorApp";
import { DriverApp } from "./screens/DriverApp";
import { LoginScreen } from "./screens/LoginScreen";
import { PartnerApp } from "./screens/PartnerApp";
import { colors } from "./theme";
import { toMobileRole } from "./types";

export function AppRoot() {
  const { session, loading } = useAuth();
  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.blue} /></View>;
  if (!session) return <LoginScreen />;
  if (session.forcePasswordChange) return <ChangePasswordScreen />;

  const role = toMobileRole(session.role);
  if (role === "partner") return <PartnerApp />;
  if (role === "driver") return <DriverApp />;
  if (role === "collaborator") return <CollaboratorApp />;
  return <LoginScreen />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.navy },
});
