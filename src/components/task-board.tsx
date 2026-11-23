"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  UserRound,
} from "lucide-react";
import { cairoDate, overdue, statuses, type Member, type Status, type Task } from "@/lib/domain";
import { labels, type Lang } from "@/lib/i18n";

type Props = {
  tasks: Task[];
  team: Member[];
  manager: boolean;
  lang: Lang;
  onOpen: (task: Task) => void;
};

function nextAction(status: Status, manager: boolean, lang: Lang) {
  const ar = lang === "ar";
  switch (status) {
    case "todo":
      return ar ? manager ? "بانتظار بدء التنفيذ" : "ابدأ تنفيذ المهمة" : manager ? "Waiting for work to start" : "Start working";
    case "in_progress":
      return ar ? manager ? "جاري العمل عليها" : "أكمل التنفيذ ثم سلّم للمراجعة" : manager ? "Work is in progress" : "Finish and submit for review";
    case "tomorrow":
      return ar ? "مجدولة للعمل غدًا" : "Scheduled for tomorrow";
    case "waiting_review":
      return ar ? manager ? "راجع التسليم واتخذ قرارك" : "بانتظار مراجعة المديرة" : manager ? "Review and approve or request changes" : "Waiting for manager approval";
    case "changes_requested":
      return ar ? manager ? "بانتظار تنفيذ التعديلات" : "نفّذ التعديلات ثم أعد التسليم" : manager ? "Awaiting requested changes" : "Apply changes and resubmit";
    case "approved":
      return ar ? "تم الاعتماد النهائي" : "Final approval complete";
  }
}

function readableDate(date: string | null, lang: Lang) {
  if (!date) return lang === "ar" ? "غير محدد" : "Not set";
  return new Date(date + "T12:00:00Z").toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Cairo",
  });
}

