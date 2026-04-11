/**
 * Ed25519 Asymmetric Key Signing — uni.id client
 *
 * Architecture:
 *   Private key  → generated on device, stored only in SecureStore (never leaves device)
 *   Public key   → derived from private key, uploaded to backend and stored in DB
 *   Signature    → produced on device with private key, verifiable by anyone with the public key
 *
 * Key storage keys:
 *   uni_signing_priv_v1  — 64 hex chars (32 bytes) private key
 *   uni_signing_pub_v1   — 64 hex chars (32 bytes) public key
 *
 * @noble/ed25519 v2 requires an explicit SHA-512 implementation in non-Node environments.
 * We use @noble/hashes/sha512 for this.
 */
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { secureGet, secureSet } from "@/context/SecureStorage";

// Wire sha512 for @noble/ed25519 in React Native.
// BOTH sync AND async MUST be set — async operations (signAsync, verifyAsync) fall back
// to crypto.subtle which is not available in React Native → "crypto.subtle must be defined"
ed.etc.sha512Sync = sha512 as typeof ed.etc.sha512Sync;
ed.etc.sha512Async = (msg: Uint8Array) => Promise.resolve(sha512(msg));

const PRIV_KEY = "uni_signing_priv_v1";
const PUB_KEY = "uni_signing_pub_v1";

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

/** Generate and persist a new Ed25519 key pair. Returns the public key hex. */
export async function generateAndStoreKeyPair(): Promise<string> {
  const privBytes = ed.utils.randomPrivateKey(); // 32 random bytes
  const pubBytes = await ed.getPublicKeyAsync(privBytes);

  const privHex = bytesToHex(privBytes);
  const pubHex = bytesToHex(pubBytes);

  await secureSet(PRIV_KEY, privHex);
  await secureSet(PUB_KEY, pubHex);

  return pubHex;
}

/** Load existing keys; returns null if not yet generated. */
export async function getStoredPublicKey(): Promise<string | null> {
  return secureGet(PUB_KEY);
}

/** Check whether a key pair exists on this device. */
export async function hasKeyPair(): Promise<boolean> {
  const priv = await secureGet(PRIV_KEY);
  return priv !== null && priv.length === 64;
}

/**
 * Sign a canonical payload string with the stored Ed25519 private key.
 * Returns the signature as a hex string, or null if no key pair exists.
 *
 * Canonical payload example:
 *   JSON.stringify({ document_hash, user_id, timestamp, consented })
 */
export async function signPayload(canonicalJson: string): Promise<string | null> {
  try {
    const privHex = await secureGet(PRIV_KEY);
    if (!privHex || privHex.length !== 64) return null;

    const privBytes = hexToBytes(privHex);
    const msgBytes = new TextEncoder().encode(canonicalJson);
    const sigBytes = await ed.signAsync(msgBytes, privBytes);
    return bytesToHex(sigBytes);
  } catch {
    return null;
  }
}

/**
 * Verify a signature locally (without network) using a known public key.
 * Useful for self-verification before uploading to backend.
 */
export async function verifySignatureLocally(
  canonicalJson: string,
  signatureHex: string,
  publicKeyHex: string
): Promise<boolean> {
  try {
    const msgBytes = new TextEncoder().encode(canonicalJson);
    const sigBytes = hexToBytes(signatureHex);
    const pubBytes = hexToBytes(publicKeyHex);
    return await ed.verifyAsync(sigBytes, msgBytes, pubBytes);
  } catch {
    return false;
  }
}

/**
 * Build the canonical JSON string for document signing.
 * MUST match the backend's canonical format exactly.
 */
export function buildCanonicalPayload(params: {
  documentHash: string;
  userId: string;
  timestamp: string;
  consented: boolean;
}): string {
  // Keys in alphabetical order for determinism
  return JSON.stringify({
    consented: params.consented,
    document_hash: params.documentHash,
    timestamp: params.timestamp,
    user_id: params.userId,
  });
}

/**
 * Get the short fingerprint of the public key (first 8 hex chars).
 * Used for display in the UI (e.g. "Huella: AB12CD34").
 */
export async function getPublicKeyFingerprint(): Promise<string | null> {
  const pub = await getStoredPublicKey();
  if (!pub) return null;
  return pub.slice(0, 8).toUpperCase();
}
