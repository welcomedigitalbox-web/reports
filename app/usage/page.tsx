"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../auth-context";

type Row = { id: number; email: string | null; question: string | null; model: string | null;
  input_tokens: number; output_tokens: number; cost_usd: number; created_at: string };
const usd = (n: number) => "$" + n.toFixed(n < 1 ? 4 : 2);

export default function UsagePage() {
  const { profile, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (profile?.email !== "admin@edu.com") return;
    const from = new Date(Date.now() - 31 * 864e5).toISOString();
    supabase.from("ai_usage").select("*").gte("created_at", from)
      .order("created_at", { ascending: false }).then(({ data }) => setRows((data as Row[]) || []));
  }, [profile?.email]);

  const s = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const byDay = new Map<string, { n: number; c: number }>();
    const byUser = new Map<string, { n: number; c: number }>();
    let t = 0, tn = 0, m = 0, mn = 0;
    for (const r of rows) {
      const c = Number(r.cost_usd || 0), d = r.created_at.slice(0, 10);
      if (d === today) { t += c; tn++; }
      if (d.startsWith(month)) { m += c; mn++; }
      const a = byDay.get(d) || { n: 0, c: 0 }; a.n++; a.c += c; byDay.set(d, a);
      const k = r.email || "?"; const b = byUser.get(k) || { n: 0, c: 0 }; b.n++; b.c += c; byUser.set(k, b);
    }
    return { t, tn, m, mn, avg: mn ? m / mn : 0, byDay: [...byDay], byUser: [...byUser] };
  }, [rows]);

  if (loading) return null;
  if (profile?.email !== "admin@edu.com") return <div className="pt-16 text-center text-sm text-slate-400">Admin only</div>;

  const card = "bg-white border border-slate-200 rounded-xl p-4";
  return (
    <div className="max-w-4xl mx-auto pt-6 space-y-5">
      <h1 className="text-xl font-semibold">AI Usage</h1>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={card}><div className="text-xs text-slate-500">ဒီနေ့</div><div className="text-lg font-semibold">{usd(s.t)}</div><div className="text-xs text-slate-400">{s.tn} မေးခွန်း</div></div>
        <div className={card}><div className="text-xs text-slate-500">ဒီလ</div><div className="text-lg font-semibold">{usd(s.m)}</div><div className="text-xs text-slate-400">{s.mn} မေးခွန်း</div></div>
        <div className={card}><div className="text-xs text-slate-500">ပျမ်းမျှ / မေးခွန်း</div><div className="text-lg font-semibold">{usd(s.avg)}</div></div>
        <div className={card}><div className="text-xs text-slate-500">လကုန် ခန့်မှန်း</div><div className="text-lg font-semibold">{usd(s.m / new Date().getDate() * 30)}</div></div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className={card}><div className="text-sm font-medium mb-2">နေ့အလိုက်</div>
          {s.byDay.map(([d, v]) => <div key={d} className="flex justify-between text-sm py-1"><span>{d}</span><span>{v.n} · {usd(v.c)}</span></div>)}</div>
        <div className={card}><div className="text-sm font-medium mb-2">User အလိုက်</div>
          {s.byUser.map(([e, v]) => <div key={e} className="flex justify-between text-sm py-1"><span>{e.split("@")[0]}</span><span>{v.n} · {usd(v.c)}</span></div>)}</div>
      </div>
      <div className={card}><div className="text-sm font-medium mb-2">မကြာသေးမီ မေးခွန်းများ</div>
        {rows.slice(0, 30).map((r) => (
          <div key={r.id} className="flex justify-between gap-3 text-sm py-1.5 border-b border-slate-100 last:border-0">
            <span className="truncate">{r.question}</span>
            <span className="shrink-0 text-slate-500">{(r.model || "").replace("claude-", "")} · {usd(Number(r.cost_usd))}</span>
          </div>))}
        {rows.length === 0 && <div className="text-sm text-slate-400">မှတ်တမ်း မရှိသေးပါ</div>}
      </div>
    </div>
  );
}
