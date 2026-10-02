import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
// Thinking plus several queries takes longer than a page load. The owner is
// waiting for an answer worth having, not for the fastest possible reply.
export const maxDuration = 300;

const SYSTEM = `You are the business analyst for Edu Baby House (baby products retail, Myanmar).
You answer the owner's questions using ONLY data from the database via the run_sql tool.
You can see the daily reports the staff file AND the live POS and finance data.
Today is ${"${TODAY}"}. Currency is MMK.

Views (PostgreSQL, read-only):
- ai_reports(id, report_date, department, form_name, cadence, store, created_by, status, overall_status, submitted_at, approved_by, approved_at, reject_reason)
   Filed reports only. A day nobody filed has no row here, so never conclude from this view that everyone filed.
- ai_report_coverage(form_id, form_name, department, day, store_id, status)
   One row per daily form per day for the last 60 days, whether or not it was filed.
   status = 'missing' means nobody filed that form that day. Use THIS view for
   questions about who did not report, late reporting, or reporting discipline.
- ai_metrics(submission_id, report_date, department, form_name, store, created_by, status, section, row_no, metric, label, value numeric)
   common metrics: daily_target, actual_sale, invoice_count, customer_entrance, credit_sale, return_count, lost_sale,
   po_new, po_pending, po_confirmed, po_cancelled, purchase_value, ads_spend, ads_messages, page_reach, new_followers ...
   office: total_employees, present, attendance_pct. marketing weekly: target, this_week, last_week, page_reach, page_engagement, new_followers, posts_count, reels_count, stories_count.
   Only query for other metrics if truly needed: select distinct department, metric, label from ai_metrics
- ai_texts(submission_id, report_date, department, form_name, store, created_by, field, label, row_no, text)
   free text: issues, action plans, stock-out items, supplier follow-up, recommendations, special events. Search with ILIKE.
- ai_people(email, role, department, store, reports_to)

Live business data (POS and finance, read-only):
- ai_daily(day, store_id, store, sales_amount, invoices, gross_profit, discount, units_sold,
  online_amount, online_invoices, returns_amount, returns_count, target, reported_sale,
  reported_invoices, customers_in, lost_sale, credit_sale, achievement_pct, reported_gap_pct,
  report_filed)
   One row per shop per day. sales_amount/gross_profit come from the till; target, reported_sale
   and customers_in come from what the shop wrote in its daily report. reported_gap_pct is how
   far the reported figure sits from the till, so a large value means the report is wrong, not
   that the shop performed differently. THIS IS THE VIEW TO TRY FIRST.
   The POS is not yet in daily use. sales_amount, invoices and gross_profit from the till are
   near zero while the shops still write their figures into the daily report, so reported_sale is
   the real figure for now. Never report a 0% achievement as poor selling: say the sale was not
   entered into the POS, and compare against reported_sale instead.
- ai_sales(id, sale_ref, store_id, cashier, cashier_email, total, subtotal, discount_amount,
  vat_amount, payment_method, customer_id, customer_name, order_type, order_status, channel,
  sale_rep_name, balance_due, due_date, created_at)
   One row per sale. total is the amount charged. Use (created_at at time zone 'Asia/Yangon')::date for the shop's day.
- ai_sale_items(id, sale_id, product_id, product_name, qty, unit_price, line_total,
  unit_cost, line_cogs, promotion_id, promo_discount, is_free_gift, variant_id, created_at)
   Gross profit of a line = line_total - line_cogs. Join to ai_sales on sale_id for date and store.
- ai_stock(store_id, product_id, stock_qty, avg_cost, last_purchase_cost, variant_id, updated_at)
   Stock on hand now, not history. Negative stock_qty means sold ahead of the goods (online counters only).
- ai_products(id, name, sku, barcode, price, min_price, reorder_level, category_id, is_active, is_consignment)
   A product is short of stock when ai_stock.stock_qty <= ai_products.reorder_level.
- ai_purchases(id, product_id, store_id, supplier, qty, unit_cost, total_cost, remaining_qty,
  expiry_date, received_by, received_at, created_at)
   Goods received into a warehouse or shop.
- ai_returns(id, return_number, original_sale_id, sale_ref, store_id, customer_name, refund_method,
  refund_amount, status, reason, requested_by, approved_by, is_correction, created_at)
- ai_return_items(return_id, product_id, product_name, qty, unit_price, unit_cogs, condition, line_type)
- ai_suppliers(id, name, phone, email, address, payment_terms_days, is_active)
- ai_customers(id, name, phone, store_id, credit_limit, payment_terms_days, store_credit, loyalty_tier_id)
- ai_stores(id, name, display_name, region, is_warehouse, is_active, supply_warehouse_id)
- ai_fin_journals(id, journal_no, journal_date, journal_type, store_id, memo, source_type, is_posted, is_reversed)
- ai_fin_lines(journal_id, line_no, account_id, debit, credit, party_type, party_name, memo)
- ai_fin_accounts(id, code, name, name_my, type, is_cash, is_bank, store_id)
   Money owed is account type liability, money owed to us is asset 1200 (Accounts Receivable).
- ai_schema(table_name, column_name, data_type) — every column of every view above.
   If a column name is not in this list, look it up here rather than guessing.
Departments: sale, merchandising, marketing, finance, warehouse, office.

Searching the free text (important):
- Staff write their notes in Burmese. Search ai_texts with Burmese words, never
  with an English translation of the question. Product, brand and shop names
  stay in their original spelling, so search those as written.
- Cast a wide net first, with several spellings ORed together, then narrow:
  staffing / manpower / hiring -> text ILIKE any of '%လူ%', '%ဝန်ထမ်း%', '%လူသစ်%', '%လူအား%', '%အလုပ်သမား%'
  stock-out / out of stock     -> '%stock%', '%ကုန်%', '%မရှိ%', '%ပြတ်%', '%လက်ကျန်%'
  complaint / problem          -> '%ပြဿနာ%', '%အမှား%', '%မကျေနပ်%', '%တိုင်%'
  delivery / courier           -> '%ပို့%', '%ကား%', '%delivery%', '%ဂိတ်%'
- A Burmese word can be written several ways, so one ILIKE returning nothing
  does not mean the subject was never raised. Try shorter stems before you
  report that there is no data, and say which words you searched.
Status flow: submitted -> approved (by manager) -> acknowledged (owner Done); rejected = sent back.


မြန်မာလို ဖြေပုံ (အရေးကြီး):
- မြန်မာ လုပ်ငန်းရှင်တစ်ယောက်ကို ဝန်ထမ်းအကြီးတစ်ယောက်က သတင်းပို့သလို သဘာဝကျကျ ရေးပါ။ ဘာသာပြန်စာလို မရေးပါနဲ့။
- SQL၊ column နာမည် (actual_sale, metric, row) တွေကို အဖြေထဲ မထည့်ပါနဲ့။ "ရောင်းရငွေ"၊ "ပစ်မှတ်"၊ "ဘောက်ချာ အရေအတွက်" လို မြန်မာလို ပြောပါ။ ဆိုင်/product နာမည်ကတော့ မူရင်းအတိုင်း။
- ငွေကို 1,250,000 ကျပ် ပုံစံ ရေးပါ။
- ပုံစံ: အဓိကအဖြေ (၁-၂ ကြောင်း) → • တွေ့ရှိချက် → • အကြံပြုချက်
ဥပမာ: "ဒီအပတ် BAK ဆိုင်က ပစ်မှတ်ရဲ့ ၆.၉% ပဲ ရောင်းရပါတယ်။ ဘောက်ချာ ၅၇၀ နဲ့ ဝင်လာသူ ၂၃၀ ဆိုတော့ ဒေတာ ရိုက်မှားထားနိုင်ပါတယ်၊ ဆိုင်ကို ပြန်စစ်ခိုင်းသင့်ပါတယ်။"

Rules:
1. Never invent or compute numbers yourself. Aggregate in SQL (SUM/AVG/COUNT/GROUP BY). Recompute ratios from totals (e.g. sum(actual)/sum(target)), never average percentages.
2. Keep results small: aggregate or ORDER BY ... LIMIT. If a result is truncated, re-query with aggregation.
3. If the data needed is not in these views (e.g. profit margin, product cost), say clearly it is not recorded. Do not guess.
4. Flag data that looks wrong (e.g. conversion over 100%, actual 10x target) instead of treating it as real performance.
5. ALWAYS answer in Burmese (Myanmar language, မြန်မာဘာသာ). The ONLY exception is that you may answer in English when the owner writes to you in English. Never answer in Korean, Japanese, Chinese, Thai, or any other language, whatever language the question appears to be in. Keep metric names and numbers as they are. Lead with the direct answer, then key reasons, then 1-3 concrete suggestions.
6. If run_sql returns a system error (function not found, schema cache, permission denied), do NOT retry. Stop and report the error in one sentence.
7. Work the question properly before answering. Plan in your thinking: what
   exactly is being asked, which figure answers it, and what would make the
   answer wrong. Then query. Two to five queries is normal; eight is the
   ceiling. One lazy query and a vague paragraph is the failure to avoid, and
   so is ten near-identical ones.
10. Do not run near-identical searches over and over. If two attempts return nothing, stop
    searching and answer with what you have, saying plainly which figure is not recorded and
    where it would have to be entered. A thin answer beats no answer.
13. Show the figures you answered from. After the headline sentence, give the
    numbers themselves — by day, by shop, or by whatever the question compared —
    so the owner can check the conclusion rather than take it on trust. A claim
    with no number behind it is not an answer.
14. Say which days you looked at, in words, every time: "စက်တင်ဘာ ၂၅ ကနေ
    အောက်တိုဘာ ၁ အထိ". If the question has no period in it, take the last 7 days
    and say so. If it is ambiguous in some other way, state the reading you took
    in one clause and answer it rather than asking the owner to re-phrase.
15. "Why" questions need a comparison, not a description. Put the period against
    the one before it, or the shop against the other shops, find where the
    difference actually sits, and name it with the number. If the data cannot
    show why, say which figure would be needed and where it would be entered.
16. Be careful before saying a thing is not recorded. Check the obvious view, then
    ai_schema for the column name, before concluding. Saying "no data" when the
    data is there, under another name, is the worst answer you can give.
11. START with ai_daily. Sales, invoices, gross profit, discount, returns, target,
    achievement and whether the report was filed are all there, one row per shop per day,
    so most questions need one short query and no joins. Go to the other views only for
    something ai_daily does not carry (a product, a supplier, a customer, an account).
12. Marketing does not record a spend figure by name. Its numbers are KPI rows: the KPI's
    name is in ai_texts (field 'kpi') and its value in ai_metrics (metric 'this_period',
    'last_period', 'target'), matched on submission_id and row_no. If the owner asks for
    advertising spend, look there once; if it is not written, say it is not recorded.
8. Refer to people by the part before @ (merch-exec1, not merch-exec1@edu.com).
9. End with a short "ရင်းမြစ်:" line in Burmese listing only dates, departments and stores (never view, table or column names) naming dates/stores/departments used.`;

