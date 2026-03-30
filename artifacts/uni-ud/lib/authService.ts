import { secureDelete, secureGet, secureSet } from "@/context/SecureStorage";

export const PIN_KEY = "uni_id_pin_v1";

const LEGACY_KEYS = [
  "pin",
  "user_pin",
  "secure_pin",
  "@uni_pin",
  "@uni_id_pin",
];

export async function migrateOldPinKeys(): Promise<void> {
  for (const key of LEGACY_KEYS) {
    try {
      await secureDelete(key);
    } catch {}
  }
}

export async function savePin(pin: string): Promise<void> {
  await secureSet(PIN_KEY, pin);
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
    return stored !== null && stored === input;
  } catch {
    return false;
  }
}

export async function clearPin(): Promise<void> {
  try {
    await secureDelete(PIN_KEY);
  } catch {}
}
