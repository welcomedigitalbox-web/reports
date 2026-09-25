"use client";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

type Row = {
  id: string; platform: string; period: string; kpi: string;
  minimum: number | null; target: number | null; good: number | null;
  lower_is_better: boolean;
};

const PLATFORMS = ["Facebook", "TikTok"];
const PERIODS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

export default function TargetsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [platform, setPlatform] = useState("Facebook");
  const [period, setPeriod] = useState("daily");
  const [msg, setMsg] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("mkt_kpi_targets").select("*")
      .eq("platform", platform).eq("period", period).order("kpi");
    setRows((data as Row[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [platform, period]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      const role = String((p as { role?: string } | null)?.role || "");
      setCanEdit(["marketing_manager", "operation_director", "owner", "admin", "om"].includes(role));
    });
  }, []);

  async function save(r: Row, patch: Partial<Row>) {
    setMsg("");
    const { error } = await supabase.from("mkt_kpi_targets").update(patch).eq("id", r.id);
    if (error) setMsg(error.message);
    else {
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
      setMsg("သိမ်းပြီး");
      setTimeout(() => setMsg(""), 1500);
    }
  }

  const num = (v: string) => (v === "" ? null : Number(v));

  const [draft, setDraft] = useState({ kpi: "", minimum: "", target: "", good: "", lower: false });
  async function addRow() {
    setMsg("");
    if (!draft.kpi.trim()) { setMsg("KPI နာမည် ထည့်ပါ"); return; }
    const { error } = await supabase.from("mkt_kpi_targets").insert({
      platform, period, kpi: draft.kpi.trim(),
      minimum: num(draft.minimum), target: num(draft.target), good: num(draft.good),
      lower_is_better: draft.lower,
    });
    if (error) { setMsg(error.message); return; }
    setDraft({ kpi: "", minimum: "", target: "", good: "", lower: false });
    load();
  }
  async function removeRow(r: Row) {
    const { error } = await supabase.from("mkt_kpi_targets").delete().eq("id", r.id);
    if (error) setMsg(error.message); else load();
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">KPI Targets</h1>
        <p className="text-sm text-slate-500">
          Report ထဲက Target အကွက်တွေက ဒီစာရင်းကနေ အလိုအလျောက် ဖြည့်တယ်။
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => (
          <button key={p} onClick={() => setPlatform(p)}
            className={"px-3 py-1.5 rounded-full border text-sm " + (p === platform ? "bg-slate-900 text-white" : "bg-white")}>
            {p}
          </button>
        ))}
        <span className="w-px bg-slate-200 mx-1" />
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={"px-3 py-1.5 rounded-full border text-sm " + (p.key === period ? "bg-slate-900 text-white" : "bg-white")}>
            {p.label}
          </button>
        ))}
      </div>

      {!canEdit && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          ကြည့်ရုံပဲ ရပါတယ် — ပြင်ခွင့်က Marketing Manager မှာ။
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
              <th className="py-2 px-3 w-24">နည်းလေကောင်း</th>
              <th className="py-2 px-3 w-16" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="py-3 px-3 text-slate-400" colSpan={5}>Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td className="py-3 px-3 text-slate-400" colSpan={5}>ဒီ platform / period အတွက် target မရှိသေးပါ။</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 px-3">{r.kpi}</td>
                {(["minimum", "target", "good"] as const).map((k) => (
                  <td key={k} className="py-2 px-3">
                    <input type="number" step="any" disabled={!canEdit}
                      defaultValue={r[k] ?? ""}
                      onBlur={(e) => {
                        const v = num(e.target.value);
                        if (v !== r[k]) save(r, { [k]: v } as Partial<Row>);
                      }}
                      className="w-24 border border-slate-200 rounded-lg px-2 py-1 disabled:bg-slate-50" />
                  </td>
                ))}
                <td className="py-2 px-3">
                  <input type="checkbox" disabled={!canEdit}
                    checked={r.lower_is_better}
                    onChange={(e) => save(r, { lower_is_better: e.target.checked })} />
                </td>
                <td className="py-2 px-3">
                  {canEdit && (
                    <button onClick={() => removeRow(r)} className="text-red-600 text-xs">ဖျက်</button>
                  )}
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
            <input value={draft.kpi} onChange={(e) => setDraft({ ...draft, kpi: e.target.value })}
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

      <p className="text-xs text-slate-500">
        “နည်းလေကောင်း” က Cost per Message လိုမျိုး — ကိန်းနည်းလေ ကောင်းလေ ဆိုတဲ့ KPI အတွက်။
      </p>
    </div>
  );
}
