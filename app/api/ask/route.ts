import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are the business analyst for Edu Baby House (baby products retail, Myanmar).
You answer the owner's questions using ONLY data from the database via the run_sql tool.
Today is ${"${TODAY}"}. Currency is MMK.

Views (PostgreSQL, read-only):
- ai_reports(id, report_date, department, form_name, cadence, store, created_by, status, overall_status, submitted_at, approved_by, approved_at, reject_reason)
- ai_metrics(submission_id, report_date, department, form_name, store, created_by, status, section, row_no, metric, label, value numeric)
   common metrics: daily_target, actual_sale, invoice_count, customer_entrance, credit_sale, return_count, lost_sale,
   po_new, po_pending, po_confirmed, po_cancelled, purchase_value, ads_spend, ads_messages, page_reach, new_followers ...
   office: total_employees, present, attendance_pct. marketing weekly: target, this_week, last_week, page_reach, page_engagement, new_followers, posts_count, reels_count, stories_count.
   Only query for other metrics if truly needed: select distinct department, metric, label from ai_metrics
- ai_texts(submission_id, report_date, department, form_name, store, created_by, field, label, row_no, text)
   free text: issues, action plans, stock-out items, supplier follow-up, recommendations, special events. Search with ILIKE.
- ai_people(email, role, department, store, reports_to)
Departments: sale, merchandising, marketing, finance, warehouse, office.
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
5. ALWAYS answer in Burmese (Myanmar language, မြန်မာဘာသာ). Only use English if the owner writes in English. Never use Japanese, Chinese or any other language. Keep metric names and numbers as they are. Lead with the direct answer, then key reasons, then 1-3 concrete suggestions.
6. If run_sql returns a system error (function not found, schema cache, permission denied), do NOT retry. Stop and report the error in one sentence.
7. Be fast: use as few queries as possible (ideally 1-2). Keep the answer concise.
8. End with a short "Source:" line naming dates/stores/departments used.`;

const TOOLS = [{
  name: "run_sql",
  description: "Run one read-only SELECT query on the report views. Returns JSON rows (max 500).",
  input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
}];

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

  for (let i = 0; i < 5; i++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: process.env.AI_MODEL || "claude-sonnet-5", max_tokens: 3000, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], tools: TOOLS, messages: convo }),
    });
    const data = await r.json();
    if (!r.ok) return NextResponse.json({ error: data?.error?.message || "AI error" }, { status: 500 });

    convo.push({ role: "assistant", content: data.content });
    if (data.stop_reason !== "tool_use") {
      const text = data.content.filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
      return NextResponse.json({ answer: text, queries });
    }
    const results = [];
    for (const c of data.content) {
      if (c.type !== "tool_use") continue;
      queries.push(c.input.query);
      const { data: rows, error } = await sb.rpc("ai_run_sql", { p_query: c.input.query });
      results.push({
        type: "tool_result", tool_use_id: c.id,
        content: JSON.stringify(error ? { error: error.message } : rows).slice(0, 60000),
        is_error: !!error,
      });
    }
    convo.push({ role: "user", content: results });
  }
  return NextResponse.json({ answer: "မေးခွန်းက ရှုပ်လွန်းလို့ ပိုတိတိကျကျ ပြန်မေးပေးပါ။", queries });
}
