/**
 * Tiny localStorage helper.
 *
 * EcoBin never reads storage during SSR: the server always renders the default
 * state and the client re-hydrates in an effect, so there is no markup mismatch.
 */
const PREFIX = "ecobin:";

export function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode) — the dashboard still works, it
    // just will not remember settings across reloads.
  }
}

export function clearAll(keys: string[]): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of keys) window.localStorage.removeItem(PREFIX + key);
  } catch {
    // Ignore — nothing to clear if storage is unavailable.
  }
}
