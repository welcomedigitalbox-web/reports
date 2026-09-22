"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Row = {
  store: string; status: string; by_whom: string | null;
  target: number | null; actual: number | null; invoices: number | null; entrance: number | null;
  credit: number | null; returns: number | null; lost: number | null;
  stockout: string | null; staff_issue: string | null; plan: string | null;
};
type Day = {
  rows: Row[]; missing: string[];
  totals: { target: number; actual: number; invoices: number; entrance: number; credit: number;
            returns: number; lost: number; achievement: number | null; avg_invoice: number | null; conversion: number | null };
  issues: { staff: number; admin: number; stock: number };
};

const today = () => new Date().toISOString().slice(0, 10);
const mmk = (v: unknown) => (v == null ? "-" : Number(v).toLocaleString());
const pct = (a: number | null, t: number | null) => (a != null && t ? Math.round((a / t) * 1000) / 10 : null);

export default function SalesDayPage() {
  const [date, setDate] = useState(today());
  const [d, setD] = useState<Day | null>(null);

  useEffect(() => {
    supabase.rpc("sales_day_rollup", { p_date: date }).then(({ data }) => setD((data as Day) || null));
  }, [date]);

  const T = d?.totals;

  const Card = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="text-xs text-slate-500 uppercase">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold">Sales Day</h1>
          <p className="text-sm text-slate-500">Every shop's report for the day, added up.</p>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      </div>

      {d && d.missing.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 mb-4 text-sm">
          Not in yet: <b>{d.missing.join(", ")}</b>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Card label="Actual" value={mmk(T?.actual)} sub={"Target " + mmk(T?.target)} />
        <Card label="Achievement" value={T?.achievement != null ? T.achievement + "%" : "-"} />
        <Card label="Invoices" value={mmk(T?.invoices)} sub={"Avg " + mmk(T?.avg_invoice)} />
        <Card label="Conversion" value={T?.conversion != null ? T.conversion + "%" : "-"} sub={mmk(T?.entrance) + " walked in"} />
        <Card label="Lost sale" value={mmk(T?.lost)} sub={mmk(T?.returns) + " returns"} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-5">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {["Shop","Target","Actual","%","Invoices","Avg","Walk-in","Conv.","Credit","Lost","Stock-out","Staff","By"].map((h) => (
                <th key={h} className={"px-3 py-2 " + (h === "Shop" || h === "Stock-out" || h === "Staff" || h === "By" ? "text-left" : "text-right")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(d?.rows || []).map((r, i) => {
              const a = pct(r.actual, r.target);
              return (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{r.store}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{mmk(r.target)}</td>
                  <td className="px-3 py-2 text-right font-medium">{mmk(r.actual)}</td>
                  <td className={"px-3 py-2 text-right " + (a == null ? "" : a >= 100 ? "text-green-700" : "text-red-600")}>{a == null ? "-" : a + "%"}</td>
                  <td className="px-3 py-2 text-right">{mmk(r.invoices)}</td>
                  <td className="px-3 py-2 text-right">{r.actual && r.invoices ? mmk(Math.round(r.actual / r.invoices)) : "-"}</td>
                  <td className="px-3 py-2 text-right">{mmk(r.entrance)}</td>
                  <td className="px-3 py-2 text-right">{r.invoices && r.entrance ? Math.round((r.invoices / r.entrance) * 1000) / 10 + "%" : "-"}</td>
                  <td className="px-3 py-2 text-right">{mmk(r.credit)}</td>
                  <td className="px-3 py-2 text-right text-orange-700">{mmk(r.lost)}</td>
                  <td className="px-3 py-2 text-slate-500">{r.stockout || "-"}</td>
                  <td className="px-3 py-2 text-slate-500">{r.staff_issue || "-"}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{r.by_whom || "-"}</td>
                </tr>
              );
            })}
            {(d?.rows || []).length === 0 && (
              <tr><td className="px-3 py-8 text-center text-slate-400" colSpan={13}>No shop reports for this day yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 text-sm">
          <Link href="/issues" className="px-3 py-2 border border-slate-200 rounded-lg">
            Staff {d?.issues.staff ?? 0} · Admin {d?.issues.admin ?? 0} · Stock {d?.issues.stock ?? 0}
          </Link>
        </div>
        <Link href="/" className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold">
          Write the manager review →
        </Link>
      </div>
    </div>
  );
}
