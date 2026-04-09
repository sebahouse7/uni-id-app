/**
 * fileVault.ts
 *
 * Device-side AES-256-GCM file encryption vault.
 *
 * Flow:
 *   Pick file → vaultEncryptFile() → encrypted blob saved to
 *   app documentDirectory/vault/{id}.enc, original temp deleted, key in SecureStore
 *   URI stored in document: "vault://{id}" (never a plaintext path)
 *   Viewing → vaultDecryptToTemp() → temp file (cleared on unmount / app restart)
 *   Deletion → vaultDeleteEntry() → removes .enc + SecureStore key
 *
 * Keys: iOS Keychain / Android Keystore via expo-secure-store (WHEN_UNLOCKED_THIS_DEVICE_ONLY).
 * Vault dir: app documentDirectory (sandbox, excluded from iCloud/ADB backup).
 * Temp dir: cacheDirectory/uni-temp/ — cleared on every app startup.
 */

import * as Crypto from "expo-crypto";
import {
  documentDirectory,
  cacheDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
  deleteAsync,
  readDirectoryAsync,
  EncodingType,
} from "expo-file-system/legacy";
// @ts-expect-error — @noble/ciphers uses .ts extensions in d.ts imports, incompatible with bundler resolution; works fine at runtime
import { gcm } from "@noble/ciphers/aes";
import { secureDelete, secureGet, secureSet } from "@/context/SecureStorage";

const VAULT_DIR = (documentDirectory ?? "") + "vault/";
const TEMP_DIR = (cacheDirectory ?? "") + "uni-temp/";
const KEY_PREFIX = "vk_";
const IV_LEN = 12;

async function ensureDir(dir: string): Promise<void> {
  const info = await getInfoAsync(dir);
  if (!info.exists) {
    await makeDirectoryAsync(dir, { intermediates: true });
  }
}

function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function bytesToB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function extensionFrom(fileName?: string): string {
  if (!fileName) return "bin";
  const parts = fileName.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "bin";
}

/**
 * Encrypts a local file with AES-256-GCM and stores the ciphertext in the
 * app vault directory. The original temp/cache file is deleted after encryption.
 *
 * @param localUri  The file:// or content:// URI of the file to encrypt.
 * @param vaultId   Unique ID for this vault entry (caller-generated).
 * @returns         "vault://{vaultId}" — the opaque vault URI to persist.
 */
export async function vaultEncryptFile(
  localUri: string,
  vaultId: string
): Promise<string> {
  await ensureDir(VAULT_DIR);

  const fileB64 = await readAsStringAsync(localUri, {
    encoding: EncodingType.Base64,
  });
  const plaintext = b64ToBytes(fileB64);

  const key = await Crypto.getRandomBytesAsync(32);
  const iv = await Crypto.getRandomBytesAsync(IV_LEN);

  const cipher = gcm(key, iv);
  const ciphertext = cipher.encrypt(plaintext);

  const combined = new Uint8Array(IV_LEN + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, IV_LEN);

  const vaultPath = VAULT_DIR + vaultId + ".enc";
  await writeAsStringAsync(vaultPath, bytesToB64(combined), {
    encoding: EncodingType.Base64,
  });

  await secureSet(KEY_PREFIX + vaultId, bytesToB64(key));

  try {
    if (!localUri.startsWith("content://")) {
      const info = await getInfoAsync(localUri);
      if (info.exists) {
        await deleteAsync(localUri, { idempotent: true });
      }
    }
  } catch {}

  return "vault://" + vaultId;
}

/**
 * Decrypts a vault entry to a temp file for display.
 * The caller MUST call cleanTempFile(vaultId) after use.
 *
 * @param vaultId   The vault entry ID.
 * @param fileName  Original file name — used to infer extension for temp file.
 * @returns         file:// URI of decrypted temp file, or null on failure.
 */
export async function vaultDecryptToTemp(
  vaultId: string,
  fileName?: string
): Promise<string | null> {
  try {
    await ensureDir(TEMP_DIR);

    const vaultPath = VAULT_DIR + vaultId + ".enc";
    const vaultInfo = await getInfoAsync(vaultPath);
    if (!vaultInfo.exists) return null;

    const keyB64 = await secureGet(KEY_PREFIX + vaultId);
    if (!keyB64) return null;

    const key = b64ToBytes(keyB64);

    const combinedB64 = await readAsStringAsync(vaultPath, {
      encoding: EncodingType.Base64,
    });
    const combined = b64ToBytes(combinedB64);

    const iv = combined.slice(0, IV_LEN);
    const ciphertext = combined.slice(IV_LEN);

    const cipher = gcm(key, iv);
    const plaintext = cipher.decrypt(ciphertext);

    const ext = extensionFrom(fileName);
    const tempPath = TEMP_DIR + vaultId + "." + ext;
    await writeAsStringAsync(tempPath, bytesToB64(plaintext), {
      encoding: EncodingType.Base64,
    });

    return tempPath;
  } catch {
    return null;
  }
}

/**
 * Permanently deletes the vault entry (encrypted file + SecureStore key).
 * Call when a document is deleted by the user.
 */
export async function vaultDeleteEntry(vaultId: string): Promise<void> {
  const vaultPath = VAULT_DIR + vaultId + ".enc";
  await deleteAsync(vaultPath, { idempotent: true }).catch(() => {});
  await secureDelete(KEY_PREFIX + vaultId).catch(() => {});
  await cleanTempFile(vaultId).catch(() => {});
}

/**
 * Deletes any temp decrypted file for a given vault entry.
 * Call on component unmount after displaying a vault file.
 */
export async function cleanTempFile(vaultId: string): Promise<void> {
  try {
    const files = await readDirectoryAsync(TEMP_DIR).catch(() => [] as string[]);
    const matches = files.filter((f) => f.startsWith(vaultId + "."));
    await Promise.all(
      matches.map((f) => deleteAsync(TEMP_DIR + f, { idempotent: true }))
    );
  } catch {}
}

/**
 * Clears ALL temp vault files. Must be called once on app startup.
 */
export async function cleanAllTempFiles(): Promise<void> {
  try {
    const info = await getInfoAsync(TEMP_DIR);
    if (!info.exists) return;
    const files = await readDirectoryAsync(TEMP_DIR);
    await Promise.all(
      files.map((f) => deleteAsync(TEMP_DIR + f, { idempotent: true }))
    );
  } catch {}
}

/**
 * Extracts the vaultId from a "vault://{id}" URI.
 * Returns null if not a vault URI.
 */
export function parseVaultId(uri: string): string | null {
  if (!uri.startsWith("vault://")) return null;
  return uri.slice("vault://".length);
}

/**
 * Returns true if the given URI is an encrypted vault reference.
 */
export function isVaultUri(uri: string): boolean {
  return typeof uri === "string" && uri.startsWith("vault://");
}

/**
 * Generates a unique vault ID for a new document file.
 */
export function newVaultId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
