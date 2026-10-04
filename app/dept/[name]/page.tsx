"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  supabase, type ReportForm, type Submission, type FormSection, type FormField,
} from "@/lib/supabase";
import { useAuth, isDirector, isManagerTier } from "../../auth-context";

type P = { id: string; email: string; role: string; store_id: string | null; is_dept_head: boolean };

function Shot({ path, who }: { path: string; who: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    if (path.startsWith("http")) { setUrl(path); return; }
    supabase.storage.from("report-photos").createSignedUrl(path, 3600)
      .then(({ data }) => { if (alive) setUrl(data?.signedUrl || ""); });
    return () => { alive = false; };
  }, [path]);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="shrink-0" title={who}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={who} className="h-20 w-20 rounded-lg border border-slate-200 object-cover" />
      <span className="block text-[10px] text-slate-400 mt-0.5 text-center truncate w-20">{who}</span>
    </a>
  );
}
const EMPTY = new Set(["", "-", "nothing", "no plan", "none", "no", "n/a", "na", "nil"]);
const NUM = new Set(["number", "money"]);
const DERIVED = new Set(["avg_invoice", "achievement_pct", "conversion_rate"]);
const KIND_LABEL: Record<string, string> = { retail: "Retail", wholesale: "Wholesale", online: "Online" };
const KIND_ORDER = ["retail", "wholesale", "online"];
const TXT = new Set(["text", "textarea"]);
const PIC = new Set(["image", "photo", "file"]);
const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
const TONE: Record<string, string> = {
  submitted: "bg-amber-50 text-amber-700", approved: "bg-blue-50 text-blue-700",
  acknowledged: "bg-green-50 text-green-700", rejected: "bg-red-50 text-red-700",
  edit_requested: "bg-amber-50 text-amber-700", cancel_requested: "bg-amber-50 text-amber-700",
};

