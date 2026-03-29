import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE_URL = process.env["EXPO_PUBLIC_API_URL"] ??
  `https://${process.env["EXPO_PUBLIC_DOMAIN"]}:8080/api`;

const KEYS = {
  ACCESS: "uni_access_token",
  REFRESH: "uni_refresh_token",
  USER_ID: "uni_user_id",
};

async function storeTokens(access: string, refresh: string): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.setItemAsync(KEYS.ACCESS, access);
  await SecureStore.setItemAsync(KEYS.REFRESH, refresh);
}

async function getAccessToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  return SecureStore.getItemAsync(KEYS.ACCESS);
}

async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  return SecureStore.getItemAsync(KEYS.REFRESH);
}

export async function clearTokens(): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.deleteItemAsync(KEYS.ACCESS);
  await SecureStore.deleteItemAsync(KEYS.REFRESH);
  await SecureStore.deleteItemAsync(KEYS.USER_ID);
}

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
  if (Platform.OS !== "web") {
    await SecureStore.setItemAsync(KEYS.USER_ID, data.user.id);
  }
  return data;
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
