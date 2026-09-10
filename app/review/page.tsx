"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import {
  supabase, STATUS_TONE,
  type ReportForm, type Submission, type SubmissionStatus,
} from "@/lib/supabase";
import { useAuth, isManagerTier, isDirector } from "../auth-context";

const TABS: { key: SubmissionStatus | "all"; label: string }[] = [
  { key: "submitted", label: "Waiting" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Sent back" },
  { key: "all", label: "All" },
];

export default function ReviewPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const [rows, setRows] = useState<Submission[]>([]);
  const [forms, setForms] = useState<ReportForm[]>([]);
  const [tab, setTab] = useState<SubmissionStatus | "all">("submitted");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function load() {
    setLoading(true);
    // RLS already limits this to the department and stores this account
    // answers for, so the query asks for everything it can see.
    const [{ data: s }, { data: f }] = await Promise.all([
      supabase.from("report_submissions").select("*")
        .not("status", "in", "(draft,archived)")
        .order("report_date", { ascending: false }).limit(200),
      supabase.from("report_forms").select("*"),
    ]);
    setRows((s as Submission[]) || []);
    setForms((f as ReportForm[]) || []);
    setLoading(false);
  }

  const [hasReports, setHasReports] = useState(false);
  useEffect(() => {
    if (!profile?.id) return;
    supabase.rpc("my_direct_report_count")
      .then(({ data }) => setHasReports(Number(data || 0) > 0));
  }, [profile?.id]);
  const [mgrEmails, setMgrEmails] = useState<Set<string>>(new Set());
  useEffect(() => {
    supabase.from("profiles").select("email, role").then(({ data }) => {
      setMgrEmails(new Set(
        ((data as { email: string; role: string }[]) || [])
          .filter((p) => isManagerTier(p.role))
          .map((p) => p.email)
      ));
    });
  }, []);

  const officeForms = useMemo(
    () => new Set(forms.filter((f) => String(f.department) === "office").map((f) => f.id)),
    [forms]
  );

  // A request is a decision too, so it sits with the waiting pile rather
  // than in a queue of its own that nobody opens.
  const visible = useMemo(() => {
    const seen = isDirector(profile?.role)
      ? rows.filter((r) => r.status !== "submitted" || mgrEmails.has(String(r.created_by)) || officeForms.has(r.form_id))
      : rows;
    if (tab === "all") return seen;
    if (tab === "submitted") {
      return seen.filter((r) =>
        ["submitted", "cancel_requested", "edit_requested"].includes(r.status)
      );
    }
    return seen.filter((r) => r.status === tab);
  }, [rows, tab, profile?.role, mgrEmails, officeForms]);

  const counts = useMemo(() => {
    const rows2 = isDirector(profile?.role)
      ? rows.filter((r) => r.status !== "submitted" || mgrEmails.has(String(r.created_by)) || officeForms.has(r.form_id))
      : rows;
    const waiting = rows2.filter((r) =>
      ["submitted", "cancel_requested", "edit_requested"].includes(r.status)
    ).length;
    return {
      submitted: waiting,
      approved: rows2.filter((r) => r.status === "approved").length,
      rejected: rows2.filter((r) => r.status === "rejected").length,
      all: rows2.length,
    } as Record<string, number>;
  }, [rows, profile?.role, mgrEmails, officeForms]);

  if (authLoading || loading) {
    return <div className="pt-16 text-center text-sm text-slate-400">…</div>;
  }
  if (!profile || !(isManagerTier(profile.role) || isDirector(profile.role) || hasReports)) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold mb-1">Review</h1>
      <p className="text-sm text-slate-500 mb-6">
        What your department has filed
      </p>

      <div className="flex gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              tab === t.key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className="ml-1 text-xs">({counts[t.key]})</span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {visible.map((s) => {
          const form = forms.find((f) => f.id === s.form_id);
          return (
            <button
              key={s.id}
              onClick={() => router.push(`/report/${s.id}`)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText size={16} className="text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm truncate">{form?.name || s.form_id}</div>
                  <div className="text-xs text-slate-400">
                    {s.report_date} · {s.created_by}
                    {s.store_id && ` · ${s.store_id}`}
                  </div>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${STATUS_TONE[s.status]}`}>
                {s.status.replace("_", " ")}
              </span>
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="text-sm text-slate-400 py-12 text-center">Nothing here</p>
        )}
      </div>
    </div>
  );
}
