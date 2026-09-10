"use client";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, isDirector } from "../auth-context";

type Msg = { role: "user" | "assistant"; content: string; queries?: string[] };
type Chat = { id: string; title: string | null; updated_at: string };
const SAMPLES = [
  "ဒီနေ့ ဘယ်ဌာနမှာ ပြဿနာအများဆုံးလဲ",
  "ဒီအပတ် ဆိုင်တစ်ဆိုင်ချင်း achievement % နှိုင်းယှဉ်ပြ",
  "ဒီလ stockout အများဆုံး product တွေနဲ့ lost sale",
  "Report မတင်တာ ခဏခဏဖြစ်တဲ့သူ ဘယ်သူလဲ",
];

export default function AskPage() {
  const { profile, loading } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSide, setShowSide] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => { if (profile) { loadChats(); } }, [profile?.id]); // eslint-disable-line

  async function loadChats() {
    const { data } = await supabase.from("ai_chats").select("id,title,updated_at")
      .order("updated_at", { ascending: false }).limit(50);
    setChats((data as Chat[]) || []);
  }

  async function openChat(id: string) {
    setChatId(id); setShowSide(false);
    const { data } = await supabase.from("ai_messages").select("role,content,queries")
      .eq("chat_id", id).order("id");
    setMsgs(((data as Msg[]) || []).map((m) => ({ ...m, queries: m.queries || undefined })));
  }

  function newChat() { setChatId(null); setMsgs([]); setShowSide(false); }

  async function removeChat(id: string) {
    if (!confirm("ဒီ chat ကို ဖျက်မလား")) return;
    await supabase.from("ai_chats").delete().eq("id", id);
    if (id === chatId) newChat();
    loadChats();
  }

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next); setInput(""); setBusy(true);

    let id = chatId;
    if (!id) {
      const { data } = await supabase.from("ai_chats").insert({ title: q.slice(0, 60) }).select("id").single();
      id = (data as { id: string } | null)?.id || null;
      setChatId(id);
    }
    if (id) await supabase.from("ai_messages").insert({ chat_id: id, role: "user", content: q });

    let reply: Msg;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ messages: next.slice(-10).map(({ role, content }) => ({ role, content })) }),
      });
      const d = await r.json();
      reply = { role: "assistant", content: d.answer || `Error: ${d.error}`, queries: d.queries };
    } catch (e) {
      reply = { role: "assistant", content: `Error: ${String(e)}` };
    }
    setMsgs([...next, reply]);
    if (id) {
      await supabase.from("ai_messages").insert({ chat_id: id, role: "assistant", content: reply.content, queries: reply.queries || null });
      await supabase.from("ai_chats").update({ updated_at: new Date().toISOString() }).eq("id", id);
    }
    setBusy(false);
    loadChats();
  }

  if (loading) return null;
  if (!profile || !isDirector(profile.role)) return <div className="pt-16 text-center text-sm text-slate-400">Owner only</div>;

  const sidebar = (
    <div className="flex flex-col h-full">
      <button onClick={newChat}
        className="mb-3 w-full text-left text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">＋ New chat</button>
      <div className="text-xs text-slate-400 px-1 mb-1">History</div>
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {chats.map((c) => (
          <div key={c.id}
            className={`group flex items-center rounded-lg ${c.id === chatId ? "bg-slate-200" : "hover:bg-slate-100"}`}>
            <button onClick={() => openChat(c.id)} className="flex-1 text-left text-sm px-3 py-2 truncate">
              {c.title || "Untitled"}
            </button>
            <button onClick={() => removeChat(c.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 px-2 text-xs">✕</button>
          </div>
        ))}
        {chats.length === 0 && <div className="text-xs text-slate-400 px-3 py-2">မေးထားတာ မရှိသေးပါ</div>}
      </div>
    </div>
  );

  return (
    <div className="flex gap-6 pt-4" style={{ height: "calc(100vh - 140px)" }}>
      <aside className="hidden md:block w-64 shrink-0 border-r border-slate-200 pr-4">{sidebar}</aside>

      {showSide && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowSide(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-slate-50 p-4" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 max-w-3xl">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setShowSide(true)} className="md:hidden text-sm border rounded-lg px-2 py-1">☰</button>
          <h1 className="text-xl font-semibold">Ask</h1>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {msgs.length === 0 && (
            <>
              <p className="text-sm text-slate-500">Report data အကုန်နဲ့ ပတ်သက်ပြီး မေးလို့ရပါတယ်</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {SAMPLES.map((s) => (
                  <button key={s} onClick={() => ask(s)}
                    className="text-left text-sm border border-slate-200 rounded-xl px-4 py-3 bg-white hover:bg-slate-50">{s}</button>
                ))}
              </div>
            </>
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

        <div className="pt-3 pb-2 flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ask(input); }}
            placeholder="မေးခွန်း ရိုက်ပါ…"
            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white" />
          <button onClick={() => ask(input)} disabled={busy}
            className="bg-blue-600 text-white rounded-xl px-5 text-sm disabled:opacity-50">Ask</button>
        </div>
      </div>
    </div>
  );
}
