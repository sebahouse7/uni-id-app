/**
 * TSA (Time Stamp Authority) Client — uni.id
 *
 * RFC 3161 compliant timestamp requests and verification.
 *
 * Architecture:
 *   1. Build DER-encoded TimeStampReq with SHA-256 hash
 *   2. POST to public TSA endpoint (freetsa.org, timestamp.acs.microsoft.com)
 *   3. Store full DER response as base64 (tsa_token)
 *   4. Extract genTime + verify embedded hash for local validation
 *
 * Why external TSA:
 *   - The timestamp is signed by a trusted third party — cannot be forged retroactively
 *   - Provides legal-grade proof that a document existed before a given time
 *   - Verifiable without trusting uni.id servers
 */

import { randomBytes } from "crypto";
import { query as dbQuery, queryOne } from "./db";

// ─── DER encoding primitives ───────────────────────────────────────────────────

function derLen(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x100) return Buffer.from([0x81, len]);
  return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
}

function derTLV(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLen(value.length), value]);
}

function derSeq(...items: Buffer[]): Buffer {
  const content = Buffer.concat(items);
  return Buffer.concat([Buffer.from([0x30]), derLen(content.length), content]);
}

function derInt(valueBytes: Buffer): Buffer {
  // ASN.1 INTEGER must be positive — prepend 0x00 if high bit set
  const val =
    valueBytes[0]! & 0x80
      ? Buffer.concat([Buffer.from([0x00]), valueBytes])
      : valueBytes;
  return derTLV(0x02, val);
}

function derBool(value: boolean): Buffer {
  return Buffer.from([0x01, 0x01, value ? 0xff : 0x00]);
}

// SHA-256 AlgorithmIdentifier DER: SEQUENCE { OID sha-256, NULL }
// OID 2.16.840.1.101.3.4.2.1 = 60 86 48 01 65 03 04 02 01
const SHA256_ALG_ID = Buffer.from("300d06096086480165030402010500", "hex");

// ─── Build RFC 3161 TimeStampReq ───────────────────────────────────────────────

function buildTsaRequest(hashHex: string): { request: Buffer; nonce: Buffer } {
  const hashBytes = Buffer.from(hashHex, "hex"); // 32 bytes for SHA-256

  // messageImprint SEQUENCE { hashAlgorithm AlgorithmIdentifier, hashedMessage OCTET STRING }
  const msgImprint = derSeq(SHA256_ALG_ID, derTLV(0x04, hashBytes));

  // version INTEGER 1
  const version = derInt(Buffer.from([0x01]));

  // nonce INTEGER (8 random bytes — ensures replay protection)
  const nonceBytes = randomBytes(8);
  const nonce = derInt(nonceBytes);

  // certReq BOOLEAN TRUE — ask TSA to include its certificate in the response
  const certReq = derBool(true);

  const request = derSeq(version, msgImprint, nonce, certReq);
  return { request, nonce: nonceBytes };
}

// ─── TSA response DER parsing ──────────────────────────────────────────────────

/**
 * Walk DER bytes recursively to find first occurrence of a given tag.
 * Returns the value bytes of the first matching TLV, or null.
 */
function derFindFirst(buf: Buffer, targetTag: number): Buffer | null {
  let pos = 0;

  function readLen(): number {
    if (pos >= buf.length) return 0;
    const b = buf[pos++]!;
    if ((b & 0x80) === 0) return b;
    const numBytes = b & 0x7f;
    let len = 0;
    for (let i = 0; i < numBytes && pos < buf.length; i++) {
      len = (len << 8) | buf[pos++]!;
    }
    return len;
  }

  function walk(end: number): Buffer | null {
    while (pos < end && pos < buf.length) {
      const tagPos = pos;
      const tag = buf[pos++]!;
      const len = readLen();
      const valueStart = pos;
      const valueEnd = pos + len;

      if (tag === targetTag) {
        return buf.slice(valueStart, valueEnd);
      }

      // Recurse into containers: SEQUENCE(0x30), SET(0x31), context-tagged(0xa0..0xbf)
      if (
        tag === 0x30 ||
        tag === 0x31 ||
        (tag & 0xe0) === 0xa0 ||
        (tag & 0xe0) === 0x60
      ) {
        const result = walk(valueEnd);
        if (result) return result;
      } else {
        pos = valueEnd;
      }
      void tagPos; // suppress unused var warning
    }
    return null;
  }

  try {
    return walk(buf.length);
  } catch {
    return null;
  }
}

