import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react-native";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, shadow } from "../theme";

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const content = <View style={styles.screenContent}>{children}</View>;
  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <View style={styles.brand}>
      <View style={[styles.brandMark, inverse && styles.brandMarkInverse]}>
        <Text style={[styles.brandLetter, inverse && styles.brandLetterInverse]}>F</Text>
      </View>
      <Text style={[styles.brandText, inverse && styles.brandTextInverse]}>Fretai</Text>
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput {...props} placeholderTextColor="#91a0b2" style={[styles.field, props.style]} />
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  icon: Icon,
}: {
  label: string;
  onPress(): void;
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, (disabled || loading) && styles.disabled]}
    >
      {loading ? <ActivityIndicator color={colors.white} /> : (
        <>
          {Icon ? <Icon size={19} color={colors.white} strokeWidth={2.2} /> : null}
          <Text style={styles.primaryButtonText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function SectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleWrap}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

export function Metric({ icon: Icon, label, value, tone = "blue" }: { icon: LucideIcon; label: string; value: string; tone?: "blue" | "green" | "amber" }) {
  const toneStyle = tone === "green" ? styles.green : tone === "amber" ? styles.amber : styles.blue;
  return (
    <View style={styles.metric}>
      <View style={[styles.metricIcon, toneStyle]}><Icon size={19} color={colors.ink} /></View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Icon size={25} color={colors.blue} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Badge({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "gray" | "blue" }) {
  const box = tone === "gray" ? styles.badgeGray : tone === "blue" ? styles.badgeBlue : styles.badgeGreen;
  const text = tone === "gray" ? styles.badgeTextGray : tone === "blue" ? styles.badgeTextBlue : styles.badgeTextGreen;
  return <View style={[styles.badge, box]}><Text style={[styles.badgeText, text]}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flexGrow: 1 },
  screenContent: { flex: 1, paddingHorizontal: 20, paddingBottom: 112 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" },
  brandMarkInverse: { backgroundColor: colors.white },
  brandLetter: { color: colors.white, fontSize: 23, fontWeight: "900" },
  brandLetterInverse: { color: colors.navy },
  brandText: { color: colors.navy, fontSize: 28, fontWeight: "800" },
  brandTextInverse: { color: colors.white },
  fieldWrap: { gap: 7 },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  field: { height: 52, borderRadius: 7, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: 15, color: colors.ink, fontSize: 16 },
  primaryButton: { height: 52, borderRadius: 7, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.5 },
  sectionHeader: { marginTop: 26, marginBottom: 15, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 16 },
  sectionTitleWrap: { flex: 1 },
  eyebrow: { color: colors.blue, fontSize: 12, lineHeight: 17, fontWeight: "800", textTransform: "uppercase" },
  sectionTitle: { color: colors.ink, fontSize: 23, lineHeight: 29, fontWeight: "800" },
  metric: { flex: 1, minWidth: 136, backgroundColor: colors.white, borderRadius: 8, padding: 16, borderWidth: 1, borderColor: colors.line, ...shadow },
  metricIcon: { width: 34, height: 34, borderRadius: 7, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  blue: { backgroundColor: colors.blueSoft },
  green: { backgroundColor: colors.greenSoft },
  amber: { backgroundColor: colors.amberSoft },
  metricValue: { color: colors.ink, fontSize: 27, fontWeight: "800" },
  metricLabel: { color: colors.muted, fontSize: 13, marginTop: 4 },
  empty: { minHeight: 210, padding: 26, borderRadius: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, justifyContent: "center", alignItems: "center" },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", textAlign: "center" },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 310, marginTop: 6 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  badgeGreen: { backgroundColor: colors.greenSoft },
  badgeGray: { backgroundColor: "#eef2f6" },
  badgeBlue: { backgroundColor: colors.blueSoft },
  badgeText: { fontSize: 11, fontWeight: "800" },
  badgeTextGreen: { color: colors.green },
  badgeTextGray: { color: colors.muted },
  badgeTextBlue: { color: colors.blue },
});
