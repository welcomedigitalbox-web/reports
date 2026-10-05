"use client";
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Parsed = {
  kind: string; date: string; available: string[];
  sections: Record<string, Record<string, unknown>[]>;
  fixed: Record<string, unknown>;
  preview: { columns: string[]; rows: (string | number)[][] } | null;
  unknown: { kind: string; raw: string }[];
};

// The workbook's own words for the summary keys, so the preview reads like
// the report rather than like a database.
const FIXED_LABEL: Record<string, string> = {
  stores_counted: "ဆိုင်", total_sku: "SKU", system_qty: "စနစ် ပမာဏ",
  ground_qty: "အမှန် ပမာဏ", match_sku: "ကိုက်သည့် SKU", diff_sku: "ကွာသည့် SKU",
  diff_sku_filed: "စာရင်းသွင်းမည်", short_value: "လိုနေသော တန်ဖိုး",
  over_value: "ပိုနေသော တန်ဖိုး", net_value: "ကွာခြား (စုစုပေါင်း)",
  negative_sku: "အနုတ် လက်ကျန် SKU", accuracy_pct: "တိကျမှု %",
  closing_qty: "လကုန် လက်ကျန်", closing_value: "ပိတ်သိမ်း တန်ဖိုး",
  negative_value: "အနုတ် လက်ကျန် တန်ဖိုး", unbalanced_sku: "ရွေ့လျားမှု မကိုက်",
  main_opening: "Main ဖွင့်လက်ကျန်", petty_opening: "Petty ဖွင့်လက်ကျန်",
  petty_transfer_in: "Petty ဝင်ငွေ",
};

// The forms that are filled from a workbook rather than typed. Naming them
// here is what lets a report open at its file instead of at an empty form.
export const IMPORT_FORMS: Record<string, string> = {
  cash_daily: "Cashbook",
  sale_income_daily: "Daily Sale & Income",
  purchase_payable_daily: "Purchase & Payable",
  inventory_daily: "Inventory Management Report",
  inventory_monthly: "Monthly Closing Stock",
};
const KIND_LABEL = IMPORT_FORMS;

const fmt = (n: unknown) => Number(n || 0).toLocaleString();

