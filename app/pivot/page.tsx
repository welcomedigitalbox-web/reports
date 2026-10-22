"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Row = {
  day: string;
  kind: string;
  label: string;
  metric: string;
  value: number;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};

export default function PivotPage() {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(iso(new Date()));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState("");
  const [byDay, setByDay] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr("");
    supabase
      .rpc("pivot_rows", { p_from: from, p_to: to })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setErr(error.message);
        setRows((data as Row[]) || []);
        setLoading(false);
      });
    return () => { live = false; };
  }, [from, to]);

  // Which groups there is anything to show for — no empty tabs.
  const kinds = useMemo(
    () => [...new Set(rows.map((r) => r.kind))].sort(),
    [rows]
  );

  // Default to whatever the person is allowed to see, rather than to a tab
  // that will look broken for them.
  useEffect(() => {
    if (!kind && kinds.length) setKind(kinds[0]);
  }, [kinds, kind]);

  const shown = rows.filter((r) => r.kind === kind);

  const metrics = useMemo(() => {
    const order = ["Target", "Sales", "Orders", "Invoices", "Walk-ins",
                   "Credit", "Returns", "Cancelled", "Lost sale",
                   "Damaged", "Picking errors", "Packing errors",
                   "Stock difference", "Negative stock"];
    const found = [...new Set(shown.map((r) => r.metric))];
    return found.sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [shown]);

  // rowKey is what each line of the table stands for: a shop, or a day.
  const table = useMemo(() => {
    const grid = new Map<string, Record<string, number>>();
    for (const r of shown) {
      const key = byDay ? r.day : r.label;
      const cell = grid.get(key) || {};
      cell[r.metric] = (cell[r.metric] || 0) + Number(r.value || 0);
      grid.set(key, cell);
    }
    return [...grid.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown, byDay]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const [, cells] of table)
      for (const m of metrics) t[m] = (t[m] || 0) + (cells[m] || 0);
    return t;
  }, [table, metrics]);

  const quick = (n: number) => () => { setFrom(daysAgo(n)); setTo(iso(new Date())); };

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-lg font-medium mb-1">Numbers</h1>
      <p className="text-sm text-slate-500 mb-4">
        Everything the daily reports and the orders already say, sliced how you
        like. Nothing here is typed in.
      </p>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label className="text-xs text-slate-500">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="block border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-900" />
        </label>
        <label className="text-xs text-slate-500">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="block border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-900" />
        </label>
        {[["Today", 0], ["7 days", 6], ["30 days", 29]].map(([t, n]) => (
          <button key={String(t)} type="button" onClick={quick(Number(n))}
            className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-100 text-slate-600">
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {kinds.map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`px-2.5 py-1 rounded-lg text-xs ${
              kind === k ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>
            {k}
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" onClick={() => setByDay(!byDay)}
          className="px-2.5 py-1 rounded-lg text-xs border border-slate-200 text-slate-600">
          {byDay ? "Show by name" : "Show by day"}
        </button>
      </div>

      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        {loading ? (
          <p className="text-sm text-slate-400 p-4">Loading…</p>
        ) : table.length === 0 ? (
          <p className="text-sm text-slate-400 p-4">
            Nothing reported in this range
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs">
                <th className="text-left font-medium p-3">{byDay ? "Day" : kind}</th>
                {metrics.map((m) => (
                  <th key={m} className="text-right font-medium p-3 whitespace-nowrap">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.map(([name, cells]) => (
                <tr key={name} className="border-t border-slate-100">
                  <td className="p-3 whitespace-nowrap">{name}</td>
                  {metrics.map((m) => (
                    <td key={m} className="p-3 text-right">
                      {cells[m] === undefined ? "-" : fmt(cells[m])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-medium">
                <td className="p-3">Total</td>
                {metrics.map((m) => (
                  <td key={m} className="p-3 text-right">{fmt(totals[m] || 0)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
