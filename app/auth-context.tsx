"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { posDb, type Profile } from "@/lib/supabase";

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
    setProfile((data as Profile) || null);
    setLoading(false);
  }

  useEffect(() => {
    if (loading) return;
    if (!session && pathname !== "/login") router.replace("/login");
  }, [session, loading, pathname, router]);

  async function signOut() {
    await posDb.auth.signOut();
    setProfile(null);
    router.replace("/login");
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

// Who may sign off a report: department heads and the tier above them.
export function isManagerTier(role?: string | null): boolean {
  return !!role && [
    "sale_manager", "merchandising_manager", "warehouse_manager",
    "finance_manager", "marketing_manager",
    "operation_director", "owner", "admin",
  ].includes(role);
}

export function isDirector(role?: string | null): boolean {
  return !!role && ["operation_director", "owner", "admin"].includes(role);
}
