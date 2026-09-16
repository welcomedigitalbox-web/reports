"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, isManagerTier, isDirector } from "../auth-context";

type T = {
  id: string; department: string; form_id: string | null; metric_key: string;
  scope: string | null; period: string; target_value: number;
  effective_from: string; note: string | null; set_by: string | null;
};
type Form = { id: string; name: string; department: string };

const PERIODS = ["day", "week", "month"];
const SUGGEST: Record<string, string[]> = {
  marketing: ["Reach", "Impressions", "Engagement Rate %", "Page Followers Growth", "Ads Spend", "Ads Messages", "Cost per Message"],
  sale: ["daily_target", "invoice_count", "conversion_rate", "avg_invoice"],
  merchandising: ["po_confirmed", "purchase_value"],
  warehouse: ["picking_error", "packing_error", "dispatch_on_time"],
  finance: ["cash_difference"],
  office: ["attendance_pct"],
};

export default function TargetsPage() {
  const { profile, loading } = useAuth();
  const [rows, setRows] = useState<T[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({
    metric_key: "", target_value: "", period: "week", scope: "", form_id: "",
    effective_from: new Date().toISOString().slice(0, 10), note: "",
  });

  const dept = isDirector(profile?.role) ? "" : String(profile?.department || "");
  const [pickDept, setPickDept] = useState("");
  const activeDept = dept || pickDept;

  useEffect(() => { if (profile) load(); }, [profile?.id, activeDept]); // eslint-disable-line

  async function load() {
    const q = supabase.from("report_targets").select("*")
      .order("department").order("metric_key").order("effective_from", { ascending: false });
    const { data } = activeDept ? await q.eq("department", activeDept) : await q;
    setRows((data as T[]) || []);
    const { data: fm } = await supabase.from("report_forms").select("id,name,department").eq("active", true);
    setForms((fm as Form[]) || []);
  }

  async function add() {
    if (!f.metric_key.trim() || f.target_value === "") { setMsg("KPI နဲ့ Target ဖြည့်ပါ"); return; }
    if (!activeDept) { setMsg("ဌာန ရွေးပါ"); return; }
    setBusy(true); setMsg("");
    const { error } = await supabase.from("report_targets").insert({
      department: activeDept, metric_key: f.metric_key.trim(),
      target_value: Number(f.target_value), period: f.period,
      scope: f.scope.trim() || null, form_id: f.form_id || null,
      effective_from: f.effective_from, note: f.note.trim() || null,
      set_by: profile?.email,
    });
    setBusy(false);
    if (error) { setMsg(error.message.includes("duplicate") ? "ဒီ KPI အတွက် ဒီရက်မှာ target ရှိပြီးသားပါ" : error.message); return; }
    setF({ ...f, metric_key: "", target_value: "", scope: "", note: "" });
    load();
  }

  async function remove(id: string) {
    if (!confirm("ဖျက်မလား")) return;
    await supabase.from("report_targets").delete().eq("id", id);
    load();
  }

  if (loading) return null;
  if (!profile || !(isManagerTier(profile.role) || isDirector(profile.role)))
    return <div className="pt-16 text-center text-sm text-slate-400">Manager only</div>;

  const inp = "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white w-full";
  const deptForms = forms.filter((x) => x.department === activeDept);
  const sugg = SUGGEST[activeDept] || [];

  return (
    <div className="max-w-4xl mx-auto pt-6">
      <h1 className="text-xl font-semibold mb-1">KPI Target</h1>
      <p className="text-sm text-slate-500 mb-5">
        ဒီမှာ သတ်မှတ်ထားတဲ့ target က report form မှာ အလိုအလျောက် ပေါ်ပါမယ်
      </p>

      {isDirector(profile.role) && (
        <select value={pickDept} onChange={(e) => setPickDept(e.target.value)} className={inp + " mb-4 max-w-xs"}>
          <option value="">ဌာန ရွေးပါ</option>
          {["sale", "merchandising", "marketing", "finance", "warehouse", "office"].map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-500">KPI</label>
            <input list="kpis" value={f.metric_key} onChange={(e) => setF({ ...f, metric_key: e.target.value })}
              placeholder="ဥပမာ Reach" className={inp} />
            <datalist id="kpis">{sugg.map((k) => <option key={k} value={k} />)}</datalist>
          </div>
          <div>
            <label className="text-xs text-slate-500">Target</label>
            <input type="number" value={f.target_value} onChange={(e) => setF({ ...f, target_value: e.target.value })} className={inp} />
          </div>
          <div>
            <label className="text-xs text-slate-500">ကာလ</label>
            <select value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} className={inp}>
              {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">ဆိုင် / Channel (မလိုရင် ချန်ထား)</label>
            <input value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} placeholder="BAK" className={inp} />
          </div>
          <div>
            <label className="text-xs text-slate-500">Form (မလိုရင် ချန်ထား)</label>
            <select value={f.form_id} onChange={(e) => setF({ ...f, form_id: e.target.value })} className={inp}>
              <option value="">အားလုံး</option>
              {deptForms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">စတင်သည့်ရက်</label>
            <input type="date" value={f.effective_from} onChange={(e) => setF({ ...f, effective_from: e.target.value })} className={inp} />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="မှတ်ချက် (optional)" className={inp} />
          <button onClick={add} disabled={busy}
            className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm shrink-0 disabled:opacity-50">ထည့်မည်</button>
        </div>
        {msg && <p className="text-sm text-red-600 mt-2">{msg}</p>}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium truncate">
                {r.metric_key}
                {r.scope && <span className="text-slate-400"> · {r.scope}</span>}
              </div>
              <div className="text-xs text-slate-400">
                {r.department} · {r.period} · {r.effective_from} မှစ
                {r.note && ` · ${r.note}`}
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <span className="font-semibold">{Number(r.target_value).toLocaleString()}</span>
              <button onClick={() => remove(r.id)} className="text-slate-300 hover:text-red-600">✕</button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">Target မသတ်မှတ်ရသေးပါ</p>}
      </div>
    </div>
  );
}
