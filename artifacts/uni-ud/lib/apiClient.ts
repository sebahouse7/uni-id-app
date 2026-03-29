import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE_URL = (() => {
  if (typeof process.env["EXPO_PUBLIC_API_URL"] === "string" && process.env["EXPO_PUBLIC_API_URL"].length > 0) {
    return process.env["EXPO_PUBLIC_API_URL"];
  }
  if (Platform.OS === "web" && typeof __DEV__ !== "undefined" && !__DEV__) {
    return "/api";
  }
  return `https://${process.env["EXPO_PUBLIC_DOMAIN"]}:8080/api`;
})();

const KEYS = {
  ACCESS: "uni_access_token",
  REFRESH: "uni_refresh_token",
  USER_ID: "uni_user_id",
};

// ─── Web localStorage helpers ─────────────────────────────────────────────────
const webStore = {
  get(key: string): string | null {
    try { return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null; }
    catch { return null; }
  },
  set(key: string, value: string): void {
    try { if (typeof localStorage !== "undefined") localStorage.setItem(key, value); }
    catch {}
  },
  delete(key: string): void {
    try { if (typeof localStorage !== "undefined") localStorage.removeItem(key); }
    catch {}
  },
};

// ─── Token storage (platform-aware) ──────────────────────────────────────────
async function storeTokens(access: string, refresh: string): Promise<void> {
  if (Platform.OS === "web") {
    webStore.set(KEYS.ACCESS, access);
    webStore.set(KEYS.REFRESH, refresh);
    return;
  }
  await SecureStore.setItemAsync(KEYS.ACCESS, access);
  await SecureStore.setItemAsync(KEYS.REFRESH, refresh);
}

async function getAccessToken(): Promise<string | null> {
  if (Platform.OS === "web") return webStore.get(KEYS.ACCESS);
  return SecureStore.getItemAsync(KEYS.ACCESS).catch(() => null);
}

async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === "web") return webStore.get(KEYS.REFRESH);
  return SecureStore.getItemAsync(KEYS.REFRESH).catch(() => null);
}

export async function clearTokens(): Promise<void> {
  if (Platform.OS === "web") {
    webStore.delete(KEYS.ACCESS);
    webStore.delete(KEYS.REFRESH);
    webStore.delete(KEYS.USER_ID);
    return;
  }
  await SecureStore.deleteItemAsync(KEYS.ACCESS).catch(() => {});
  await SecureStore.deleteItemAsync(KEYS.REFRESH).catch(() => {});
  await SecureStore.deleteItemAsync(KEYS.USER_ID).catch(() => {});
}

// ─── Token refresh ────────────────────────────────────────────────────────────
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) { await clearTokens(); return null; }
    const { accessToken, refreshToken: newRefresh } = await res.json();
    await storeTokens(accessToken, newRefresh);
    return accessToken;
  } catch {
    return null;
  }
}

// ─── Authenticated fetch ──────────────────────────────────────────────────────
async function authFetch(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<Response> {
  let token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    token = await refreshAccessToken();
    if (token) return authFetch(path, options, false);
  }

  return res;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export async function apiRegister(
  deviceId: string,
  name: string,
  bio?: string
): Promise<{ accessToken: string; refreshToken: string; user: any }> {
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, name, bio }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Error al registrar");
  }
  const data = await res.json();
  await storeTokens(data.accessToken, data.refreshToken);
  if (Platform.OS === "web") {
    webStore.set(KEYS.USER_ID, data.user.id);
  } else {
    await SecureStore.setItemAsync(KEYS.USER_ID, data.user.id);
  }
  return data;
}

/**
 * Verifica si la sesión actual es válida contra el backend.
 * No lanza error — devuelve { authenticated: false } si no hay sesión.
 */
export async function apiCheckSession(): Promise<{ authenticated: boolean; user?: any }> {
  const token = await getAccessToken();
  if (!token) return { authenticated: false };
  try {
    const res = await authFetch("/auth/me");
    if (!res.ok) return { authenticated: false };
    const user = await res.json();
    return { authenticated: true, user };
  } catch {
    return { authenticated: false };
  }
}

export async function apiGetProfile(): Promise<any> {
  const res = await authFetch("/auth/me");
  if (!res.ok) throw new Error("No se pudo obtener el perfil");
  return res.json();
}

export async function apiUpdateProfile(updates: { name?: string; bio?: string }): Promise<any> {
  const res = await authFetch("/auth/me", {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("No se pudo actualizar el perfil");
  return res.json();
}

export async function apiLogout(): Promise<void> {
  await authFetch("/auth/logout", { method: "POST" }).catch(() => {});
  await clearTokens();
}

// ─── Documentos ───────────────────────────────────────────────────────────────
export async function apiGetDocuments(): Promise<any[]> {
  const res = await authFetch("/documents");
  if (!res.ok) throw new Error("Error al cargar documentos");
  return res.json();
}

export async function apiCreateDocument(doc: {
  title: string;
  category: string;
  description?: string;
  fileUri?: string;
  fileName?: string;
  tags?: string[];
}): Promise<any> {
  const res = await authFetch("/documents", {
    method: "POST",
    body: JSON.stringify(doc),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Error al crear documento");
  }
  return res.json();
}

export async function apiUpdateDocument(id: string, updates: Partial<{
  title: string;
  category: string;
  description: string;
  fileUri: string;
  fileName: string;
  tags: string[];
}>): Promise<any> {
  const res = await authFetch(`/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Error al actualizar documento");
  return res.json();
}

export async function apiDeleteDocument(id: string): Promise<void> {
  const res = await authFetch(`/documents/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Error al eliminar documento");
}

// ─── Suscripciones ────────────────────────────────────────────────────────────
export async function apiCreateMercadoPagoCheckout(planId: string, backUrl: string): Promise<any> {
  const res = await authFetch("/subscriptions/mercadopago/create", {
    method: "POST",
    body: JSON.stringify({ planId, backUrl }),
  });
  if (!res.ok) throw new Error("Error al crear pago");
  return res.json();
}

export async function apiCreateStripeCheckout(planId: string): Promise<any> {
  const res = await authFetch("/subscriptions/stripe/create", {
    method: "POST",
    body: JSON.stringify({ planId }),
  });
  if (!res.ok) throw new Error("Error al crear pago");
  return res.json();
}

export async function apiGetSubscriptionStatus(): Promise<any> {
  const res = await authFetch("/subscriptions/my");
  if (!res.ok) return null;
  return res.json();
}

export async function isLoggedIn(): Promise<boolean> {
  const token = await getAccessToken();
  return !!token;
}

// ─── Share / Identidad compartida ─────────────────────────────────────────────
export async function apiShareCreate(opts: {
  documentIds: string[];
  label?: string;
  expiresInMinutes: number;
}): Promise<{ token: string; url: string; expiresAt: string }> {
  const res = await authFetch("/share/create", {
    method: "POST",
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Error al crear enlace");
  }
  return res.json();
}

export async function apiShareHistory(): Promise<any[]> {
  const res = await authFetch("/share/history");
  if (!res.ok) return [];
  return res.json();
}

export async function apiShareRevoke(token: string): Promise<void> {
  await authFetch(`/share/${token}`, { method: "DELETE" });
}

export async function apiShareView(token: string): Promise<{
  label: string | null;
  owner: { name: string };
  documents: any[];
  expiresAt: string;
  accessCount: number;
}> {
  const base = process.env["EXPO_PUBLIC_API_URL"] ?? "/api";
  const res = await fetch(`${base}/share/${token}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Enlace inválido o expirado");
  }
  return res.json();
}
