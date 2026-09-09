"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import {
  supabase, STATUS_TONE,
  type ReportForm, type Submission,
} from "@/lib/supabase";
import { useAuth, isDirector } from "./auth-context";

const today = () => new Date().toISOString().slice(0, 10);

export default function HomePage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const [forms, setForms] = useState<ReportForm[]>([]);
  const [mine, setMine] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function load() {
    setLoading(true);

    // Your department's forms, unless you are a director - they answer for
    // all of them and file none.
    const q = supabase.from("forms").select("*").eq("active", true).order("sort_order");
    const { data: f } = isDirector(profile?.role) || !profile?.department
      ? await q
      : await q.eq("department", profile.department);

    const { data: s } = await supabase
      .from("submissions")
      .select("*")
      .eq("created_by", profile!.email)
      .order("report_date", { ascending: false })
      .limit(30);

    setForms((f as ReportForm[]) || []);
    setMine((s as Submission[]) || []);
    setLoading(false);
  }

  // Today's report for a form, if it has been started.
  const todays = useMemo(() => {
    const map = new Map<string, Submission>();
    for (const s of mine) if (s.report_date === today()) map.set(s.form_id, s);
    return map;
  }, [mine]);

  async function openForm(form: ReportForm) {
    const existing = todays.get(form.id);
    if (existing) return router.push(`/report/${existing.id}`);

    setBusy(form.id);
    setError("");
    try {
      // The store is the one this account works from. A head covering
      // several files against none of them in particular.
      const { data, error: err } = await supabase
        .from("submissions")
        .insert({
          form_id: form.id,
          store_id: profile?.store_id || null,
          report_date: today(),
          created_by: profile!.email,
          answers: {},
        })
        .select()
        .single();

      if (err) throw err;
      router.push(`/report/${(data as Submission).id}`);
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e);
      // The unique index does the work of "one per day" - if someone else
      // in the department already opened it, say so rather than failing.
      setError(msg.includes("duplicate") ? "Someone has already started today's report" : msg);
      setBusy(null);
    }
  }

  if (authLoading || loading) {
    return <div className="pt-16 text-center text-sm text-slate-400">…</div>;
  }

  if (!profile) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold mb-1">Today</h1>
      <p className="text-sm text-slate-500 mb-6">{today()}</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3 mb-10">
        {forms.map((f) => {
          const started = todays.get(f.id);
          return (
            <button
              key={f.id}
              onClick={() => openForm(f)}
              disabled={busy === f.id}
              className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-300 transition disabled:opacity-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">{f.name}</div>
                  {f.name_mm && (
                    <div className="text-xs text-slate-500 mt-0.5">{f.name_mm}</div>
                  )}
                </div>
                {started ? (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${STATUS_TONE[started.status]}`}>
                    {started.status.replace("_", " ")}
                  </span>
                ) : (
                  <Plus size={16} className="text-slate-400 shrink-0 mt-0.5" />
                )}
              </div>
            </button>
          );
        })}
        {forms.length === 0 && (
          <p className="text-sm text-slate-400 col-span-2 py-8 text-center border border-slate-200 rounded-xl">
            No forms for your department yet
          </p>
        )}
      </div>

      <h2 className="font-semibold mb-3">Recent</h2>
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {mine.map((s) => {
          const form = forms.find((f) => f.id === s.form_id);
          return (
            <button
              key={s.id}
              onClick={() => router.push(`/report/${s.id}`)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText size={16} className="text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm truncate">{form?.name || s.form_id}</div>
                  <div className="text-xs text-slate-400">
                    {s.report_date}
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
        {mine.length === 0 && (
          <p className="text-sm text-slate-400 py-8 text-center">Nothing filed yet</p>
        )}
      </div>
    </div>
  );
}
