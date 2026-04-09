/**
 * offlineIdentity.ts
 *
 * Generates and verifies offline identity packages for uni.id.
 *
 * Package format:
 *   v1 — signed JSON (Ed25519) with SHA-256 integrity check
 *   Data fields selected by the user are included in the payload.
 *   The package is base64url-encoded for QR / file sharing.
 *
 * Security model:
 *   - Integrity: SHA-256 hash of the payload JSON
 *   - Authenticity: Ed25519 signature over (hash + ts + uid + ctx)
 *   - Selective disclosure: only selected fields are included
 *   - The public key is embedded so any verifier can check the signature
 */

import * as Crypto from "expo-crypto";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { secureGet } from "@/context/SecureStorage";

// Wire sha512 for @noble/ed25519 in React Native
ed.etc.sha512Sync = sha512 as typeof ed.etc.sha512Sync;

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

export interface OfflinePackage {
  v: "1";
  type: "uniid-offline";
  ctx: OfflineContext;
  ts: number;
  uid: string;
  name: string;
  pub: string;
  payload: string;
  hash: string;
  sig: string;
}

export type VerificationStatus = "valid" | "unverified" | "invalid";

export interface OfflineVerificationResult {
  status: VerificationStatus;
  signatureOk: boolean;
  hashOk: boolean;
  data: OfflinePackageData | null;
  package: OfflinePackage | null;
  error?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PRIV_KEY_STORAGE = "uni_signing_priv_v1";
const PUB_KEY_STORAGE = "uni_signing_pub_v1";

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
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

function base64urlEncode(str: string): string {
  if (typeof btoa !== "undefined") {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  return Buffer.from(str, "utf-8").toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(encoded: string): string {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  if (typeof atob !== "undefined") {
    return decodeURIComponent(escape(atob(padded)));
  }
  return Buffer.from(padded, "base64").toString("utf-8");
}

// ── Core: Generate Package ─────────────────────────────────────────────────

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
}): Promise<{ encoded: string; pkg: OfflinePackage }> {
  const { uid, name, selection, context, allDocuments, bio, globalId } = params;

  const privHex = await secureGet(PRIV_KEY_STORAGE);
  const pubHex = await secureGet(PUB_KEY_STORAGE);

  if (!privHex || !pubHex) {
    throw new Error("No hay claves de firma disponibles. Inicializá la identidad primero.");
  }

  const ts = Date.now();

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

  const payloadJson = JSON.stringify(data);
  const payloadB64 = base64urlEncode(payloadJson);

  const hashHex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    payloadJson,
    { encoding: Crypto.CryptoEncoding.HEX }
  );

  const canonical = JSON.stringify({ ctx: context, hash: hashHex, ts, uid });
  const sigBytes = await ed.signAsync(
    new TextEncoder().encode(canonical),
    hexToBytes(privHex)
  );
  const sigHex = bytesToHex(sigBytes);

  const pkg: OfflinePackage = {
    v: "1",
    type: "uniid-offline",
    ctx: context,
    ts,
    uid,
    name,
    pub: pubHex,
    payload: payloadB64,
    hash: hashHex,
    sig: sigHex,
  };

  const encoded = base64urlEncode(JSON.stringify(pkg));
  return { encoded, pkg };
}

// ── Core: Verify Package ───────────────────────────────────────────────────

export async function verifyOfflinePackage(
  encoded: string
): Promise<OfflineVerificationResult> {
  let pkg: OfflinePackage;
  try {
    const raw = base64urlDecode(encoded);
    pkg = JSON.parse(raw);
  } catch {
    return { status: "invalid", signatureOk: false, hashOk: false, data: null, package: null, error: "Paquete inválido o corrupto" };
  }

  if (!pkg?.v || pkg.type !== "uniid-offline" || !pkg.payload || !pkg.hash || !pkg.sig || !pkg.pub) {
    return { status: "invalid", signatureOk: false, hashOk: false, data: null, package: null, error: "Formato de paquete desconocido" };
  }

  let data: OfflinePackageData | null = null;
  let hashOk = false;
  let signatureOk = false;

  try {
    const payloadJson = base64urlDecode(pkg.payload);
    data = JSON.parse(payloadJson);

    const computedHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      payloadJson,
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    hashOk = computedHash === pkg.hash;
  } catch {
    return { status: "invalid", signatureOk: false, hashOk: false, data: null, package: pkg, error: "Error al decodificar payload" };
  }

  try {
    const canonical = JSON.stringify({ ctx: pkg.ctx, hash: pkg.hash, ts: pkg.ts, uid: pkg.uid });
    signatureOk = await ed.verifyAsync(
      hexToBytes(pkg.sig),
      new TextEncoder().encode(canonical),
      hexToBytes(pkg.pub)
    );
  } catch {
    signatureOk = false;
  }

  const status: VerificationStatus = signatureOk && hashOk ? "valid" : hashOk ? "unverified" : "invalid";

  return { status, signatureOk, hashOk, data, package: pkg };
}

// ── Encode / Decode helpers (for file export) ──────────────────────────────

export function encodePackage(pkg: OfflinePackage): string {
  return base64urlEncode(JSON.stringify(pkg));
}

export function decodePackage(encoded: string): OfflinePackage | null {
  try {
    return JSON.parse(base64urlDecode(encoded)) as OfflinePackage;
  } catch {
    return null;
  }
}

// ── Format timestamp ───────────────────────────────────────────────────────

export function formatPackageTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
