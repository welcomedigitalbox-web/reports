"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, isDirector } from "../../auth-context";

// The operation director reads a department's day and writes his own line
// about it. That line is not a note on the side — it is his daily report,
// the one the owner acknowledges — so it is saved into that report rather
// than into a table of its own.
const FORM = "operation_daily";
const SECTION = "65f5bb81-9df7-46e9-84a5-d3c5dbeb5ebd";

const LABEL: Record<string, string> = {
  sale: "အရောင်း (Sale)",
  merchandising: "ကုန်ပစ္စည်း (Merchandising)",
  warehouse: "ဂိုဒေါင် (Warehouse)",
  finance: "ငွေစာရင်း (Finance)",
  marketing: "စျေးကွက် (Marketing)",
  office: "HR & Admin",
};

const FIELDS: [string, string][] = [
  ["done_today", "Done today"],
  ["plan_tomorrow", "Plan tomorrow"],
  ["incidents", "Incidents"],
  ["urgent", "Urgent"],
  ["overview", "Overview"],
];

type Row = Record<string, unknown>;

export default function DirectorNote({ dept, date }: { dept: string; date: string }) {
  const { profile } = useAuth();
  const [subId, setSubId] = useState<string | null>(null);
  const [row, setRow] = useState<Row>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const label = LABEL[dept];
  const mine = !!profile && isDirector(profile.role) && !!label;

  useEffect(() => {
    if (!mine || !profile) return;
    let live = true;
    (async () => {
      const { data } = await supabase
        .from("report_submissions")
        .select("id, answers")
        .eq("form_id", FORM)
        .eq("report_date", date)
        .eq("created_by", profile.email)
        .limit(1)
        .maybeSingle();
      if (!live) return;
      const s = data as { id: string; answers: Record<string, unknown> } | null;
      setSubId(s?.id || null);
      const rows = ((s?.answers || {})[SECTION] as Row[]) || [];
      setRow(rows.find((r) => r.department === label) || {});
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.email, dept, date, mine]);

  if (!mine || !profile) return null;

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      let id = subId;
      let answers: Record<string, unknown> = {};
      if (id) {
        const { data } = await supabase
          .from("report_submissions").select("answers").eq("id", id).single();
        answers = (data as { answers: Record<string, unknown> } | null)?.answers || {};
      } else {
        const { data, error } = await supabase
          .from("report_submissions")
          .insert({
            form_id: FORM,
            store_id: (profile as { store_id?: string | null }).store_id || null,
            report_date: date,
            created_by: profile!.email,
            answers: {},
          })
          .select()
          .single();
        if (error) throw error;
        id = (data as { id: string }).id;
        setSubId(id);
      }
      const rows = (((answers[SECTION] as Row[]) || []))
        .filter((r) => r.department !== label);
      rows.push({ ...row, department: label });
      const { error } = await supabase.rpc("report_save_answers", {
        p_submission_id: id,
        p_answers: { ...answers, [SECTION]: rows },
      });
      if (error) throw error;
      setMsg("Saved to your daily report");
    } catch (e) {
      setMsg((e as { message?: string })?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
      <h2 className="text-sm font-semibold mb-1">Your note on this department</h2>
      <p className="text-xs text-slate-500 mb-3">
        Saved into your Operation Daily Report for {date}. File that report to send it up.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map(([k, lbl]) => (
          <label key={k} className="text-xs text-slate-500">
            {lbl}
            <textarea
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
              rows={3}
              value={String(row[k] ?? "")}
              onChange={(e) => setRow((r) => ({ ...r, [k]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={save}
          disabled={busy}
          className="px-4 py-2 bg-slate-900 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium"
        >
          {busy ? "…" : "Save"}
        </button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}
