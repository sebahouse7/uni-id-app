import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const RAILWAY_URL = "https://expressjs-production-8bfc.up.railway.app/api";
const BASE_URL = process.env["EXPO_PUBLIC_API_URL"] || RAILWAY_URL;

const REQUEST_TIMEOUT_MS = 8000;

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

// ─── Retry fetch with timeout + exponential backoff ──────────────────────────
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err?.name === "AbortError"
        ? new Error("Tiempo de espera agotado. Verificá tu conexión.")
        : err;
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 800));
      }
    }
  }
  throw lastError ?? new Error("Sin conexión al servidor");
}

export async function apiCheckHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${BASE_URL}/healthz`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
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

  const res = await fetchWithRetry(`${BASE_URL}${path}`, { ...options, headers });

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

// ─── Share / Compartición segura de identidad ─────────────────────────────────

export async function apiShareCreateQr(opts: {
  permissions?: { name?: boolean; globalId?: boolean; bio?: boolean; networkPlan?: boolean };
  expiresInMinutes?: number;
  label?: string;
}): Promise<{ token: string; qrContent: string; expiresAt: string; expiresInMinutes: number; permissions: any }> {
  const res = await authFetch("/share/create-qr", {
    method: "POST",
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Error al crear QR");
  }
  return res.json();
}

export async function apiShareGetPending(): Promise<any[]> {
  const res = await authFetch("/share/pending");
  if (!res.ok) return [];
  return res.json();
}

export async function apiShareApprove(
  requestId: string,
  opts: { consentConfirmed: boolean }
): Promise<{ ok: boolean; data: any }> {
  const res = await authFetch(`/share/approve/${requestId}`, {
    method: "POST",
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Error al aprobar");
  }
  return res.json();
}

export async function apiShareReject(requestId: string): Promise<void> {
  const res = await authFetch(`/share/reject/${requestId}`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Error al rechazar");
  }
}

export async function apiShareRevokeAccess(requestId: string): Promise<void> {
  const res = await authFetch(`/share/revoke-access/${requestId}`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Error al revocar");
  }
}

export async function apiShareAccessLog(): Promise<any[]> {
  const res = await authFetch("/share/access-log");
  if (!res.ok) return [];
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

// ─── Sesiones activas ──────────────────────────────────────────────────────────
export async function apiGetSessions(): Promise<any[]> {
  const res = await authFetch("/sessions");
  if (!res.ok) return [];
  const data = await res.json();
  return data.sessions ?? [];
}

export async function apiRevokeSession(sessionId: string): Promise<void> {
  await authFetch(`/sessions/${sessionId}`, { method: "DELETE" });
}

export async function apiRevokeAllSessions(): Promise<void> {
  await authFetch("/sessions", { method: "DELETE" });
  await clearTokens();
}

// ─── Logs de auditoría ─────────────────────────────────────────────────────────
export async function apiGetAuditLogs(limit = 30): Promise<any[]> {
  const res = await authFetch(`/auth/audit-logs?limit=${limit}`);
  if (!res.ok) return [];
  return res.json();
}

// ─── Business ─────────────────────────────────────────────────────────────────
export async function apiGetBusinesses(): Promise<any[]> {
  const res = await authFetch("/businesses");
  if (!res.ok) return [];
  return res.json();
}

export async function apiCreateBusiness(data: {
  name: string; legalName?: string; taxId?: string; businessType?: string;
  industry?: string; foundedDate?: string; address?: string; city?: string;
  country?: string; website?: string; email?: string; phone?: string; description?: string;
}): Promise<any> {
  const res = await authFetch("/businesses", { method: "POST", body: JSON.stringify(data) });
  if (!res.ok) throw new Error("Error al crear empresa");
  return res.json();
}

export async function apiUpdateBusiness(id: string, data: Partial<{
  name: string; legalName: string; taxId: string; businessType: string;
  industry: string; foundedDate: string; address: string; city: string;
  country: string; website: string; email: string; phone: string; description: string;
}>): Promise<any> {
  const res = await authFetch(`/businesses/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  if (!res.ok) throw new Error("Error al actualizar empresa");
  return res.json();
}

