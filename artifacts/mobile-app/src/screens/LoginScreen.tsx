import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { LogIn, ShieldCheck } from "lucide-react-native";
import { useAuth } from "../auth/AuthContext";
import { Brand, Field, PrimaryButton } from "../components/ui";
import { ApiError } from "../services/api";
import { colors } from "../theme";
import { toMobileRole } from "../types";

export function LoginScreen() {
  const { signIn, signOut } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!identifier.trim() || !password) {
      setError("Informe seu CPF ou e-mail e sua senha.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const session = await signIn(identifier.trim().toLowerCase(), password);
      if (!toMobileRole(session.role)) {
        await signOut();
        setError("Este perfil deve acessar o painel web da Fretai.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.top}>
        <Brand inverse />
        <View style={styles.intro}>
          <Text style={styles.title}>Sua viagem começa aqui.</Text>
          <Text style={styles.subtitle}>Acesse rotas, equipe e operação em tempo real.</Text>
        </View>
        <View style={styles.security}>
          <ShieldCheck size={17} color="#9ecbff" />
          <Text style={styles.securityText}>Acesso protegido pela conta Fretai</Text>
        </View>
      </View>

      <View style={styles.form}>
        <Text style={styles.formTitle}>Entrar</Text>
        <Text style={styles.formSubtitle}>Colaborador: no primeiro acesso, use o CPF nos dois campos.</Text>
        <Field
          label="CPF ou e-mail"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoComplete="username"
          returnKeyType="next"
          placeholder="000.000.000-00 ou e-mail"
        />
        <Field
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          returnKeyType="done"
          onSubmitEditing={submit}
          placeholder="Sua senha"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton label="Entrar" icon={LogIn} onPress={submit} loading={loading} />
        <Text style={styles.support}>Problemas no acesso? Fale com o administrador da sua empresa.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  top: { flex: 1, minHeight: 290, backgroundColor: colors.navy, paddingHorizontal: 26, paddingTop: 62, paddingBottom: 30, justifyContent: "space-between" },
  intro: { gap: 8, marginTop: 40 },
  title: { color: colors.white, fontSize: 31, lineHeight: 37, fontWeight: "800", maxWidth: 330 },
  subtitle: { color: "#b7c7d9", fontSize: 15, lineHeight: 22, maxWidth: 310 },
  security: { flexDirection: "row", alignItems: "center", gap: 8 },
  securityText: { color: "#b7c7d9", fontSize: 12 },
  form: { backgroundColor: colors.canvas, padding: 26, gap: 17 },
  formTitle: { color: colors.ink, fontSize: 25, fontWeight: "800" },
  formSubtitle: { color: colors.muted, fontSize: 14, marginTop: -10, marginBottom: 4 },
  error: { color: colors.red, backgroundColor: colors.redSoft, borderWidth: 1, borderColor: "#ffd1d1", borderRadius: 7, padding: 11, fontSize: 13 },
  support: { color: colors.muted, textAlign: "center", fontSize: 12, lineHeight: 18, paddingHorizontal: 20 },
});
