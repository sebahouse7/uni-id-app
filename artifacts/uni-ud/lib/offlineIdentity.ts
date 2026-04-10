/**
 * offlineIdentity.ts — Security v2
 *
 * Arquitectura de seguridad (nivel producción):
 *
 *   GENERACIÓN:
 *     1. JSON con campos seleccionados (selective disclosure)
 *     2. Random nonce (16 bytes) — protección anti-replay
 *     3. Random session key (32 bytes) + IV (12 bytes)
 *     4. AES-256-GCM cifra el JSON → ciphertext
 *     5. SHA-256(ciphertext) → hash
 *     6. Ed25519 firma canonical(ctx, hash, nonce, ts, uid) → sig
 *
 *   QR (compacto):
 *     { v, uid, name, pub, ts, nonce, ctx, hash, sig }
 *     No contiene datos cifrados — solo prueba de identidad
 *
 *   Archivo .uniid (completo):
 *     Extiende QR + { sessionKey, iv, cipher }
 *     El receptor descifra con sessionKey → verifica firma
 *
 *   VERIFICACIÓN:
 *     - TTL: rechaza paquetes con ts > 5 minutos
 *     - Anti-replay: rechaza nonces ya vistos (cache in-memory, TTL 6 min)
 *     - Hash: verifica SHA-256(cipher) === hash
 *     - Firma: verifica Ed25519 sobre canonical
 *     - Trust level: HIGH / MEDIUM / NONE
 *
 *   CLAVES:
 *     - Privada Ed25519: en SecureStore (nunca AsyncStorage, nunca texto plano)
 *     - Session key AES: efímera, generada por paquete, incluida en .uniid
 */

// @ts-expect-error — @noble/ciphers uses .ts extensions in d.ts imports; works at runtime
import { gcm } from "@noble/ciphers/aes";
import * as Crypto from "expo-crypto";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { secureGet } from "@/context/SecureStorage";

// Wire sha512 for @noble/ed25519 in React Native
ed.etc.sha512Sync = sha512 as typeof ed.etc.sha512Sync;

// ── TTL ────────────────────────────────────────────────────────────────────

export const PACKAGE_TTL_MS = 5 * 60 * 1000;   // 5 minutos
const NONCE_CACHE_TTL_MS   = 6 * 60 * 1000;   // 6 minutos (buffer extra)
const MAX_QR_BYTES         = 1400;             // Límite seguro para QR ECC-M

// ── Anti-replay nonce cache (in-memory, process lifetime) ─────────────────

const _nonceCache = new Map<string, number>(); // nonce -> expiresAt ms

function _cleanNonceCache(): void {
  const now = Date.now();
  for (const [k, exp] of _nonceCache) {
    if (now > exp) _nonceCache.delete(k);
  }
}

function isNonceUsed(nonce: string): boolean {
  _cleanNonceCache();
  return _nonceCache.has(nonce);
}

function markNonceUsed(nonce: string): void {
  _nonceCache.set(nonce, Date.now() + NONCE_CACHE_TTL_MS);
}

// ── Storage keys (SecureStore only) ───────────────────────────────────────

const PRIV_KEY_STORAGE = "uni_signing_priv_v1";
const PUB_KEY_STORAGE  = "uni_signing_pub_v1";

// ── Types ──────────────────────────────────────────────────────────────────

export type OfflineContext = "work" | "rent" | "sale" | "health" | "quick";

export interface OfflineDataSelection {
  name: boolean;
  globalId: boolean;
  bio: boolean;
  documentIds: string[];
}

export interface OfflinePackageData {
  name?: string;
  globalId?: string;
  bio?: string;
  documents?: Array<{
    id: string;
    title: string;
    category: string;
    description?: string;
    createdAt: string;
  }>;
}

/** Header común a ambos formatos (QR y archivo) */
export interface PackageHeader {
  v: "2";
  type: "uniid-offline";
  ctx: OfflineContext;
  ts: number;      // Unix ms
  nonce: string;   // 32 hex chars (16 bytes)
  uid: string;
  name: string;
  pub: string;     // Ed25519 public key hex
  hash: string;    // SHA-256(ciphertext) hex
  sig: string;     // Ed25519 sig hex over canonical
}

/** Formato compacto — va en el QR (sin datos cifrados) */
export type CompactPackage = PackageHeader;

/** Formato completo — va en el archivo .uniid */
export interface OfflinePackage extends PackageHeader {
  sessionKey: string; // AES-256 key hex (32 bytes)
  iv: string;         // AES-GCM IV hex (12 bytes)
  cipher: string;     // base64 AES-256-GCM ciphertext
}

