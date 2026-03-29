"use server";

import {
  getRivenConfig as getStoredRivenConfig,
  setRivenConfig as storeRivenConfig,
  removeRivenConfig as clearStoredRivenConfig,
  type RivenConfig,
} from "./store/server-actions";

export async function resolveRivenConfig(): Promise<RivenConfig | null> {
  const stored = await getStoredRivenConfig();
  if (stored?.apiUrl && stored?.apiKey) {
    return stored;
  }

  const envUrl = process.env.RIVEN_API_URL;
  const envKey = process.env.RIVEN_API_KEY;
  if (envUrl && envKey) {
    return { apiUrl: envUrl, apiKey: envKey };
  }

  return null;
}

export async function testRivenConnection(
  config?: RivenConfig,
): Promise<{ success: boolean; message: string }> {
  const resolved = config || (await resolveRivenConfig());
  if (!resolved) {
    return { success: false, message: "No Riven configuration found" };
  }

  const baseUrl = resolved.apiUrl.replace(/\/+$/, "");

  try {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      method: "GET",
      headers: {
        "x-api-key": resolved.apiKey,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return { success: true, message: "Connected to Riven" };
    }

    return {
      success: false,
      message: `Riven returned ${response.status}: ${response.statusText}`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Network error";
    return { success: false, message };
  }
}

export async function saveRivenConfig(config: RivenConfig) {
  return storeRivenConfig(config);
}

export async function disconnectRiven() {
  return clearStoredRivenConfig();
}
