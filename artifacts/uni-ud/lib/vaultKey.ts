/**
 * vaultKey.ts
 *
 * Derives the master vault key from: SHA-256(pinHash || deviceId || salt)
 *
 * - pinHash   : already hashed PIN from SecureStore (never stored raw)
 * - deviceId  : random ID generated once per install, stored in SecureStore
 * - salt      : random 32-byte value generated once per install, stored in SecureStore
 *
 * The derived 32-byte key is cached in module memory for the session.
 * It is cleared when the user's PIN changes (via clearVaultKeyCache).
 * Nothing is ever written to disk.
 */

import * as Crypto from "expo-crypto";
import { secureGet, secureSet } from "@/context/SecureStorage";
import { getPin } from "@/lib/authService";

const DEVICE_ID_KEY = "uni_vault_device_id_v1";
const VAULT_SALT_KEY = "uni_vault_salt_v1";

let _cachedKey: Uint8Array | null = null;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await secureGet(DEVICE_ID_KEY);
  if (existing) return existing;
  const random = await Crypto.getRandomBytesAsync(16);
  const id = bytesToHex(random);
  await secureSet(DEVICE_ID_KEY, id);
  return id;
}

async function getOrCreateSalt(): Promise<Uint8Array> {
  const existing = await secureGet(VAULT_SALT_KEY);
  if (existing) return hexToBytes(existing);
  const salt = await Crypto.getRandomBytesAsync(32);
  await secureSet(VAULT_SALT_KEY, bytesToHex(salt));
  return salt;
}

/**
 * Derives the 32-byte vault master key.
 * Key = SHA-256( pinHash || deviceId || salt )
 * Result is cached in module memory for the session.
 */
export async function deriveVaultKey(): Promise<Uint8Array> {
  if (_cachedKey) return _cachedKey;

  const pinHash = await getPin().catch(() => null);
  const deviceId = await getOrCreateDeviceId();
  const salt = await getOrCreateSalt();

  const combined = (pinHash ?? "no-pin") + "|" + deviceId + "|" + bytesToHex(salt);
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    combined,
    { encoding: Crypto.CryptoEncoding.HEX }
  );

  _cachedKey = hexToBytes(digest);
  return _cachedKey;
}

/**
 * Clears the in-memory key cache.
 * Call when the PIN changes so the key is re-derived on next use.
 */
export function clearVaultKeyCache(): void {
  _cachedKey = null;
}

/**
 * Returns true if there is a vault key ready (PIN configured).
 */
export async function hasVaultKey(): Promise<boolean> {
  const pin = await getPin().catch(() => null);
  return !!pin;
}