export type VerificationStatus = "valid" | "unverified" | "invalid";
export type TrustLevel = "high" | "medium" | "none";

export interface OfflineVerificationResult {
  status: VerificationStatus;
  trust: TrustLevel;
  signatureOk: boolean;
  hashOk: boolean;
  notExpired: boolean;
  nonceOk: boolean;
  data: OfflinePackageData | null;
  pkg: OfflinePackage | null;
  error?: string;
}

/** Resultado de generateOfflinePackage */
export interface GeneratedOfflinePackage {
  /** Base64url del CompactPackage — para QR */
  qrEncoded: string;
  /** Base64url del OfflinePackage — para archivo .uniid */
  fullEncoded: string;
  /** Objetos raw para inspección en UI */
  compact: CompactPackage;
  full: OfflinePackage;
}

// ── Metadata de contexto ───────────────────────────────────────────────────

export const CONTEXT_LABELS: Record<OfflineContext, string> = {
  work:   "Trabajo",
  rent:   "Alquiler",
  sale:   "Compra / Venta",
  health: "Salud",
  quick:  "Validación rápida",
};

export const CONTEXT_ICONS: Record<OfflineContext, string> = {
  work:   "briefcase",
  rent:   "home",
  sale:   "tag",
  health: "activity",
  quick:  "zap",
};

export const CONTEXT_COLORS: Record<OfflineContext, string> = {
  work:   "#1A6FE8",
  rent:   "#7C3AED",
  sale:   "#F59E0B",
  health: "#10B981",
  quick:  "#00D4FF",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  const bin = Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
  if (typeof btoa !== "undefined") return btoa(bin);
  return Buffer.from(bytes).toString("base64");
}

