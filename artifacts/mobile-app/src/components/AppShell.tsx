import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, shadow } from "../theme";
import { Brand } from "./ui";

export type TabItem<T extends string> = { key: T; label: string; icon: LucideIcon };

export function AppHeader({ greeting, detail }: { greeting: string; detail: string }) {
  return (
    <View style={styles.header}>
      <Brand inverse />
      <View style={styles.headerText}>
        <Text numberOfLines={1} style={styles.greeting}>{greeting}</Text>
        <Text numberOfLines={1} style={styles.detail}>{detail}</Text>
      </View>
    </View>
  );
}

export function BottomTabs<T extends string>({ items, current, onChange }: { items: TabItem<T>[]; current: T; onChange(value: T): void }) {
  return (
    <View style={styles.tabs}>
      {items.map(item => {
        const selected = item.key === current;
        const Icon = item.icon;
        return (
          <Pressable key={item.key} onPress={() => onChange(item.key)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected }}>
            <Icon size={21} color={selected ? colors.blue : colors.muted} strokeWidth={selected ? 2.6 : 2} />
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Shell({ header, children, tabs }: { header: ReactNode; children: ReactNode; tabs: ReactNode }) {
  return <View style={styles.shell}>{header}<View style={styles.body}>{children}</View>{tabs}</View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.canvas },
  header: { minHeight: 92, paddingTop: 18, paddingBottom: 15, paddingHorizontal: 20, backgroundColor: colors.navy, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18 },
  headerText: { flex: 1, alignItems: "flex-end" },
  greeting: { color: colors.white, fontSize: 15, fontWeight: "800", maxWidth: 170 },
  detail: { color: "#9eb0c4", fontSize: 11, marginTop: 3, maxWidth: 180 },
  body: { flex: 1 },
  tabs: { position: "absolute", left: 12, right: 12, bottom: 12, height: 72, borderRadius: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "stretch", ...shadow },
  tab: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 5 },
  tabLabel: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  tabLabelSelected: { color: colors.blue },
});
