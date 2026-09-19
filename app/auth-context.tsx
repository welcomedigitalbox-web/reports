"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { posDb, type Profile } from "@/lib/supabase";
import { APP_URL, canAccess, applyAppAccess } from "@/lib/apps";

type AuthContextType = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    posDb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
      else setLoading(false);
    });

    const { data: sub } = posDb.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) loadProfile(s.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The profile is the POS one. Accounts are created there; this app adds
  // no roles of its own, so a person's department and reporting line mean
  // the same thing in both places.
  async function loadProfile(userId: string) {
    const { data } = await posDb
      .from("profiles")
      .select("id, email, role, store_id, department, is_dept_head, reports_to")
      .eq("id", userId)
      .single();
    await loadRoleTiers();
    const { data: acc } = await posDb.from("org_app_access").select("app, department");
    applyAppAccess((acc as { app: string; department: string }[]) || []);
    setProfile((data as Profile) || null);
    setLoading(false);
  }

  useEffect(() => {
    if (loading) return;

    // The session is shared across the subdomains and the POS owns the sign-in
    // screen, so send people there with a note of where they were headed.
    if (!session) {
      const back = encodeURIComponent(window.location.href);
      window.location.replace(`${APP_URL.pos}/login?next=${back}`);
      return;
    }

    // Signed in is not the same as allowed: a valid session says who someone
    // is, not that this app is any of their business.
    if (profile && !canAccess("report", profile)) {
      window.location.replace(`${APP_URL.pos}/no-access?app=report`);
    }
  }, [session, profile, loading, pathname, router]);

  async function signOut() {
    // This clears the shared cookie, so it signs the person out of every app
    // at once — which is what one sign-in ought to mean.
    await posDb.auth.signOut();
    setProfile(null);
    window.location.replace(`${APP_URL.pos}/login`);
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// Who may sign off a report is decided in the database, not here: org_roles
// carries a tier for every role, so a new role needs no code change. The
// arrays below are only what we fall back on before that table has loaded.
const TIER: Record<string, string> = {};

const FALLBACK_HEADS = [
  "sale_manager", "merchandising_manager", "warehouse_manager",
  "finance_manager", "marketing_manager", "hr_manager",
];
const FALLBACK_DIRECTORS = ["operation_director", "owner", "admin"];

export async function loadRoleTiers(): Promise<void> {
  const { data } = await posDb.from("org_roles").select("key, tier, active");
  const rows = (data as { key: string; tier: string; active: boolean }[]) || [];
  for (const r of rows) if (r.active) TIER[r.key] = r.tier;
}

export function isManagerTier(role?: string | null): boolean {
  if (!role) return false;
  const t = TIER[role];
  if (t) return t === "head" || t === "director";
  return FALLBACK_HEADS.includes(role) || FALLBACK_DIRECTORS.includes(role);
}

export function isDirector(role?: string | null): boolean {
  if (!role) return false;
  const t = TIER[role];
  if (t) return t === "director";
  return FALLBACK_DIRECTORS.includes(role);
}
