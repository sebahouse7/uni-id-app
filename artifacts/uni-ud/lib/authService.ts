import * as Crypto from "expo-crypto";
import { secureDelete, secureGet, secureSet } from "@/context/SecureStorage";

export const PIN_KEY = "uni_id_pin_v1";
const PIN_HASH_SALT = "uni.id::secure::pin::v1::2024";

const LEGACY_KEYS = [
  "pin",
  "user_pin",
  "secure_pin",
  "@uni_pin",
  "@uni_id_pin",
];

async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${PIN_HASH_SALT}:${pin}`,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
}

export async function migrateOldPinKeys(): Promise<void> {
  for (const key of LEGACY_KEYS) {
    try {
      await secureDelete(key);
    } catch {}
  }
}

export async function savePin(pin: string): Promise<void> {
  const hashed = await hashPin(pin);
  await secureSet(PIN_KEY, hashed);
}

export async function getPin(): Promise<string | null> {
  try {
    return await secureGet(PIN_KEY);
  } catch {
    return null;
  }
}

export async function validatePin(input: string): Promise<boolean> {
  try {
    const stored = await getPin();
    if (!stored) return false;
    const hashed = await hashPin(input);
    return stored === hashed;
  } catch {
    return false;
  }
}

export async function clearPin(): Promise<void> {
  try {
    await secureDelete(PIN_KEY);
  } catch {}
}
