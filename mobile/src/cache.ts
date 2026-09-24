import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "cache:";

export async function readCache<T>(key: string): Promise<{ data: T; savedAt: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {
    // best-effort; ignore storage failures
  }
}

// User settings kept on the device (not a cache: never expires, no timestamp).
export async function readSetting<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem("setting:" + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeSetting<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem("setting:" + key, JSON.stringify(value));
  } catch {
    // best-effort
  }
}

export function minutesAgo(timestamp: number): number {
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
}