function b64ToBytes(b64: string): Uint8Array {
  if (typeof atob !== "undefined") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function b64urlEncode(str: string): string {
  let b64: string;
  if (typeof btoa !== "undefined") {
    b64 = btoa(unescape(encodeURIComponent(str)));
  } else {
    b64 = Buffer.from(str, "utf-8").toString("base64");
  }
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(encoded: string): string {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  if (typeof atob !== "undefined") {
    return decodeURIComponent(escape(atob(padded)));
  }
  return Buffer.from(padded, "base64").toString("utf-8");
}

function canonicalString(p: {
  ctx: string; hash: string; nonce: string; ts: number; uid: string;
}): string {
  // Orden alfabético para determinismo
  return JSON.stringify({
    ctx: p.ctx, hash: p.hash, nonce: p.nonce, ts: p.ts, uid: p.uid,
  });
}

// ── GENERATE ───────────────────────────────────────────────────────────────

export async function generateOfflinePackage(params: {
  uid: string;
  name: string;
  selection: OfflineDataSelection;
  context: OfflineContext;
  allDocuments: Array<{
    id: string;
    title: string;
    category: string;
    description?: string;
    createdAt: string;
  }>;
  bio?: string;
  globalId?: string;
}): Promise<GeneratedOfflinePackage> {
  const { uid, name, selection, context, allDocuments, bio, globalId } = params;

  // ── 1. Recuperar clave privada Ed25519 (SecureStore únicamente) ──────────
  const privHex = await secureGet(PRIV_KEY_STORAGE);
  const pubHex  = await secureGet(PUB_KEY_STORAGE);
  if (!privHex || !pubHex) {
    throw new Error("No hay claves de firma disponibles. Inicializá la identidad primero.");
  }

  // ── 2. Construir payload de datos ─────────────────────────────────────────
  const data: OfflinePackageData = {};
  if (selection.name) data.name = name;
  if (selection.globalId && globalId) data.globalId = globalId;
  if (selection.bio && bio) data.bio = bio;
  if (selection.documentIds.length > 0) {
    data.documents = allDocuments
      .filter((d) => selection.documentIds.includes(d.id))
      .map(({ id, title, category, description, createdAt }) => ({
        id, title, category, createdAt, ...(description ? { description } : {}),
      }));
  }
  const dataJson = JSON.stringify(data);
  const plaintext = new TextEncoder().encode(dataJson);

  // ── 3. AES-256-GCM: generar session key + IV aleatorios ───────────────────
  const sessionKeyBytes = await Crypto.getRandomBytesAsync(32); // AES-256
  const ivBytes         = await Crypto.getRandomBytesAsync(12); // GCM nonce
  const sessionKeyHex   = bytesToHex(sessionKeyBytes);
  const ivHex           = bytesToHex(ivBytes);

  const cipher     = gcm(sessionKeyBytes, ivBytes);
  const ciphertext = cipher.encrypt(plaintext);           // incluye GCM tag
  const cipherB64  = bytesToB64(ciphertext);

  // ── 4. SHA-256(ciphertext) ────────────────────────────────────────────────
  const hashHex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    cipherB64,                                            // sobre el base64
    { encoding: Crypto.CryptoEncoding.HEX }
  );

  // ── 5. Nonce anti-replay (16 bytes) ───────────────────────────────────────
  const nonceBytes = await Crypto.getRandomBytesAsync(16);
  const nonceHex   = bytesToHex(nonceBytes);
  const ts         = Date.now();

  // ── 6. Firma Ed25519 sobre canonical ─────────────────────────────────────
  const canonical  = canonicalString({ ctx: context, hash: hashHex, nonce: nonceHex, ts, uid });
  const sigBytes   = await ed.signAsync(new TextEncoder().encode(canonical), hexToBytes(privHex));
  const sigHex     = bytesToHex(sigBytes);

  // ── 7. Ensamblar formatos ─────────────────────────────────────────────────
  const header: PackageHeader = {
    v: "2", type: "uniid-offline",
    ctx: context, ts, nonce: nonceHex, uid, name, pub: pubHex, hash: hashHex, sig: sigHex,
  };

  const compact: CompactPackage = { ...header };

  const full: OfflinePackage = {
    ...header,
    sessionKey: sessionKeyHex,
    iv: ivHex,
    cipher: cipherB64,
  };

  const qrEncoded   = b64urlEncode(JSON.stringify(compact));
  const fullEncoded = b64urlEncode(JSON.stringify(full));

  // ── 8. Verificar que el QR compacto cabe en el límite ────────────────────
  const qrContent = `uniid://offline?p=${qrEncoded}`;
  if (qrContent.length > MAX_QR_BYTES * 4) {
    // Si aún así excede (nombre muy largo), truncamos el nombre en el compact
    const compactTrimmed: CompactPackage = { ...compact, name: compact.name.slice(0, 20) };
    const qrEncodedTrimmed = b64urlEncode(JSON.stringify(compactTrimmed));
    return {
      qrEncoded: qrEncodedTrimmed,
      fullEncoded,
      compact: compactTrimmed,
      full,
    };
  }

  return { qrEncoded, fullEncoded, compact, full };
}

// ── VERIFY (paquete completo .uniid) ──────────────────────────────────────

export async function verifyOfflinePackage(
  encoded: string
): Promise<OfflineVerificationResult> {
  let pkg: OfflinePackage;
  try {
    const raw = b64urlDecode(encoded);
    pkg = JSON.parse(raw);
  } catch {
    return _invalid("Paquete inválido o corrupto");
  }

  if (!pkg?.v || pkg.type !== "uniid-offline" || !pkg.cipher || !pkg.hash || !pkg.sig || !pkg.pub || !pkg.nonce) {
    return _invalid("Formato de paquete desconocido o versión no soportada");
  }

  // ── TTL check ─────────────────────────────────────────────────────────────
  const notExpired = Date.now() - pkg.ts < PACKAGE_TTL_MS;
  if (!notExpired) {
    return { ..._invalid("El paquete expiró (TTL 5 min)"), notExpired: false };
  }

  // ── Anti-replay ───────────────────────────────────────────────────────────
  const nonceOk = !isNonceUsed(pkg.nonce);
  if (!nonceOk) {
    return { ..._invalid("Nonce ya utilizado (posible replay attack)"), notExpired: true, nonceOk: false };
  }

  // ── Hash check (integridad) ────────────────────────────────────────────────
  let hashOk = false;
  let data: OfflinePackageData | null = null;

  try {
    const computedHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      pkg.cipher,
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    hashOk = computedHash === pkg.hash;
  } catch {
    return { ..._invalid("Error al verificar hash del ciphertext"), notExpired: true, nonceOk: true };
  }

  // ── Descifrado AES-256-GCM ────────────────────────────────────────────────
  if (hashOk && pkg.sessionKey && pkg.iv) {
    try {
      const keyBytes     = hexToBytes(pkg.sessionKey);
      const ivBytes      = hexToBytes(pkg.iv);
      const cipherBytes  = b64ToBytes(pkg.cipher);
      const decipher     = gcm(keyBytes, ivBytes);
      const plainBytes   = decipher.decrypt(cipherBytes);
      const plainJson    = new TextDecoder().decode(plainBytes);
      data = JSON.parse(plainJson);
    } catch {
      hashOk = false; // integridad comprometida
    }
  }

  // ── Firma Ed25519 ─────────────────────────────────────────────────────────
  let signatureOk = false;
  try {
    const canonical = canonicalString({ ctx: pkg.ctx, hash: pkg.hash, nonce: pkg.nonce, ts: pkg.ts, uid: pkg.uid });
    signatureOk = await ed.verifyAsync(
      hexToBytes(pkg.sig),
      new TextEncoder().encode(canonical),
      hexToBytes(pkg.pub)
    );
  } catch {
    signatureOk = false;
  }

  // ── Resultado final ────────────────────────────────────────────────────────
  if (signatureOk && hashOk) {
    markNonceUsed(pkg.nonce);
    return {
      status: "valid",
      trust: "high",
      signatureOk: true,
      hashOk: true,
      notExpired: true,
      nonceOk: true,
      data,
      pkg,
    };
  }

  if (hashOk && !signatureOk) {
    return {
      status: "unverified",
      trust: "medium",
      signatureOk: false,
      hashOk: true,
      notExpired: true,
      nonceOk: true,
      data,
      pkg,
    };
  }

  return {
    status: "invalid",
    trust: "none",
    signatureOk,
    hashOk: false,
    notExpired: true,
    nonceOk: true,
    data: null,
    pkg,
    error: "Hash de ciphertext inválido — datos comprometidos",
  };
}

// ── VERIFY COMPACT (solo cabecera, sin datos) ─────────────────────────────

export async function verifyCompactPackage(
  encoded: string
): Promise<Omit<OfflineVerificationResult, "data"> & { data: null }> {
  let compact: CompactPackage;
  try {
    const raw = b64urlDecode(encoded);
    compact = JSON.parse(raw);
  } catch {
    return { ..._invalid("Paquete QR inválido"), data: null } as any;
  }

  if (!compact?.v || compact.type !== "uniid-offline" || !compact.hash || !compact.sig || !compact.pub || !compact.nonce) {
    return { ..._invalid("Formato QR desconocido"), data: null } as any;
  }

  const notExpired = Date.now() - compact.ts < PACKAGE_TTL_MS;
  if (!notExpired) return { ..._invalid("QR expirado"), notExpired: false, data: null } as any;

  const nonceOk = !isNonceUsed(compact.nonce);

  let signatureOk = false;
  try {
    const canonical = canonicalString({
      ctx: compact.ctx, hash: compact.hash, nonce: compact.nonce, ts: compact.ts, uid: compact.uid,
    });
    signatureOk = await ed.verifyAsync(
      hexToBytes(compact.sig),
      new TextEncoder().encode(canonical),
      hexToBytes(compact.pub)
    );
  } catch {
    signatureOk = false;
  }

  const status: VerificationStatus = signatureOk ? "valid" : "unverified";
  const trust: TrustLevel = signatureOk && nonceOk ? "high" : signatureOk ? "medium" : "none";

  if (signatureOk && nonceOk) markNonceUsed(compact.nonce);

  return {
    status,
    trust,
    signatureOk,
    hashOk: true,
    notExpired: true,
    nonceOk,
    data: null,
    pkg: null,
  };
}

// ── Helpers internos ───────────────────────────────────────────────────────

function _invalid(error: string): OfflineVerificationResult {
  return {
    status: "invalid",
    trust: "none",
    signatureOk: false,
    hashOk: false,
    notExpired: true,
    nonceOk: true,
    data: null,
    pkg: null,
    error,
  };
}

// ── Encode/Decode para uso externo ────────────────────────────────────────

export function encodePackage(pkg: OfflinePackage | CompactPackage): string {
  return b64urlEncode(JSON.stringify(pkg));
}

export function decodePackage(encoded: string): OfflinePackage | null {
  try {
    return JSON.parse(b64urlDecode(encoded)) as OfflinePackage;
  } catch {
    return null;
  }
}

// ── Helpers de UI ─────────────────────────────────────────────────────────

export function formatPackageTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function getTimeUntilExpiry(ts: number): string {
  const remaining = ts + PACKAGE_TTL_MS - Date.now();
  if (remaining <= 0) return "Expirado";
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function qrFitsLimit(qrEncoded: string): boolean {
  return `uniid://offline?p=${qrEncoded}`.length <= MAX_QR_BYTES;
}
