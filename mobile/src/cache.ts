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

export function minutesAgo(timestamp: number): number {
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
}
