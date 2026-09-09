"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Row = {
  store_id: string;
  store_name: string;
  filed: boolean;
  status: string;
  filed_by: string | null;
  daily_target: number;
  actual_sale: number;
  invoice_count: number;
  customers_in: number;
  credit_sale: number;
  return_count: number;
  lost_sale: number;
  stockout: string | null;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

export default function ConsolidatedPanel({ date }: { date: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    supabase
      .rpc("sales_consolidated", { p_date: date })
      .then(({ data }) => {
        if (!live) return;
        setRows((data as Row[]) || []);
        setLoading(false);
      });
    return () => { live = false; };
  }, [date]);

  const total = useMemo(() => {
    const t = rows.reduce(
      (a, r) => ({
        target: a.target + Number(r.daily_target || 0),
        actual: a.actual + Number(r.actual_sale || 0),
        invoices: a.invoices + Number(r.invoice_count || 0),
        customers: a.customers + Number(r.customers_in || 0),
        credit: a.credit + Number(r.credit_sale || 0),
        returns: a.returns + Number(r.return_count || 0),
        lost: a.lost + Number(r.lost_sale || 0),
      }),
      { target: 0, actual: 0, invoices: 0, customers: 0, credit: 0, returns: 0, lost: 0 }
    );
    return t;
  }, [rows]);

  const notFiled = rows.filter((r) => !r.filed);

  if (loading) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <p className="text-sm text-slate-400">…</p>
      </section>
    );
  }

  const pct = (a: number, b: number) =>
    b > 0 ? Math.round((a / b) * 1000) / 10 : null;

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="font-medium text-sm">Channel figures</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Read from each shop&apos;s own report — nothing to type here
        </p>
      </div>

      {notFiled.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
          Not filed yet: {notFiled.map((r) => r.store_name).join(" · ")}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-4 py-2">Channel</th>
              <th className="text-right px-3 py-2">Target</th>
              <th className="text-right px-3 py-2">Actual</th>
              <th className="text-right px-3 py-2">%</th>
              <th className="text-right px-3 py-2">Invoices</th>
              <th className="text-right px-3 py-2">Credit</th>
              <th className="text-right px-3 py-2">Returns</th>
              <th className="text-right px-3 py-2">Lost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = pct(r.actual_sale, r.daily_target);
              return (
                <tr key={r.store_id} className={`border-t border-slate-100 ${r.filed ? "" : "text-slate-300"}`}>
                  <td className="px-4 py-2">
                    {r.store_name}
                    {!r.filed && <span className="text-xs ml-2">not filed</span>}
                    {r.stockout && (
                      <div className="text-xs text-amber-700 mt-0.5">
                        out: {r.stockout}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(r.daily_target)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(r.actual_sale)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${
                    p === null ? "" : p >= 100 ? "text-green-700" : p >= 90 ? "" : "text-red-600"
                  }`}>
                    {p === null ? "-" : `${p}%`}
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(r.invoice_count)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.credit_sale)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.return_count)}</td>
                  <td className="px-3 py-2 text-right">{r.lost_sale ? fmt(r.lost_sale) : "-"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-medium">
            <tr>
              <td className="px-4 py-2">Total</td>
              <td className="px-3 py-2 text-right">{fmt(total.target)}</td>
              <td className="px-3 py-2 text-right">{fmt(total.actual)}</td>
              <td className={`px-3 py-2 text-right ${
                pct(total.actual, total.target) === null ? ""
                  : pct(total.actual, total.target)! >= 100 ? "text-green-700" : "text-red-600"
              }`}>
                {pct(total.actual, total.target) === null
                  ? "-"
                  : `${pct(total.actual, total.target)}%`}
              </td>
              <td className="px-3 py-2 text-right">{fmt(total.invoices)}</td>
              <td className="px-3 py-2 text-right">{fmt(total.credit)}</td>
              <td className="px-3 py-2 text-right">{fmt(total.returns)}</td>
              <td className="px-3 py-2 text-right">{total.lost ? fmt(total.lost) : "-"}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {total.customers > 0 && (
        <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-500">
          {fmt(total.customers)} customers in · {pct(total.invoices, total.customers)}% bought
        </div>
      )}
    </section>
  );
}
