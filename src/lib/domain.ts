export const statuses = [
  "todo",
  "in_progress",
  "tomorrow",
  "waiting_review",
  "changes_requested",
  "approved",
] as const;
export type Status = (typeof statuses)[number];
export type Member = {
  id: string;
  display_name: string;
  role: "manager" | "member";
  active: boolean;
};
export type Task = {
  id: string;
  title: string;
  description: string;
  assignee_id: string;
  due_date: string | null;
  planned_for: string | null;
  priority: "low" | "normal" | "high";
  status: Status;
  submission_note: string;
  review_note: string;
  created_at: string;
  updated_at: string;
  version: number;
};
export type Notice = {
  id: string;
  task_id: string;
  kind: string;
  created_at: string;
  read_at: string | null;
};
export type Event = {
  id: string;
  actor_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
};
export type Comment = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
};
export type Attachment = {
  id: string;
  task_id: string;
  object_path: string;
  filename: string;
  size: number;
  created_at: string;
};
export type ArchiveRow = {
  id: string;
  batch_id: string;
  sheet: string;
  row_number: number;
  cells: Record<
    string,
    { value: unknown; comment?: unknown; hyperlink?: unknown }
  >;
  mapped: Record<string, unknown>;
  fingerprint: string;
};
export function canTransition(role: Member["role"], from: Status, to: Status) {
  if (from === to) return true;
  if (to === "approved" || to === "changes_requested")
    return role === "manager" && from === "waiting_review";
  return (
    from !== "approved" &&
    from !== "waiting_review" &&
    ["todo", "in_progress", "tomorrow", "waiting_review"].includes(to)
  );
}
export function cairoDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function tomorrow(now = new Date()) {
  const d = new Date(cairoDate(now) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
export function overdue(task: Task, date = cairoDate()) {
  return !!task.due_date && task.due_date < date && task.status !== "approved";
}
export function csvCell(value: unknown) {
  const s = String(value ?? "");
  return (
    '"' + (/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
  );
}
export function safeUrl(value: unknown) {
  try {
    const u = new URL(String(value));
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
