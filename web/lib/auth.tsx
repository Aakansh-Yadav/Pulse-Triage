"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: "patient" | "doctor" | "admin" | "staff";
  patient_id: string | null;
  doctor_id: string | null;
};

type AuthState = {
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { email: string; password: string; fullName: string; role?: "patient" | "doctor" }) => Promise<User>;
  logout: () => void;
};

export function homePath(role: User["role"] | string) {
  if (role === "doctor") return "/doctor";
  if (role === "staff") return "/staff";
  return "/patient";
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = localStorage.getItem("pt_token");
      const u = localStorage.getItem("pt_user");
      if (t) {
        setToken(t);
        if (u) {
          try {
            setUser(JSON.parse(u) as User);
          } catch {
            /* ignore broken cache */
          }
        }
        try {
          const data = await api<{ user: User }>("/api/auth/me", { token: t });
          if (!cancelled && data.user) {
            localStorage.setItem("pt_user", JSON.stringify(data.user));
            setUser(data.user);
          }
        } catch {
          if (!cancelled) {
            localStorage.removeItem("pt_token");
            localStorage.removeItem("pt_user");
            setToken(null);
            setUser(null);
          }
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      ready,
      async login(email, password) {
        const data = await api<{ token: string; user: User }>("/api/auth/login", { method: "POST", body: { email, password } });
        localStorage.setItem("pt_token", data.token);
        localStorage.setItem("pt_user", JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        return data.user;
      },
      async register(input) {
        const data = await api<{ token: string; user: User }>("/api/auth/register", { method: "POST", body: input });
        localStorage.setItem("pt_token", data.token);
        localStorage.setItem("pt_user", JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        return data.user;
      },
      logout() {
        localStorage.removeItem("pt_token");
        localStorage.removeItem("pt_user");
        setToken(null);
        setUser(null);
      },
    }),
    [user, token, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
