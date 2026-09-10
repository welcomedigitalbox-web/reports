"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const DEPTS = ["sale", "merchandising", "marketing", "finance", "warehouse"];

export default function DeptCards({ date }: { date: string }) {
  const router = useRouter();
  const [stat, setStat] = useState<Record<string, { filed: number; waiting: number; done: number }>>({});
  useEffect(() => {
    (async () => {
      const [{ data: f }, { data: s }] = await Promise.all([
        supabase.from("report_forms").select("id,department"),
        supabase.from("report_submissions").select("form_id,status").eq("report_date", date)
          .not("status", "in", "(draft,archived)"),
      ]);
      const dep = new Map(((f as { id: string; department: string }[]) || []).map((x) => [x.id, x.department]));
      const out: Record<string, { filed: number; waiting: number; done: number }> = {};
      for (const r of (s as { form_id: string; status: string }[]) || []) {
        const d = dep.get(r.form_id) || "other";
        const e = (out[d] ||= { filed: 0, waiting: 0, done: 0 });
        e.filed++;
        if (["submitted", "approved", "edit_requested", "cancel_requested"].includes(r.status)) e.waiting++;
        if (r.status === "acknowledged") e.done++;
      }
      setStat(out);
    })();
  }, [date]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
      {DEPTS.map((d) => {
        const e = stat[d] || { filed: 0, waiting: 0, done: 0 };
        const tone = e.filed === 0 ? "border-slate-200 text-slate-400"
          : e.waiting > 0 ? "border-amber-300" : "border-green-300";
        return (
          <button key={d} onClick={() => router.push(`/dept/${d}`)}
            className={`bg-white border-2 rounded-xl p-4 text-left hover:shadow-sm ${tone}`}>
            <div className="font-semibold capitalize">{d}</div>
            <div className="text-xs mt-1">
              {e.filed === 0 ? "Nothing filed" : e.waiting > 0 ? `⏳ ${e.waiting} waiting · ${e.filed} filed` : `✅ ${e.done} done`}
            </div>
          </button>
        );
      })}
    </div>
  );
}
