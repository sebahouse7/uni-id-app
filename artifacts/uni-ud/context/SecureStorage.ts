import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const CHUNK_SIZE = 2000;

function chunkKey(key: string, i: number) {
  return `${key}_chunk_${i}`;
}
function metaKey(key: string) {
  return `${key}_chunks`;
}

async function webFallbackGet(key: string): Promise<string | null> {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
async function webFallbackSet(key: string, value: string): Promise<void> {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {}
}
async function webFallbackDelete(key: string): Promise<void> {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {}
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await webFallbackSet(key, value);
    return;
  }
  if (value.length <= CHUNK_SIZE) {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await SecureStore.deleteItemAsync(metaKey(key)).catch(() => {});
    return;
  }
  const chunks = Math.ceil(value.length / CHUNK_SIZE);
  for (let i = 0; i < chunks; i++) {
    await SecureStore.setItemAsync(
      chunkKey(key, i),
      value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
    );
  }
  await SecureStore.setItemAsync(metaKey(key), String(chunks), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return webFallbackGet(key);
  }
  const chunksStr = await SecureStore.getItemAsync(metaKey(key)).catch(() => null);
  if (chunksStr) {
    const chunks = parseInt(chunksStr, 10);
    let result = "";
    for (let i = 0; i < chunks; i++) {
      const chunk = await SecureStore.getItemAsync(chunkKey(key, i)).catch(() => "");
      result += chunk ?? "";
    }
    return result || null;
  }
  return SecureStore.getItemAsync(key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }).catch(() => null);
}

export async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await webFallbackDelete(key);
    return;
  }
  const chunksStr = await SecureStore.getItemAsync(metaKey(key)).catch(() => null);
  if (chunksStr) {
    const chunks = parseInt(chunksStr, 10);
    for (let i = 0; i < chunks; i++) {
      await SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => {});
    }
    await SecureStore.deleteItemAsync(metaKey(key)).catch(() => {});
    return;
  }
  await SecureStore.deleteItemAsync(key).catch(() => {});
}
