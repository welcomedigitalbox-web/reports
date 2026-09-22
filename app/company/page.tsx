"use client";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import Link from "next/link";

type Tot = { section: string; label: string; type: string; value: number | null };
type Note = { label: string; text: string; by: string };
type Form = { form_id: string; name: string; subs: { by: string; status: string }[]; totals: Tot[]; notes: Note[] };

const fmt = (n: number | null, t?: string) =>
  n == null ? "—" : t === "percent" ? Number(n).toFixed(1) + "%" : Math.round(Number(n)).toLocaleString();
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const URGENT = /urgent|အရေးပေါ်|approval|risk/i;

export default function CompanyDayPage() {
  const [date, setDate] = useState(today());
  const [data, setData] = useState<Form[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    setErr("");
    supabase.rpc("dept_day", { p_date: date, p_exclude: [] }).then(({ data, error }: any) => {
      if (error) setErr(error.message);
      setData(data || []);
    });
  }, [date]);

  const done = data.filter((d) => d.subs.length).length;
  const urgent = data.flatMap((d) => d.notes.filter((n) => URGENT.test(n.label)).map((n) => ({ ...n, dept: d.name })));

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Company Day</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-2 py-1" />
        <span className={"text-sm px-2 py-0.5 rounded " + (done === data.length ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
          {done}/{data.length} reports in
        </span>
      </div>
      {err && <div className="text-red-600 text-sm">{err}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.map((d) => {
          const isSales = d.form_id.startsWith("sales");
          const href = isSales ? "/sales-day?date=" + date : "/day?f=" + d.form_id;
          const head = d.totals.filter((t) => t.value != null && Number(t.value) !== 0).slice(0, 4);
          const flags = d.notes.filter((n) => URGENT.test(n.label)).length;
          return (
            <Link key={d.form_id} href={href} className="border rounded-lg p-3 flex flex-col gap-2 hover:shadow-sm bg-white">
              <div className="flex items-center justify-between">
                <span className="font-medium">{d.name}</span>
                <span className={"text-xs px-1.5 rounded " + (d.subs.length ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                  {d.subs.length ? d.subs.length + " in" : "missing"}
                </span>
              </div>
              {head.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {head.map((t, i) => (
                    <div key={i}>
                      <div className="text-xs text-gray-500 truncate">{t.label}</div>
                      <div className="font-semibold tabular-nums">{fmt(t.value, t.type)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400">{d.subs.length ? "Text-only report" : "Nothing yet"}</div>
              )}
              {flags > 0 && <div className="mt-auto text-xs text-red-600">⚑ {flags} urgent / needs decision</div>}
            </Link>
          );
        })}
      </div>

      {urgent.length > 0 && (
        <section className="border rounded-lg p-3">
          <h2 className="font-medium mb-2">Needs attention</h2>
          <div className="space-y-2">
            {urgent.map((n, i) => (
              <div key={i} className="text-sm">
                <div className="text-xs text-gray-500">{n.dept} · {n.label} · {n.by}</div>
                <div className="whitespace-pre-wrap">{n.text}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
