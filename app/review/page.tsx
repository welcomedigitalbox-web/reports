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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [who, setWho] = useState("");
  const [dept, setDept] = useState("");
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

  const formDept = useMemo(
    () => new Map(forms.map((f) => [f.id, String(f.department || "")])),
    [forms]
  );

  const depts = useMemo(() => {
    const set = new Set(forms.map((f) => String(f.department || "")).filter(Boolean));
    return Array.from(set).sort();
  }, [forms]);

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
    let out = seen;
    if (tab === "submitted") {
      out = out.filter((r) =>
        ["submitted", "cancel_requested", "edit_requested"].includes(r.status)
      );
    } else if (tab !== "all") {
      out = out.filter((r) => r.status === tab);
    }
    if (from) out = out.filter((r) => String(r.report_date) >= from);
    if (to) out = out.filter((r) => String(r.report_date) <= to);
    if (who) out = out.filter((r) => String(r.created_by) === who);
    if (dept) out = out.filter((r) => String(formDept.get(r.form_id) || "") === dept);
    return out;
  }, [rows, tab, profile?.role, mgrEmails, officeForms, from, to, who, dept, formDept]);

  const people = useMemo(() => {
    const set = new Set(rows.map((r) => String(r.created_by)).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input type="date" value={from} max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={to} min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white" />
        <select value={dept} onChange={(e) => setDept(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white capitalize">
          <option value="">department</option>
          {depts.map((d2) => (
            <option key={d2} value={d2}>{d2}</option>
          ))}
        </select>
        <select value={who} onChange={(e) => setWho(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">အားစုး</option>
          {people.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        {(from || to || who || dept) && (
          <button onClick={() => { setFrom(""); setTo(""); setWho(""); setDept(""); }}
            className="text-xs text-blue-600 px-2 py-1.5">clear</button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{visible.length}</span>
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
