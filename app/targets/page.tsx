"use client";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

type Row = {
  id: string; department: string; metric_key: string; scope: string | null;
  period: string | null; target_value: number | null; minimum_value: number | null;
  good_value: number | null; lower_is_better: boolean; effective_from: string; note: string | null;
};
type Dept = { code: string; name: string };

const PERIODS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];
const today = () => new Date().toISOString().slice(0, 10);

export default function TargetsPage() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [dept, setDept] = useState("");
  const [period, setPeriod] = useState("weekly");
  const [rows, setRows] = useState<Row[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [scope, setScope] = useState("");
  const [role, setRole] = useState("");
  const [myDept, setMyDept] = useState("");
  const [msg, setMsg] = useState("");
  const [history, setHistory] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState({ metric: "", minimum: "", target: "", good: "", lower: false, from: today() });

  const isDirector = ["operation_director", "owner", "admin", "om", "md"].includes(role);
  const canEdit = isDirector || (dept === myDept && /manager/i.test(role));

  useEffect(() => {
    supabase.from("departments").select("code, name").eq("active", true).order("name")
      .then(({ data }) => setDepts((data as Dept[]) || []));
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from("profiles").select("role, department").eq("id", data.user.id).maybeSingle();
      const pr = p as { role?: string; department?: string } | null;
      setRole(String(pr?.role || ""));
      setMyDept(String(pr?.department || ""));
      setDept(String(pr?.department || "marketing"));
    });
  }, []);

  async function load() {
    if (!dept) return;
    // Only what is in force today; the older rows stay as history.
    const { data } = await supabase
      .from("report_targets").select("*")
      .eq("department", dept).eq("period", period)
      .lte("effective_from", today())
      .order("metric_key").order("effective_from", { ascending: false });
    const all = (data as Row[]) || [];
    const seen = new Set<string>();
    const current = all.filter((r) => {
      const k = r.metric_key + "|" + (r.scope || "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    setRows(current);
    const sc = [...new Set(all.map((r) => r.scope || ""))].filter(Boolean);
    setScopes(sc);
    if (sc.length && !sc.includes(scope)) setScope(sc[0]);
    if (!sc.length) setScope("");
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dept, period]);

  const shown = scope ? rows.filter((r) => (r.scope || "") === scope) : rows;

  // A changed target is a new row, so last month's report still shows last month's target.
  async function saveNew(r: Row, patch: Partial<Row>) {
    setMsg("");
    const { error } = await supabase.from("report_targets").insert({
      department: r.department, form_id: r.form_id ?? null, metric_key: r.metric_key,
      scope: r.scope, period: r.period,
      target_value: patch.target_value ?? r.target_value,
      minimum_value: patch.minimum_value ?? r.minimum_value,
      good_value: patch.good_value ?? r.good_value,
      lower_is_better: patch.lower_is_better ?? r.lower_is_better,
      effective_from: today(),
    });
    if (error) setMsg(error.message);
    else { setMsg("သိမ်းပြီး — ဒီနေ့ကစပြီး သက်ရောက်မယ်"); load(); setTimeout(() => setMsg(""), 2500); }
  }

  const num = (v: string) => (v === "" ? null : Number(v));

  async function addRow() {
    setMsg("");
    if (!draft.metric.trim()) { setMsg("KPI နာမည် ထည့်ပါ"); return; }
    const { error } = await supabase.from("report_targets").insert({
      department: dept, metric_key: draft.metric.trim(), scope: scope || null, period,
      target_value: num(draft.target), minimum_value: num(draft.minimum), good_value: num(draft.good),
      lower_is_better: draft.lower, effective_from: draft.from || today(),
    });
    if (error) { setMsg(error.message); return; }
    setDraft({ metric: "", minimum: "", target: "", good: "", lower: false, from: today() });
    load();
  }

  async function showHistory(r: Row) {
    const { data } = await supabase
      .from("report_targets").select("*")
      .eq("department", r.department).eq("metric_key", r.metric_key)
      .eq("period", r.period || "")
      .order("effective_from", { ascending: false });
    setHistory((data as Row[]) || []);
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Targets</h1>
        <p className="text-sm text-slate-500">
          Report ထဲက Target အကွက်တွေက ဒီစာရင်းကနေ ဖြည့်တယ်။ ပြင်လိုက်ရင် ဒီနေ့ကစပြီး သက်ရောက်ပြီး အဟောင်းက သမိုင်းအဖြစ် ကျန်တယ်။
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select value={dept} onChange={(e) => setDept(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          disabled={!isDirector}>
          {depts.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
        </select>
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={"px-3 py-1.5 rounded-full border text-sm " + (p.key === period ? "bg-slate-900 text-white" : "bg-white")}>
            {p.label}
          </button>
        ))}
        {scopes.length > 0 && (
          <>
            <span className="w-px h-5 bg-slate-200 mx-1" />
            {scopes.map((sc) => (
              <button key={sc} onClick={() => setScope(sc)}
                className={"px-3 py-1.5 rounded-full border text-sm " + (sc === scope ? "bg-slate-900 text-white" : "bg-white")}>
                {sc}
              </button>
            ))}
          </>
        )}
      </div>

      {!canEdit && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          ကြည့်ရုံပဲ ရပါတယ် — ပြင်ခွင့်က အဲ့ department ရဲ့ manager မှာ။
        </div>
      )}
      {msg && <div className="text-sm text-slate-600">{msg}</div>}

      <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 px-3">KPI</th>
              <th className="py-2 px-3 w-28">Minimum</th>
              <th className="py-2 px-3 w-28">Target</th>
              <th className="py-2 px-3 w-28">Good</th>
              <th className="py-2 px-3 w-20">နည်းလေကောင်း</th>
              <th className="py-2 px-3 w-28">စတင်ရက်</th>
              <th className="py-2 px-3 w-16" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td className="py-3 px-3 text-slate-400" colSpan={7}>Target မရှိသေးပါ။</td></tr>
            )}
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 px-3">{r.metric_key}</td>
                {(["minimum_value", "target_value", "good_value"] as const).map((k) => (
                  <td key={k} className="py-2 px-3">
                    <input type="number" step="any" disabled={!canEdit} defaultValue={r[k] ?? ""}
                      onBlur={(e) => {
                        const v = num(e.target.value);
                        if (v !== r[k]) saveNew(r, { [k]: v } as Partial<Row>);
                      }}
                      className="w-24 border border-slate-200 rounded-lg px-2 py-1 disabled:bg-slate-50" />
                  </td>
                ))}
                <td className="py-2 px-3">
                  <input type="checkbox" disabled={!canEdit} checked={r.lower_is_better}
                    onChange={(e) => saveNew(r, { lower_is_better: e.target.checked })} />
                </td>
                <td className="py-2 px-3 text-slate-500">{r.effective_from}</td>
                <td className="py-2 px-3">
                  <button onClick={() => showHistory(r)} className="text-blue-600 text-xs">သမိုင်း</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="border border-slate-200 rounded-xl p-3 bg-white flex flex-wrap items-end gap-2">
          <div>
            <div className="text-xs text-slate-500">KPI</div>
            <input value={draft.metric} onChange={(e) => setDraft({ ...draft, metric: e.target.value })}
              placeholder="ဥပမာ Views" className="border border-slate-200 rounded-lg px-2 py-1 w-44" />
          </div>
          {(["minimum", "target", "good"] as const).map((k) => (
            <div key={k}>
              <div className="text-xs text-slate-500 capitalize">{k}</div>
              <input type="number" step="any" value={draft[k]}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                className="border border-slate-200 rounded-lg px-2 py-1 w-24" />
            </div>
          ))}
          <div>
            <div className="text-xs text-slate-500">စတင်ရက်</div>
            <input type="date" value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              className="border border-slate-200 rounded-lg px-2 py-1" />
          </div>
          <label className="text-xs text-slate-500 flex items-center gap-1">
            <input type="checkbox" checked={draft.lower}
              onChange={(e) => setDraft({ ...draft, lower: e.target.checked })} />
            နည်းလေကောင်း
          </label>
          <button onClick={addRow} className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm">
            KPI ထည့်
          </button>
        </div>
      )}

      {history && (
        <div className="border border-slate-200 rounded-xl p-3 bg-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium text-sm">သမိုင်း — {history[0]?.metric_key}</h2>
            <button onClick={() => setHistory(null)} className="text-xs text-slate-500">ပိတ်</button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-1">စတင်ရက်</th><th>Minimum</th><th>Target</th><th>Good</th><th>Scope</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1">{h.effective_from}</td>
                  <td>{h.minimum_value ?? "—"}</td>
                  <td>{h.target_value ?? "—"}</td>
                  <td>{h.good_value ?? "—"}</td>
                  <td>{h.scope || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
