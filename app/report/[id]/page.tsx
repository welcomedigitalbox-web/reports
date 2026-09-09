"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Check, X, Save, Undo2 } from "lucide-react";
import {
  supabase, loadFormStructure, STATUS_TONE,
  type FormSection, type ReportForm, type Submission, type Department,
} from "@/lib/supabase";
import { useAuth, isManagerTier, isDirector } from "../../auth-context";
import SectionBlock from "../../section-block";

const DEPARTMENTS: Department[] = [
  "sale", "merchandising", "warehouse", "finance", "marketing",
];

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  const [sub, setSub] = useState<Submission | null>(null);
  const [form, setForm] = useState<ReportForm | null>(null);
  const [sections, setSections] = useState<FormSection[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [people, setPeople] = useState<{ id: string; email: string }[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState("");

  // Rejecting, cancelling and requesting an edit all need a reason; one
  // prompt serves them all rather than three near-identical modals.
  const [prompt, setPrompt] = useState<null | {
    kind: "reject" | "cancel" | "edit";
    label: string;
  }>(null);
  const [reason, setReason] = useState("");

  const [incident, setIncident] = useState<null | true>(null);
  const [incTitle, setIncTitle] = useState("");
  const [incDetail, setIncDetail] = useState("");
  const [incUrgency, setIncUrgency] = useState("normal");
  const [incDepts, setIncDepts] = useState<string[]>([]);

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function say(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  async function load() {
    setLoading(true);

    const { data: s } = await supabase
      .from("report_submissions").select("*").eq("id", id).single();
    if (!s) { setLoading(false); return; }

    const { data: f } = await supabase
      .from("report_forms").select("*").eq("id", (s as Submission).form_id).single();

    const [structure, { data: st }, { data: pp }] = await Promise.all([
      loadFormStructure((s as Submission).form_id),
      supabase.from("stores").select("id, name").order("name"),
      supabase.from("profiles").select("id, email").order("email"),
    ]);

    setSub(s as Submission);
    setForm(f as ReportForm);
    setSections(structure);
    setAnswers(((s as Submission).answers as Record<string, unknown>) || {});
    setStores((st as { id: string; name: string }[]) || []);
    setPeople((pp as { id: string; email: string }[]) || []);
    setDirty(false);
    setLoading(false);
  }

  const mine = sub?.created_by === profile?.email;

  // Editable only while it is a draft and yours. Everything after that
  // goes through a request, so an approval always refers to what was read.
  const readOnly = !sub || sub.status !== "draft" || (!mine && !isDirector(profile?.role));

  const canReview = useMemo(() => {
    if (!sub || !form || !profile) return false;
    if (sub.status !== "submitted") return false;
    if (sub.created_by === profile.email && !isDirector(profile.role)) return false;
    return isManagerTier(profile.role);
  }, [sub, form, profile]);

  const canDecideRequest =
    !!sub && ["cancel_requested", "edit_requested"].includes(sub.status)
    && isManagerTier(profile?.role);

  function setAnswer(key: string, value: unknown) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("report_submissions")
        .update({ answers })
        .eq("id", id);
      if (error) throw error;
      setDirty(false);
      say("Saved");
    } catch (e) {
      say("❌ " + ((e as { message?: string })?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function run(fn: () => Promise<{ error: unknown }>, ok: string) {
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw error;
      setPrompt(null);
      setReason("");
      say(ok);
      await load();
    } catch (e) {
      say("❌ " + ((e as { message?: string })?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function submitReport() {
    // Save first: the RPC checks required fields against what is stored,
    // not what is on screen.
    if (dirty) await save();
    await run(
      () => supabase.rpc("report_submit", { p_submission_id: id }),
      "Filed"
    );
  }

  async function raiseIncident() {
    if (!incTitle.trim()) return say("An incident needs a title");
    await run(
      () => supabase.rpc("report_raise_incident", {
        p_submission_id: id,
        p_title: incTitle.trim(),
        p_detail: incDetail.trim() || null,
        p_urgency: incUrgency,
        p_departments: incDepts,
      }),
      "Sent"
    );
    setIncident(null);
    setIncTitle("");
    setIncDetail("");
    setIncDepts([]);
  }

  if (loading) {
    return <div className="pt-16 text-center text-sm text-slate-400">…</div>;
  }
  if (!sub || !form) {
    return (
      <div className="pt-16 text-center">
        <p className="text-sm text-slate-500 mb-4">Report not found</p>
        <button onClick={() => router.push("/")} className="text-blue-600 text-sm font-medium">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <button onClick={() => router.push("/")} className="text-blue-600 text-sm font-medium mb-4">
        ← My Reports
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold">{form.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {sub.report_date}
            {sub.store_id && ` · ${sub.store_id}`} · {sub.created_by}
          </p>
        </div>
        <span className={`px-3 py-1 rounded text-sm font-medium shrink-0 ${STATUS_TONE[sub.status]}`}>
          {sub.status.replace("_", " ")}
        </span>
      </div>

      {sub.reject_reason && sub.status === "rejected" && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <div className="text-sm font-medium text-red-800">Sent back</div>
          <p className="text-sm text-red-700 mt-0.5">{sub.reject_reason}</p>
        </div>
      )}

      {sub.request_reason && ["cancel_requested", "edit_requested"].includes(sub.status) && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-4">
          <div className="text-sm font-medium text-orange-800">
            {sub.status === "cancel_requested" ? "Cancellation requested" : "Edit requested"}
            {sub.requested_by && ` by ${sub.requested_by}`}
          </div>
          <p className="text-sm text-orange-700 mt-0.5">{sub.request_reason}</p>
        </div>
      )}

      {sections.map((s) => (
        <SectionBlock
          key={s.id}
          section={s}
          answers={answers}
          onChange={setAnswer}
          readOnly={readOnly}
          stores={stores}
          people={people}
        />
      ))}

      {/* Anything the day threw up that another department needs to know
          about. The ticks are open on purpose: the person who saw it is
          rarely the person who knows whose problem it is. */}
      {!readOnly && (
        <button
          onClick={() => setIncident(true)}
          className="flex items-center gap-2 text-sm font-medium text-amber-700 mb-6"
        >
          <AlertTriangle size={16} /> Raise an incident
        </button>
      )}

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 px-4 sm:px-6 py-3">
        <div className="max-w-4xl mx-auto flex flex-wrap gap-2 justify-end">
          {!readOnly && (
            <>
              <button
                onClick={save}
                disabled={busy || !dirty}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save size={14} /> Save
              </button>
              <button
                onClick={submitReport}
                disabled={busy}
                className="px-5 py-2 bg-blue-600 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold"
              >
                File report
              </button>
            </>
          )}

          {mine && sub.status === "rejected" && (
            <button
              onClick={() => run(() => supabase.rpc("report_reopen", { p_submission_id: id }), "Reopened")}
              disabled={busy}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium flex items-center gap-1.5"
            >
              <Undo2 size={14} /> Reopen
            </button>
          )}

          {mine && ["submitted", "approved"].includes(sub.status) && (
            <button
              onClick={() => setPrompt({ kind: "cancel", label: "Why should this be cancelled?" })}
              disabled={busy}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium"
            >
              Request cancel
            </button>
          )}

          {mine && ["approved", "acknowledged"].includes(sub.status) && (
            <button
              onClick={() => setPrompt({ kind: "edit", label: "What needs changing?" })}
              disabled={busy}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium"
            >
              Request edit
            </button>
          )}

          {canReview && (
            <>
              <button
                onClick={() => setPrompt({ kind: "reject", label: "Why is this going back?" })}
                disabled={busy}
                className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium flex items-center gap-1.5"
              >
                <X size={14} /> Send back
              </button>
              <button
                onClick={() => run(() => supabase.rpc("report_review", { p_submission_id: id }), "Approved")}
                disabled={busy}
                className="px-5 py-2 bg-green-600 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5"
              >
                <Check size={14} /> Approve
              </button>
            </>
          )}

          {canDecideRequest && (
            <>
              <button
                onClick={() => run(
                  () => supabase.rpc("report_review_request", { p_submission_id: id, p_grant: false, p_reason: "refused" }),
                  "Refused"
                )}
                disabled={busy}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium"
              >
                Refuse
              </button>
              <button
                onClick={() => run(
                  () => supabase.rpc("report_review_request", { p_submission_id: id, p_grant: true }),
                  "Granted"
                )}
                disabled={busy}
                className="px-5 py-2 bg-blue-600 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold"
              >
                Grant
              </button>
            </>
          )}

          {isDirector(profile?.role) && sub.status === "approved" && (
            <button
              onClick={() => run(
                () => supabase.rpc("report_acknowledge", { p_ids: [id] }),
                "Marked done"
              )}
              disabled={busy}
              className="px-5 py-2 bg-green-600 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold"
            >
              Done
            </button>
          )}
        </div>
      </div>

      {prompt && (
        <div className="fixed inset-0 bg-black/30 grid place-items-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-lg">
            <h3 className="font-semibold mb-4">{prompt.label}</h3>
            <textarea
              autoFocus
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setPrompt(null); setReason(""); }}
                className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
              <button
                disabled={!reason.trim() || busy}
                onClick={() => {
                  const r = reason.trim();
                  if (prompt.kind === "reject") {
                    run(() => supabase.rpc("report_review", {
                      p_submission_id: id, p_reject: true, p_reason: r,
                    }), "Sent back");
                  } else if (prompt.kind === "cancel") {
                    run(() => supabase.rpc("report_request_cancel", {
                      p_submission_id: id, p_reason: r,
                    }), "Requested");
                  } else {
                    run(() => supabase.rpc("report_request_edit", {
                      p_submission_id: id, p_reason: r,
                    }), "Requested");
                  }
                }}
                className="flex-1 py-2.5 bg-blue-600 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {incident && (
        <div className="fixed inset-0 bg-black/30 grid place-items-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg my-8">
            <h3 className="font-semibold mb-4">Raise an incident</h3>

            <label className="text-sm text-slate-600">What happened</label>
            <input
              autoFocus
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 mb-3"
              value={incTitle}
              onChange={(e) => setIncTitle(e.target.value)}
            />

            <label className="text-sm text-slate-600">Detail</label>
            <textarea
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 mb-3"
              value={incDetail}
              onChange={(e) => setIncDetail(e.target.value)}
            />

            <label className="text-sm text-slate-600">Urgency</label>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 mb-4"
              value={incUrgency}
              onChange={(e) => setIncUrgency(e.target.value)}
            >
              <option value="normal">Normal</option>
              <option value="attention">Needs attention</option>
              <option value="critical">Critical</option>
            </select>

            <label className="text-sm text-slate-600 block mb-2">Who needs to know</label>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {DEPARTMENTS.map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={incDepts.includes(d)}
                    onChange={() =>
                      setIncDepts(
                        incDepts.includes(d)
                          ? incDepts.filter((x) => x !== d)
                          : [...incDepts, d]
                      )
                    }
                  />
                  {d}
                </label>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setIncident(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={raiseIncident}
                disabled={busy || !incTitle.trim()}
                className="flex-1 py-2.5 bg-amber-600 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
