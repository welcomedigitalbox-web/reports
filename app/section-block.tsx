"use client";

import { Trash2, Plus } from "lucide-react";
import type { FormField, FormSection } from "@/lib/supabase";

// Figures the form can work out for itself. Typing a percentage that the
// two numbers beside it already imply is an invitation to a wrong one.
const DERIVED: Record<string, { of: string; per: string }> = {
  achievement_pct: { of: "actual_sale", per: "daily_target" },
  conversion_rate: { of: "invoice_count", per: "customer_entrance" },
};

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

  function setRow(i: number, key: string, value: unknown) {
    const next = rows.map((r, idx) => {
      if (idx !== i) return r;
      const row = { ...r, [key]: value };

      // Recompute anything that reads this field, so the percentage
      // follows the numbers rather than being typed against them.
      for (const [target, src] of Object.entries(DERIVED)) {
        if (src.of !== key && src.per !== key) continue;
        const top = Number(row[src.of]);
        const bottom = Number(row[src.per]);
        row[target] =
          Number.isFinite(top) && Number.isFinite(bottom) && bottom > 0
            ? Math.round((top / bottom) * 1000) / 10
            : "";
      }
      return row;
    });
    onChange(section.id, next);
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
                      readOnly={readOnly || f.key in DERIVED}
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
                onChange={(v) => onChange(f.key, v)}
                readOnly={readOnly}
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
