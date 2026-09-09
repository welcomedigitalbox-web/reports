import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Same project as the POS. The reporting tables live in their own schema;
// profiles, stores and the approval helpers are shared, which is the point
// of not standing up a second database.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: "reporting" },
});

// A second client for the POS side of the same database - profiles, stores,
// and the org structure the approval rules read.
export const posDb = createClient(supabaseUrl, supabaseAnonKey);

export type Department =
  | "sale"
  | "merchandising"
  | "warehouse"
  | "finance"
  | "marketing";

export type Profile = {
  id: string;
  email: string;
  role: string;
  store_id: string | null;
  department: Department | null;
  is_dept_head: boolean;
  reports_to: string | null;
};

export type FieldType =
  | "text" | "textarea" | "number" | "money" | "percent"
  | "date" | "select" | "yesno" | "user" | "store" | "file";

export type FormField = {
  id: string;
  section_id: string;
  key: string;
  label: string;
  label_mm: string | null;
  field_type: FieldType;
  options: string[] | null;
  required: boolean;
  source: "manual" | "auto";
  source_key: string | null;
  help: string | null;
  sort_order: number;
};

export type FormSection = {
  id: string;
  form_id: string;
  title: string;
  title_mm: string | null;
  is_table: boolean;
  sort_order: number;
  fields: FormField[];
};

export type ReportForm = {
  id: string;
  name: string;
  name_mm: string | null;
  department: Department;
  cadence: "daily" | "weekly" | "monthly";
  filled_by: string | null;
  checked_by: string | null;
  sort_order: number;
  active: boolean;
};

export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "acknowledged"
  | "rejected"
  | "cancel_requested"
  | "edit_requested"
  | "archived";

export type Submission = {
  id: string;
  form_id: string;
  store_id: string | null;
  report_date: string;
  status: SubmissionStatus;
  answers: Record<string, unknown>;
  overall_status: "normal" | "attention" | "critical" | null;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  rejected_by: string | null;
  reject_reason: string | null;
  request_reason: string | null;
  requested_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Incident = {
  id: string;
  submission_id: string;
  title: string;
  detail: string | null;
  urgency: "normal" | "attention" | "critical";
  evidence: string | null;
  raised_by: string;
  created_at: string;
  closed_at: string | null;
};

export type IncidentRoute = {
  route_id: string;
  incident_id: string;
  department: Department;
  routed_at: string;
  seen_at: string | null;
  response: string | null;
  title: string;
  detail: string | null;
  urgency: string;
  raised_by: string;
  form_id: string;
  store_id: string | null;
  report_date: string;
};

export type ActionItem = {
  id: string;
  submission_id: string;
  issue: string;
  responsible: string | null;
  start_date: string | null;
  deadline: string | null;
  status: "open" | "in_progress" | "done" | "cancelled";
  delay_reason: string | null;
  next_action: string | null;
  evidence: string | null;
  days_overdue?: number;
};

// Load a form with its sections and fields in the order they should appear.
export async function loadFormStructure(formId: string) {
  const { data: sections } = await supabase
    .from("form_sections")
    .select("*")
    .eq("form_id", formId)
    .order("sort_order");

  const ids = ((sections as FormSection[]) || []).map((s) => s.id);
  if (!ids.length) return [] as FormSection[];

  const { data: fields } = await supabase
    .from("form_fields")
    .select("*")
    .in("section_id", ids)
    .order("sort_order");

  const bySection = new Map<string, FormField[]>();
  for (const f of (fields as FormField[]) || []) {
    bySection.set(f.section_id, [...(bySection.get(f.section_id) || []), f]);
  }

  return ((sections as FormSection[]) || []).map((s) => ({
    ...s,
    fields: bySection.get(s.id) || [],
  }));
}

export const STATUS_TONE: Record<SubmissionStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  submitted: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  acknowledged: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancel_requested: "bg-orange-100 text-orange-700",
  edit_requested: "bg-orange-100 text-orange-700",
  archived: "bg-slate-100 text-slate-400",
};
