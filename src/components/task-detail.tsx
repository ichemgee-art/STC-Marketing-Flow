"use client";
import { useEffect, useState, useCallback } from "react";
import { X, Paperclip, Send, Clock, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  statuses,
  canTransition,
  tomorrow,
  type Task,
  type Member,
  type Comment,
  type Attachment,
  type Event,
} from "@/lib/domain";
import { labels, type Lang } from "@/lib/i18n";
export default function TaskDetail({
  task,
  member,
  team,
  lang,
  onClose,
  onChange,
  onNotice,
}: {
  task: Task;
  member: Member;
  team: Member[];
  lang: Lang;
  onClose: () => void;
  onChange: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [comments, setComments] = useState<Comment[]>([]),
    [files, setFiles] = useState<Attachment[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [note, setNote] = useState(""),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const results = await Promise.all([
      supabase
        .from("stc_comments")
        .select("*")
        .eq("task_id", task.id)
        .order("created_at"),
      supabase
        .from("stc_attachments")
        .select("*")
        .eq("task_id", task.id)
        .order("created_at"),
      supabase
        .from("stc_events")
        .select("*")
        .eq("task_id", task.id)
        .order("created_at", { ascending: false }),
    ]);
    const e = results.find((r) => r.error)?.error;
    if (e) {
      setError(e.message);
      return;
    }
    setComments(results[0].data || []);
    setFiles(results[1].data || []);
    setEvents(results[2].data || []);
  }, [task.id]);
  useEffect(() => {
    void load();
    const channel = supabase
      .channel("detail-" + task.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stc_comments",
          filter: `task_id=eq.${task.id}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stc_attachments",
          filter: `task_id=eq.${task.id}`,
        },
        () => void load(),
      )
      .subscribe();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("keydown", onKey);
    };
  }, [task.id, load, onClose]);
  useEffect(() => {
    void load();
  }, [task.version, load]);
  async function run(fn: () => Promise<void>, confirmation?: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      await onChange();
      if (confirmation) onNotice(confirmation);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function change(status: Task["status"]) {
    if (
      ["waiting_review", "changes_requested"].includes(status) &&
      !note.trim()
    )
      throw new Error(
        t(
          "Add a submission or review note first.",
          "اكتب ملاحظة التسليم أو التعديلات أولًا.",
        ),
      );
    const values: Record<string, unknown> = { status };
    if (status === "waiting_review") values.submission_note = note;
    if (["approved", "changes_requested"].includes(status))
      values.review_note = note;
    if (status === "tomorrow") values.planned_for = tomorrow();
    const r = await supabase
      .from("stc_tasks")
      .update(values)
      .eq("id", task.id)
      .eq("version", task.version)
      .select("id");
    if (r.error) throw r.error;
    if (!r.data.length)
      throw new Error(
        t(
          "This task changed. Close and reopen it before trying again.",
          "المهمة اتعدّلت. أغلقها وافتحها من جديد قبل المحاولة.",
        ),
      );
    setNote("");
  }
  async function updateTask(form: HTMLFormElement) {
    const f = new FormData(form);
    const r = await supabase.from("stc_tasks").update({
      title: String(f.get("title") || "").trim(),
      description: String(f.get("description") || ""),
      assignee_id: String(f.get("assignee")),
      due_date: f.get("due") || null,
      priority: String(f.get("priority")),
    }).eq("id", task.id).eq("version", task.version).select("id");
    if (r.error) throw r.error;
    if (!r.data?.length) throw new Error(t("Task changed in another session. Reopen it and try again.", "المهمة اتعدلت من حساب تاني. افتحها من جديد وحاول تاني."));
    setEditing(false);
  }
  async function removeTask() {
    if (!window.confirm(t(
      "Remove this task from everyone's active lists? The action will be recorded.",
      "هل متأكد من حذف المهمة من القوائم الحالية عند كل الفريق؟ هيتم حفظ العملية في سجل النشاط."
    ))) return;
    await run(async () => {
      const r = await supabase.from("stc_tasks").update({
        deleted_at: new Date().toISOString(),
        deleted_by: member.id,
      }).eq("id", task.id).eq("version", task.version).select("id");
      if (r.error) throw r.error;
      if (!r.data?.length) throw new Error(t("Task changed. Reopen it and try again.", "المهمة اتغيرت. افتحها تاني وحاول."));
      onClose();
    }, t("Task removed from team lists.", "تم حذف المهمة من قوائم الفريق بنجاح."));
  }
  async function upload(file: File) {
    if (file.size > 25 * 1024 * 1024)
      throw new Error(
        t(
          "Maximum attachment size is 25 MB.",
          "الحد الأقصى للمرفق 25 ميجابايت.",
        ),
      );
    const path = `${task.id}/${member.id}/${crypto.randomUUID()}`;
    const uploaded = await supabase.storage
      .from("stc-task-files")
      .upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
    if (uploaded.error) throw uploaded.error;
    const r = await supabase
      .from("stc_attachments")
      .insert({
        task_id: task.id,
        object_path: path,
        filename: file.name,
        size: file.size,
      });
    if (r.error) {
      await supabase.storage.from("stc-task-files").remove([path]);
      throw r.error;
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-title"
      >
        <div className="section-title">
          <span className={"status-pill " + task.status}>
            {labels[task.status][lang === "ar" ? 1 : 0]}
          </span>
          <button autoFocus aria-label={t("Close", "إغلاق")} onClick={onClose}>
            <X />
          </button>
        </div>
        <h2 id="task-title">{task.title}</h2>
        <p className="detail-description">{task.description}</p>
        {member.role === "manager" && !task.deleted_at && (
          <div className="manager-task-tools">
            <div className="manager-task-tool-heading">
              <strong>{t("Manager controls", "إدارة المهمة")}</strong>
              <span>{t("Changes update the assigned member automatically.", "أي تعديل هيتحدث عند الموظف تلقائيًا.")}</span>
            </div>
            <div className="manager-task-tool-buttons">
              {task.status !== "approved" && <button type="button" onClick={() => setEditing(!editing)} disabled={busy}>
                {editing ? t("Cancel editing", "إلغاء التعديل") : t("Edit task", "تعديل المهمة")}
              </button>}
              <button type="button" className="danger-action" disabled={busy} onClick={() => void removeTask()}>
                {t("Remove task", "حذف المهمة")}
              </button>
            </div>
            {editing && task.status !== "approved" && (
              <form className="manager-edit-form" onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                void run(() => updateTask(form), t("Task updated for the team.", "تم تعديل المهمة والتحديث هيظهر للفريق."));
              }}>
                <label>{t("Title", "عنوان المهمة")}<input name="title" defaultValue={task.title} required maxLength={300}/></label>
                <label>{t("Instructions", "التفاصيل والتعليمات")}<textarea name="description" defaultValue={task.description} rows={4}/></label>
                <div className="form-grid">
                  <label>{t("Assigned to", "المسؤول")}<select name="assignee" defaultValue={task.assignee_id} required>
                    {team.filter(p => p.role === "member" && p.active).map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                  </select></label>
                  <label>{t("Deadline", "موعد التسليم")}<input name="due" type="date" defaultValue={task.due_date || ""}/></label>
                </div>
                <label>{t("Priority", "الأولوية")}<select name="priority" defaultValue={task.priority}>
                  <option value="low">{t("Low", "منخفضة")}</option>
                  <option value="normal">{t("Normal", "عادية")}</option>
                  <option value="high">{t("High", "عالية")}</option>
                </select></label>
                <button className="primary wide" type="submit" disabled={busy}>{t("Save changes for team", "حفظ التعديلات للفريق")}</button>
              </form>
            )}
          </div>
        )}

        <div className="detail-facts">
          <span>
            {t("Assigned to", "المسؤول")}
            <b>
              {team.find((p) => p.id === task.assignee_id)?.display_name ||
                member.display_name}
            </b>
          </span>
          <span>
            {t("Original deadline", "موعد التسليم الأصلي")}
            <b>{task.due_date || "—"}</b>
          </span>
          <span>
            {t("Planned work date", "تاريخ العمل المخطط")}
            <b>{task.planned_for || "—"}</b>
          </span>
        </div>
        {task.submission_note && (
          <div className="note-block">
            <b>{t("Submission", "التسليم")}</b>
            <p>{task.submission_note}</p>
          </div>
        )}
        {task.review_note && (
          <div className="note-block">
            <b>{t("Manager review", "مراجعة المديرة")}</b>
            <p>{task.review_note}</p>
          </div>
        )}
        {task.status !== "approved" && (
          <>
            <div className="task-detail-guidance">
              <strong>{member.role === "manager" && task.status === "waiting_review"
                ? t("Review the delivered work", "راجعي الشغل اللي اتسلّم")
                : task.status === "changes_requested"
                  ? t("Changes are required", "مطلوب تعديل المهمة")
                  : t("Keep the task moving", "حدّث حالة المهمة بسهولة")}</strong>
              <p>{member.role === "manager" && task.status === "waiting_review"
                ? t("Check the submitted files and notes, then approve or request specific changes.", "راجعي الملفات والملاحظات، وبعدها اعتمدي المهمة أو اكتبي التعديلات المطلوبة بشكل واضح.")
                : task.status === "changes_requested"
                  ? t("Read the review note, make the requested updates and resubmit your work.", "اقرأ ملاحظات المديرة، ونفّذ التعديلات المطلوبة، وبعدها سلّم شغلك تاني.")
                  : t("Choose the current step. When you finish, submit your work for manager approval.", "اختار المرحلة المناسبة. لما تخلص، سلّم المهمة للمراجعة علشان المديرة تعتمدها.")}</p>
            </div>
            <label>
              {task.status === "waiting_review"
                ? t("Review note", "ملاحظات المراجعة")
                : t("Submission note", "ملاحظات التسليم")}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={10000}
              />
            </label>
            <div className="status-actions">
              {statuses
                .filter(
                  (s) =>
                    s !== task.status &&
                    canTransition(member.role, task.status, s),
                )
                .map((s) => (
                  <button
                    disabled={busy}
                    className={
                      s === "approved" || s === "waiting_review"
                        ? "primary"
                        : ""
                    }
                    key={s}
                    onClick={() => void run(() => change(s), s === "waiting_review" ? t("Submitted successfully. Nardine has been notified for review.", "تم تسليم المهمة بنجاح، ووصل لناردين إشعار بانتظار المراجعة.") : s === "approved" ? t("Task approved. Team member notified.", "تم اعتماد المهمة، ووصل إشعار للموظف.") : s === "changes_requested" ? t("Requested changes sent to the member.", "تم إرسال التعديلات المطلوبة للموظف.") : t("Task status updated.", "تم تحديث حالة المهمة بنجاح."))}
                  >
                    {s === "waiting_review"
                      ? t("Submit for review", "تسليم للمراجعة")
                      : s === "approved"
                        ? t("Approve task", "اعتماد المهمة")
                        : s === "changes_requested"
                          ? t("Request changes", "طلب تعديلات")
                          : s === "in_progress"
                            ? t("Start / continue work", "بدء / متابعة التنفيذ")
                            : s === "tomorrow"
                              ? t("Move to tomorrow", "تأجيل العمل لبكرة")
                              : labels[s][lang === "ar" ? 1 : 0]}
                  </button>
                ))}
            </div>
          </>
        )}
        <h3>
          <Paperclip size={17} /> {t("Attachments", "المرفقات")}
        </h3>
        {files.map((file) => (
          <button
            className="file-row"
            key={file.id}
            onClick={() =>
              void run(async () => {
                const r = await supabase.storage
                  .from("stc-task-files")
                  .createSignedUrl(file.object_path, 60, {
                    download: file.filename,
                  });
                if (r.error) throw r.error;
                const a = document.createElement("a");
                a.href = r.data.signedUrl;
                a.rel = "noopener";
                a.target = "_blank";
                a.click();
              })
            }
          >
            <Download size={15} />
            {file.filename}
            <small>{Math.ceil(file.size / 1024)} KB</small>
          </button>
        ))}
        {task.status !== "approved" && (
          <label className="upload">
            {t("Attach a file (up to 25 MB)", "أضف ملفًا (حتى 25 ميجابايت)")}
            <input
              type="file"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void run(() => upload(file), t("Attachment saved.", "تم حفظ المرفق بنجاح."));
                e.target.value = "";
              }}
            />
          </label>
        )}
        <h3>{t("Notes & discussion", "الملاحظات والنقاش")}</h3>
        {comments.map((c) => (
          <div className="comment" key={c.id}>
            <b>
              {team.find((p) => p.id === c.author_id)?.display_name ||
                t("Team member", "عضو الفريق")}
            </b>
            <small>
              {new Date(c.created_at).toLocaleString(
                lang === "ar" ? "ar-EG" : "en-GB",
                { timeZone: "Africa/Cairo" },
              )}
            </small>
            <p>{c.body}</p>
          </div>
        ))}
        {task.status !== "approved" && (
          <form
            className="comment-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const body = String(new FormData(form).get("body"));
              void run(async () => {
                const r = await supabase
                  .from("stc_comments")
                  .insert({ task_id: task.id, body });
                if (r.error) throw r.error;
                form.reset();
              }, t("Note saved.", "تم حفظ الملاحظة."));
            }}
          >
            <input
              name="body"
              required
              maxLength={10000}
              aria-label={t("Add a note", "إضافة ملاحظة")}
              placeholder={t("Write a note…", "اكتب ملاحظة…")}
            />
            <button
              className="primary"
              disabled={busy}
              aria-label={t("Send note", "حفظ الملاحظة")}
            >
              <Send size={17} />
            </button>
          </form>
        )}
        <h3>
          <Clock size={17} /> {t("Activity history", "سجل النشاط")}
        </h3>
        {events.map((e) => (
          <div className="event" key={e.id}>
            <span>
              {e.action in labels
                ? labels[e.action as keyof typeof labels][lang === "ar" ? 1 : 0]
                : e.action === "assigned"
                  ? t("Assigned", "تم الإسناد")
                  : t("Updated", "تم التحديث")}
            </span>
            <small>
              {new Date(e.created_at).toLocaleString(
                lang === "ar" ? "ar-EG" : "en-GB",
                { timeZone: "Africa/Cairo" },
              )}
            </small>
          </div>
        ))}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
