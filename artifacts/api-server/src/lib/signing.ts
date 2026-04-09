/**
 * Digital Signature Module
 *
 * Architecture:
 *   Document → SHA-256 hash → HMAC-SHA256 signed with system signing key
 *   The signing key is derived from ENCRYPTION_MASTER_KEY using a domain separator.
 *
 * This gives each document a verifiable, tamper-evident fingerprint
 * anchored to the server's master key. The signature record can be
 * presented as a legal attestation that the user consented to sharing
 * that exact document at that exact moment.
 */
import { createHmac, createHash } from "crypto";
import { query, queryOne } from "./db";

const SIGNING_DOMAIN = "uniid::document::sign::v1";

function getSigningKey(): Buffer {
  const master = process.env["ENCRYPTION_MASTER_KEY"];
  if (!master || master.length < 64) {
    const fallback = process.env["JWT_SECRET"] ?? "uniid_default_fallback_key_change_in_production_2024";
    return createHash("sha256").update(SIGNING_DOMAIN + "::" + fallback).digest();
  }
  return createHash("sha256")
    .update(SIGNING_DOMAIN + "::" + master)
    .digest();
}

/** Compute SHA-256 hash of arbitrary content (hex string, document metadata, etc.). */
export function computeHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Sign a hash with the system signing key (HMAC-SHA256). Returns hex signature. */
export function signHash(hash: string): string {
  return createHmac("sha256", getSigningKey()).update(hash).digest("hex");
}

/** Verify a hex signature against a hash. Constant-time comparison. */
export function verifySignatureHex(hash: string, signature: string): boolean {
  const expected = signHash(hash);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

export interface SignDocumentParams {
  userId: string;
  documentId?: string;
  /** Content to sign: typically JSON of { document_id, user_global_id, timestamp, ... } */
  contentHash: string;
  signerGlobalId?: string;
  ip?: string;
  deviceId?: string;
  metadata?: Record<string, unknown>;
  consented?: boolean;
}

export interface SignatureRecord {
  id: string;
  document_hash: string;
  signature: string;
  algorithm: string;
  signer_global_id: string | null;
  created_at: string;
  consented: boolean;
}

/** Create and persist a signature record for a document. */
export async function signDocument(params: SignDocumentParams): Promise<SignatureRecord> {
  const { userId, documentId, contentHash, signerGlobalId, ip, deviceId, metadata, consented = true } = params;
  const signature = signHash(contentHash);

  const row = await queryOne<SignatureRecord>(
    `INSERT INTO uni_document_signatures
       (user_id, document_id, document_hash, signature, algorithm, signer_global_id, ip_address, device_id, consented, metadata)
     VALUES ($1, $2, $3, $4, 'HMAC-SHA256', $5, $6, $7, $8, $9)
     RETURNING id, document_hash, signature, algorithm, signer_global_id, created_at, consented`,
    [
      userId,
      documentId ?? null,
      contentHash,
      signature,
      signerGlobalId ?? null,
      ip ?? null,
      deviceId ?? null,
      consented,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );

  return row!;
}

/** Look up all signatures for a given document hash. */
export async function getSignaturesForHash(documentHash: string): Promise<SignatureRecord[]> {
  return query<SignatureRecord>(
    `SELECT id, document_hash, signature, algorithm, signer_global_id, created_at, consented
     FROM uni_document_signatures
     WHERE document_hash = $1
     ORDER BY created_at DESC`,
    [documentHash]
  );
}

/** Look up all signatures created by a user. */
export async function getUserSignatures(userId: string, limit = 50): Promise<SignatureRecord[]> {
  return query<SignatureRecord>(
    `SELECT id, document_hash, signature, algorithm, signer_global_id, created_at, consented
     FROM uni_document_signatures
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
}
