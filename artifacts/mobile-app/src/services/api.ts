import Constants from "expo-constants";
import type { CollaboratorHome, Driver, MobileIdentity, Session, Vehicle } from "../types";

const configuredUrl =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  "https://fretaiserver.onrender.com";

export const API_URL = configuredUrl.replace(/\/$/, "");

type ApiErrorBody = { error?: string; message?: string };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(body.error ?? body.message ?? `Erro HTTP ${response.status}`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function login(identifier: string, password: string): Promise<Session> {
  return apiRequest<Session>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

export async function changePassword(token: string, currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  }, token);
}

export function getMobileIdentity(token: string) {
  return apiRequest<MobileIdentity>("/api/mobile/me", {}, token);
}

export function getCollaboratorHome(token: string) {
  return apiRequest<CollaboratorHome>("/api/mobile/collaborator/home", {}, token);
}

export function getPartnerVehicles(token: string, partnerId: number) {
  return apiRequest<Vehicle[]>(`/api/partners/${partnerId}/vehicles`, {}, token);
}

export function getPartnerDrivers(token: string, partnerId: number) {
  return apiRequest<Driver[]>(`/api/partners/${partnerId}/drivers`, {}, token);
}
