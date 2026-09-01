import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { KeyRound } from "lucide-react-native";
import { useAuth } from "../auth/AuthContext";
import { Brand, Field, PrimaryButton } from "../components/ui";
import { ApiError, changePassword } from "../services/api";
import { colors } from "../theme";

export function ChangePasswordScreen() {
  const { session, finishPasswordChange } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!session) return;
    if (next.length < 6) { setError("A nova senha deve ter ao menos 6 caracteres."); return; }
    if (next !== confirm) { setError("As novas senhas não coincidem."); return; }
    setLoading(true);
    setError("");
    try {
      await changePassword(session.token, current, next);
      await finishPasswordChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível alterar a senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.page}>
      <Brand />
      <View style={styles.icon}><KeyRound size={28} color={colors.blue} /></View>
      <Text style={styles.title}>Crie uma nova senha</Text>
      <Text style={styles.subtitle}>Este é seu primeiro acesso. Troque a senha inicial para continuar.</Text>
      <View style={styles.fields}>
        <Field label="Senha atual" value={current} onChangeText={setCurrent} secureTextEntry />
        <Field label="Nova senha" value={next} onChangeText={setNext} secureTextEntry />
        <Field label="Confirmar nova senha" value={confirm} onChangeText={setConfirm} secureTextEntry />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Salvar nova senha" onPress={submit} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 24, paddingTop: 64 },
  icon: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center", marginTop: 52, marginBottom: 20 },
  title: { color: colors.ink, fontSize: 26, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 340 },
  fields: { gap: 15, marginTop: 28, marginBottom: 16 },
  error: { color: colors.red, fontSize: 13, marginBottom: 12 },
});
