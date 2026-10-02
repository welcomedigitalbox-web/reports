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

type Off = { day: string; department: string | null; note: string | null };
type Holiday = { day: string; department: string | null; note: string | null };

export default function FilingPage() {
  const { profile, loading: authLoading } = useAuth();
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(daysAgo(1));
  const [rows, setRows] = useState<Row[]>([]);
  const [offs, setOffs] = useState<Off[]>([]);
  const [showOff, setShowOff] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newDay, setNewDay] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newNote, setNewNote] = useState("");
  const [dept, setDept] = useState("");
  const [busy, setBusy] = useState(true);

  const allowed =
    !!profile && (isDirector(profile.role) || profile.email === "itadmin@edu.com");

  useEffect(() => {
    if (!allowed) return;
    load();
    loadHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, from, to]);

  async function load() {
    setBusy(true);
    const [{ data }, { data: off }] = await Promise.all([
      supabase.rpc("filing_matrix", { p_from: from, p_to: to }),
      supabase.rpc("off_days", { p_from: from, p_to: to }),
    ]);
    setRows((data as Row[]) || []);
    setOffs((off as Off[]) || []);
    setBusy(false);
  }

  // The holidays someone actually entered, as opposed to the standing
  // Sunday rule, which has no row and cannot be deleted.
  async function loadHolidays() {
    const { data } = await supabase
      .from("report_off_days")
      .select("day, department, note")
      .order("day");
    setHolidays((data as Holiday[]) || []);
  }

  async function addHoliday() {
    if (!newDay) return;
    const { error } = await supabase.from("report_off_days").insert({
      day: newDay,
      department: newDept || null,
      note: newNote || null,
      created_by: profile?.email,
    });
    if (error) { alert(error.message); return; }
    setNewDay(""); setNewNote(""); setNewDept("");
    await Promise.all([loadHolidays(), load()]);
  }

  async function removeHoliday(h: Holiday) {
    const q = supabase.from("report_off_days").delete().eq("day", h.day);
    const { error } = h.department
      ? await q.eq("department", h.department)
      : await q.is("department", null);
    if (error) { alert(error.message); return; }
    await Promise.all([loadHolidays(), load()]);
  }

  // A day nobody was meant to work is not a day anybody missed. Sundays
  // come back from the database as a null department, which the shops are
  // exempt from; a holiday row may name one department or apply to all.
  function isOff(day: string, department: string) {
    return offs.some((o) => {
      if (o.day !== day) return false;
      if (o.department) return o.department === department;
      return o.note !== "Sunday" || department !== "sale";
    });
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
        missed: days.filter((d) => !isOff(d, x.department) && !x.byDay.get(d)?.filed).length,
        due: days.filter((d) => !isOff(d, x.department)).length,
      }))
      .sort((a, b) => b.missed - a.missed || a.email.localeCompare(b.email));
  }, [rows, days, dept, offs]);

  const totals = useMemo(() => {
    const expected = lines.reduce((t, l) => t + l.due, 0);
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

      <div className="mb-5">
        <button onClick={() => setShowOff(!showOff)}
          className="text-sm text-blue-600">
          {showOff ? "− " : "+ "}Off days ({holidays.length} holidays · Sundays are automatic)
        </button>

        {showOff && (
          <div className="mt-3 bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-3">
              Sunday is an off day for every department except <b>sale</b>, and needs no
              entry. Add the holidays and closures below; leave the department empty for
              a day the whole company is closed. An off day counts against nobody.
            </p>

            <div className="flex flex-wrap items-end gap-2 mb-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Date</label>
                <input type="date" value={newDay} onChange={(e) => setNewDay(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Department</label>
                <select value={newDept} onChange={(e) => setNewDept(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm capitalize">
                  <option value="">everyone</option>
                  {depts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[12rem]">
                <label className="block text-xs text-slate-500 mb-1">Note</label>
                <input value={newNote} onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Thadingyut"
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <button onClick={addHoliday} disabled={!newDay}
                className="bg-blue-600 disabled:bg-slate-300 text-white text-sm px-4 py-2 rounded-lg font-medium">
                Add
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {holidays.map((h) => (
                <div key={h.day + (h.department || "")}
                  className="flex items-center gap-3 py-1.5 text-sm">
                  <span className="w-28 tabular-nums">{h.day}</span>
                  <span className="w-32 text-slate-500 capitalize">{h.department || "everyone"}</span>
                  <span className="flex-1 text-slate-600">{h.note || ""}</span>
                  <button onClick={() => removeHoliday(h)}
                    className="text-xs text-red-600">remove</button>
                </div>
              ))}
              {holidays.length === 0 && (
                <p className="text-sm text-slate-400 py-2">No holidays entered yet</p>
              )}
            </div>
          </div>
        )}
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
                    const off = isOff(d, l.department);
                    return (
                      <td key={d} className="px-1 py-2">
                        <span
                          title={
                            off
                              ? `${d} · off day`
                              : ok
                              ? `${d} · ${r?.status} · ${yangon(r?.submitted_at)}`
                              : `${d} · not filed`
                          }
                          className={
                            "block w-5 h-5 rounded " +
                            (ok ? "bg-green-500" : off ? "bg-slate-200" : "bg-amber-400")
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
        Green filed · amber not filed · grey an off day, which counts against nobody. Hover a square for the time it was filed. Yangon time.
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
