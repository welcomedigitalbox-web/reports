"use client";
import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";

type Tot = { section: string; label: string; type: string; value: number | null };
type Brk = { section: string; dim: string; label: string; value: number | null };
type Note = { label: string; text: string; by: string };
type Form = { form_id: string; name: string; subs: { by: string; status: string }[]; totals: Tot[]; breakdown: Brk[]; notes: Note[] };

const fmt = (n: number | null, t?: string) =>
  n == null ? "—" : t === "percent" ? Number(n).toFixed(1) + "%" : Math.round(Number(n)).toLocaleString();
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
function groupBy<T>(xs: T[], k: (x: T) => string) {
  const m = new Map<string, T[]>(); xs.forEach((x) => { const key = k(x); m.set(key, [...(m.get(key) || []), x]); }); return m;
}

export default function DeptDayPage() {
  const [date, setDate] = useState(today());
  const [data, setData] = useState<Form[]>([]);
  const [pick, setPick] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true); setErr("");
    supabase.rpc("dept_day", { p_date: date }).then(({ data, error }: any) => {
      if (error) setErr(error.message);
      const rows: Form[] = data || [];
      setData(rows);
      if (!rows.find((r) => r.form_id === pick) && rows[0]) setPick(rows[0].form_id);
      setLoading(false);
    });
  }, [date]);

  const f = data.find((x) => x.form_id === pick);
  const totBySec = useMemo(() => groupBy(f?.totals || [], (t) => t.section), [f]);
  const brkBySec = useMemo(() => groupBy(f?.breakdown || [], (b) => b.section), [f]);
  const done = data.filter((d) => d.subs.length > 0).length;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Department Day</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-2 py-1" />
        <span className="text-sm text-gray-500">{done}/{data.length} departments reported</span>
        {loading && <span className="text-sm text-gray-400">Loading…</span>}
      </div>
      {err && <div className="text-red-600 text-sm">{err}</div>}

      <div className="flex flex-wrap gap-2">
        {data.map((d) => (
          <button key={d.form_id} onClick={() => setPick(d.form_id)}
            className={"px-3 py-1.5 rounded-full border text-sm " + (d.form_id === pick ? "bg-black text-white" : "bg-white")}>
            {d.name}
            <span className={"ml-2 text-xs px-1.5 rounded " + (d.subs.length ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
              {d.subs.length || "missing"}
            </span>
          </button>
        ))}
      </div>

      {f && f.subs.length === 0 && <div className="p-6 border rounded text-center text-red-600">No report submitted for this day.</div>}

      {f && f.subs.length > 0 && (
        <>
          <div className="text-sm text-gray-600">
            Submitted by: {f.subs.map((s, i) => <span key={i} className="mr-3">{s.by} <span className="text-gray-400">({s.status})</span></span>)}
          </div>

          {[...totBySec.entries()].map(([sec, ts]) => (
            <section key={sec} className="border rounded-lg p-3">
              <h2 className="font-medium mb-2">{sec}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {ts.map((t, i) => (
                  <div key={i} className="rounded border p-2 bg-gray-50">
                    <div className="text-xs text-gray-500">{t.label}</div>
                    <div className="text-lg font-semibold tabular-nums">{fmt(t.value, t.type)}</div>
                  </div>
                ))}
              </div>
              {brkBySec.has(sec) && (() => {
                const rows = brkBySec.get(sec)!;
                const labels = [...new Set(rows.map((r) => r.label))];
                const dims = [...new Set(rows.map((r) => r.dim))];
                const cell = (d: string, l: string) => rows.find((r) => r.dim === d && r.label === l)?.value ?? null;
                if (dims.length < 2 && dims[0] === "—") return null;
                return (
                  <div className="overflow-x-auto mt-3">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-gray-500 border-b"><th className="py-1 pr-3"></th>
                        {labels.map((l) => <th key={l} className="py-1 pr-3 text-right">{l}</th>)}</tr></thead>
                      <tbody>
                        {dims.map((d) => (
                          <tr key={d} className="border-b last:border-0"><td className="py-1 pr-3">{d}</td>
                            {labels.map((l) => <td key={l} className="py-1 pr-3 text-right tabular-nums">{fmt(cell(d, l))}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </section>
          ))}

          {f.notes.length > 0 && (
            <section className="border rounded-lg p-3">
              <h2 className="font-medium mb-2">Notes</h2>
              <div className="space-y-2">
                {f.notes.map((n, i) => (
                  <div key={i} className="text-sm">
                    <div className="text-xs text-gray-500">{n.label} · {n.by}</div>
                    <div className="whitespace-pre-wrap">{n.text}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
