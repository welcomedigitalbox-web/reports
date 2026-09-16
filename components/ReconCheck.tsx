"use client";
import type { FormSection } from "@/lib/supabase";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v || 0);
const fmt = (v: number) => v.toLocaleString();

export default function ReconCheck({
  formId, sections, answers,
}: { formId: string; sections: FormSection[]; answers: Record<string, unknown> }) {
  const rows = (title: string): Row[] => {
    const s = sections.find((x) => x.title === title);
    const v = s ? answers[s.id] : null;
    return Array.isArray(v) ? (v as Row[]) : [];
  };
  const sum = (title: string, key = "amount") =>
    rows(title).reduce((a, r) => a + n(r[key]), 0);

  const issues: string[] = [];
  const notes: string[] = [];

  if (formId === "cash_daily") {
    const open = n(answers.main_opening);
    const inc = sum("Main Cashbook · ငွေဝင်", "amount");
    const out = sum("Main Cashbook · ငွေထွက်", "amount");
    const close = open + inc - out;
    notes.push(`Main Cashbook: ${fmt(open)} + ${fmt(inc)} − ${fmt(out)} = ${fmt(close)}`);
    if (answers.main_closing != null && String(answers.main_closing) !== "" &&
        Math.abs(n(answers.main_closing) - close) > 1)
      issues.push(`Main Closing ကွာနေပါတယ် — တွက်ချက်ချက် ${fmt(close)} · ရိုက်ထားတာ ${fmt(n(answers.main_closing))}`);

    const pOpen = n(answers.petty_opening) + n(answers.petty_transfer_in);
    const pOut = sum("Petty Cashbook · ငွေထွက်", "amount");
    notes.push(`Petty Cashbook: ${fmt(pOpen)} − ${fmt(pOut)} = ${fmt(pOpen - pOut)}`);
    if (answers.petty_closing != null && String(answers.petty_closing) !== "" &&
        Math.abs(n(answers.petty_closing) - (pOpen - pOut)) > 1)
      issues.push(`Petty Closing ကွာနေပါတယ် — တွက်ချက်ချက် ${fmt(pOpen - pOut)}`);
  }

  if (formId === "sale_income_daily") {
    const sale = sum("ဆိုင်အလိုက် ရောင်းအား");
    const cc = rows("ဆိုင်အလိုက် ငွေသား / အကြွေး")
      .reduce((a, r) => a + n(r.cash_amount) + n(r.credit_amount), 0);
    const ct = sum("Cash Type အလိုက် ငွေဝင်");
    notes.push(`ရောင်းအား ${fmt(sale)} · ငွေသား+အကြွေး ${fmt(cc)} · Cash Type ${fmt(ct)}`);
    if (sale && cc && Math.abs(sale - cc) > 1)
      issues.push(`ရောင်းအား (${fmt(sale)}) နဲ့ ငွေသား+အကြွေး (${fmt(cc)}) မတူပါ — ကွာ ${fmt(Math.abs(sale - cc))}`);
  }

  if (formId === "purchase_payable_daily") {
    const pay = sum("Payment · ပေးချေမှု");
    const out = sum("Cash & Bank Out");
    notes.push(`ပေးချေမှု ${fmt(pay)} · Cash & Bank Out ${fmt(out)}`);
    if (pay && out && Math.abs(pay - out) > 1)
      issues.push(`ပေးချေမှု (${fmt(pay)}) နဲ့ Cash & Bank Out (${fmt(out)}) မတူပါ — ကွာ ${fmt(Math.abs(pay - out))}`);
  }

  if (!notes.length) return null;

  return (
    <div className={`rounded-xl p-4 mb-4 border ${issues.length ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
      <div className="text-sm font-medium mb-1">
        {issues.length ? "⚠ စစ်ဆေးချက် — ကွာဟမှု တွေ့ပါတယ်" : "✓ စစ်ဆေးချက်"}
      </div>
      {issues.map((s, i) => <div key={i} className="text-sm text-red-700">{s}</div>)}
      {notes.map((s, i) => <div key={i} className="text-xs text-slate-500 mt-0.5">{s}</div>)}
    </div>
  );
}
