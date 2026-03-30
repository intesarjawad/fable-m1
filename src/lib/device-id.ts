import { v4 as uuidv4 } from "uuid";

const STORAGE_KEY = "fable_device_id";
let cachedDeviceId: string | null = null;

export function getDeviceId(): string {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  if (typeof window !== "undefined") {
    try {
      const existingId = window.localStorage.getItem(STORAGE_KEY);
      if (existingId) {
        cachedDeviceId = existingId;
        return cachedDeviceId;
      }

      const newId = uuidv4();
      window.localStorage.setItem(STORAGE_KEY, newId);
      cachedDeviceId = newId;
      return cachedDeviceId;
    } catch {
      // If storage fails (e.g., private mode), fall back to an in-memory value
    }
  }

  cachedDeviceId = uuidv4();
  return cachedDeviceId;
}
