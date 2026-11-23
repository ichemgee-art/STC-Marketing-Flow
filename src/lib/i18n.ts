import type { Status } from "./domain";
export const labels: Record<Status, [string, string]> = {
  todo: ["To Do", "للتنفيذ"],
  in_progress: ["In Progress", "قيد التنفيذ"],
  tomorrow: ["Tomorrow", "غدًا"],
  waiting_review: ["Waiting for Review", "بانتظار المراجعة"],
  changes_requested: ["Changes Requested", "مطلوب تعديلات"],
  approved: ["Approved", "معتمدة"],
};
export type Lang = "en" | "ar";
