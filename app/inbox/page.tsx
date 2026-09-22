"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Item = {
  submission_id: string; section_id: string; row_no: number; section: string;
  store_id: string | null; report_date: string; submitted_by: string | null;
  item: Record<string, unknown>; status: string; note: string | null;
  handled_by: string | null; handled_at: string | null;
};

const STATUS = [
  { key: "open", label: "Open", tone: "bg-amber-50 text-amber-700" },
  { key: "in_progress", label: "In progress", tone: "bg-blue-50 text-blue-700" },
  { key: "done", label: "Done", tone: "bg-green-50 text-green-700" },
];

export default function InboxPage() {
  const [rows, setRows] = useState<Item[]>([]);
  const [filter, setFilter] = useState("open");
  const [section, setSection] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    const { data } = await supabase.rpc("my_routed_items", { p_status: filter || null });
    setRows((data as Item[]) || []);
    setBusy(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  const sections = useMemo(() => Array.from(new Set(rows.map((r) => r.section))), [rows]);
  const shown = section ? rows.filter((r) => r.section === section) : rows;

  async function mark(r: Item, status: string) {
    const note = status === "done" ? window.prompt("Note (optional)") || "" : "";
    await supabase.rpc("report_item_set", {
      p_sub: r.submission_id, p_sec: r.section_id, p_row: r.row_no, p_status: status, p_note: note,
    });
    load();
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold mb-1">Inbox</h1>
      <p className="text-sm text-slate-500 mb-4">Issues other teams wrote into their reports for you.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {[{ key: "", label: "All" }, ...STATUS].map((s) => (
          <button key={s.key} onClick={() => setFilter(s.key)}
            className={"px-3 py-1.5 rounded-lg text-sm border " +
              (filter === s.key ? "bg-slate-900 text-white border-slate-900" : "border-slate-200")}>
            {s.label}
          </button>
        ))}
        <select value={section} onChange={(e) => setSection(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
          <option value="">All sections</option>
          {sections.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {busy && <p className="text-sm text-slate-400">…</p>}
      {!busy && shown.length === 0 && <p className="text-sm text-slate-400 py-10 text-center">Nothing here.</p>}

      <div className="space-y-3">
        {shown.map((r) => {
          const tone = STATUS.find((s) => s.key === r.status)?.tone || "";
          return (
            <div key={r.submission_id + r.section_id + r.row_no}
              className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-sm">
                  <span className="font-semibold">{r.section}</span>
                  <span className="text-slate-400"> · {r.store_id || "-"} · {r.report_date}</span>
                </div>
                <span className={"text-xs px-2 py-0.5 rounded " + tone}>{r.status}</span>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm mb-3">
                {Object.entries(r.item).filter(([, v]) => v !== "" && v != null).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-slate-400 capitalize">{k.replace(/_/g, " ")}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-400">
                  from {r.submitted_by || "-"}
                  {r.handled_by ? " · " + r.handled_by : ""}{r.note ? " · " + r.note : ""}
                </span>
                <div className="flex gap-2">
                  {r.status !== "in_progress" && r.status !== "done" && (
                    <button onClick={() => mark(r, "in_progress")}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm">Take it</button>
                  )}
                  {r.status !== "done" && (
                    <button onClick={() => mark(r, "done")}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm">Done</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
