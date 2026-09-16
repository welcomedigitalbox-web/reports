"use client";
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Parsed = {
  kind: string; date: string; available: string[];
  sections: Record<string, Record<string, unknown>[]>;
  fixed: Record<string, unknown>;
  unknown: { kind: string; raw: string }[];
};
const KIND_LABEL: Record<string, string> = {
  cash_daily: "Cashbook", sale_income_daily: "Daily Sale & Income",
  purchase_payable_daily: "Purchase & Payable",
};
const fmt = (n: unknown) => Number(n || 0).toLocaleString();

export default function ExcelImport({
  formId, reportDate, sectionIds, onApply,
}: {
  formId: string; reportDate: string;
  sectionIds: Record<string, string>;      // section title -> id
  onApply: (answers: Record<string, unknown>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [p, setP] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function parse(f: File, date: string) {
    setBusy(true); setErr("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.append("file", f); fd.append("date", date);
      const r = await fetch("/api/import-excel", {
        method: "POST",
        headers: { authorization: `Bearer ${session?.access_token}` },
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "ဖတ်၍ မရပါ"); setP(null); }
      else if (d.kind !== formId) {
        setErr(`ဒီဖိုင်က ${KIND_LABEL[d.kind] || d.kind} ပါ — ဒီ report နဲ့ မကိုက်ပါ`);
        setP(null);
      } else setP(d as Parsed);
    } catch (e) { setErr(String(e)); }
    setBusy(false);
  }

  async function apply() {
    if (!p) return;
    setBusy(true);
    // master list မှာ မရှိတဲ့ နာမည်အသစ်များကို သိမ်း (အတည်မပြုရသေး)
    const tbl: Record<string, string> = {
      supplier: "report_suppliers", cash_type: "report_cash_types", expense: "report_expense_types",
    };
    for (const u of p.unknown) {
      const t = tbl[u.kind];
      if (t) await supabase.from(t).insert({ name: u.raw, is_verified: false });
    }
    const answers: Record<string, unknown> = { ...p.fixed };
    for (const [title, rows] of Object.entries(p.sections)) {
      const id = sectionIds[title];
      if (id) answers[id] = rows;
    }
    onApply(answers);
    setBusy(false); setP(null); setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const total = (rows: Record<string, unknown>[]) =>
    rows.reduce((a, r) => a + Number(r.amount || 0) + Number(r.cash_amount || 0) + Number(r.credit_amount || 0), 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept=".xlsx,.xls"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setFile(f); setP(null); setErr("");
            if (f) parse(f, reportDate);
          }}
          className="text-sm" />
        {busy && <span className="text-sm text-slate-400">ဖတ်နေပါတယ်…</span>}
      </div>
      <p className="text-xs text-slate-400 mt-2">
        Excel တင်လိုက်ရင် အကွက်တွေ အလိုအလျောက် ဖြည့်ပေးပါမယ်။ ပြီးရင် လိုသလို ပြင်လို့ရပါတယ်။
      </p>
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}

      {p && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-sm font-medium">ရက်စွဲ</span>
            {p.available.length > 1 ? (
              <select value={p.date} disabled={busy}
                onChange={(e) => file && parse(file, e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-sm">
                {p.available.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            ) : <span className="text-sm">{p.date}</span>}
            {p.date !== reportDate && (
              <span className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-700">
                Report ရက် ({reportDate}) နဲ့ မတူပါ
              </span>
            )}
          </div>

          {Object.entries(p.sections).map(([title, rows]) => (
            <div key={title} className="flex justify-between text-sm py-1">
              <span className={sectionIds[title] ? "" : "text-red-500"}>
                {title}{!sectionIds[title] && " (section ရှာမတွေ့)"}
              </span>
              <span className="text-slate-500">{rows.length} row · {fmt(total(rows))}</span>
            </div>
          ))}

          {p.unknown.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3">
              <div className="text-xs font-medium text-amber-800 mb-1">
                နာမည်အသစ် {p.unknown.length} ခု — သိမ်းပြီး နောက်မှ Master မှာ ပေါင်းလို့ရပါတယ်
              </div>
              <div className="text-xs text-amber-700">
                {p.unknown.map((u) => `${u.raw} (${u.kind})`).join(" · ")}
              </div>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button onClick={apply} disabled={busy}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              ဖြည့်မည်
            </button>
            <button onClick={() => { setP(null); setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
              className="border border-slate-200 rounded-lg px-4 py-2 text-sm">မလုပ်တော့</button>
          </div>
        </div>
      )}
    </div>
  );
}
