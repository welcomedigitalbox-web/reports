"use client";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, isDirector } from "../auth-context";

type Msg = { role: "user" | "assistant"; content: string; queries?: string[] };
const SAMPLES = [
  "ဒီနေ့ ဘယ်ဌာနမှာ ပြဿနာအများဆုံးလဲ",
  "ဒီအပတ် ဆိုင်တစ်ဆိုင်ချင်း achievement % နှိုင်းယှဉ်ပြ",
  "ဒီလ stockout အများဆုံး product တွေနဲ့ lost sale",
  "Report မတင်တာ ခဏခဏဖြစ်တဲ့သူ ဘယ်သူလဲ",
];

export default function AskPage() {
  const { profile, loading } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ messages: next.slice(-10).map(({ role, content }) => ({ role, content })) }),
      });
      const d = await r.json();
      setMsgs([...next, { role: "assistant", content: d.answer || `Error: ${d.error}`, queries: d.queries }]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: `Error: ${String(e)}` }]);
    }
    setBusy(false);
  }

  if (loading) return null;
  if (!profile || !isDirector(profile.role)) return <div className="pt-16 text-center text-sm text-slate-400">Owner only</div>;

  return (
    <div className="max-w-3xl mx-auto pt-6 flex flex-col" style={{ minHeight: "calc(100vh - 140px)" }}>
      <h1 className="text-xl font-semibold mb-1">Ask</h1>
      <p className="text-sm text-slate-500 mb-4">Report data အကုန်နဲ့ ပတ်သက်ပြီး မေးလို့ရပါတယ်</p>

      <div className="flex-1 space-y-4">
        {msgs.length === 0 && (
          <div className="grid sm:grid-cols-2 gap-2">
            {SAMPLES.map((s) => (
              <button key={s} onClick={() => ask(s)}
                className="text-left text-sm border border-slate-200 rounded-xl px-4 py-3 bg-white hover:bg-slate-50">{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user"
              ? "bg-blue-600 text-white rounded-2xl px-4 py-2 max-w-[85%] text-sm"
              : "bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap"}>
              {m.content}
              {m.queries && m.queries.length > 0 && (
                <details className="mt-2 text-xs text-slate-400">
                  <summary className="cursor-pointer">Data query {m.queries.length} ခု ကြည့်ရန်</summary>
                  {m.queries.map((q, k) => <pre key={k} className="mt-1 p-2 bg-slate-50 rounded overflow-x-auto">{q}</pre>)}
                </details>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm text-slate-400">Data ခွဲခြမ်းနေပါတယ်…</div>}
        <div ref={end} />
      </div>

      <div className="sticky bottom-0 bg-slate-50 pt-3 pb-4 flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ask(input); }}
          placeholder="မေးခွန်း ရိုက်ပါ…"
          className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white" />
        <button onClick={() => ask(input)} disabled={busy}
          className="bg-blue-600 text-white rounded-xl px-5 text-sm disabled:opacity-50">Ask</button>
      </div>
    </div>
  );
}