export async function apiDeleteBusiness(id: string): Promise<void> {
  await authFetch(`/businesses/${id}`, { method: "DELETE" });
}

export async function apiGetBusinessDocuments(businessId: string): Promise<any[]> {
  const res = await authFetch(`/businesses/${businessId}/documents`);
  if (!res.ok) return [];
  return res.json();
}

export async function apiAddBusinessDocument(businessId: string, data: {
  title: string; description?: string; docType?: string; fileUri?: string; fileName?: string;
}): Promise<any> {
  const res = await authFetch(`/businesses/${businessId}/documents`, { method: "POST", body: JSON.stringify(data) });
  if (!res.ok) throw new Error("Error al agregar documento");
  return res.json();
}

export async function apiDeleteBusinessDocument(businessId: string, docId: string): Promise<void> {
  await authFetch(`/businesses/${businessId}/documents/${docId}`, { method: "DELETE" });
}

// ─── Firmas Digitales (Ed25519 asimétrico) ────────────────────────────────────

/**
 * Registra la clave pública Ed25519 del dispositivo en el backend.
 * Idempotente — se puede llamar múltiples veces (solo actualiza si cambia).
 */
export async function apiRegisterSigningKey(publicKeyHex: string): Promise<{ ok: boolean }> {
  const res = await authFetch("/auth/me/signing-key", {
    method: "POST",
    body: JSON.stringify({ publicKey: publicKeyHex }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Error al registrar clave de firma");
  }
  return res.json();
}

/**
 * Obtiene la clave pública Ed25519 registrada del usuario actual.
 * Retorna null si no hay clave registrada.
 */
export async function apiGetMySigningKey(): Promise<{ publicKey: string | null; fingerprint: string | null }> {
  const res = await authFetch("/auth/me/signing-key");
  if (!res.ok) return { publicKey: null, fingerprint: null };
  return res.json();
}

/**
 * Obtiene la clave pública de un usuario por su ID (endpoint público).
 */
export async function apiGetUserPublicKey(userId: string): Promise<{ publicKey: string | null; fingerprint: string | null }> {
  const res = await fetch(`${BASE_URL}/users/${userId}/public-key`);
  if (!res.ok) return { publicKey: null, fingerprint: null };
  return res.json();
}

/**
 * Firma un documento de forma asimétrica (Ed25519).
 * La firma se genera en el dispositivo y se envía al backend junto con el hash.
 * Si no se tiene clave asimétrica, usa el fallback HMAC del backend.
 */
export async function apiSignDocument(params: {
  documentId: string;
  /** Firma Ed25519 generada en el dispositivo (hex de 128 chars). Si null → fallback a HMAC */
  signature?: string;
  /** Hash canónico del payload que fue firmado. */
  canonicalPayload?: string;
  deviceId?: string;
  consented?: boolean;
}): Promise<any> {
  const res = await authFetch("/signatures/sign", {
    method: "POST",
    body: JSON.stringify({
      documentId: params.documentId,
      signature: params.signature,
      canonicalPayload: params.canonicalPayload,
      deviceId: params.deviceId,
      consented: params.consented ?? true,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Error al firmar documento");
  }
  return res.json();
}

/**
 * Verifica una firma digitalmente contra el backend.
 */
export async function apiVerifySignature(params: {
  documentHash: string;
  signature?: string;
  userId?: string;
}): Promise<{ verified: boolean; reason: string; records: any[] }> {
  const res = await fetch(`${BASE_URL}/signatures/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) return { verified: false, reason: "Error de red", records: [] };
  return res.json();
}

/**
 * Retorna las firmas del usuario autenticado.
 */
export async function apiGetMySignatures(limit = 50): Promise<any[]> {
  const res = await authFetch(`/signatures/mine?limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.signatures ?? [];
}
