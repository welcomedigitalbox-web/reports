"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  supabase, type ReportForm, type Submission, type FormSection, type FormField,
} from "@/lib/supabase";
import { useAuth, isDirector, isManagerTier } from "../../auth-context";

type P = { id: string; email: string; role: string; store_id: string | null; is_dept_head: boolean };
const EMPTY = new Set(["", "-", "nothing", "no plan", "none", "no", "n/a", "na", "nil"]);
const NUM = new Set(["number", "money"]);
const TXT = new Set(["text", "textarea"]);
const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
const TONE: Record<string, string> = {
  submitted: "bg-amber-50 text-amber-700", approved: "bg-blue-50 text-blue-700",
  acknowledged: "bg-green-50 text-green-700", rejected: "bg-red-50 text-red-700",
  edit_requested: "bg-amber-50 text-amber-700", cancel_requested: "bg-amber-50 text-amber-700",
};

export default function DeptPage() {
  const { name } = useParams<{ name: string }>();
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [forms, setForms] = useState<ReportForm[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [people, setPeople] = useState<P[]>([]);
  const [struct, setStruct] = useState<Record<string, FormSection[]>>({});
  const [stores, setStores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (profile) load(); /* eslint-disable-next-line */ }, [profile?.id, date, name]);

  async function load() {
    setLoading(true);
    const { data: f } = await supabase.from("report_forms").select("*").eq("department", name);
    const fs = (f as ReportForm[]) || [];
    const ids = fs.map((x) => x.id);
    const [{ data: s }, { data: p }, { data: st }, { data: sec }] = await Promise.all([
      ids.length
        ? supabase.from("report_submissions").select("*").in("form_id", ids)
            .eq("report_date", date).not("status", "in", "(draft,archived)")
        : Promise.resolve({ data: [] }),
      supabase.from("profiles").select("id,email,role,store_id,is_dept_head").eq("department", name),
      supabase.from("stores").select("id,name"),
      ids.length ? supabase.from("report_sections").select("*").in("form_id", ids) : Promise.resolve({ data: [] }),
    ]);
    const secs = (sec as FormSection[]) || [];
    const { data: fl } = secs.length
      ? await supabase.from("report_fields").select("*").in("section_id", secs.map((x) => x.id)).order("sort_order")
      : { data: [] };
    const bySec = new Map<string, FormField[]>();
    for (const x of (fl as FormField[]) || []) bySec.set(x.section_id, [...(bySec.get(x.section_id) || []), x]);
    const map: Record<string, FormSection[]> = {};
    for (const x of secs.sort((a, b) => a.sort_order - b.sort_order))
      (map[x.form_id] ||= []).push({ ...x, fields: bySec.get(x.id) || [] });

    setForms(fs); setSubs((s as Submission[]) || []); setPeople((p as P[]) || []);
    setStruct(map);
    setStores(Object.fromEntries(((st as { id: string; name: string }[]) || []).map((x) => [x.id, x.name])));
    setLoading(false);
  }

  const isCons = (fid: string) => /consolidat/i.test(forms.find((f) => f.id === fid)?.name || "");
  const isHead = (fid: string) => {
    const f = forms.find((x) => x.id === fid);
    return isCons(fid) || /manager/i.test(String(f?.filled_by || ""));
  };
  const staffSubs = subs.filter((s) => !isCons(s.form_id));
  const consSubs = subs.filter((s) => isCons(s.form_id));
  const who = (s: Submission) => (s.store_id && stores[s.store_id]) || s.created_by.split("@")[0];

  const summary = useMemo(() => {
    const nums = new Map<string, { label: string; total: number }>();
    const texts = new Map<string, { label: string; items: { who: string; text: string }[] }>();
    for (const s of staffSubs) {
      const a = (s.answers || {}) as Record<string, unknown>;
      for (const sec of struct[s.form_id] || []) {
        const rows: Record<string, unknown>[] = sec.is_table
          ? ((a[sec.id] ?? a[sec.title]) as Record<string, unknown>[]) || []
          : [a];
        for (const r of Array.isArray(rows) ? rows : []) {
          for (const fd of sec.fields) {
            const v = r?.[fd.key] ?? r?.[fd.id];
            if (NUM.has(fd.field_type)) {
              const n = Number(v);
              if (v === "" || v == null || isNaN(n)) continue;
              const e = nums.get(fd.key) || { label: fd.label, total: 0 };
              e.total += n; nums.set(fd.key, e);
            } else if (TXT.has(fd.field_type)) {
              const t = String(v ?? "").trim();
              if (EMPTY.has(t.toLowerCase())) continue;
              const e = texts.get(fd.key) || { label: fd.label, items: [] };
              e.items.push({ who: who(s), text: t }); texts.set(fd.key, e);
            }
          }
        }
      }
    }
    const tgt = nums.get("daily_target")?.total, act = nums.get("actual_sale")?.total;
    return { nums: [...nums.values()], texts: [...texts.values()], pct: tgt ? (act || 0) / tgt * 100 : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs, struct, stores, forms]);

  const filers = people.filter((p) => !p.is_dept_head && !isManagerTier(p.role));
  const filedBy = new Set(staffSubs.map((s) => s.created_by));
  const notFiled = filers.filter((p) => !filedBy.has(p.email));

  if (authLoading || loading) return <div className="pt-16 text-center text-sm text-slate-400">…</div>;
  if (!profile || !isDirector(profile.role)) return null;

  return (
    <div className="max-w-4xl mx-auto pt-6">
      <button onClick={() => router.push("/dashboard")} className="text-sm text-blue-600 mb-4">← Dashboard</button>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold capitalize">{name} · Daily Summary</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
        <div className="flex flex-wrap gap-2 text-xs mb-4">
          <span className="px-2 py-1 rounded bg-slate-100">Filed {filers.length - notFiled.length}/{filers.length}</span>
          {notFiled.length > 0 && (
            <span className="px-2 py-1 rounded bg-amber-50 text-amber-700">
              Not filed: {notFiled.map((p) => (p.store_id && stores[p.store_id]) || p.email.split("@")[0]).join(" · ")}
            </span>
          )}
        </div>
        {summary.pct !== null && (
          <div className="text-3xl font-semibold mb-1">
            <span className={summary.pct < 80 ? "text-red-600" : "text-green-700"}>{fmt(summary.pct)}%</span>
            <span className="text-sm text-slate-500 font-normal ml-2">of target</span>
          </div>
        )}
        {summary.nums.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            {summary.nums.map((n) => (
              <div key={n.label} className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">{n.label}</div>
                <div className="font-semibold">{fmt(n.total)}</div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-slate-400">No figures filed yet.</p>}
        {summary.texts.map((t) => (
          <div key={t.label} className="mt-4">
            <div className="text-xs font-medium text-slate-500 mb-1">{t.label}</div>
            <ul className="space-y-1 text-sm">
              {t.items.map((i, k) => (
                <li key={k}><span className="text-slate-400 mr-2">{i.who}</span>{i.text}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {[...subs.filter((x) => isHead(x.form_id)), ...subs.filter((x) => !isHead(x.form_id))].map((s) => (
          <button key={s.id} onClick={() => router.push(`/report/${s.id}`)}
            className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 ${isHead(s.form_id) ? "bg-slate-50" : ""}`}>
            <div className={isHead(s.form_id) ? "" : "pl-4 border-l-2 border-slate-100"}>
              <div className="text-sm font-medium">{who(s)}</div>
              <div className="text-xs text-slate-400">{forms.find((f) => f.id === s.form_id)?.name}</div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded ${TONE[s.status] || "bg-slate-100"}`}>{s.status}</span>
          </button>
        ))}
        {subs.length === 0 && <div className="px-4 py-6 text-sm text-slate-400 text-center">Nothing filed for this day.</div>}
      </div>
    </div>
  );
}
