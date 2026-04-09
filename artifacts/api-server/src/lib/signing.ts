/**
 * Digital Signature Module — uni.id
 *
 * Supports two signature types:
 *
 *   "hmac"      — HMAC-SHA256 with system key (legacy, server-side only)
 *   "ed25519"   — Ed25519 asymmetric signature (client-side, externally verifiable)
 *
 * Ed25519 architecture:
 *   Private key lives only on user's device (SecureStore)
 *   Public key is registered once in uni_users.signing_public_key
 *   Anyone can verify a signature using only the public key — no backend dependency
 *
 * Backward compatibility:
 *   All existing HMAC records remain valid and verifiable.
 *   signature_type column discriminates between the two schemes.
 */
import { createHmac, createHash, createPublicKey, verify as nodeVerify } from "crypto";
import { query, queryOne } from "./db";

// ─── HMAC-SHA256 (legacy) ─────────────────────────────────────────────────────
const SIGNING_DOMAIN = "uniid::document::sign::v1";

function getHmacKey(): Buffer {
  const master = process.env["ENCRYPTION_MASTER_KEY"];
  if (!master || master.length < 64) {
    const fallback = process.env["JWT_SECRET"] ?? "uniid_default_fallback_key_change_in_production_2024";
    return createHash("sha256").update(SIGNING_DOMAIN + "::" + fallback).digest();
  }
  return createHash("sha256").update(SIGNING_DOMAIN + "::" + master).digest();
}

export function computeHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function signHash(hash: string): string {
  return createHmac("sha256", getHmacKey()).update(hash).digest("hex");
}