export default function TaskBoard({ tasks, team, manager, lang, onOpen }: Props) {
  const [stage, setStage] = useState<Status | "all">("all");
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const counts = useMemo(
    () => Object.fromEntries(statuses.map((s) => [s, tasks.filter((task) => task.status === s).length])) as Record<Status, number>,
    [tasks],
  );
  const filtered = useMemo(() => {
    const list = tasks.filter((task) => stage === "all" || task.status === stage);
    return [...list].sort((a, b) => {
      if (overdue(a) !== overdue(b)) return overdue(a) ? -1 : 1;
      const weight = { high: 0, normal: 1, low: 2 };
      if (weight[a.priority] !== weight[b.priority]) return weight[a.priority] - weight[b.priority];
      return (a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31");
    });
  }, [tasks, stage]);

  function who(id: string) {
    return team.find((m) => m.id === id)?.display_name || t("Team member", "عضو الفريق");
  }
  const day = cairoDate();
  return (
    <section className="task-experience" aria-label={t("Task cards", "بطاقات المهام")}>
      <div className="task-experience-intro">
        <div>
          <span className="task-eyebrow">{manager ? t("TEAM WORKFLOW", "متابعة شغل الفريق") : t("MY WORK", "مساحة مهامي")}</span>
          <h2>{manager ? t("All work, clearly organized", "كل شغل الفريق قدامك بوضوح") : t("Know what to do next", "عارف مطلوب منك إيه بالضبط")}</h2>
          <p>{manager
            ? t("Choose a stage, open the task, and review submissions in one place.", "اختار حالة المهمة وافتح البطاقة لمتابعة التنفيذ أو مراجعة التسليم.")
            : t("Read the brief, check the deadline, and open the task to update or submit it.", "اقرأ تفاصيل المهمة وموعدها، وبعد التنفيذ افتح البطاقة وسلّم شغلك للمراجعة.")}</p>
        </div>
        <div className="task-total"><strong>{tasks.length}</strong><span>{t("Tasks", "مهمة")}</span></div>
      </div>

      <div className="task-stage-filters" role="group" aria-label={t("Filter by status", "تصفية حسب حالة المهمة")}>
        <button type="button" aria-pressed={stage === "all"} className={stage === "all" ? "selected" : ""} onClick={() => setStage("all")}>
          {t("All tasks", "كل المهام")} <span>{tasks.length}</span>
        </button>
        {statuses.map((s) => (
          <button type="button" key={s} aria-pressed={stage === s} className={stage === s ? "selected" : ""} onClick={() => setStage(s)}>
            <i className={"task-status-dot task-status-" + s} />
            {labels[s][lang === "ar" ? 1 : 0]} <span>{counts[s]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="task-empty-state">
          <div className="task-empty-symbol"><ClipboardList size={32} strokeWidth={1.7} /></div>
          <h3>{tasks.length === 0 ? t("No tasks assigned yet", "مفيش مهام مسجلة لسه") : t("No tasks in this stage", "مفيش مهام بالحالة دي")}</h3>
          <p>{tasks.length === 0
            ? manager ? t("Create the first task and assign it to a team member.", "ابدئي بإضافة أول مهمة وحددي الشخص المسؤول عنها.") : t("Tasks assigned by your manager will appear here automatically.", "أول ما المديرة تسند لك مهمة هتظهر هنا تلقائيًا.")
            : t("Choose another status or show all tasks.", "اختار حالة مختلفة أو اعرض كل المهام.")}</p>
          {tasks.length > 0 && <button type="button" onClick={() => setStage("all")}>{t("Show all tasks", "عرض كل المهام")}</button>}
        </div>
      ) : (
        <div className="stc-card-grid">
          {filtered.map((task) => {
            const isLate = overdue(task, day);
            return (
              <button type="button" key={task.id} className={"stc-work-card stc-work-card-" + task.status} onClick={() => onOpen(task)} aria-label={t("Open task", "فتح مهمة") + ": " + task.title}>
                <div className="stc-work-card-top">
                  <span className={"stc-card-status " + task.status}><span className={"task-status-dot task-status-" + task.status} />{labels[task.status][lang === "ar" ? 1 : 0]}</span>
                  <span className={"stc-card-priority " + task.priority}>
                    {task.priority === "high" ? t("High priority", "عاجلة") : task.priority === "low" ? t("Low priority", "منخفضة") : t("Normal priority", "عادية")}
                  </span>
                </div>
                <div className="stc-work-card-body">
                  <h3>{task.title}</h3>
                  <p>{task.description?.trim() || t("Open for detailed instructions.", "افتح المهمة لقراءة كل التفاصيل والتعليمات.")}</p>
                </div>
                <div className="stc-work-card-facts">
                  <div className="stc-card-fact">
                    <span className="stc-card-fact-icon"><UserRound size={17} /></span>
                    <span><small>{t("Responsible", "المسؤول")}</small><strong>{who(task.assignee_id)}</strong></span>
                  </div>
                  <div className={"stc-card-fact" + (isLate ? " is-late" : "")}>
                    <span className="stc-card-fact-icon">{isLate ? <AlertTriangle size={17} /> : <CalendarDays size={17} />}</span>
                    <span><small>{isLate ? t("Overdue", "متأخرة عن الموعد") : t("Due date", "موعد التسليم")}</small><strong>{readableDate(task.due_date, lang)}</strong></span>
                  </div>
                  {task.planned_for && task.planned_for !== task.due_date && (
                    <div className="stc-card-fact">
                      <span className="stc-card-fact-icon"><Clock3 size={17} /></span>
                      <span><small>{t("Planned for", "موعد العمل")}</small><strong>{readableDate(task.planned_for, lang)}</strong></span>
                    </div>
                  )}
                </div>
                <div className="stc-work-card-footer">
                  <div className="stc-card-next">
                    {task.status === "approved" ? <CheckCircle2 size={18} /> : <ArrowUpRight size={18} />}
                    <span><small>{t("Next step", "الخطوة التالية")}</small><strong>{nextAction(task.status, manager, lang)}</strong></span>
                  </div>
                  <span className="stc-open-task">{t("View details", "التفاصيل")} <ArrowUpRight size={16} /></span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
