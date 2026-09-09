"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertTriangle } from "lucide-react";
import {
  supabase, STATUS_TONE,
  type ReportForm, type Submission, type Department,
} from "@/lib/supabase";
import { useAuth, isDirector } from "../auth-context";

const DEPT_ORDER: Department[] = [
  "sale", "merchandising", "warehouse", "finance", "marketing",
];

export default function DashboardPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const [rows, setRows] = useState<Submission[]>([]);
  const [forms, setForms] = useState<ReportForm[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  // Eight departments open at once is a wall. The one that needs the
  // owner - anything still waiting - opens itself; the rest fold away.
  const [openDept, setOpenDept] = useState<string | null>(null);
  // Which departments have not reported is worth knowing and not worth a
  // paragraph across the top of the screen every morning.
  const [showMissing, setShowMissing] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, date]);

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: f }] = await Promise.all([
      supabase.from("report_submissions").select("*")
        .eq("report_date", date)
        .in("status", ["approved", "acknowledged"])
        .order("form_id"),
      supabase.from("report_forms").select("*").order("sort_order"),
    ]);
    setRows((s as Submission[]) || []);
    setForms((f as ReportForm[]) || []);
    setPicked([]);
    setLoading(false);
  }

  // Grouped by department, because that is the unit the owner reads in:
  // "has warehouse reported today", not "how many reports arrived".
  const byDept = useMemo(() => {
    const formDept = new Map(forms.map((f) => [f.id, f.department]));
    const map = new Map<string, { form: ReportForm | undefined; sub: Submission }[]>();

    for (const s of rows) {
      const d = formDept.get(s.form_id) || "other";
      map.set(d, [...(map.get(d) || []), { form: forms.find((f) => f.id === s.form_id), sub: s }]);
    }

    const out: [string, { form: ReportForm | undefined; sub: Submission }[]][] = [];
    for (const d of DEPT_ORDER) if (map.has(d)) out.push([d, map.get(d)!]);
    for (const [k, v] of map) if (!DEPT_ORDER.includes(k as Department)) out.push([k, v]);
    return out;
  }, [rows, forms]);

  // Only approved reports can be acknowledged; the rest are still moving.
  const acknowledgeable = useMemo(
    () => rows.filter((r) => r.status === "approved").map((r) => r.id),
    [rows]
  );

  // A form with no submission today is the thing worth noticing.
  const missing = useMemo(() => {
    const filed = new Set(rows.map((r) => r.form_id));
    return forms.filter((f) => f.active && !filed.has(f.id));
  }, [rows, forms]);

  async function acknowledge(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("report_acknowledge", { p_ids: ids });
      if (error) throw error;
      setToast(`Marked ${ids.length} done`);
      setTimeout(() => setToast(""), 3000);
      await load();
    } catch (e) {
      setToast("❌ " + ((e as { message?: string })?.message || String(e)));
      setTimeout(() => setToast(""), 4000);
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loading) {
    return <div className="pt-16 text-center text-sm text-slate-400">…</div>;
  }
  if (!profile || !isDirector(profile.role)) return null;

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {rows.length} filed · {acknowledgeable.length} waiting on you
          </p>
        </div>
        <input
          type="date"
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {missing.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4">
          <button
            onClick={() => setShowMissing(!showMissing)}
            className="flex items-center gap-2 text-sm font-medium text-amber-800 w-full text-left"
          >
            <AlertTriangle size={15} />
            Not filed yet ({missing.length})
            <span className="ml-auto text-xs font-normal">
              {showMissing ? "hide" : "show"}
            </span>
          </button>
          {showMissing && (
            <p className="text-xs text-amber-700 mt-2">
              {missing.map((f) => f.name).join(" · ")}
            </p>
          )}
        </div>
      )}

      {byDept.map(([dept, list]) => (
        <section key={dept} className="mb-3">
          <button
            onClick={() => setOpenDept(openDept === dept ? null : dept)}
            className="w-full flex items-center gap-2 px-1 py-2 text-left"
          >
            <span className="text-slate-400 w-3">
              {openDept === dept ? "\u2212" : "+"}
            </span>
            <span className="text-sm font-medium capitalize">{dept}</span>
            <span className="text-xs text-slate-400">({list.length})</span>
            {list.some((x) => x.sub.status === "approved") && (
              <span className="ml-auto text-xs text-blue-600 font-medium">
                {list.filter((x) => x.sub.status === "approved").length} to sign
              </span>
            )}
          </button>
          <div className={`bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 ${
            openDept === dept ? "" : "hidden"
          }`}>
            {list.map(({ form, sub }) => (
              <div key={sub.id} className="flex items-center gap-3 px-4 py-3">
                {sub.status === "approved" && (
                  <input
                    type="checkbox"
                    checked={picked.includes(sub.id)}
                    onChange={() =>
                      setPicked(
                        picked.includes(sub.id)
                          ? picked.filter((x) => x !== sub.id)
                          : [...picked, sub.id]
                      )
                    }
                  />
                )}
                <button
                  onClick={() => router.push(`/report/${sub.id}`)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="text-sm truncate">{form?.name || sub.form_id}</div>
                  <div className="text-xs text-slate-400">
                    {sub.created_by}
                    {sub.store_id && ` · ${sub.store_id}`}
                    {sub.approved_by && ` · approved by ${sub.approved_by}`}
                  </div>
                </button>
                {sub.overall_status && sub.overall_status !== "normal" && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                    sub.overall_status === "critical"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {sub.overall_status}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${STATUS_TONE[sub.status]}`}>
                  {sub.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      {rows.length === 0 && (
        <p className="text-sm text-slate-400 py-16 text-center border border-slate-200 rounded-xl">
          Nothing filed for {date}
        </p>
      )}

      {acknowledgeable.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 px-4 sm:px-6 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <button
              onClick={() =>
                setPicked(picked.length === acknowledgeable.length ? [] : acknowledgeable)
              }
              className="text-sm text-blue-600 font-medium"
            >
              {picked.length === acknowledgeable.length ? "Clear" : "Select all"}
            </button>
            <button
              onClick={() => acknowledge(picked.length ? picked : acknowledgeable)}
              disabled={busy}
              className="px-5 py-2 bg-green-600 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5"
            >
              <Check size={15} />
              Done ({picked.length || acknowledgeable.length})
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
