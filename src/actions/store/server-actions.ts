"use server";

import { cookies } from "next/headers";
import { AuthenticationResult } from "@jellyfin/sdk/lib/generated-client/models";

// --- Types ---
export interface LoginPreferences {
  username?: string;
  serverUrl?: string;
}

export interface AuthData {
  serverUrl: string;
  user: AuthenticationResult & { AccessToken: string };
  timestamp: number;
}


// --- StoreServerURL actions ---
const SERVER_URL_KEY = "jellyfin-server-url";

export async function setServerUrl(value: string) {
  (await cookies()).set(SERVER_URL_KEY, value);
}

export async function getServerUrl(): Promise<string | null> {
  const cookieStore = await cookies();
  const val = cookieStore.get(SERVER_URL_KEY);
  return val ? val.value : null;
}

export async function removeServerUrl() {
  (await cookies()).delete(SERVER_URL_KEY);
}

// --- StoreLoginPreferences actions ---
const PREF_KEY = "login-preferences";

export async function setLoginPreferences(value: LoginPreferences) {
  (await cookies()).set(PREF_KEY, JSON.stringify(value));
}

export async function getLoginPreferences(): Promise<LoginPreferences | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PREF_KEY);
  if (!raw || !raw.value) return null;
  try {
    return JSON.parse(raw.value) as LoginPreferences;
  } catch {
    return null;
  }
}

export async function removeLoginPreferences() {
  (await cookies()).delete(PREF_KEY);
}

// --- StoreAuthData actions ---
const AUTH_DATA_KEY = "jellyfin-auth";

export async function setAuthData(value: AuthData) {
  (await cookies()).set(AUTH_DATA_KEY, JSON.stringify(value));
}

export async function getAuthData(): Promise<AuthData | null> {
  const cookieStore = await cookies();
  const val = cookieStore.get(AUTH_DATA_KEY);
  if (!val || !val.value) return null;

  try {
    const parsed = JSON.parse(val.value);
    return parsed as AuthData;
  } catch {
    return null;
  }
}

export async function removeAuthData() {
  (await cookies()).delete(AUTH_DATA_KEY);
}

export async function executeClearAuthDataAction(
  preservePrefs: boolean = true,
) {
  const cookieStore = await cookies();
  
  if (preservePrefs) {
    try {
      const val = cookieStore.get(AUTH_DATA_KEY);
      if (val && val.value) {
        const parsed = JSON.parse(val.value) as AuthData;
        const userName =
          (parsed?.user as any)?.Name || parsed?.user?.User?.Name;
        if (userName) {
          cookieStore.set(PREF_KEY, JSON.stringify({ username: userName }));
        }
      }
    } catch (err) {
      console.warn("Failed to save login preferences on auth error:", err);
    }
    cookieStore.delete(AUTH_DATA_KEY);
  } else {
    cookieStore.delete(AUTH_DATA_KEY);
    cookieStore.delete(SERVER_URL_KEY);
  }
}

// --- Riven config ---
const RIVEN_CONFIG_KEY = "riven-config";

export interface RivenConfig {
  apiUrl: string;
  apiKey: string;
}

export async function setRivenConfig(value: RivenConfig) {
  (await cookies()).set(RIVEN_CONFIG_KEY, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getRivenConfig(): Promise<RivenConfig | null> {
  const cookieStore = await cookies();
  const val = cookieStore.get(RIVEN_CONFIG_KEY);
  if (!val || !val.value) return null;
  try {
    return JSON.parse(val.value) as RivenConfig;
  } catch {
    return null;
  }
}

export async function removeRivenConfig() {
  (await cookies()).delete(RIVEN_CONFIG_KEY);
}

// --- TMDB config ---
const TMDB_CONFIG_KEY = "tmdb-config";

export interface TmdbConfig {
  apiKey: string;
}

export async function setTmdbConfig(value: TmdbConfig) {
  const cookieStore = await cookies();
  cookieStore.set(TMDB_CONFIG_KEY, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getTmdbConfig(): Promise<TmdbConfig | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(TMDB_CONFIG_KEY);
  if (!raw?.value) return null;
  try {
    return JSON.parse(raw.value);
  } catch {
    return null;
  }
}

export async function removeTmdbConfig() {
  const cookieStore = await cookies();
  cookieStore.delete(TMDB_CONFIG_KEY);
}
