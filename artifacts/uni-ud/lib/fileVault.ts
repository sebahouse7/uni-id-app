/**
 * fileVault.ts
 *
 * Device-side AES-256-GCM file encryption vault.
 *
 * KEY DESIGN:
 *   Master key = SHA-256(pinHash || deviceId || salt) — see lib/vaultKey.ts
 *   Key is derived from SecureStore contents, never stored in plaintext.
 *   Per-file key = AES-256-GCM using master key + file-specific IV (12 bytes).
 *
 * STORAGE:
 *   Encrypted blobs → documentDirectory/vault/{id}.enc
 *   No plaintext version ever persists on disk.
 *
 * DECRYPTION:
 *   All decryption is in-memory only (returns base64 string / Uint8Array).
 *   The ONLY exception is sharing non-image files (see vaultShareFile),
 *   which writes a temp file, returns the path, and the caller MUST delete it
 *   immediately after the share dialog closes.
 *
 * MIGRATION:
 *   migrateOldVaultFiles() converts v1 per-file random-key entries to the
 *   new PIN-derived key scheme. Run once on startup after auth.
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
  copyAsync,
  EncodingType,
} from "expo-file-system/legacy";
// @ts-expect-error — @noble/ciphers uses .ts extensions in d.ts imports, incompatible with bundler resolution; works fine at runtime
import { gcm } from "@noble/ciphers/aes";
import { secureDelete, secureGet } from "@/context/SecureStorage";
import { deriveVaultKey } from "@/lib/vaultKey";

const VAULT_DIR = (documentDirectory ?? "") + "vault/";
const SHARE_TEMP_DIR = (cacheDirectory ?? "") + "uni-share/";
const OLD_KEY_PREFIX = "vk_";
const IV_LEN = 12;

async function ensureDir(dir: string): Promise<void> {
  const info = await getInfoAsync(dir);
  if (!info.exists) {
    await makeDirectoryAsync(dir, { intermediates: true });
  }
}

function b64ToBytes(b64: string): Uint8Array {
  // atob is available in React Native (Hermes) and browsers — avoids Buffer dependency
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  // btoa is available in React Native (Hermes) and browsers — avoids Buffer dependency
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Reads any file URI (file://, content://, ph://) as a Base64 string.
 * content:// URIs (Android camera) are first copied to a temp file since
 * readAsStringAsync cannot read them directly on all Android versions.
 */
async function readAnyUriAsBase64(uri: string): Promise<string> {
  const needsCopy =
    uri.startsWith("content://") ||
    uri.startsWith("ph://") ||
    uri.startsWith("assets-library://");

  if (!needsCopy) {
    return readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  }

  const tmpPath = (cacheDirectory ?? "") + "vault_read_" + Date.now() + ".bin";
  try {
    await copyAsync({ from: uri, to: tmpPath });
    const b64 = await readAsStringAsync(tmpPath, { encoding: EncodingType.Base64 });
    return b64;
  } finally {
    deleteAsync(tmpPath, { idempotent: true }).catch(() => {});
  }
}

function extensionFrom(fileName?: string): string {
  if (!fileName) return "bin";
  const parts = fileName.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "bin";
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    bmp: "image/bmp",
    avif: "image/avif",
    pdf: "application/pdf",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}

/**
 * Encrypts a local file with AES-256-GCM using the PIN-derived vault key.
 * The original file is deleted after encryption.
 * The encrypted blob is saved to vault/{vaultId}.enc in documentDirectory.
 *
 * @param localUri  file:// URI of the file to encrypt.
 * @param vaultId   Unique ID for this vault entry.
 * @returns         "vault://{vaultId}" — opaque URI to persist in the document record.
 */
