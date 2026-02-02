import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { djangoApi, setAccessToken, setOnUnauthorized } from "../api/client";

import { deleteToken, getToken, saveToken } from "./tokenStorage";

type UserRole = "Commercial" | "Superviseur" | "CountryManager";

export type UnderUser = {
  id: number;
  username?: string;

  // From accounts_userprofile.speciality_rolee
  speciality_rolee?: string;

  // From accounts_userprofile.rolee (optional, in case you want it later)
  role?: UserRole;
};

export type AuthUser = {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  is_superuser?: boolean;
  is_staff?: boolean;
  is_active?: boolean;

  // existing (from rolee)
  role?: UserRole;

  // NEW (from speciality_rolee)
  speciality_rolee?: string;

  // NEW
  users_under?: UnderUser[];
};

type AuthState =
  | { status: "loading"; user: null; scopeUserIds: number[] }
  | { status: "signedOut"; user: null; scopeUserIds: number[] }
  | { status: "signedIn"; user: AuthUser; scopeUserIds: number[] };

type Ctx = {
  state: AuthState;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

function normalizeRole(rolee: unknown): UserRole | undefined {
  if (typeof rolee !== "string") return undefined;

  const r = rolee.trim();

  if (r === "Commercial") return "Commercial";
  if (r === "Superviseur") return "Superviseur";
  if (r === "CountryManager" || r.toLowerCase() === "countrymanager") {
    return "CountryManager";
  }
  return undefined;
}

function normalizeSpecialityRolee(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const raw = value.trim();
  if (!raw) return undefined;

  // Accept either underscores or spaces from backend
  const s = raw.replace(/_/g, " ").replace(/\s+/g, " ").trim();

  // Canonicalize known values (keep strings to avoid TypeScript friction elsewhere)
  if (s.toLowerCase() === "medico commercial") return "Medico Commercial";
  if (s.toLowerCase() === "commercial") return "Commercial";

  // Supervisor “speciality” axis as seen in your backend usage
  if (s.toLowerCase() === "superviseur national") return "Superviseur National";
  if (s.toLowerCase() === "superviseur regional") return "Superviseur Regional";
  if (s.toLowerCase() === "superviseur") return "Superviseur";

  // Unknown values: keep as-is (but normalized for underscores/spaces)
  return s;
}

/**
 * Django /accounts/api/app/current returns a flat payload like:
 * {
 *   id, username, first_name, last_name, email,
 *   is_superuser, is_staff, is_active,
 *   rolee,
 *   speciality_rolee,
 *   users_under: [{id, username, rolee?, speciality_rolee?}, ...]
 * }
 */
function mapCurrentResponseToAuth(data: any): { user: AuthUser; scopeUserIds: number[] } {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid /accounts/api/app/current response");
  }

  const id = Number(data.id);
  if (!Number.isFinite(id)) {
    throw new Error("Invalid user id from /accounts/api/app/current");
  }

  const user: AuthUser = {
    id,
    username: String(data.username ?? ""),
    first_name: data.first_name ?? undefined,
    last_name: data.last_name ?? undefined,
    email: data.email ?? undefined,
    is_superuser: data.is_superuser ?? undefined,
    is_staff: data.is_staff ?? undefined,
    is_active: data.is_active ?? undefined,
    role: normalizeRole(data.rolee ?? data.role),

    speciality_rolee: normalizeSpecialityRolee(
      data.speciality_rolee ?? data.specialityRolee
    ),
  };

  const usersUnder: UnderUser[] = Array.isArray(data.users_under)
    ? data.users_under
        .map((u: any) => {
          const uid = Number(u?.id);
          if (!Number.isFinite(uid)) return null;

          return {
            id: uid,
            username: u?.username != null ? String(u.username) : undefined,
            role: normalizeRole(u?.rolee ?? u?.role),
            speciality_rolee: normalizeSpecialityRolee(
              u?.speciality_rolee ?? u?.specialityRolee
            ),
          } as UnderUser;
        })
        .filter(Boolean) as UnderUser[]
    : [];

  user.users_under = usersUnder;

  const usersUnderIds = usersUnder.map((u) => u.id);

  // Always include self and de-duplicate
  const scopeUserIds = Array.from(new Set([user.id, ...usersUnderIds]));

  return { user, scopeUserIds };
}

async function fetchCurrent(): Promise<{ user: AuthUser; scopeUserIds: number[] }> {
  // NOTE: This must hit Django, not Node
  const res = await djangoApi.get("/accounts/api/app/current");
  return mapCurrentResponseToAuth(res.data);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    scopeUserIds: [],
  });

  const logoutLock = useRef(false);

  const logout = async () => {
    if (logoutLock.current) return;
    logoutLock.current = true;
    try {
      setAccessToken(null);
      await deleteToken();
    } finally {
      setState({ status: "signedOut", user: null, scopeUserIds: [] });
      logoutLock.current = false;
    }
  };

  const login = async (username: string, password: string) => {
    setState((prev) => ({
      status: "loading",
      user: null,
      scopeUserIds: prev.scopeUserIds,
    }));

    // DRF obtain_auth_token: POST /api-auth/ -> { token: "..." }
    // This endpoint does NOT require CSRF and is intended for API clients.
    const res = await djangoApi.post("/api-auth/", { username, password });

    const token = res.data?.token;
    if (!token || typeof token !== "string") {
      throw new Error("Missing token from /api-auth/");
    }

    await saveToken(token);
    setAccessToken(token);

    const { user, scopeUserIds } = await fetchCurrent();
    setState({ status: "signedIn", user, scopeUserIds });
  };

  useEffect(() => {
    // any 401 should log the user out (except login, handled in client.ts)
    setOnUnauthorized(() => logout());
    return () => setOnUnauthorized(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          setState({ status: "signedOut", user: null, scopeUserIds: [] });
          return;
        }

        setAccessToken(token);

        const { user, scopeUserIds } = await fetchCurrent();
        setState({ status: "signedIn", user, scopeUserIds });
      } catch {
        // token invalid / server unreachable / payload mismatch
        setAccessToken(null);
        await deleteToken().catch(() => {});
        setState({ status: "signedOut", user: null, scopeUserIds: [] });
      }
    })();
  }, []);

  const value = useMemo<Ctx>(() => ({ state, login, logout }), [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
