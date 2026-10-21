"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Row = {
  source: string;
  orders: number;
  sales: number;
  cancelled: number;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

export default function SourcePanel({ date }: { date: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    supabase.rpc("online_order_sources", { p_date: date }).then(({ data }) => {
      if (!live) return;
      setRows((data as Row[]) || []);
      setLoading(false);
    });
    return () => { live = false; };
  }, [date]);

  const total = rows.reduce(
    (a, r) => ({
      orders: a.orders + Number(r.orders || 0),
      sales: a.sales + Number(r.sales || 0),
      cancelled: a.cancelled + Number(r.cancelled || 0),
    }),
    { orders: 0, sales: 0, cancelled: 0 }
  );

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="font-medium text-sm">Where orders came from</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Counted from the orders themselves — nothing to type here
        </p>
      </div>

      <div className="p-4 overflow-x-auto">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400">No orders taken on this day</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs">
                <th className="text-left font-medium pb-2">Source</th>
                <th className="text-right font-medium pb-2">Orders</th>
                <th className="text-right font-medium pb-2">Sales</th>
                <th className="text-right font-medium pb-2">Cancelled</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.source} className="border-t border-slate-100">
                  <td className="py-2">{r.source}</td>
                  <td className="py-2 text-right">{fmt(Number(r.orders))}</td>
                  <td className="py-2 text-right">{fmt(Number(r.sales))}</td>
                  <td className="py-2 text-right text-slate-400">
                    {Number(r.cancelled) ? fmt(Number(r.cancelled)) : "-"}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-medium">
                <td className="py-2">Total</td>
                <td className="py-2 text-right">{fmt(total.orders)}</td>
                <td className="py-2 text-right">{fmt(total.sales)}</td>
                <td className="py-2 text-right text-slate-400">
                  {total.cancelled ? fmt(total.cancelled) : "-"}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