export async function vaultEncryptFile(
  localUri: string,
  vaultId: string
): Promise<string> {
  await ensureDir(VAULT_DIR);

  const rawKey = await deriveVaultKey();
  // Coerce to plain Uint8Array — native modules in React Native return typed arrays
  // that may fail instanceof checks inside @noble/ciphers
  const masterKey = new Uint8Array(rawKey);
  const rawIv = await Crypto.getRandomBytesAsync(IV_LEN);
  const iv = new Uint8Array(rawIv);

  const fileB64 = await readAnyUriAsBase64(localUri);
  const plaintext = new Uint8Array(b64ToBytes(fileB64));

  const cipher = gcm(masterKey, iv);
  const ciphertext = cipher.encrypt(plaintext);

  const combined = new Uint8Array(IV_LEN + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, IV_LEN);

  await writeAsStringAsync(VAULT_DIR + vaultId + ".enc", bytesToB64(combined), {
    encoding: EncodingType.Base64,
  });

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
 * Decrypts a vault entry entirely in memory.
 * Nothing is written to disk.
 *
 * @param vaultId   The vault entry ID.
 * @param fileName  Original file name — used to infer MIME type for data URIs.
 * @returns         { base64, mimeType, dataUri } or null if decryption fails.
 */
export async function vaultDecryptToMemory(
  vaultId: string,
  fileName?: string
): Promise<{ base64: string; mimeType: string; dataUri: string } | null> {
  try {
    const vaultPath = VAULT_DIR + vaultId + ".enc";
    const vaultInfo = await getInfoAsync(vaultPath);
    if (!vaultInfo.exists) return null;

    const masterKey = new Uint8Array(await deriveVaultKey());

    const combinedB64 = await readAsStringAsync(vaultPath, {
      encoding: EncodingType.Base64,
    });
    const combined = new Uint8Array(b64ToBytes(combinedB64));

    const iv = combined.slice(0, IV_LEN);
    const ciphertext = combined.slice(IV_LEN);

    const cipher = gcm(masterKey, iv);
    const plaintext = cipher.decrypt(ciphertext);

    const base64 = bytesToB64(plaintext);
    const ext = extensionFrom(fileName);
    const mimeType = mimeFromExt(ext);
    const dataUri = `data:${mimeType};base64,${base64}`;

    return { base64, mimeType, dataUri };
  } catch {
    return null;
  }
}

/**
 * Decrypts a vault entry to a TEMPORARY file for sharing only.
 * The caller MUST delete the returned path immediately after the share dialog closes.
 * This is the ONLY case where plaintext touches disk — for the duration of the share.
 *
 * @param vaultId   The vault entry ID.
 * @param fileName  Original file name.
 * @returns         Temporary file:// URI, or null on failure.
 */
export async function vaultShareFile(
  vaultId: string,
  fileName?: string
): Promise<{ tempPath: string; cleanup: () => Promise<void> } | null> {
  try {
    await ensureDir(SHARE_TEMP_DIR);

    const result = await vaultDecryptToMemory(vaultId, fileName);
    if (!result) return null;

    const ext = extensionFrom(fileName);
    const tempPath = SHARE_TEMP_DIR + vaultId + "_share." + ext;

    await writeAsStringAsync(tempPath, result.base64, {
      encoding: EncodingType.Base64,
    });

    const cleanup = async (): Promise<void> => {
      await deleteAsync(tempPath, { idempotent: true }).catch(() => {});
    };

    return { tempPath, cleanup };
  } catch {
    return null;
  }
}

/**
 * Permanently deletes a vault entry (encrypted file on disk).
 * Safe to call even if the entry doesn't exist.
 */
export async function vaultDeleteEntry(vaultId: string): Promise<void> {
  await deleteAsync(VAULT_DIR + vaultId + ".enc", { idempotent: true }).catch(() => {});
  await secureDelete(OLD_KEY_PREFIX + vaultId).catch(() => {});
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

/**
 * Migrates vault files encrypted with old v1 per-file random keys (stored in SecureStore)
 * to the new PIN-derived key scheme.
 *
 * Safe to call multiple times — skips entries that are already migrated.
 * Should be called once on startup after the user has authenticated.
 */
export async function migrateOldVaultFiles(): Promise<void> {
  try {
    const vaultDirInfo = await getInfoAsync(VAULT_DIR);
    if (!vaultDirInfo.exists) return;

    const files = await readDirectoryAsync(VAULT_DIR).catch(() => [] as string[]);
    const encFiles = files.filter((f) => f.endsWith(".enc"));
    if (encFiles.length === 0) return;

    const newKey = await deriveVaultKey().catch(() => null);
    if (!newKey) return;

    let migrated = 0;
    for (const file of encFiles) {
      const vaultId = file.replace(".enc", "");
      const oldKeyB64 = await secureGet(OLD_KEY_PREFIX + vaultId).catch(() => null);
      if (!oldKeyB64) continue;

      try {
        const vaultPath = VAULT_DIR + file;
        const combinedB64 = await readAsStringAsync(vaultPath, {
          encoding: EncodingType.Base64,
        });
        const combined = b64ToBytes(combinedB64);
        const iv = combined.slice(0, IV_LEN);
        const ciphertext = combined.slice(IV_LEN);

        const oldKey = b64ToBytes(oldKeyB64);
        const oldCipher = gcm(oldKey, iv);
        const plaintext = oldCipher.decrypt(ciphertext);

        const newIv = await Crypto.getRandomBytesAsync(IV_LEN);
        const newCipher = gcm(newKey, newIv);
        const newCiphertext = newCipher.encrypt(plaintext);

        const newCombined = new Uint8Array(IV_LEN + newCiphertext.length);
        newCombined.set(newIv, 0);
        newCombined.set(newCiphertext, IV_LEN);

        await writeAsStringAsync(vaultPath, bytesToB64(newCombined), {
          encoding: EncodingType.Base64,
        });

        await secureDelete(OLD_KEY_PREFIX + vaultId).catch(() => {});
        migrated++;
      } catch {}
    }

    if (migrated > 0) {
      console.log(`[vaultMigration] Migrated ${migrated} file(s) to PIN-derived key scheme`);
    }
  } catch {}
}

/**
 * Clears ALL share temp files.
 * Call on app startup to clean any leftover share temps.
 */
export async function cleanShareTemps(): Promise<void> {
  try {
    const info = await getInfoAsync(SHARE_TEMP_DIR);
    if (!info.exists) return;
    const files = await readDirectoryAsync(SHARE_TEMP_DIR).catch(() => [] as string[]);
    await Promise.all(
      files.map((f) => deleteAsync(SHARE_TEMP_DIR + f, { idempotent: true }))
    );
  } catch {}
}
