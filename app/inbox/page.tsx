"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Send } from "lucide-react";
import { supabase, type IncidentRoute, type Department } from "@/lib/supabase";
import { useAuth, isDirector, isManagerTier } from "../auth-context";

const DEPARTMENTS: Department[] = [
  "sale", "merchandising", "warehouse", "finance", "marketing",
];

const TONE: Record<string, string> = {
  normal: "bg-slate-100 text-slate-600",
  attention: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

export default function InboxPage() {
  const { profile, loading: authLoading } = useAuth();

  const [rows, setRows] = useState<IncidentRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [routeTo, setRouteTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  function say(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3500);
  }

  async function load() {
    setLoading(true);
    // RLS shows a route to the department it was sent to, to whoever
    // raised it, and to the directors - the query needs no filter.
    const { data } = await supabase
      .from("report_incident_inbox")
      .select("*")
      .order("routed_at", { ascending: false })
      .limit(100);
    setRows((data as IncidentRoute[]) || []);
    setLoading(false);
  }

  async function respond(routeId: string) {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("report_respond_incident", {
        p_route_id: routeId,
        p_response: reply.trim(),
      });
      if (error) throw error;
      setReplyTo(null);
      setReply("");
      say("Answered");
      await load();
    } catch (e) {
      say("❌ " + ((e as { message?: string })?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  // Sending it on: the person who saw the thing rarely knows the org
  // chart, so a manager can add the department they missed.
  async function sendOn(incidentId: string, dept: string) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("report_route_incident", {
        p_incident_id: incidentId,
        p_department: dept,
      });
      if (error) throw error;
      setRouteTo(null);
      say(`Sent to ${dept}`);
      await load();
    } catch (e) {
      say("❌ " + ((e as { message?: string })?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loading) {
    return <div className="pt-16 text-center text-sm text-slate-400">…</div>;
  }
  if (!profile) return null;

  const canRoute = isManagerTier(profile.role) || isDirector(profile.role);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-1">Inbox</h1>
      <p className="text-sm text-slate-500 mb-6">
        Raised in someone&apos;s report and sent to you
      </p>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.route_id} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                  <span className="font-medium text-sm">{r.title}</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {r.raised_by} · {r.report_date}
                  {r.store_id && ` · ${r.store_id}`}
                  {r.department && ` → ${r.department}`}
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${TONE[r.urgency]}`}>
                {r.urgency}
              </span>
            </div>

            {r.detail && (
              <p className="text-sm text-slate-600 mb-3">{r.detail}</p>
            )}

            {r.response ? (
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm">
                <div className="text-xs text-slate-400 mb-0.5">Answered</div>
                {r.response}
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {replyTo === r.route_id ? (
                  <div className="w-full">
                    <textarea
                      autoFocus
                      rows={2}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-2"
                      placeholder="What was done about it"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setReplyTo(null); setReply(""); }}
                        className="px-4 py-1.5 border border-slate-200 rounded-lg text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => respond(r.route_id)}
                        disabled={busy || !reply.trim()}
                        className="px-4 py-1.5 bg-blue-600 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold"
                      >
                        Answer
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setReplyTo(r.route_id); setReply(""); }}
                    className="text-sm text-blue-600 font-medium"
                  >
                    Answer
                  </button>
                )}

                {canRoute && routeTo !== r.incident_id && (
                  <button
                    onClick={() => setRouteTo(r.incident_id)}
                    className="text-sm text-slate-500 font-medium flex items-center gap-1"
                  >
                    <Send size={13} /> Send on
                  </button>
                )}
              </div>
            )}

            {routeTo === r.incident_id && (
              <div className="mt-3 flex flex-wrap gap-2">
                {DEPARTMENTS.filter((d) => d !== r.department).map((d) => (
                  <button
                    key={d}
                    onClick={() => sendOn(r.incident_id, d)}
                    disabled={busy}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm capitalize"
                  >
                    {d}
                  </button>
                ))}
                <button
                  onClick={() => setRouteTo(null)}
                  className="px-3 py-1.5 text-sm text-slate-500"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}

        {rows.length === 0 && (
          <p className="text-sm text-slate-400 py-16 text-center border border-slate-200 rounded-xl">
            Nothing has been sent to you
          </p>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
