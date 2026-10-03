// frontend/app/lib/device-id.ts
const STORAGE_KEY = "banda-oriental:device-id";

let memoryDeviceId: string | null = null;

function createUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID. This id only
  // needs to tell anonymous devices apart — it is never used as a secret.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(stored)) {
      memoryDeviceId = stored;
      return stored;
    }
    const created = createUuid();
    window.localStorage.setItem(STORAGE_KEY, created);
    memoryDeviceId = created;
    return created;
  } catch {
    // localStorage unavailable (private browsing, blocked storage, etc.)
    // — fall back to an in-memory id so the game still works for this
    // page load (Review Focus #1).
    memoryDeviceId = createUuid();
    return memoryDeviceId;
  }
}