export default function DeptPage() {
  const { name } = useParams<{ name: string }>();
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  // The day comes from the dashboard that linked here, so clicking a
  // department does not quietly jump the reader back to today.
  const [date, setDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Yangon" })
  );

  // The day comes from the dashboard that linked here. It is read after the
  // first render rather than during it: the page is rendered once on the
  // server, where there is no address bar, and a value picked there would
  // stick through hydration and quietly show today instead.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get("date");
    if (fromLink) setDate(fromLink);
  }, []);
  // One day is the common case; a week or a month is the question a manager
  // asks at the end of it. Same page, same figures, added up.
  const [dateTo, setDateTo] = useState("");
  const range = !!dateTo && dateTo > date;
  const [forms, setForms] = useState<ReportForm[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [people, setPeople] = useState<P[]>([]);
  const [struct, setStruct] = useState<Record<string, FormSection[]>>({});
  const [stores, setStores] = useState<Record<string, string>>({});
  const [kinds, setKinds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [parts, setParts] = useState<{ submission_id: string; email: string }[]>([]);

  useEffect(() => { if (profile) load(); /* eslint-disable-next-line */ }, [profile?.id, date, dateTo, name]);

  async function load() {
    setLoading(true);
    const { data: f } = await supabase.from("report_forms").select("*").eq("department", name);
    const fs = (f as ReportForm[]) || [];
    const ids = fs.map((x) => x.id);
    const [{ data: s }, { data: p }, { data: st }, { data: sec }] = await Promise.all([
      ids.length
        ? (range
            ? supabase.from("report_submissions").select("*").in("form_id", ids)
                .gte("report_date", date).lte("report_date", dateTo)
                .not("status", "in", "(draft,archived)")
            : supabase.from("report_submissions").select("*").in("form_id", ids)
                .eq("report_date", date).not("status", "in", "(draft,archived)"))
        : Promise.resolve({ data: [] }),
      supabase.from("profiles").select("id,email,role,store_id,is_dept_head").eq("department", name),
      supabase.from("stores").select("id,name"),
      ids.length ? supabase.from("report_sections").select("*").in("form_id", ids) : Promise.resolve({ data: [] }),
    ]);
    const secs = (sec as FormSection[]) || [];
    const { data: fl } = secs.length
      ? await supabase.from("report_fields").select("*").in("section_id", secs.map((x) => x.id)).order("sort_order")
      : { data: [] };
    const bySec = new Map<string, FormField[]>();
    for (const x of (fl as FormField[]) || []) bySec.set(x.section_id, [...(bySec.get(x.section_id) || []), x]);
    const map: Record<string, FormSection[]> = {};
    for (const x of secs.sort((a, b) => a.sort_order - b.sort_order))
      (map[x.form_id] ||= []).push({ ...x, fields: bySec.get(x.id) || [] });

    // On a shared form one report holds several people's parts; who filed
    // is in the parts table, not in who happened to open the report first.
    const subIds = ((s as Submission[]) || []).map((x) => x.id);
    const { data: pt } = subIds.length
      ? await supabase.from("report_submission_parts").select("submission_id,email").in("submission_id", subIds)
      : { data: [] };
    setParts((pt as { submission_id: string; email: string }[]) || []);

    setForms(fs); setSubs((s as Submission[]) || []); setPeople((p as P[]) || []);
    setStruct(map);
    setStores(Object.fromEntries(((st as { id: string; name: string }[]) || []).map((x) => [x.id, x.name])));
    const { data: br } = await supabase.from("report_branches").select("id,name,kind");
    const km: Record<string, string> = {};
    for (const b of ((br as { id: string; name: string; kind: string | null }[]) || [])) {
      if (!b.kind) continue;
      km[String(b.id).toLowerCase()] = b.kind;
      km[String(b.name).toLowerCase()] = b.kind;
    }
    setKinds(km);
    setLoading(false);
  }

  const isCons = (fid: string) => /consolidat/i.test(forms.find((f) => f.id === fid)?.name || "");
  const isHead = (fid: string) => {
    const f = forms.find((x) => x.id === fid);
    return isCons(fid) || /manager/i.test(String(f?.filled_by || ""));
  };
  const staffSubs = subs.filter((s) => !isCons(s.form_id));
  const consSubs = subs.filter((s) => isCons(s.form_id));
  const isShared = (fid: string) => !!forms.find((f) => f.id === fid)?.is_shared;
  // On a shared report each section belongs to the person (or role) it is
  // routed to; crediting all of it to whoever opened the report first put
  // three people's work under one name.
  const sectionOwner = (s: Submission, sec?: FormSection): string | null => {
    if (!sec || !isShared(s.form_id)) return null;
    if (sec.route_emails?.length) return sec.route_emails.map((e) => e.split("@")[0]).join(", ");
    if (sec.route_roles?.length) {
      const holders = people.filter((p) => sec.route_roles!.includes(p.role));
      const filed = holders.filter((p) => parts.some((x) => x.submission_id === s.id && x.email === p.email));
      const pick = filed.length ? filed : holders;
      if (pick.length) return pick.map((p) => p.email.split("@")[0]).join(", ");
      return sec.route_roles.join(", ");
    }
    return null;
  };
  const who = (s: Submission, sec?: FormSection) => {
    const n = sectionOwner(s, sec) || (s.store_id && stores[s.store_id]) || s.created_by.split("@")[0];
    // Over a range, "who said it" is not enough — when matters too.
    return range ? `${n} · ${String(s.report_date).slice(5)}` : n;
  };

  // One roll-up, used for the staff submissions and again for the managers'.
  const rollUp = (from: Submission[]) => {
    const nums = new Map<string, { label: string; total: number }>();
    const texts = new Map<string, { label: string; items: { who: string; text: string }[] }>();
    const pics = new Map<string, { label: string; items: { who: string; path: string }[] }>();
    for (const s of from) {
      const a = (s.answers || {}) as Record<string, unknown>;
      for (const sec of struct[s.form_id] || []) {
        const rows: Record<string, unknown>[] = sec.is_table
          ? ((a[sec.id] ?? a[sec.title]) as Record<string, unknown>[]) || []
          : [a];
        for (const r of Array.isArray(rows) ? rows : []) {
          for (const fd of sec.fields) {
            const v = r?.[fd.key] ?? r?.[fd.id];
            if (DERIVED.has(fd.key)) continue;
            if (NUM.has(fd.field_type)) {
              const n = Number(v);
              if (v === "" || v == null || isNaN(n)) continue;
              const e = nums.get(fd.key) || { label: fd.label, total: 0 };
              e.total += n; nums.set(fd.key, e);
            } else if (TXT.has(fd.field_type)) {
              const t = String(v ?? "").trim();
              if (EMPTY.has(t.toLowerCase())) continue;
              const e = texts.get(fd.key) || { label: fd.label, items: [] };
              e.items.push({ who: who(s, sec), text: t }); texts.set(fd.key, e);
            } else if (PIC.has(fd.field_type)) {
              const t = String(v ?? "").trim();
              if (!t) continue;
              const e = pics.get(fd.key) || { label: fd.label, items: [] };
              e.items.push({ who: who(s, sec), path: t }); pics.set(fd.key, e);
            }
          }
        }
      }
    }
    const tgt = nums.get("daily_target")?.total, act = nums.get("actual_sale")?.total;
    return {
      nums: [...nums.values()], texts: [...texts.values()], pics: [...pics.values()],
      pct: tgt ? (act || 0) / tgt * 100 : null,
    };
  };

  const summary = useMemo(() => rollUp(staffSubs), // eslint-disable-line react-hooks/exhaustive-deps
    [subs, struct, stores, forms, range]);
  const headSummary = useMemo(() => rollUp(consSubs), // eslint-disable-line react-hooks/exhaustive-deps
    [subs, struct, stores, forms, range]);

  // Wholesale invoices are far larger than showroom ones, so one blended
  // average invoice value tells nobody anything. Each channel keeps its own.
  const channels = useMemo(() => {
    type Agg = { name: string; target: number; actual: number; invoices: number; entrance: number };
    const blank = (n: string): Agg => ({ name: n, target: 0, actual: 0, invoices: 0, entrance: 0 });
    const groups = new Map<string, { total: Agg; branches: Map<string, Agg> }>();
    for (const s of staffSubs) {
      const a = (s.answers || {}) as Record<string, unknown>;
      for (const sec of struct[s.form_id] || []) {
        const hasChannel = sec.is_table && sec.fields.some((f) => f.key === "channel");
        const hasFigures = sec.fields.some((f) => f.key === "daily_target" || f.key === "actual_sale");
        if (!hasChannel && !hasFigures) continue;
        if (!hasChannel) {
          // A form without a channel column belongs to one branch outright —
          // the wholesale and online desks each file their own.
          const label = (s.store_id && stores[s.store_id]) || s.created_by.split("@")[0];
          const key = String(s.store_id || label).toLowerCase();
          const kind = kinds[key] || kinds[label.toLowerCase()]
            || (/wholesale/i.test(label) ? "wholesale" : /online/i.test(label) ? "online" : "retail");
          const g = groups.get(kind) || { total: blank(kind), branches: new Map<string, Agg>() };
          const b = g.branches.get(label) || blank(label);
          const flat = (a as Record<string, unknown>);
          const take = (...keys: string[]) => {
            for (const k of keys) { const n = Number(flat[k]); if (flat[k] != null && flat[k] !== "" && !isNaN(n)) return n; }
            return 0;
          };
          const vals = { target: take("daily_target"), actual: take("actual_sale"),
                         invoices: take("invoice_count", "order_count"), entrance: take("customer_entrance") };
          for (const k of ["target", "actual", "invoices", "entrance"] as const) {
            (g.total as unknown as Record<string, number>)[k] += vals[k];
            (b as unknown as Record<string, number>)[k] += vals[k];
          }
          g.branches.set(label, b);
          groups.set(kind, g);
          continue;
        }
        const rows = ((a[sec.id] ?? a[sec.title]) as Record<string, unknown>[]) || [];
        for (const r of Array.isArray(rows) ? rows : []) {
          const raw = String(r?.channel ?? "").trim();
          if (!raw) continue;
          const label = stores[raw] || raw;
          const kind = kinds[raw.toLowerCase()] || kinds[label.toLowerCase()] || "retail";
          const g = groups.get(kind) || { total: blank(kind), branches: new Map<string, Agg>() };
          const b = g.branches.get(label) || blank(label);
          for (const [k, key] of [["target", "daily_target"], ["actual", "actual_sale"],
                                  ["invoices", "invoice_count"], ["entrance", "customer_entrance"]] as const) {
            const n = Number(r?.[key]);
            if (!isNaN(n)) { (g.total as unknown as Record<string, number>)[k] += n;
                             (b as unknown as Record<string, number>)[k] += n; }
          }
          g.branches.set(label, b);
          groups.set(kind, g);
        }
      }
    }
    return KIND_ORDER.filter((k) => groups.has(k)).map((k) => ({
      kind: k,
      total: groups.get(k)!.total,
      branches: [...groups.get(k)!.branches.values()].sort((x, y) => y.actual - x.actual),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs, struct, stores, kinds]);

  const grand = useMemo(() => channels.reduce(
    (t, c) => ({ target: t.target + c.total.target, actual: t.actual + c.total.actual,
                 invoices: t.invoices + c.total.invoices }),
    { target: 0, actual: 0, invoices: 0 }), [channels]);

  const filers = people.filter((p) => !p.is_dept_head && !isManagerTier(p.role));
  // Filed means: opened a report of their own, or filed their part of a
  // shared one, or wrote in a section addressed to them by name.
  const filedBy = new Set(staffSubs.map((s) => s.created_by));
  for (const x of parts) if (staffSubs.some((s) => s.id === x.submission_id)) filedBy.add(x.email);
  for (const s of staffSubs) {
    if (!isShared(s.form_id)) continue;
    const a = (s.answers || {}) as Record<string, unknown>;
    for (const sec of struct[s.form_id] || []) {
      if (!sec.route_emails?.length) continue;
      const wrote = sec.fields.some((f) => {
        const v = a[f.key] ?? a[f.id];
        return v != null && String(v).trim() !== "";
      }) || (sec.is_table && Array.isArray(a[sec.id]) && (a[sec.id] as unknown[]).length > 0);
      if (wrote) sec.route_emails.forEach((e) => filedBy.add(e));
    }
  }
  const notFiled = filers.filter((p) => !filedBy.has(p.email));

  const days = range
    ? Math.round(
        (new Date(dateTo + "T00:00:00Z").getTime() -
          new Date(date + "T00:00:00Z").getTime()) / 86400000) + 1
    : 1;
  // Over a range, "who has not filed" is a per-day question. What is useful
  // is how many of the days expected actually arrived.
  const expected = filers.length * days;

  if (authLoading || loading) return <div className="pt-16 text-center text-sm text-slate-400">…</div>;
  if (!profile || !isDirector(profile.role)) return null;

  return (
    <div className="max-w-4xl mx-auto pt-6">
      <button onClick={() => router.push("/dashboard")} className="text-sm text-blue-600 mb-4">← Dashboard</button>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold capitalize">
            {name} · {range ? "Summary" : "Daily Summary"}
          </h1>
          {range && (
            <p className="text-sm text-slate-500 mt-0.5">
              {date} → {dateTo} · {days} days · {subs.length} reports
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} max={dateTo || undefined}
            onChange={(e) => setDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
          <span className="text-xs text-slate-400">to</span>
          <input type="date" value={dateTo} min={date}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
          {range && (
            <button onClick={() => setDateTo("")} className="text-xs text-blue-600 px-1">
              one day
            </button>
          )}
        </div>
      </div>

      {channels.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">By channel</h2>
            <div className="text-xs text-slate-500">
              Total {fmt(grand.actual)} / {fmt(grand.target)} · {fmt(grand.invoices)} invoices
            </div>
          </div>
          <div className="space-y-4">
            {channels.map((c) => {
              const pc = c.total.target ? (c.total.actual / c.total.target) * 100 : null;
              const asv = c.total.invoices ? c.total.actual / c.total.invoices : null;
              return (
                <div key={c.kind} className="rounded-lg border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 rounded-t-lg">
                    <div className="font-medium text-sm">{KIND_LABEL[c.kind] || c.kind}</div>
                    <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                      <span>Target <b className="text-slate-900">{fmt(c.total.target)}</b></span>
                      <span>Actual <b className="text-slate-900">{fmt(c.total.actual)}</b></span>
                      <span className={pc == null ? "" : pc < 80 ? "text-red-600" : "text-green-700"}>
                        {pc == null ? "-" : fmt(pc) + "%"}
                      </span>
                      <span>Invoices <b className="text-slate-900">{fmt(c.total.invoices)}</b></span>
                      <span>Avg invoice <b className="text-slate-900">{asv == null ? "-" : fmt(Math.round(asv))}</b></span>
                    </div>
                  </div>
                  {c.kind === "retail" && c.branches.length > 1 && (
                    <table className="w-full text-xs">
                      <tbody>
                        {c.branches.map((b) => {
                          const bp = b.target ? (b.actual / b.target) * 100 : null;
                          const ba = b.invoices ? b.actual / b.invoices : null;
                          return (
                            <tr key={b.name} className="border-t border-slate-100">
                              <td className="px-4 py-2 text-slate-600">{b.name}</td>
                              <td className="px-3 py-2 text-right text-slate-400">{fmt(b.target)}</td>
                              <td className="px-3 py-2 text-right font-medium">{fmt(b.actual)}</td>
                              <td className={"px-3 py-2 text-right " + (bp == null ? "" : bp < 80 ? "text-red-600" : "text-green-700")}>
                                {bp == null ? "-" : fmt(bp) + "%"}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-500">{fmt(b.invoices)} inv</td>
                              <td className="px-3 py-2 text-right text-slate-500">{ba == null ? "-" : fmt(Math.round(ba))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
        <div className="flex flex-wrap gap-2 text-xs mb-4">
          <span className="px-2 py-1 rounded bg-slate-100">
            {range
              ? `Filed ${staffSubs.length}/${expected}`
              : `Filed ${filers.length - notFiled.length}/${filers.length}`}
          </span>
          {!range && notFiled.length > 0 && (
            <span className="px-2 py-1 rounded bg-amber-50 text-amber-700">
              Not filed: {notFiled.map((p) => (p.store_id && stores[p.store_id]) || p.email.split("@")[0]).join(" · ")}
            </span>
          )}
        </div>
        {summary.pct !== null && (
          <div className="text-3xl font-semibold mb-1">
            <span className={summary.pct < 80 ? "text-red-600" : "text-green-700"}>{fmt(summary.pct)}%</span>
            <span className="text-sm text-slate-500 font-normal ml-2">of target</span>
          </div>
        )}
        {summary.nums.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            {summary.nums.map((n) => (
              <div key={n.label} className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">{n.label}</div>
                <div className="font-semibold">{fmt(n.total)}</div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-slate-400">No figures filed yet.</p>}
        {summary.texts.map((t) => (
          <div key={t.label} className="mt-4">
            <div className="text-xs font-medium text-slate-500 mb-1">{t.label}</div>
            <ul className="space-y-1 text-sm">
              {t.items.map((i, k) => (
                <li key={k}><span className="text-slate-400 mr-2">{i.who}</span>{i.text}</li>
              ))}
            </ul>
          </div>
        ))}

        {summary.pics.map((p) => (
          <div key={p.label} className="mt-4">
            <div className="text-xs font-medium text-slate-500 mb-1">{p.label}</div>
            <div className="flex flex-wrap gap-2">
              {p.items.map((i, k) => <Shot key={k} path={i.path} who={i.who} />)}
            </div>
          </div>
        ))}
      </div>

      {/* What the department heads filed. It was being collected and then
          thrown away, so this page read as though they had written nothing. */}
      {(headSummary.nums.length > 0 || headSummary.texts.length > 0 || headSummary.pics.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <h2 className="text-sm font-semibold mb-1">Manager</h2>
          <p className="text-xs text-slate-400 mb-3">
            {consSubs.length} {consSubs.length === 1 ? "report" : "reports"}
          </p>

          {headSummary.nums.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-2">
              {headSummary.nums.map((n) => (
                <div key={n.label}>
                  <div className="text-xs text-slate-500">{n.label}</div>
                  <div className="text-base font-semibold">{fmt(n.total)}</div>
                </div>
              ))}
            </div>
          )}

          {headSummary.texts.map((t) => (
            <div key={t.label} className="mt-3">
              <div className="text-xs font-medium text-slate-500 mb-1">{t.label}</div>
              <ul className="space-y-1 text-sm">
                {t.items.map((i, k) => (
                  <li key={k}><span className="text-slate-400 mr-2">{i.who}</span>{i.text}</li>
                ))}
              </ul>
            </div>
          ))}

          {headSummary.pics.map((p) => (
            <div key={p.label} className="mt-3">
              <div className="text-xs font-medium text-slate-500 mb-1">{p.label}</div>
              <div className="flex flex-wrap gap-2">
                {p.items.map((i, k) => <Shot key={k} path={i.path} who={i.who} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {[...subs.filter((x) => isHead(x.form_id)), ...subs.filter((x) => !isHead(x.form_id))].map((s) => (
          <button key={s.id} onClick={() => router.push(`/report/${s.id}`)}
            className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 ${isHead(s.form_id) ? "bg-slate-50" : ""}`}>
            <div className={isHead(s.form_id) ? "" : "pl-4 border-l-2 border-slate-100"}>
              <div className="text-sm font-medium">{who(s)}</div>
              <div className="text-xs text-slate-400">{forms.find((f) => f.id === s.form_id)?.name}</div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded ${TONE[s.status] || "bg-slate-100"}`}>{s.status}</span>
          </button>
        ))}
        {subs.length === 0 && <div className="px-4 py-6 text-sm text-slate-400 text-center">Nothing filed for this day.</div>}
      </div>
    </div>
  );
}
