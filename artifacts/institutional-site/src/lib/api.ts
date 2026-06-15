const API_URL = import.meta.env.VITE_API_URL ?? "";

export function apiUrl(path: string): string {
  if (!API_URL) return path;
  return `${API_URL.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