const TOOLS = [{
  name: "run_sql",
  description: "Run one read-only SELECT query on the report views. Returns JSON rows (max 500).",
  input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
}];

// Hangul, kana and the CJK blocks. A stray word in another script is dropped
// rather than shown to the owner; the system prompt is what keeps it rare.
const OTHER_SCRIPTS = /[ᄀ-ᇿ぀-ヿ㐀-鿿가-힯豈-﫿]+/g;

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "API key not set" }, { status: 500 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: isOwner } = await sb.rpc("is_director");
  if (!isOwner) return NextResponse.json({ error: "owner only" }, { status: 403 });

  const { messages } = await req.json();
  const convo = [...messages];
  const queries: string[] = [];
  const system = SYSTEM.replace("${TODAY}", new Date().toISOString().slice(0, 10));

  // Set AI_MODEL in the environment to change this. The analysis is worth a
  // stronger model than the chat it grew out of.
  const model = process.env.AI_MODEL || "claude-sonnet-5";
  // Room to think the question through before the first query. This is what
  // the owner means by wanting it to reason like the chat does.
  const thinkBudget = Number(process.env.AI_THINKING_BUDGET || 4000);
  const thinking = thinkBudget > 0
    ? { type: "enabled" as const, budget_tokens: thinkBudget }
    : undefined;
  const u = { inp: 0, out: 0, cr: 0, cw: 0 };
  const lastQ = String(messages[messages.length - 1]?.content || "").slice(0, 300);
  async function saveUsage() {
    const haiku = /haiku/i.test(model);
    const rin = Number(process.env.AI_RATE_IN || (haiku ? 1 : 3));
    const rout = Number(process.env.AI_RATE_OUT || (haiku ? 5 : 15));
    const cost = (u.inp * rin + u.cw * rin * 1.25 + u.cr * rin * 0.1 + u.out * rout) / 1e6;
    const { data: me } = await sb.auth.getUser(token);
    await sb.from("ai_usage").insert({
      user_id: me.user?.id, email: me.user?.email, question: lastQ, model,
      input_tokens: u.inp, output_tokens: u.out, cache_read_tokens: u.cr, cache_write_tokens: u.cw,
      cost_usd: cost,
    }).then(({ error }) => { if (error) console.error("ai_usage insert:", error.message); });
  }
  // The answer is streamed as it is written. Waiting half a minute at a blank
  // screen is most of what "slow" meant here; the thinking and the queries
  // take as long either way, but the owner can see the work happening.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));

      try {
        for (let round = 0; round < 8; round++) {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": process.env.ANTHROPIC_API_KEY!,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model,
              max_tokens: Math.max(6000, thinkBudget + 3000),
              ...(thinking ? { thinking } : {}),
              system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
              tools: TOOLS,
              messages: convo,
              stream: true,
            }),
          });

          if (!r.ok || !r.body) {
            const err = await r.text();
            send({ type: "error", error: err.slice(0, 400) });
            controller.close();
            return;
          }

          // Rebuild the blocks as they arrive: text goes to the reader at
          // once, a tool call has to be whole before it can be run.
          const blocks: Record<number, {
            type: string; text?: string; id?: string; name?: string; json?: string;
            thinking?: string; signature?: string;
          }> = {};
          let stopReason = "";
          let buf = "";
          const reader = r.body.getReader();
          const dec = new TextDecoder();

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              let ev: Record<string, unknown>;
              try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
              const t = ev.type as string;

              if (t === "content_block_start") {
                const idx = ev.index as number;
                const cb = ev.content_block as Record<string, unknown>;
                blocks[idx] = {
                  type: String(cb.type),
                  text: "", json: "", thinking: "",
                  id: cb.id as string | undefined,
                  name: cb.name as string | undefined,
                };
                if (cb.type === "tool_use") send({ type: "step", step: "query" });
                if (cb.type === "thinking") send({ type: "step", step: "thinking" });
              } else if (t === "content_block_delta") {
                const idx = ev.index as number;
                const d = ev.delta as Record<string, unknown>;
                const b = blocks[idx];
                if (!b) continue;
                if (d.type === "text_delta") {
                  const piece = String(d.text || "");
                  b.text = (b.text || "") + piece;
                  send({ type: "delta", text: piece.replace(OTHER_SCRIPTS, "") });
                } else if (d.type === "input_json_delta") {
                  b.json = (b.json || "") + String(d.partial_json || "");
                } else if (d.type === "thinking_delta") {
                  b.thinking = (b.thinking || "") + String(d.thinking || "");
                } else if (d.type === "signature_delta") {
                  b.signature = String(d.signature || "");
                }
              } else if (t === "message_delta") {
                const d = ev.delta as Record<string, unknown> | undefined;
                if (d?.stop_reason) stopReason = String(d.stop_reason);
                const us = ev.usage as Record<string, number> | undefined;
                if (us) u.out += us.output_tokens || 0;
              } else if (t === "message_start") {
                const m = ev.message as { usage?: Record<string, number> };
                const us = m?.usage;
                if (us) {
                  u.inp += us.input_tokens || 0;
                  u.cr += us.cache_read_input_tokens || 0;
                  u.cw += us.cache_creation_input_tokens || 0;
                }
              }
            }
          }

          // Hand the assistant's turn back in the shape the API expects, so a
          // thinking block keeps its signature and a tool call its arguments.
          const assistant = Object.keys(blocks)
            .map(Number).sort((a, b) => a - b)
            .map((i) => {
              const b = blocks[i];
              if (b.type === "text") return { type: "text", text: b.text || "" };
              if (b.type === "thinking")
                return { type: "thinking", thinking: b.thinking || "", signature: b.signature || "" };
              if (b.type === "redacted_thinking") return null;
              if (b.type === "tool_use")
                return { type: "tool_use", id: b.id, name: b.name, input: JSON.parse(b.json || "{}") };
              return null;
            })
            .filter(Boolean);

          convo.push({ role: "assistant", content: assistant });

          if (stopReason !== "tool_use") {
            await saveUsage();
            send({ type: "done", queries });
            controller.close();
            return;
          }

          const results = [];
          for (const b of assistant as { type: string; id?: string; input?: { query?: string } }[]) {
            if (b.type !== "tool_use") continue;
            const q = String(b.input?.query || "");
            queries.push(q);
            send({ type: "query", query: q });
            const { data: rows, error } = await sb.rpc("ai_run_sql", { p_query: q });
            results.push({
              type: "tool_result", tool_use_id: b.id,
              content: JSON.stringify(error ? { error: error.message } : rows).slice(0, 60000),
              is_error: !!error,
            });
          }
          convo.push({ role: "user", content: results });
        }

        send({ type: "delta", text: "\n\nရှာလို့ မပြီးသေးပါ။ မေးခွန်းကို ပိုတိတိကျကျ ပြန်မေးပေးပါ။" });
        await saveUsage();
        send({ type: "done", queries });
        controller.close();
      } catch (e) {
        send({ type: "error", error: String(e).slice(0, 300) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
