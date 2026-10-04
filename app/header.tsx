"use client";

import { APP_URL } from "@/lib/apps";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, isManagerTier, isDirector } from "./auth-context";
import { useEffect as useEffectHR, useState as useStateHR } from "react";
import { supabase as sbHR } from "@/lib/supabase";

export default function Header() {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const [hasReports, setHasReports] = useStateHR(false);
  // Directors file nothing by default — unless a form is addressed to them by
  // name or role, like the operations report the owner signs off.
  const [filesOwn, setFilesOwn] = useStateHR(false);
  // How many issues other departments have left for this person, unanswered.
  const [openIssues, setOpenIssues] = useStateHR(0);
  useEffectHR(() => {
    if (!profile?.id) return;
    sbHR.rpc("my_direct_report_count").then(({ data }) => setHasReports(Number(data || 0) > 0));
    if (isDirector(profile.role)) {
      sbHR.from("report_forms").select("*").eq("active", true).then(({ data }) => {
        const mine = ((data as { allowed_emails?: string[] | null }[]) || [])
          .some((f) => (f.allowed_emails || []).includes(profile.email));
        setFilesOwn(mine);
      });
    }
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-read on every page change: the count is stale the moment someone marks
  // one done, and a badge that lies is worse than no badge.
  useEffectHR(() => {
    if (!profile?.id) return;
    sbHR.rpc("my_open_issue_count").then(({ data }) => setOpenIssues(Number(data || 0)));
  }, [profile?.id, pathname]);

  if (!profile || pathname === "/login") return null;

  // Three audiences, three doors. Everyone files; heads review what their
  // department filed; the owner reads what the heads have signed.
  const tabs = [
    ...(isDirector(profile.role) && !filesOwn ? [] : [{ href: "/", label: "My Reports" }]),
    ...(isManagerTier(profile.role) || hasReports ? [{ href: "/review", label: "Review" }] : []),
        ...(isManagerTier(profile.role) || isDirector(profile.role) ? [{ href: "/targets", label: "Target" }] : []),
    ...(isDirector(profile.role) ? [{ href: "/dashboard", label: "Dashboard" }, { href: "/ask", label: "Ask AI" }] : []),
    ...(profile.email === "admin@edu.com" ? [{ href: "/usage", label: "AI Usage" }] : []),
    ...(isDirector(profile.role) || profile.email === "itadmin@edu.com"
      ? [{ href: "/filing", label: "Filing" }] : []),
    { href: "/issues", label: "Issues" },
  ];

  return (
    <header className="bg-white border-b border-slate-200 mb-6">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href={APP_URL.pos}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            &larr; Return to Home
          </a>
          <div className="font-semibold">Daily Reports</div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500 hidden sm:inline">
            {profile.email} {profile.department && `· ${profile.department}`}
          </span>
          <button
            onClick={signOut}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium"
          >
            Logout
          </button>
        </div>
      </div>

      <nav className="px-4 sm:px-6 flex gap-1">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              pathname === t.href
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {t.label}
              {t.href === "/issues" && (
                // Shown even at nought: "0" is an answer, a missing badge is
                // only ever a question about whether it loaded.
                <span
                  className={
                    "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold leading-none " +
                    (openIssues > 0 ? "bg-red-600 text-white" : "bg-slate-200 text-slate-500")
                  }
                >
                  {openIssues > 99 ? "99+" : openIssues}
                </span>
              )}
            </span>
          </Link>
        ))}
      </nav>
    </header>
  );
}