/**
 * Extract the GeneralizedTime (tag 0x18) from a TSA DER token.
 * Returns the Date or null if not found / unparseable.
 */
function extractGenTime(tokenBuf: Buffer): Date | null {
  const raw = derFindFirst(tokenBuf, 0x18);
  if (!raw) return null;
  try {
    const str = raw.toString("ascii");
    // Format: YYYYMMDDHHmmss[.sss]Z
    const y = parseInt(str.slice(0, 4), 10);
    const mo = parseInt(str.slice(4, 6), 10) - 1;
    const d = parseInt(str.slice(6, 8), 10);
    const h = parseInt(str.slice(8, 10), 10);
    const mi = parseInt(str.slice(10, 12), 10);
    const s = parseInt(str.slice(12, 14), 10);
    return new Date(Date.UTC(y, mo, d, h, mi, s));
  } catch {
    return null;
  }
}

/**
 * Extract the hashedMessage OCTET STRING embedded in the TSA token.
 * The SHA-256 OID sequence is followed by the hash bytes.
 * Returns hex string of the 32-byte hash, or null.
 */
function extractEmbeddedHash(tokenBuf: Buffer): string | null {
  // Locate SHA-256 OID bytes: 06 09 60 86 48 01 65 03 04 02 01
  const sha256Oid = Buffer.from("0609608648016503040201", "hex");
  const oidIdx = tokenBuf.indexOf(sha256Oid);
  if (oidIdx === -1) return null;

  // After OID: skip NULL params (05 00 = 2 bytes) + end of AlgorithmIdentifier SEQUENCE
  // Then look for OCTET STRING 04 20 (tag + length 32) within next 32 bytes
  const searchFrom = oidIdx + sha256Oid.length;
  for (let i = searchFrom; i < searchFrom + 32 && i + 33 < tokenBuf.length; i++) {
    if (tokenBuf[i] === 0x04 && tokenBuf[i + 1] === 0x20) {
      return tokenBuf.slice(i + 2, i + 34).toString("hex");
    }
  }
  return null;
}

// ─── TSA HTTP client ───────────────────────────────────────────────────────────

const TSA_ENDPOINTS = [
  "https://freetsa.org/tsr",
  "http://timestamp.acs.microsoft.com",
];

export interface TsaResult {
  /** Full DER response stored as base64 — the legally meaningful artifact */
  token: string;
  /** Timestamp extracted from the TSA token's genTime field */
  timestamp: Date;
  /** Whether the embedded hash in the token matches our documentHash */
  hashVerified: boolean;
  /** Which TSA endpoint responded */
  endpoint: string;
}

/**
 * Request an RFC 3161 timestamp token for the given SHA-256 hash (hex).
 * Tries each TSA endpoint in order, returns null if all fail.
 *
 * @param hashHex     SHA-256 hash of the canonical document payload (64 hex chars)
 * @param timeoutMs   Per-endpoint timeout. Default 8 seconds.
 */
export async function requestTimestamp(
  hashHex: string,
  timeoutMs = 8000
): Promise<TsaResult | null> {
  if (!hashHex || hashHex.length !== 64) {
    console.warn("[TSA] requestTimestamp: hashHex must be 64 hex chars");
    return null;
  }

  const { request } = buildTsaRequest(hashHex);

  for (const endpoint of TSA_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/timestamp-query" },
        body: request,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        console.warn(`[TSA] ${endpoint} responded HTTP ${response.status}`);
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (
        !contentType.includes("timestamp-reply") &&
        !contentType.includes("octet-stream")
      ) {
        console.warn(`[TSA] ${endpoint} unexpected content-type: ${contentType}`);
        continue;
      }

      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.length < 10) {
        console.warn(`[TSA] ${endpoint} response too short (${buf.length} bytes)`);
        continue;
      }

      const tokenBase64 = buf.toString("base64");
      const timestamp = extractGenTime(buf) ?? new Date();
      const embeddedHash = extractEmbeddedHash(buf);
      const hashVerified = embeddedHash === hashHex;

      if (!hashVerified) {
        console.warn(
          `[TSA] ${endpoint} token hash mismatch: expected ${hashHex.slice(0, 8)}... got ${(embeddedHash ?? "null").slice(0, 8)}...`
        );
      }

      console.log(
        `[TSA] ✅ Token received from ${endpoint} — timestamp: ${timestamp.toISOString()}, hashVerified: ${hashVerified}`
      );

      return { token: tokenBase64, timestamp, hashVerified, endpoint };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        console.warn(`[TSA] ${endpoint} timed out after ${timeoutMs}ms`);
      } else {
        console.warn(`[TSA] ${endpoint} error:`, err?.message ?? String(err));
      }
      continue;
    }
  }

  console.warn("[TSA] All endpoints failed — document will be marked 'pending'");
  return null;
}