export default function ExcelImport({
  formId, reportDate, sectionIds, onApply, gate, onSkip,
}: {
  formId: string; reportDate: string;
  sectionIds: Record<string, string>;      // section title -> id
  onApply: (answers: Record<string, unknown>) => void;
  // When the report is still empty this stands in front of the form: the
  // file comes first, and the rest of the report follows from it.
  gate?: boolean;
  onSkip?: () => void;
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
      if (!r.ok) { setErr(d.error || "ဖိုင်ကို ဖတ်၍ မရပါ"); setP(null); }
      else if (d.kind !== formId) {
        // Saying which report it IS saves the walk back to the list.
        setErr(
          `ဒီဖိုင်က ${KIND_LABEL[d.kind] || d.kind} ပါ — ဒီ report နဲ့ မကိုက်ပါ။ ` +
          `${KIND_LABEL[formId] || formId} ဖိုင်ကို ရွေးပါ။`
        );
        setP(null);
      } else setP(d as Parsed);
    } catch (e) { setErr(String(e)); }
    setBusy(false);
  }

  async function apply() {
    if (!p) return;
    setBusy(true);
    // Names the master list has not seen are kept, unverified, so the same
    // spelling lands in the same place next month.
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

  const money = (rows: Record<string, unknown>[]) =>
    rows.reduce((a, r) =>
      a + Number(r.amount || 0) + Number(r.cash_amount || 0) + Number(r.credit_amount || 0)
        + Number(r.difference_value || 0) + Number(r.closing_value || 0) + Number(r.gap_value || 0), 0);

  const reset = () => {
    setP(null); setFile(null); setErr("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className={`bg-white rounded-xl mb-4 ${
      gate ? "border-2 border-dashed border-blue-200 p-6" : "border border-slate-200 p-4"
    }`}>
      {gate && (
        <>
          <h2 className="text-base font-semibold">ပထမဆုံး — Excel ဖိုင် တင်ပါ</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            {KIND_LABEL[formId] || formId} ဖိုင်ကို တင်လိုက်ရင် အကွက်တွေ အလိုအလျောက် ဖြည့်ပြီး
            အစီရင်ခံစာ ပေါ်လာပါမယ်။
          </p>
        </>
      )}

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

      {!gate && (
        <p className="text-xs text-slate-400 mt-2">
          Excel တင်လိုက်ရင် အကွက်တွေ အလိုအလျောက် ဖြည့်ပေးပါမယ်။ ပြီးရင် လိုသလို ပြင်လို့ရပါတယ်။
        </p>
      )}

      {/* A file that cannot be read says so here, where the file was
          chosen, rather than leaving an empty form and no explanation. */}
      {err && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{err}</p>
          <button onClick={reset} className="text-xs text-red-600 underline mt-1">
            တခြားဖိုင် ရွေးမည်
          </button>
        </div>
      )}

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

          {/* Shop by shop, the way the workbook is organised. */}
          {p.preview && p.preview.rows.length > 0 && (
            <div className="overflow-x-auto mb-4 border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    {p.preview.columns.map((c, i) => (
                      <th key={c} className={`px-3 py-2 font-medium ${i ? "text-right" : "text-left"}`}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.preview.rows.map((r, n) => (
                    <tr key={n} className="border-t border-slate-100">
                      {r.map((v, i) => (
                        <td key={i} className={`px-3 py-2 ${i ? "text-right tabular-nums" : "font-medium"}`}>
                          {typeof v === "number" ? fmt(v) : v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    {p.preview.columns.map((c, i) => (
                      <td key={c} className={`px-3 py-2 font-semibold ${i ? "text-right tabular-nums" : ""}`}>
                        {i === 0
                          ? "စုစုပေါင်း"
                          : /%/.test(c)
                          ? ""
                          : fmt(p.preview!.rows.reduce((a, r) => a + Number(r[i] || 0), 0))}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* The whole-report figures, as a list of pairs rather than a
              wall of boxes. */}
          {Object.keys(p.fixed).length > 0 && (
            <div className="overflow-hidden border border-slate-200 rounded-lg mb-3">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(p.fixed).map(([k, v], i) => (
                    <tr key={k} className={i ? "border-t border-slate-100" : ""}>
                      <td className="px-3 py-1.5 text-slate-500">{FIXED_LABEL[k] || k.replace(/_/g, " ")}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmt(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="overflow-hidden border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(p.sections).map(([title, rows], i) => (
                  <tr key={title} className={i ? "border-t border-slate-100" : ""}>
                    <td className={`px-3 py-1.5 ${sectionIds[title] ? "" : "text-red-500"}`}>
                      {title}{!sectionIds[title] && " (section ရှာမတွေ့)"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500 whitespace-nowrap">
                      {rows.length} row{money(rows) ? ` · ${fmt(money(rows))}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {p.unknown.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3">
              <div className="text-xs font-medium text-amber-800 mb-1">
                နာမည်အသစ် {p.unknown.length} ခု — သိမ်းပြီး နောက်မှ Master မှာ ပေါင်းလို့ရပါတယ်
              </div>
              <div className="text-xs text-amber-700">
                {p.unknown.slice(0, 40).map((u) => `${u.raw} (${u.kind})`).join(" · ")}
                {p.unknown.length > 40 && ` … +${p.unknown.length - 40}`}
              </div>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button onClick={apply} disabled={busy}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              ဖြည့်မည်
            </button>
            <button onClick={reset}
              className="border border-slate-200 rounded-lg px-4 py-2 text-sm">မလုပ်တော့</button>
          </div>
        </div>
      )}

      {/* A count that never produced a workbook still has to be filed. */}
      {gate && !p && onSkip && (
        <button onClick={onSkip} className="text-sm text-slate-500 underline mt-4">
          ဖိုင် မရှိဘူး — လက်နဲ့ ဖြည့်မယ်
        </button>
      )}
    </div>
  );
}