export function verifyHmac(hash: string, signature: string): boolean {
  const expected = signHash(hash);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

// Alias kept for backward compat (routes that were already calling this)
export const verifySignatureHex = verifyHmac;

// ─── Ed25519 asymmetric (new) ─────────────────────────────────────────────────
/**
 * Convert a raw 32-byte Ed25519 public key (hex) to a Node.js KeyObject.
 * Node.js uses SubjectPublicKeyInfo (SPKI DER) format internally.
 * OID for Ed25519: 1.3.101.112
 * SPKI header bytes: 302A300506032B6570032100
 */
function hexToEd25519PublicKey(rawHex: string) {
  const raw = Buffer.from(rawHex, "hex");
  if (raw.length !== 32) throw new Error("Ed25519 public key must be 32 bytes");
  const spkiHeader = Buffer.from("302A300506032B6570032100", "hex");
  const spkiDer = Buffer.concat([spkiHeader, raw]);
  return createPublicKey({ key: spkiDer, format: "der", type: "spki" });
}

/**
 * Verify an Ed25519 signature.
 * @param canonicalPayload  The exact UTF-8 string that was signed on the device.
 * @param signatureHex      128 hex chars (64 bytes) — the Ed25519 signature.
 * @param publicKeyHex      64 hex chars (32 bytes) — the signer's public key.
 */
export function verifyEd25519(
  canonicalPayload: string,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  try {
    if (!publicKeyHex || publicKeyHex.length !== 64) return false;
    if (!signatureHex || signatureHex.length !== 128) return false;
    const pubKey = hexToEd25519PublicKey(publicKeyHex);
    const message = Buffer.from(canonicalPayload, "utf8");
    const signature = Buffer.from(signatureHex, "hex");
    // Ed25519 in Node.js: pass null as hash algorithm (Ed25519 handles it internally)
    return nodeVerify(null, message, pubKey, signature);
  } catch {
    return false;
  }
}

/**
 * Get public key fingerprint (first 8 hex chars uppercased).
 * Matches the frontend `getPublicKeyFingerprint()`.
 */
export function getKeyFingerprint(publicKeyHex: string): string {
  return publicKeyHex.slice(0, 8).toUpperCase();
}

// ─── DB operations ────────────────────────────────────────────────────────────
export interface SignatureRecord {
  id: string;
  document_hash: string;
  signature: string;
  algorithm: string;
  signature_type: string;
  signer_global_id: string | null;
  public_key_snapshot: string | null;
  created_at: string;
  consented: boolean;
  // TSA fields (added progressively — may be null for pre-TSA records)
  tsa_token: string | null;
  tsa_timestamp: string | null;
  tsa_status: string | null;   // 'none' | 'pending' | 'verified' | 'failed'
  tsa_endpoint: string | null;
}

export interface SignDocumentParams {
  userId: string;
  documentId?: string;
  contentHash: string;
  /** Pre-built Ed25519 signature from device (hex). If provided, uses ed25519 type. */
  ed25519Signature?: string;
  /** The canonical payload string that was signed. Required for ed25519. */
  canonicalPayload?: string;
  /** Public key at time of signing — stored as snapshot for audit trail. */
  publicKeySnapshot?: string;
  signerGlobalId?: string;
  ip?: string;
  deviceId?: string;
  metadata?: Record<string, unknown>;
  consented?: boolean;
}

/** Create and persist a signature record. Chooses type based on params. */
export async function signDocument(params: SignDocumentParams): Promise<SignatureRecord> {
  const {
    userId, documentId, contentHash, ed25519Signature, canonicalPayload,
    publicKeySnapshot, signerGlobalId, ip, deviceId, metadata, consented = true,
  } = params;

  let signature: string;
  let algorithm: string;
  let signatureType: string;

  if (ed25519Signature && canonicalPayload) {
    // Asymmetric path: signature was generated on device
    signature = ed25519Signature;
    algorithm = "Ed25519";
    signatureType = "ed25519";
  } else {
    // HMAC path: signature generated server-side (fallback / legacy)
    signature = signHash(contentHash);
    algorithm = "HMAC-SHA256";
    signatureType = "hmac";
  }

  const row = await queryOne<SignatureRecord>(
    `INSERT INTO uni_document_signatures
       (user_id, document_id, document_hash, signature, algorithm, signature_type,
        public_key_snapshot, signer_global_id, ip_address, device_id, consented, metadata,
        tsa_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
     RETURNING id, document_hash, signature, algorithm, signature_type, public_key_snapshot,
               signer_global_id, created_at, consented,
               tsa_token, tsa_timestamp, tsa_status, tsa_endpoint`,
    [
      userId, documentId ?? null, contentHash, signature, algorithm, signatureType,
      publicKeySnapshot ?? null, signerGlobalId ?? null, ip ?? null,
      deviceId ?? null, consented, metadata ? JSON.stringify(metadata) : null,
    ]
  );

  return row!;
}

const SIG_COLS = `
  id, document_hash, signature, algorithm, signature_type, public_key_snapshot,
  signer_global_id, created_at, consented,
  tsa_token, tsa_timestamp, tsa_status, tsa_endpoint
`;

/** Look up all signatures for a given document hash (all types). */
export async function getSignaturesForHash(documentHash: string): Promise<SignatureRecord[]> {
  return query<SignatureRecord>(
    `SELECT ${SIG_COLS} FROM uni_document_signatures
     WHERE document_hash = $1
     ORDER BY created_at DESC`,
    [documentHash]
  );
}

/** Look up all signatures created by a user. */
export async function getUserSignatures(userId: string, limit = 50): Promise<SignatureRecord[]> {
  return query<SignatureRecord>(
    `SELECT ${SIG_COLS} FROM uni_document_signatures
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
}

/** Store or update a user's Ed25519 public key. */
export async function storeUserPublicKey(userId: string, publicKeyHex: string): Promise<void> {
  if (publicKeyHex.length !== 64) throw new Error("Clave pública debe ser 32 bytes (64 hex chars)");
  await query(
    `UPDATE uni_users SET signing_public_key = $1 WHERE id = $2`,
    [publicKeyHex, userId]
  );
}

/** Get a user's stored Ed25519 public key. */
export async function getUserPublicKey(userId: string): Promise<string | null> {
  const row = await queryOne<{ signing_public_key: string | null }>(
    `SELECT signing_public_key FROM uni_users WHERE id = $1`,
    [userId]
  );
  return row?.signing_public_key ?? null;
}
