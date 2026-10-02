"use client";

// Who filed and who did not, over a stretch of days. One square per person
// per day: green filed, amber missed. The count beside each row is the
// number that gets talked about in a meeting.

import { useEffect, useMemo, useState } from "react";
import { supabase, yangon } from "@/lib/supabase";
import { useAuth, isDirector } from "../auth-context";

type Row = {
  email: string;
  department: string;
  form_id: string;
  form_name: string;
  cadence: string;
  is_shared: boolean;
  day: string;
  filed: boolean;
  status: string | null;
  submitted_at: string | null;
};

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Yangon" });
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Yangon" });
};

export default function FilingPage() {
  const { profile, loading: authLoading } = useAuth();
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(daysAgo(1));
  const [rows, setRows] = useState<Row[]>([]);
  const [dept, setDept] = useState("");
  const [busy, setBusy] = useState(true);

  const allowed =
    !!profile && (isDirector(profile.role) || profile.email === "itadmin@edu.com");

  useEffect(() => {
    if (!allowed) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, from, to]);

  async function load() {
    setBusy(true);
    const { data } = await supabase.rpc("filing_matrix", { p_from: from, p_to: to });
    setRows((data as Row[]) || []);
    setBusy(false);
  }

  const days = useMemo(
    () => Array.from(new Set(rows.map((r) => r.day))).sort(),
    [rows]
  );

  const depts = useMemo(
    () => Array.from(new Set(rows.map((r) => r.department))).sort(),
    [rows]
  );

  // One line per person per form: two forms missed on the same day are two
  // reports missing, not one bad day.
  const lines = useMemo(() => {
    const m = new Map<string, { email: string; department: string; form: string; shared: boolean; cadence: string; byDay: Map<string, Row> }>();
    for (const r of rows) {
      if (dept && r.department !== dept) continue;
      const k = `${r.email}|${r.form_id}`;
      const e = m.get(k) || {
        email: r.email, department: r.department, form: r.form_name,
        shared: r.is_shared, cadence: r.cadence, byDay: new Map<string, Row>(),
      };
      e.byDay.set(r.day, r);
      m.set(k, e);
    }
    return [...m.values()]
      .map((x) => ({
        ...x,
        missed: days.filter((d) => !x.byDay.get(d)?.filed).length,
      }))
      .sort((a, b) => b.missed - a.missed || a.email.localeCompare(b.email));
  }, [rows, days, dept]);

  const totals = useMemo(() => {
    const expected = lines.length * days.length;
    const missed = lines.reduce((t, l) => t + l.missed, 0);
    return { expected, missed, filed: expected - missed };
  }, [lines, days]);

  if (authLoading) return <div className="pt-16 text-center text-sm text-slate-400">…</div>;
  if (!allowed) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6">
      <h1 className="text-xl font-semibold mb-1">Filing</h1>
      <p className="text-sm text-slate-500 mb-5">
        Who filed their daily report, and who did not.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input type="date" value={from} max={to}
          onChange={(e) => setFrom(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={to} min={from} max={today()}
          onChange={(e) => setTo(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
        <button onClick={() => { setFrom(daysAgo(7)); setTo(daysAgo(1)); }}
          className="text-xs text-blue-600 px-2">last 7 days</button>
        <button onClick={() => { setFrom(daysAgo(30)); setTo(daysAgo(1)); }}
          className="text-xs text-blue-600 px-2">last 30 days</button>
        <select value={dept} onChange={(e) => setDept(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm capitalize">
          <option value="">all departments</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <Tile label="Expected" value={totals.expected} />
        <Tile label="Filed" value={totals.filed} tone="text-green-700" />
        <Tile label="Missed" value={totals.missed} tone={totals.missed ? "text-amber-700" : ""} />
        <Tile
          label="On time"
          value={totals.expected ? Math.round((totals.filed / totals.expected) * 100) + "%" : "-"}
        />
      </div>

      {busy && <p className="text-sm text-slate-400">…</p>}

      {!busy && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left px-4 py-2 sticky left-0 bg-white">Who</th>
                <th className="text-left px-3 py-2">Report</th>
                {days.map((d) => (
                  <th key={d} className="px-1 py-2 text-[10px] font-medium text-slate-400 w-7">
                    {d.slice(8)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Missed</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.email + l.form} className="border-t border-slate-100">
                  <td className="px-4 py-2 sticky left-0 bg-white whitespace-nowrap">
                    {l.email}
                    <span className="text-xs text-slate-400 ml-2 capitalize">{l.department}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                    {l.form}
                    {l.shared && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        shared
                      </span>
                    )}
                    {l.cadence === "weekly" && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        weekly
                      </span>
                    )}
                  </td>
                  {days.map((d) => {
                    const r = l.byDay.get(d);
                    const ok = !!r?.filed;
                    return (
                      <td key={d} className="px-1 py-2">
                        <span
                          title={
                            ok
                              ? `${d} · ${r?.status} · ${yangon(r?.submitted_at)}`
                              : `${d} · not filed`
                          }
                          className={
                            "block w-5 h-5 rounded " +
                            (ok ? "bg-green-500" : "bg-amber-400")
                          }
                        />
                      </td>
                    );
                  })}
                  <td className={"px-3 py-2 text-right font-semibold " +
                    (l.missed ? "text-amber-700" : "text-slate-300")}>
                    {l.missed}
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={days.length + 3} className="text-center text-slate-400 py-10">
                    Nothing to show
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-3">
        Green filed · amber not filed. Hover a square for the time it was filed. Yangon time.
        A report marked <b>shared</b> is one the team fills in together — each person
        counts as having filed once they have added their own part. A <b>weekly</b>
        report covers its whole week, so one filing turns the whole week green.
      </p>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 min-w-[110px]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={"text-lg font-semibold mt-0.5 " + (tone || "")}>{value}</div>
    </div>
  );
}
