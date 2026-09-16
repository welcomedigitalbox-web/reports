import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 60;

type Cell = string | number | null;
const num = (v: Cell) => {
  const n = Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
};
const isTotal = (s: string) =>
  /^(total|opening|closing|branch name|cash type|particular|supplier)/i.test(s.trim());

// "01.09.2026" / Date / "1.9.26" -> YYYY-MM-DD
function toISO(v: Cell): string | null {
  if (v == null) return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const m = String(v).trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? "20" + m[3] : m[3];
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: me } = await sb.auth.getUser(token);
  if (!me.user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const wantDate = String(form.get("date") || "");
  if (!file) return NextResponse.json({ error: "ဖိုင် မပါပါ" }, { status: 400 });

  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
  const grid = (name: string): Cell[][] => {
    const ws = wb.Sheets[name];
    return ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as Cell[][]) : [];
  };
  const sheet = (...names: string[]) =>
    wb.SheetNames.find((s) => names.some((n) => s.toLowerCase().includes(n))) || "";

  // ---- master lookup ----
  const [sup, cty, exp, br] = await Promise.all([
    sb.from("report_suppliers").select("name,aliases"),
    sb.from("report_cash_types").select("name,aliases"),
    sb.from("report_expense_types").select("name,aliases"),
    sb.from("report_branches").select("id,name,aliases"),
  ]);
  type M = { name: string; aliases: string[] | null };
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u1000-\u109f]/g, "");
  const index = (rows: M[]) => {
    const m = new Map<string, string>();
    for (const r of rows || []) {
      m.set(norm(r.name), r.name);
      for (const a of r.aliases || []) m.set(norm(a), r.name);
    }
    return m;
  };
  const M_SUP = index((sup.data as M[]) || []);
  const M_CTY = index((cty.data as M[]) || []);
  const M_EXP = index((exp.data as M[]) || []);
  const M_BR = index((br.data as M[]) || []);

  const unknown: { kind: string; raw: string }[] = [];
  const look = (m: Map<string, string>, raw: string, kind: string) => {
    const hit = m.get(norm(raw));
    if (hit) return hit;
    unknown.push({ kind, raw: raw.trim() });
    return raw.trim();
  };

  // ---- date columns (row with 01.09.2026 …) ----
  function dateCols(rows: Cell[][]) {
    for (let r = 0; r < Math.min(6, rows.length); r++) {
      const cols: { i: number; iso: string }[] = [];
      rows[r].forEach((c, i) => { const d = toISO(c); if (d) cols.push({ i, iso: d }); });
      if (cols.length) return { header: r, cols };
    }
    return { header: -1, cols: [] as { i: number; iso: string }[] };
  }

  // rows under a label, for one date column
  function collect(rows: Cell[][], start: number, end: number, col: number) {
    const out: { label: string; amount: number }[] = [];
    for (let r = start; r < end && r < rows.length; r++) {
      const label = String(rows[r]?.[0] ?? "").trim();
      if (!label || isTotal(label)) continue;
      const a = num(rows[r]?.[col] ?? null);
      if (a != null) out.push({ label, amount: a });
    }
    return out;
  }
  const findRow = (rows: Cell[][], re: RegExp, from = 0) =>
    rows.findIndex((r, i) => i >= from && re.test(String(r?.[0] ?? "")));

  const sections: Record<string, unknown[]> = {};
  const fixed: Record<string, unknown> = {};
  let kind = "";
  let usedDate = wantDate;
  let available: string[] = [];

  // ========== CASHBOOK ==========
  if (sheet("main cashbook")) {
    kind = "cash_daily";
    const main = grid(sheet("main cashbook"));
    const petty = grid(sheet("petty"));
    const d = toISO(main[1]?.[1] ?? null) || toISO(petty[1]?.[1] ?? null);
    if (d) { usedDate = d; available = [d]; }

    const inc = findRow(main, /opening balance/i);
    const totInc = findRow(main, /total income/i);
    const totExp = findRow(main, /total expense/i, totInc);
    fixed.main_opening = num(main[inc]?.[1] ?? null) ?? 0;
    sections["Main Cashbook · ငွေဝင်"] = collect(main, inc + 1, totInc, 1)
      .map((x) => ({ source: x.label, amount: x.amount, remark: "" }));
    sections["Main Cashbook · ငွေထွက်"] = collect(main, totInc + 1, main.length, 1)
      .filter((x) => !/^total|^closing/i.test(x.label))
      .map((x) => ({ expense_type: look(M_EXP, x.label, "expense"), amount: x.amount, remark: "" }));

    const pOpen = findRow(petty, /opening balance/i);
    const pTot = findRow(petty, /total petty|total .*income/i);
    fixed.petty_opening = num(petty[pOpen]?.[1] ?? null) ?? 0;
    fixed.petty_transfer_in = num(petty[pOpen + 1]?.[1] ?? null) ?? 0;
    sections["Petty Cashbook · ငွေထွက်"] = collect(petty, pTot + 1, petty.length, 1)
      .filter((x) => !/^total|^closing/i.test(x.label))
      .map((x) => ({ expense_type: look(M_EXP, x.label, "expense"), amount: x.amount, remark: "" }));
  }

  // ========== SALE & INCOME ==========
  else if (sheet("daily sale")) {
    kind = "sale_income_daily";
    const sale = grid(sheet("daily sale"));
    const inc = grid(sheet("today income"));
    const ct = grid(sheet("cash type"));
    const dc = dateCols(sale);
    available = dc.cols.map((c) => c.iso);
    const pick = dc.cols.find((c) => c.iso === wantDate) || dc.cols[dc.cols.length - 1];
    if (!pick) return NextResponse.json({ error: "ရက်စွဲ ရှာမတွေ့ပါ" }, { status: 400 });
    usedDate = pick.iso;

    const tot = findRow(sale, /total sale/i);
    sections["ဆိုင်အလိုက် ရောင်းအား"] = collect(sale, dc.header + 2, tot, pick.i)
      .map((x) => ({ branch: look(M_BR, x.label, "branch"), amount: x.amount }));

    const cashHead = findRow(sale, /cash in hand/i);
    if (cashHead > 0) {
      const rows = collect(sale, cashHead + 2, sale.length, pick.i)
        .filter((x) => !/^total/i.test(x.label));
      const byBranch = new Map<string, { cash_amount: number; credit_amount: number }>();
      for (const x of rows) {
        const credit = /credit/i.test(x.label);
        const key = look(M_BR, x.label.replace(/credit/i, "").trim(), "branch");
        const e = byBranch.get(key) || { cash_amount: 0, credit_amount: 0 };
        if (credit) e.credit_amount += x.amount; else e.cash_amount += x.amount;
        byBranch.set(key, e);
      }
      sections["ဆိုင်အလိုက် ငွေသား / အကြွေး"] =
        [...byBranch].map(([branch, v]) => ({ branch, ...v }));
    }

    const dIdx = dateCols(inc);
    const dPick = dIdx.cols.find((c) => c.iso === usedDate);
    if (dPick) {
      const start = findRow(inc, /delivery|safe|fast|express/i);
      sections["Delivery / အကြွေး ပြန်ရငွေ"] = collect(inc, start, inc.length, dPick.i)
        .filter((x) => !/^total/i.test(x.label))
        .map((x) => ({ partner: x.label, amount: x.amount }));
    }

    const cIdx = dateCols(ct);
    const cPick = cIdx.cols.find((c) => c.iso === usedDate);
    if (cPick) {
      sections["Cash Type အလိုက် ငွေဝင်"] = collect(ct, cIdx.header + 2, ct.length, cPick.i)
        .map((x) => ({ cash_type: look(M_CTY, x.label, "cash_type"), amount: x.amount }));
    }
  }

  // ========== PURCHASE & PAYABLE ==========
  else if (sheet("purchase")) {
    kind = "purchase_payable_daily";
    const map: [string, string, string][] = [
      ["purchase", "Purchase · ဝယ်ယူမှု", "supplier"],
      ["payable", "Payable · ပေးရန်ကျန်", "supplier"],
      ["payment", "Payment · ပေးချေမှု", "supplier"],
      ["cash type", "Cash & Bank Out", "cash_type"],
    ];
    const first = grid(sheet("purchase"));
    const fd = dateCols(first);
    available = fd.cols.map((c) => c.iso);
    const pickIso = (fd.cols.find((c) => c.iso === wantDate) || fd.cols[fd.cols.length - 1])?.iso;
    if (!pickIso) return NextResponse.json({ error: "ရက်စွဲ ရှာမတွေ့ပါ" }, { status: 400 });
    usedDate = pickIso;

    for (const [sheetKey, title, field] of map) {
      const g = grid(sheet(sheetKey));
      if (!g.length) continue;
      const d = dateCols(g);
      const col = d.cols.find((c) => c.iso === usedDate);
      if (!col) continue;
      const rows = collect(g, d.header + 2, g.length, col.i);
      sections[title] = rows.map((x) =>
        field === "supplier"
          ? { supplier: look(M_SUP, x.label, "supplier"), amount: x.amount, remark: "" }
          : { cash_type: look(M_CTY, x.label, "cash_type"), amount: x.amount });
    }
  } else {
    return NextResponse.json({ error: "ဒီ Excel ပုံစံကို မသိပါ" }, { status: 400 });
  }

  const seen = new Set<string>();
  const newOnes = unknown.filter((u) => {
    const k = u.kind + "|" + u.raw;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return NextResponse.json({ kind, date: usedDate, available, sections, fixed, unknown: newOnes });
}
