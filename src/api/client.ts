import axios, { AxiosError } from "axios";
import { getToken } from "../auth/tokenStorage";

/**
 * Base URL normalization:
 * - API_URL:   http://10.x.x.x:5000
 * - API_PREFIX: /api
 * => API_BASE_URL = http://10.x.x.x:5000/api
 */
const API_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");
const API_PREFIX = process.env.EXPO_PUBLIC_API_PREFIX || "/api"; // IMPORTANT: default to /api (not /api/auth)
const API_PATH_PREFIX = API_PREFIX.startsWith("/") ? API_PREFIX : `/${API_PREFIX}`;

const normalize = (base: string, prefix: string) => {
  const b = base.replace(/\/+$/, "");
  const p = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return `${b}${p}`;
};

export const API_BASE_URL = normalize(API_URL, API_PATH_PREFIX);

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
});

export const setAccessToken = (token: string | null) => {
  accessToken = token;

  // Keep axios defaults in sync (helps for some edge cases)
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete (api.defaults.headers.common as any).Authorization;
  }
};

export const setOnUnauthorized = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

async function resolveToken(): Promise<string | null> {
  if (accessToken) return accessToken;

  // Fallback: read from storage (cold start / edge cases)
  try {
    const stored = await getToken();
    if (stored) {
      accessToken = stored;
      api.defaults.headers.common.Authorization = `Bearer ${stored}`;
      return stored;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Builds a full URL while avoiding "/api/api/..." double-prefix issues.
 * Accepts:
 * - "/rapports/today"  -> API_BASE_URL + "/rapports/today"
 * - "/api/rapports/.." -> API_URL + "/api/rapports/.."  (already prefixed)
 * - "http(s)://..."    -> unchanged
 */
function buildFullUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;

  const p = path.startsWith("/") ? path : `/${path}`;

  if (!API_URL) return p;

  if (p === API_PATH_PREFIX || p.startsWith(`${API_PATH_PREFIX}/`)) {
    return `${API_URL}${p}`;
  }
  return `${API_BASE_URL}${p}`;
}

/**
 * Auth-aware fetch: injects Bearer token if available,
 * and triggers onUnauthorized on 401 (like axios interceptor).
 */
export async function authFetch(path: string, init: RequestInit = {}) {
  const url = buildFullUrl(path);

  const headers = new Headers(init.headers || {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  if (!headers.has("Authorization")) {
    const token = await resolveToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, { ...init, headers });

  const isLogin = url.toLowerCase().includes("/auth/login");
  if (res.status === 401 && !isLogin) {
    onUnauthorized?.();
  }

  return res;
}

// Axios request interceptor (kept for safety)
api.interceptors.request.use(async (config) => {
  const token = await resolveToken(); // <-- important
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    const status = err.response?.status;
    const url = String(err.config?.url || "").toLowerCase();
    const isLogin = url.includes("/login");

    if (status === 401 && !isLogin) {
      onUnauthorized?.();
    }
    return Promise.reject(err);
  }
);
