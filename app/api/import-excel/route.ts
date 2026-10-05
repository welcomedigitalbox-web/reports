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

  // A plain number, zero included. The existing num() treats 0 as absent
  // because a blank cell and a zero mean the same thing in a cashbook. In
  // a stock count they do not: zero on the shelf is a fact.
  const plain = (v: Cell): number | null => {
    const t = String(v ?? "").trim();
    if (t === "") return null;
    const n = Number(t.replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  // The header is not always the first row: a banner sits above it, and
  // sometimes the number columns are grouped under one spanning title.
  const headerRow = (rows: Cell[][], need: string[]) => {
    for (let r = 0; r < Math.min(8, rows.length); r++) {
      const line = rows[r].map((c) => String(c ?? "").toLowerCase()).join("|");
      if (need.every((w) => line.includes(w))) return r;
    }
    // A spanning title leaves the real names one row down.
    for (let r = 0; r < Math.min(8, rows.length); r++) {
      const a = rows[r].map((c) => String(c ?? "").toLowerCase()).join("|");
      const b = (rows[r + 1] || []).map((c) => String(c ?? "").toLowerCase()).join("|");
      if (need.every((w) => (a + "|" + b).includes(w))) return r + 1;
    }
    return -1;
  };

  // Column names are read rather than counted, because the shops' sheets
  // do not agree on where things sit. Both header rows are consulted.
  const columns = (rows: Cell[][], h: number) => {
    const out: Record<string, number | undefined> = {};
    const label = (i: number) =>
      (String(rows[h]?.[i] ?? "").trim() || String(rows[h - 1]?.[i] ?? "").trim()).toLowerCase();
    const width = Math.max(rows[h]?.length ?? 0, rows[h - 1]?.length ?? 0);
    for (let i = 0; i < width; i++) {
      const t = label(i);
      if (!t) continue;
      if (/^code/.test(t)) out.code ??= i;
      else if (/descrip|item/.test(t)) out.desc ??= i;
      else if (/^opening/.test(t)) out.opening ??= i;
      else if (/^in$|^in\b/.test(t)) out.in_qty ??= i;
      else if (/^out/.test(t)) out.out_qty ??= i;
      else if (/^closing/.test(t)) out.closing ??= i;
      else if (/^qty|quantity/.test(t)) out.qty ??= i;
      else if (/ground/.test(t)) out.ground ??= i;
      else if (/differ/.test(t)) out.difference ??= i;
      else if (/^price/.test(t)) out.price ??= i;
      else if (/^total amount/.test(t)) out.total_amount ??= i;
      else if (/^amount/.test(t)) out.unit_amount ??= i;
    }
    // The valuation sheets call the unit price "Amount" and the line
    // total "Total Amount"; the count sheets call the unit price "Price".
    if (out.qty == null && out.closing != null) out.qty = out.closing;
    return out;
  };

  // Which sheets are a stock count, and which are a month's closing.
  const banner = (name: string) => String(grid(name)[0]?.[0] ?? "").toLowerCase();
  const invSheets = () =>
    wb.SheetNames.filter((n) => /inventory management/i.test(banner(n)));
  const monthlySheets = () =>
    wb.SheetNames.filter((n) => /monthly clo/i.test(banner(n)));

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


  // ========== INVENTORY: THE DAILY COUNT ==========
  // One sheet per shop, named for it. Columns: No, Code, Description,
  // Qty (system), Ground (counted), Different, Price, Amount. The header
  // sits on row 2 or 3 because "Closing Stock" spans the number columns.
  else if (invSheets().length > 0 && !monthlySheets().length) {
    kind = "inventory_daily";
    let sku = 0, sysQty = 0, grdQty = 0, matched = 0, short = 0, over = 0, neg = 0;
    const diffs: Record<string, unknown>[] = [];

    for (const name of invSheets()) {
      const g = grid(name);
      const h = headerRow(g, ["code", "qty"]);
      if (h < 0) continue;
      const c = columns(g, h);
      const branch = look(M_BR, name.trim(), "branch");

      for (let r = h + 1; r < g.length; r++) {
        const code = String(g[r]?.[c.code ?? 1] ?? "").trim();
        const nameCell = String(g[r]?.[c.desc ?? 2] ?? "").trim();
        if (!code || isTotal(code) || isTotal(nameCell)) continue;

        const sq = plain(g[r]?.[c.qty ?? 3]);
        const gq = c.ground == null ? null : plain(g[r]?.[c.ground]);
        const price = c.price == null ? 0 : plain(g[r]?.[c.price]) ?? 0;
        if (sq == null && gq == null) continue;

        sku++;
        sysQty += sq ?? 0;
        grdQty += gq ?? 0;
        if ((sq ?? 0) < 0) neg++;

        // A blank Ground means nobody counted it, which is not the same
        // as counting zero. Those lines are left out of the difference.
        if (gq == null) continue;
        const d = (sq ?? 0) - gq;
        if (d === 0) { matched++; continue; }
        const value = d * price;
        if (d > 0) short += value; else over += -value;

        diffs.push({
          location: branch, product_code: code, product_name: nameCell,
          system_qty: sq ?? 0, ground_qty: gq, difference: d,
          unit_price: price, difference_value: value,
          root_cause: "", action_taken: "", status: "Open",
        });
      }
    }

    fixed.stores_counted = invSheets().length;
    fixed.total_sku = sku;
    fixed.system_qty = sysQty;
    fixed.ground_qty = grdQty;
    fixed.match_sku = matched;
    fixed.diff_sku = diffs.length;
    fixed.short_value = short;
    fixed.over_value = over;
    fixed.net_value = short - over;
    fixed.negative_sku = neg;
    fixed.accuracy_pct = matched + diffs.length
      ? Math.round((matched / (matched + diffs.length)) * 1000) / 10 : 0;

    // Worst first: the money is what gets looked at, not the alphabet.
    diffs.sort((a, b) =>
      Math.abs(Number(b.difference_value)) - Math.abs(Number(a.difference_value)));
    // A thousand lines is not a report anybody works through. The money
    // is in the first few dozen, so those are filed and the count of the
    // rest is stated plainly — the workbook is attached either way, so
    // nothing is lost, and nobody is misled into thinking this is all.
    const CAP = 200;
    fixed.diff_sku_filed = Math.min(diffs.length, CAP);
    sections["B. Differences"] = diffs.slice(0, CAP);
    available = [usedDate];
  }

  // ========== INVENTORY: THE MONTH'S CLOSING ==========
  // Per shop, two sheets: the movement (Opening, In, Out, Closing) and
  // the valuation (Closing, Amount, Total Amount). They are matched up
  // by the shop named in the first cell of each.
  else if (monthlySheets().length > 0) {
    kind = "inventory_monthly";

    type Row = { open: number; inq: number; out: number; close: number; name: string };
    const move = new Map<string, Map<string, Row>>();   // branch -> code -> row
    const price = new Map<string, Map<string, number>>();
    const value = new Map<string, number>();
    const skuCount = new Map<string, number>();

    for (const name of wb.SheetNames) {
      const g = grid(name);
      const banner = String(g[0]?.[0] ?? "");
      const h = headerRow(g, ["code", "closing"]);
      if (h < 0) continue;
      const c = columns(g, h);
      // The shop is named in the banner above the header, which is the
      // only place it appears — sheet names are dates on half of them.
      const branch = look(M_BR, (banner.split(/showroom|monthly|daily/i)[0] || name).trim(), "branch");
      const valuation = c.unit_amount != null && c.total_amount != null;

      for (let r = h + 1; r < g.length; r++) {
        const code = String(g[r]?.[c.code ?? 1] ?? "").trim();
        const pname = String(g[r]?.[c.desc ?? 2] ?? "").trim();
        if (!code || isTotal(code) || isTotal(pname)) continue;
        const close = plain(g[r]?.[c.closing ?? 3]);
        if (close == null) continue;

        if (valuation) {
          const unit = plain(g[r]?.[c.unit_amount!]) ?? 0;
          const tot = plain(g[r]?.[c.total_amount!]) ?? close * unit;
          if (!price.has(branch)) price.set(branch, new Map());
          price.get(branch)!.set(code, unit);
          value.set(branch, (value.get(branch) ?? 0) + tot);
          skuCount.set(branch, (skuCount.get(branch) ?? 0) + 1);
        } else {
          if (!move.has(branch)) move.set(branch, new Map());
          move.get(branch)!.set(code, {
            open: plain(g[r]?.[c.opening ?? 3]) ?? 0,
            inq: plain(g[r]?.[c.in_qty ?? 4]) ?? 0,
            out: plain(g[r]?.[c.out_qty ?? 5]) ?? 0,
            close, name: pname,
          });
        }
      }
    }

    const byShop: Record<string, unknown>[] = [];
    const problems: Record<string, unknown>[] = [];
    let tSku = 0, tQty = 0, tVal = 0, tNeg = 0, tNegVal = 0, tUnbal = 0;

    for (const branch of new Set([...move.keys(), ...value.keys()])) {
      const rows = move.get(branch) || new Map<string, Row>();
      const px = price.get(branch) || new Map<string, number>();
      let open = 0, inq = 0, out = 0, close = 0, negs = 0;

      for (const [code, r] of rows) {
        open += r.open; inq += r.inq; out += r.out; close += r.close;
        const unit = px.get(code) ?? 0;

        if (r.close < 0) {
          negs++; tNeg++; tNegVal += r.close * unit;
          problems.push({
            location: branch, product_code: code, product_name: r.name,
            problem: "Negative closing stock",
            opening_qty: r.open, in_qty: r.inq, out_qty: r.out, closing_qty: r.close,
            expected_qty: r.open + r.inq - r.out, gap: r.close - (r.open + r.inq - r.out),
            gap_value: r.close * unit, root_cause: "", status: "Open",
          });
          continue;
        }
        // Opening plus what came in, less what went out, is what should
        // be on the shelf. Where it is not, a movement went unrecorded.
        const expected = r.open + r.inq - r.out;
        if (Math.abs(expected - r.close) > 0.001) {
          tUnbal++;
          problems.push({
            location: branch, product_code: code, product_name: r.name,
            problem: "Movement does not add up",
            opening_qty: r.open, in_qty: r.inq, out_qty: r.out, closing_qty: r.close,
            expected_qty: expected, gap: r.close - expected,
            gap_value: (r.close - expected) * unit, root_cause: "", status: "Open",
          });
        }
      }

      const shopSku = skuCount.get(branch) ?? rows.size;
      const shopVal = value.get(branch) ?? 0;
      tSku += shopSku; tQty += close; tVal += shopVal;

      byShop.push({
        location: branch, total_sku: shopSku,
        opening_qty: open, in_qty: inq, out_qty: out,
        closing_qty: close, closing_value: shopVal, negative_sku: negs,
      });
    }

    fixed.stores_counted = byShop.length;
    fixed.total_sku = tSku;
    fixed.closing_qty = tQty;
    fixed.closing_value = tVal;
    fixed.negative_sku = tNeg;
    fixed.negative_value = tNegVal;
    fixed.unbalanced_sku = tUnbal;

    byShop.sort((a, b) => String(a.location).localeCompare(String(b.location)));
    problems.sort((a, b) => Math.abs(Number(b.gap_value)) - Math.abs(Number(a.gap_value)));
    sections["B. By shop"] = byShop;
    sections["C. To settle before closing"] = problems.slice(0, 200);
    available = [usedDate];
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
