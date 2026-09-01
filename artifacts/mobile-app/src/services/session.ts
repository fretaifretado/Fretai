import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { Session } from "../types";

const SESSION_KEY = "fretai.mobile.session";

export async function readSession(): Promise<Session | null> {
  try {
    const value = Platform.OS === "web"
      ? globalThis.localStorage?.getItem(SESSION_KEY)
      : await SecureStore.getItemAsync(SESSION_KEY);
    return value ? JSON.parse(value) as Session : null;
  } catch {
    return null;
  }
}

export async function writeSession(session: Session): Promise<void> {
  const value = JSON.stringify(session);
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(SESSION_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearSession(): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(SESSION_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