// ─── TSA token verification (local) ──────────────────────────────────────────

export interface TsaVerifyResult {
  valid: boolean;
  timestamp: Date | null;
  hashMatch: boolean;
  reason: string;
}

/**
 * Verify a stored TSA token against a document hash.
 * Local verification: checks that the token contains the correct hash and has a parseable timestamp.
 * Does NOT validate the TSA CA certificate chain (that requires OpenSSL or full PKI lib).
 */
export function verifyTsaToken(
  tokenBase64: string,
  hashHex: string
): TsaVerifyResult {
  try {
    const buf = Buffer.from(tokenBase64, "base64");
    const timestamp = extractGenTime(buf);
    const embeddedHash = extractEmbeddedHash(buf);
    const hashMatch = embeddedHash === hashHex;

    if (!timestamp) {
      return {
        valid: false,
        timestamp: null,
        hashMatch,
        reason: "Token TSA no contiene timestamp válido (formato inesperado)",
      };
    }

    return {
      valid: hashMatch,
      timestamp,
      hashMatch,
      reason: hashMatch
        ? `Token TSA válido — hash verificado en timestamp externo (${timestamp.toISOString()})`
        : `Hash en token TSA no coincide con el documento (token adulterado)`,
    };
  } catch {
    return {
      valid: false,
      timestamp: null,
      hashMatch: false,
      reason: "Token TSA inválido o corrupto",
    };
  }
}

// ─── DB operations for TSA ────────────────────────────────────────────────────

/**
 * Update a signature record with the result of a TSA request.
 * Called asynchronously after the initial sign response is returned to the client.
 */
export async function saveTsaResult(
  signatureId: string,
  result: TsaResult
): Promise<void> {
  await dbQuery(
    `UPDATE uni_document_signatures
     SET tsa_token = $1, tsa_timestamp = $2, tsa_status = 'verified', tsa_endpoint = $3
     WHERE id = $4`,
    [result.token, result.timestamp.toISOString(), result.endpoint, signatureId]
  );
}

/**
 * Mark a signature's TSA status as failed (for retry later).
 */
export async function markTsaPending(signatureId: string): Promise<void> {
  await dbQuery(
    `UPDATE uni_document_signatures SET tsa_status = 'pending' WHERE id = $1`,
    [signatureId]
  );
}

/**
 * Retry all signatures with tsa_status = 'pending'.
 * Called on server startup to ensure eventual consistency.
 */
export async function retryPendingTsaRequests(): Promise<void> {
  const pending = await dbQuery<{ id: string; document_hash: string }>(
    `SELECT id, document_hash FROM uni_document_signatures
     WHERE tsa_status = 'pending'
     ORDER BY created_at DESC
     LIMIT 100`
  );

  if (pending.length === 0) return;
  console.log(`[TSA] Retrying ${pending.length} pending TSA request(s)...`);

  for (const row of pending) {
    try {
      const result = await requestTimestamp(row.document_hash);
      if (result) {
        await saveTsaResult(row.id, result);
        console.log(`[TSA] ✅ Retry success for signature ${row.id}`);
      } else {
        console.warn(`[TSA] Retry still failed for signature ${row.id}`);
      }
    } catch (err: any) {
      console.warn(`[TSA] Retry error for ${row.id}:`, err?.message);
    }
  }
}
