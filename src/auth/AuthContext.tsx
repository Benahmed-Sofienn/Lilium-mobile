import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, setAccessToken, setOnUnauthorized } from "../api/client";
import { deleteToken, getToken, saveToken } from "./tokenStorage";

type UserRole = "Commercial" | "Superviseur" | "Countrymanager";

type AuthUser = {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  is_superuser?: boolean;
  is_staff?: boolean;
  is_active?: boolean;
  role?: UserRole; 
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

 const loadMeAndScope = async () => {
  const meRes = await api.get("/auth/me");

  const user = meRes.data?.user as AuthUser | undefined;
  const roleFromProfile = meRes.data?.profile?.rolee as AuthUser["role"] | undefined;

  if (!user?.id) throw new Error("Invalid /me response");

  const mergedUser: AuthUser = {
    ...user,
    role: (user as any)?.role ?? roleFromProfile, // fallback from profile.rolee
  };

  const scopeRes = await api.get("/auth/scope-users");
  const idsRaw = scopeRes.data?.scopeUserIds;
  const scopeUserIds = Array.isArray(idsRaw)
    ? idsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n))
    : [];

  setState({ status: "signedIn", user: mergedUser, scopeUserIds });
}

const fetchMeAndScope = async () => {
  const meRes = await api.get("/auth/me");

  const user = meRes.data?.user as AuthUser | undefined;
  const roleFromProfile = meRes.data?.profile?.rolee as AuthUser["role"] | undefined;

  if (!user?.id) throw new Error("Invalid /me response");

  const mergedUser: AuthUser = {
    ...user,
    role: (user as any)?.role ?? roleFromProfile,
  };

  const scopeRes = await api.get("/auth/scope-users");
  const idsRaw = scopeRes.data?.scopeUserIds;
  const scopeUserIds = Array.isArray(idsRaw)
    ? idsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n))
    : [];

  return { user: mergedUser, scopeUserIds };
};


  const login = async (username: string, password: string) => {
    setState((prev) => ({ status: "loading", user: null, scopeUserIds: prev.scopeUserIds }));


    const res = await api.post("/auth/login", { username, password, rememberMe: true });
    const token = res.data?.token;
    if (!token) throw new Error("Missing token from /login");

    await saveToken(token);
    setAccessToken(token);

    const { user, scopeUserIds } = await fetchMeAndScope();

    setState({ status: "signedIn", user, scopeUserIds });
  };


  useEffect(() => {
    setOnUnauthorized(() => logout());
    return () => setOnUnauthorized(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          setState((prev) =>
            prev.status === "loading"
              ? { status: "signedOut", user: null, scopeUserIds: [] }
              : prev
          );
          return;
        }

        setAccessToken(token);
        const { user, scopeUserIds } = await fetchMeAndScope();

        setState((prev) =>
          prev.status === "loading"
            ? { status: "signedIn", user, scopeUserIds }
            : prev
        );
      } catch {
        setState((prev) =>
          prev.status === "loading"
            ? { status: "signedOut", user: null, scopeUserIds: [] }
            : prev
        );
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
