import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { login as loginRequest } from "../services/api";
import { clearSession, readSession, writeSession } from "../services/session";
import type { Session } from "../types";

type AuthValue = {
  session: Session | null;
  loading: boolean;
  signIn(identifier: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  finishPasswordChange(): Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readSession().then(setSession).finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const next = await loginRequest(identifier, password);
    await writeSession(next);
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  const finishPasswordChange = useCallback(async () => {
    if (!session) return;
    const next = { ...session, forcePasswordChange: false };
    await writeSession(next);
    setSession(next);
  }, [session]);

  const value = useMemo(
    () => ({ session, loading, signIn, signOut, finishPasswordChange }),
    [session, loading, signIn, signOut, finishPasswordChange],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return value;
}
