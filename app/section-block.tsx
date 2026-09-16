"use client";
import { useRef, useState, useEffect } from "react";

import { Trash2, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { FormField, FormSection } from "@/lib/supabase";

// Figures the form can work out for itself. Typing a percentage that the
// two numbers beside it already imply is an invitation to a wrong one,
// and a difference column is a subtraction nobody should be doing by eye.
//
// Ratios: target = round(of / per * 100, 1)
// Comparison Period ရွေးထားတာနဲ့ အတိုင်းအတာ လိုက်ညှိ
const UNIT_BY_CMP: Record<string, [string, string]> = {
  "1 Day": ["ယခုရက်", "ယခင်ရက်"],
  "1 Week": ["ယခုအပတ်", "ယခင်အပတ်"],
  "1 Month": ["ယခုလ", "ယခင်လ"],
};

const DERIVED: Record<string, { of: string; per: string }> = {
  achievement_pct: { of: "actual_sale", per: "daily_target" },
  conversion_rate: { of: "invoice_count", per: "customer_entrance" },
  attendance_pct:  { of: "present", per: "total_employees" },
  roas:            { of: "sale_amount", per: "ad_spend" },
};

// Quotients: target = round(of / per) — a money figure, not a percentage.
const QUOTIENT: Record<string, { of: string; per: string }> = {
  avg_invoice: { of: "actual_sale", per: "invoice_count" },
};

// Differences: target = a - b. Warehouse counts what arrived against what
// was sent; stock counts the shelf against the system.
const DIFFERENCE: Record<string, [string, string]> = {
  difference:       ["received_qty", "quantity"],
  cash_difference:  ["physical_closing", "expected_closing"],
  variance:         ["received", "pos_sale"],
};

// Sums: target = the fields listed, added up.
const SUM_OF: Record<string, string[]> = {
  total_received:   ["cash", "kbz", "aya", "kpay", "wave", "other_bank"],
  expected_closing: ["opening_balance", "cash_in"],
};

// The stock exception table subtracts one way and values the result the
// other, so it gets its own pass rather than a third generic rule.
const STOCK_DIFF = { key: "difference", ground: "ground_qty", system: "system_qty" };

type Props = {
  section: FormSection;
  answers: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  readOnly: boolean;
  stores: { id: string; name: string }[];
  people: { id: string; email: string }[];
  // The shop this account works from, so a new row starts where they are.
  defaultStore?: string | null;
};


// Everything a row can work out from what it now holds. Runs on every
// edit rather than on the fields that happen to feed a formula, so a
// value pasted in from anywhere still lands the derived ones.
function recompute(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  const num = (k: string) => Number(out[k]);

  for (const [target, src] of Object.entries(DERIVED)) {
    const top = num(src.of);
    const bottom = num(src.per);
    out[target] =
      Number.isFinite(top) && Number.isFinite(bottom) && bottom > 0
        ? Math.round((top / bottom) * 1000) / 10
        : "";
  }

  for (const [target, src] of Object.entries(QUOTIENT)) {
    const top = num(src.of);
    const bottom = num(src.per);
    out[target] =
      Number.isFinite(top) && Number.isFinite(bottom) && bottom > 0
        ? Math.round(top / bottom)
        : "";
  }

  for (const [target, [a, b]] of Object.entries(DIFFERENCE)) {
    const x = num(a);
    const y = num(b);
    out[target] = Number.isFinite(x) && Number.isFinite(y) ? x - y : "";
  }

  for (const [target, parts] of Object.entries(SUM_OF)) {
    const vals = parts.map(num).filter(Number.isFinite);
    // An untouched section should stay blank rather than reading zero.
    out[target] = vals.length ? vals.reduce((a, b) => a + b, 0) : "";
  }

  // Stock exceptions: the shelf against the books, and what that is worth.
  const ground = num(STOCK_DIFF.ground);
  const system = num(STOCK_DIFF.system);
  if (Number.isFinite(ground) && Number.isFinite(system)) {
    out[STOCK_DIFF.key] = ground - system;
  }

  return out;
}

const COMPUTED = new Set([
  ...Object.keys(DERIVED),
  ...Object.keys(QUOTIENT),
  ...Object.keys(DIFFERENCE),
  ...Object.keys(SUM_OF),
  "target",
]);

// One control per field type. Everything is stored as a string except
// numbers and yes/no, because the answers are jsonb and the form
// definition - not the column - is what says how to read them back.
function Field({
  field,
  value,
  onChange,
  readOnly,
  stores,
  people,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
  stores: Props["stores"];
  people: Props["people"];
}) {
  const base =
    "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500";
  const v = value ?? "";

  switch (field.field_type) {
    case "textarea":
      return (
        <textarea
          rows={3}
          className={base}
          value={String(v)}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
    case "money":
    case "percent":
      return (
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            className={base}
            value={String(v)}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          />
          {field.field_type !== "number" && (
            <span className="absolute right-3 top-2 text-xs text-slate-400">
              {field.field_type === "money" ? "MMK" : "%"}
            </span>
          )}
        </div>
      );

    case "date":
      return (
        <input
          type="date"
          className={base}
          value={String(v)}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "select":
      return (
        <select
          className={base}
          value={String(v)}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {(field.options || []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );

    case "yesno":
      // Three states, not two: unanswered is different from "no", and a
      // blank tickbox hides that difference.
      return (
        <div className="flex gap-2">
          {[["yes", "Yes"], ["no", "No"]].map(([val, label]) => (
            <button
              key={val}
              type="button"
              disabled={readOnly}
              onClick={() => onChange(v === val ? "" : val)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                v === val
                  ? val === "yes"
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-red-600 text-white border-red-600"
                  : "border-slate-200 text-slate-600"
              } disabled:opacity-60`}
            >
              {label}
            </button>
          ))}
        </div>
      );

    case "store":
      return (
        <select
          className={base}
          value={String(v)}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      );

    case "user":
      return (
        <select
          className={base}
          value={String(v)}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {people.map((p) => (
            <option key={p.id} value={p.email}>{p.email}</option>
          ))}
        </select>
      );

    case "file":
      // Uploads are not wired up yet; a link to wherever the evidence
      // lives is more useful than a box that does nothing.
      return (
        <input
          type="url"
          placeholder="https://…"
          className={base}
          value={String(v)}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    default:
      return (
        <input
          type="text"
          className={base}
          value={String(v)}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export default function SectionBlock({
  section, answers, onChange, readOnly, stores, people, defaultStore,
}: Props) {
  // A table section keeps its rows as an array under the section id, so
  // adding a supplier does not need a schema change.
  const rows = (answers[section.id] as Record<string, unknown>[]) || [];
  const targetCache = useRef(new Map<string, number | null>());
  const [dept, setDept] = useState<string>("");
  useEffect(() => {
    supabase.from("profiles").select("department").eq("id", "").maybeSingle();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from("profiles").select("department").eq("id", data.user.id).maybeSingle();
      setDept(String((p as { department?: string } | null)?.department || ""));
    });
  }, []);

  function setRow(i: number, key: string, value: unknown) {
    const next = rows.map((r, idx) =>
      idx === i ? recompute({ ...r, [key]: value }) : r
    );
    onChange(section.id, next);

    // Picking a KPI pulls the target the manager set, so nobody types it in.
    if (key === "kpi" && value) {
      const metric = String(value);
      const cached = targetCache.current.get(metric);
      const apply = (v: number | null) => {
        if (v == null) return;
        onChange(section.id, next.map((r, idx) =>
          idx === i ? recompute({ ...r, target: v }) : r
        ));
      };
      if (cached !== undefined) { apply(cached); return; }
      supabase.rpc("get_target", { p_metric: metric, p_department: dept || null })
        .then(({ data }) => {
          const v = data == null ? null : Number(data);
          targetCache.current.set(metric, v);
          apply(v);
        });

      // Comparison Period က အတိုင်းအတာကို ပြောပြီးသား, ပြီးတော့ အရင်ကာလ data ကို ဆွဲ
      const cmp = String(answers["comparison_period"] || "");
      const units = UNIT_BY_CMP[cmp];
      const unit = units ? units[0] : String((next[i] || {}).this_period_unit || "");
      const prevUnit = units ? units[1] : String((next[i] || {}).last_period_unit || "");
      supabase
        .rpc("get_prev_kpi", {
          p_form_id: section.form_id,
          p_kpi: metric,
          p_before: String(answers["period_start"] || new Date().toISOString().slice(0, 10)),
          p_unit: prevUnit || unit,
        })
        .then(({ data }) => {
          onChange(section.id, next.map((r, idx) => idx !== i ? r : recompute({
            ...r,
            ...(units ? { this_period_unit: units[0], last_period_unit: units[1] } : {}),
            ...(data == null ? {} : { last_period: Number(data) }),
          })));
        });
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="font-medium text-sm">{section.title}</h3>
        {section.title_mm && (
          <p className="text-xs text-slate-500 mt-0.5">{section.title_mm}</p>
        )}
      </div>

      {section.is_table ? (
        <div className="p-4">
          {rows.length === 0 && (
            <p className="text-sm text-slate-400 mb-3">No rows yet</p>
          )}

          {rows.map((row, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">#{i + 1}</span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onChange(section.id, rows.filter((_, x) => x !== i))}
                    className="text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {section.fields.map((f) => (
                  <div key={f.id}>
                    <label className="text-xs text-slate-600 block mb-1">
                      {f.label}
                      {f.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <Field
                      field={f}
                      value={row[f.key]}
                      onChange={(v) => setRow(i, f.key, v)}
                      readOnly={readOnly || COMPUTED.has(f.key)}
                      stores={stores}
                      people={people}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {!readOnly && (
            <button
              type="button"
              onClick={() => {
                const seed: Record<string, unknown> = {};
                const storeField = section.fields.find((f) => f.field_type === "store");
                if (storeField && defaultStore) seed[storeField.key] = defaultStore;
                onChange(section.id, [...rows, seed]);
              }}
              className="flex items-center gap-1.5 text-sm text-blue-600 font-medium"
            >
              <Plus size={14} /> Add row
            </button>
          )}
        </div>
      ) : (
        <div className="p-4 grid sm:grid-cols-2 gap-4">
          {section.fields.map((f) => (
            <div key={f.id}>
              <label className="text-sm text-slate-600 block mb-1">
                {f.label}
                {f.required && <span className="text-red-500 ml-0.5">*</span>}
                {f.label_mm && (
                  <span className="text-xs text-slate-400 block">{f.label_mm}</span>
                )}
              </label>
              <Field
                field={f}
                value={answers[f.key]}
                onChange={(v) => {
                  // A plain section is one flat set of answers, so the
                  // recompute runs across the whole submission.
                  const next = recompute({ ...answers, [f.key]: v });
                  for (const k of [f.key, ...COMPUTED]) {
                    if (next[k] !== answers[k]) onChange(k, next[k]);
                  }
                }}
                readOnly={readOnly || COMPUTED.has(f.key)}
                stores={stores}
                people={people}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
