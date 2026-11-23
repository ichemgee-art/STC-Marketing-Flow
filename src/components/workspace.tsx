"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import Image from "next/image";
import type { Session } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  ListTodo,
  CalendarDays,
  Archive,
  BarChart3,
  Bell,
  Plus,
  Search,
  LogOut,
  ArrowUpRight,
  CheckCheck,
  Menu,
  X,
} from "lucide-react";
import { supabase, configured } from "@/lib/supabase";
import {
  statuses,
  overdue,
  cairoDate,
  csvCell,
  type Task,
  type Member,
  type Notice,
} from "@/lib/domain";
import { labels, type Lang } from "@/lib/i18n";
import TaskDetail from "./task-detail";
import History from "./history";

export default function Workspace() {
  const authEpoch = useRef(0);
  const [lang, setLang] = useState<Lang>("ar");
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [member, setMember] = useState<Member | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]),
    [team, setTeam] = useState<Member[]>([]),
    [notices, setNotices] = useState<Notice[]>([]);
  const [dailyReports, setDailyReports] = useState<
    { report_date: string; summary: Record<string, unknown>[] }[]
  >([]);
  const [view, setView] = useState("overview"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<Task | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [showNotices, setShowNotices] = useState(false),
    [mobile, setMobile] = useState(false),
    [live, setLive] = useState(false);
  const manager = member?.role === "manager";
  useEffect(() => {
    const saved = localStorage.getItem("stc-language");
    if (saved === "en" || saved === "ar") setLang(saved);
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      authEpoch.current++;
      setSession(s);
      setMember(null);
      setTasks([]);
      setTeam([]);
      setNotices([]);
      setSelected(null);
      setView('overview');
      setCreating(false);
      setShowNotices(false);
      setFilter('all');
      setQuery('');
      setDailyReports([]);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    localStorage.setItem("stc-language", lang);
  }, [lang]);
  const load = useCallback(async () => {
    if (!session) return;
    const epoch = authEpoch.current;
    try {
      const m = await supabase
        .from("stc_members")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();
      if (m.error) throw m.error;
      if (epoch !== authEpoch.current) return;
      setMember(m.data);
      if (!m.data?.active) {
        setTasks([]);
        return;
      }
      // Pagination avoids Supabase's default 1000-row cap silently truncating reports.
      const all: Task[] = [];
      for (let offset = 0; ; offset += 1000) {
        const r = await supabase
          .from("stc_tasks")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id")
          .range(offset, offset + 999);
        if (r.error) throw r.error;
        all.push(...r.data);
        if (r.data.length < 1000) break;
      }
      const [people, n] = await Promise.all([
        supabase.from("stc_members").select("*").eq("active", true),
        supabase
          .from("stc_notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (people.error) throw people.error;
      if (n.error) throw n.error;
      if (epoch !== authEpoch.current) return;
      setTasks(all);
      setTeam(people.data);
      setNotices(n.data);
      if (m.data.role === "manager") {
        const reports = await supabase
          .from("stc_daily_reports")
          .select("report_date,summary")
          .order("report_date", { ascending: false })
          .limit(30);
        if (reports.error) throw reports.error;
        if (epoch === authEpoch.current) setDailyReports(reports.data);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : String((e as { message?: string }).message || e),
      );
    }
  }, [session]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!session) return;
    const c = supabase
      .channel("workspace-" + session.user.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stc_tasks" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stc_notifications",
          filter: `recipient_id=eq.${session.user.id}`,
        },
        () => void load(),
      )
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    const poll = setInterval(() => void load(), 60000);
    return () => {
      void supabase.removeChannel(c);
      clearInterval(poll);
      setLive(false);
    };
  }, [session, load]);
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const date = cairoDate();
  const review = tasks.filter((x) => x.status === "waiting_review");
  const approved = tasks.filter((x) => x.status === "approved");
  const late = tasks.filter((x) => overdue(x));
  const visible = tasks.filter(
    (x) =>
      (filter === "all" || x.assignee_id === filter) &&
      `${x.title} ${x.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const name = (id: string) =>
    team.find((p) => p.id === id)?.display_name ||
    t("Team member", "عضو الفريق");
  function exportReport() {
    const rows = [
      ["Title", "Assignee", "Status", "Due date", "Planned date", "Updated at"],
      ...visible.map((x) => [
        x.title,
        name(x.assignee_id),
        x.status,
        x.due_date,
        x.planned_for,
        x.updated_at,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `STC-report-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const languageButton = (
    <button
      className="language"
      onClick={() => setLang(lang === "ar" ? "en" : "ar")}
    >
      {lang === "ar" ? "English" : "العربية"}
    </button>
  );
  if (!ready) return <main className="loading">STC Marketing Flow…</main>;
  if (!session)
    return (
      <main className="login">
        <div className="login-story">
          <Image
            src="/stc-logo.png"
            width={220}
            height={130}
            alt="STC"
            className="brand-image"
          />
          <span className="eyebrow">STC MARKETING FLOW</span>
          <h1>
            {t("Good work.\nClear progress.", "شغل منظّم.\nوإنجاز واضح.")}
          </h1>
          <p>
            {t(
              "One place for your team, every task, and every approval.",
              "مكان واحد للفريق، من أول فكرة لحد الاعتماد.",
            )}
          </p>
          <div className="login-steps">
            <span>01 {t("Assign", "إسناد")}</span>
            <span>02 {t("Create", "تنفيذ")}</span>
            <span>03 {t("Review", "مراجعة")}</span>
          </div>
        </div>
        <section className="login-form">
          {languageButton}
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h2>{t("Welcome back", "أهلًا بعودتك")}</h2>
          <p className="muted">
            {t(
              "Sign in with your team account to continue.",
              "سجّل دخول بحساب الفريق لمتابعة شغلك.",
            )}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(async () => {
                if (!configured)
                  throw new Error(
                    t(
                      "Configure the public Supabase environment variables.",
                      "إعدادات اتصال Supabase غير متاحة.",
                    ),
                  );
                const r = await supabase.auth.signInWithPassword({
                  email: String(f.get("email")),
                  password: String(f.get("password")),
                });
                if (r.error) throw r.error;
              });
            }}
          >
            <label>
              {t("Email address", "البريد الإلكتروني")}
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                dir="ltr"
              />
            </label>
            <label>
              {t("Password", "كلمة المرور")}
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
              />
            </label>
            <button className="primary wide" disabled={busy}>
              {busy
                ? t("Signing in…", "جارٍ الدخول…")
                : t("Sign in", "تسجيل الدخول")}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <p className="small muted">
            {t(
              "Accounts are provisioned by your workspace administrator.",
              "حسابات الفريق يتم تجهيزها عن طريق مسؤولة النظام.",
            )}
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
      </main>
    );
  return (
    <div className="app">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <Image
            src="/stc-logo.png"
            width={140}
            height={80}
            alt="STC"
            className="brand-image"
          />
          <b>Marketing Flow</b>
        </div>
        <span className="side-caption">{t("WORKSPACE", "مساحة العمل")}</span>
        <nav>
          {[
            ["overview", LayoutDashboard, t("Overview", "نظرة عامة")],
            ["tasks", ListTodo, t("Tasks", "المهام")],
            ["calendar", CalendarDays, t("Calendar", "التقويم")],
            ["reports", BarChart3, t("Reports", "التقارير")],
            ...(manager
              ? [
                  [
                    "history",
                    Archive,
                    t("Historical archive", "الأرشيف التاريخي"),
                  ],
                ]
              : []),
          ].map(([id, Icon, label]) => {
            const I = Icon as typeof ListTodo;
            return (
              <button
                key={String(id)}
                className={view === id ? "active" : ""}
                onClick={() => {
                  setView(String(id));
                  setMobile(false);
                }}
              >
                <I size={19} />
                {String(label)}
                {id === "tasks" && (
                  <span className="nav-count">
                    {tasks.filter((x) => x.status !== "approved").length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="side-bottom">
          <div className="avatar">
            {member?.display_name?.slice(0, 1) || "S"}
          </div>
          <div>
            <b>{member?.display_name || t("Account", "الحساب")}</b>
            <small>
              {manager
                ? t("Manager", "مديرة الفريق")
                : t("Team member", "عضو الفريق")}
            </small>
          </div>
          <button
            aria-label={t("Sign out", "تسجيل الخروج")}
            onClick={() =>
              void action(async () => {
                const r = await supabase.auth.signOut();
                if (r.error) throw r.error;
              })
            }
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="mobile-toggle"
            aria-label="Menu"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <span>
            {t("Workspace", "مساحة العمل")} <span className="slash">/</span>{" "}
            <b>{t("Marketing team", "فريق التسويق")}</b>
          </span>
          <div className="top-actions">
            <span className={live ? "live" : "offline"}>
              {live ? t("Live", "متصل") : t("Reconnecting", "جارٍ الاتصال")}
            </span>
            {languageButton}
            <button
              className="bell"
              aria-label={t("Notifications", "الإشعارات")}
              onClick={() => setShowNotices(!showNotices)}
            >
              <Bell size={20} />
              {notices.some((n) => !n.read_at) && <i />}
            </button>
          </div>
        </header>
        <main className="content">
          {error && (
            <div className="error" role="alert">
              {error}
              <button
                onClick={() => {
                  setError("");
                  void load();
                }}
              >
                {t("Retry", "إعادة المحاولة")}
              </button>
            </div>
          )}
          {!member?.active ? (
            <section className="empty">
              <h1>
                {t(
                  "Your workspace is not activated yet",
                  "حسابك لم يُفعَّل في الفريق بعد",
                )}
              </h1>
              <p>
                {t(
                  "Ask the workspace administrator to add your authenticated user to the team.",
                  "اطلب من مسؤولة النظام إضافة حسابك إلى الفريق.",
                )}
              </p>
            </section>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {new Intl.DateTimeFormat(
                      lang === "ar" ? "ar-EG" : "en-GB",
                      { dateStyle: "full", timeZone: "Africa/Cairo" },
                    ).format(new Date())}
                  </span>
                  <h1>
                    {view === "history"
                      ? t("Historical archive", "الأرشيف التاريخي")
                      : view === "reports"
                        ? t("Team reports", "تقارير الفريق")
                        : view === "calendar"
                          ? t("Team calendar", "تقويم الفريق")
                          : t("Let’s move work forward", "خلّينا ننجز سوا")}
                  </h1>
                  <p className="muted">
                    {t(
                      "A clear view of what’s moving, what’s next, and what needs you.",
                      "كل اللي شغال، واللي جاي، واللي محتاج مراجعتك في مكان واحد.",
                    )}
                  </p>
                </div>
                {manager && view !== "history" && (
                  <button className="primary" onClick={() => setCreating(true)}>
                    <Plus size={18} />
                    {t("New task", "مهمة جديدة")}
                  </button>
                )}
              </div>
              {view === "history" ? (
                <History lang={lang} team={team} />
              ) : (
                <>
                  <div className="stats">
                    {[
                      [
                        t("Active tasks", "المهام الحالية"),
                        tasks.length - approved.length,
                        "navy",
                      ],
                      [
                        t("In progress", "قيد التنفيذ"),
                        tasks.filter((x) => x.status === "in_progress").length,
                        "blue",
                      ],
                      [
                        t("Waiting for review", "بانتظار المراجعة"),
                        review.length,
                        "gold",
                      ],
                      [t("Approved", "تم اعتمادها"), approved.length, "green"],
                    ].map(([label, value, color]) => (
                      <div className="stat" key={label}>
                        <div className={"stat-dot " + color} />
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                  {late.length > 0 && (
                    <div className="deadline-alert">
                      <CalendarDays size={18} />
                      {t(
                        `${late.length} tasks are past their original deadline.`,
                        `${late.length} مهمة تجاوزت موعد التسليم الأصلي.`,
                      )}
                    </div>
                  )}
                  {view === "reports" ? (
                    <section className="panel">
                      <div className="section-title">
                        <h2>{t("Team performance", "متابعة أداء الفريق")}</h2>
                        <button onClick={exportReport}>
                          {t("Export CSV", "تصدير CSV")}
                        </button>
                      </div>
                      <p className="muted">
                        {t(
                          "Current status totals · Cairo time · Historical archive is excluded.",
                          "إجمالي الحالات الحالية · توقيت القاهرة · الأرشيف التاريخي غير محسوب.",
                        )}
                      </p>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>{t("Team member", "عضو الفريق")}</th>
                              {statuses.map((s) => (
                                <th key={s}>
                                  {labels[s][lang === "ar" ? 1 : 0]}
                                </th>
                              ))}
                              <th>{t("Overdue", "متأخرة")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {team.map((p) => (
                              <tr key={p.id}>
                                <td>{p.display_name}</td>
                                {statuses.map((s) => (
                                  <td key={s}>
                                    {
                                      tasks.filter(
                                        (x) =>
                                          x.assignee_id === p.id &&
                                          x.status === s,
                                      ).length
                                    }
                                  </td>
                                ))}
                                <td>
                                  {
                                    late.filter((x) => x.assignee_id === p.id)
                                      .length
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <h3>{t("Today’s activity", "نشاط اليوم")}</h3>
                      <p>
                        {t(
                          "Submissions and approvals updated today",
                          "تسليمات واعتمادات تم تحديثها اليوم",
                        )}
                        :{" "}
                        {
                          tasks.filter(
                            (x) =>
                              cairoDate(new Date(x.updated_at)) === date &&
                              ["waiting_review", "approved"].includes(x.status),
                          ).length
                        }
                      </p>
                      {manager && (
                        <>
                          <h3>
                            {t(
                              "Saved daily reports",
                              "التقارير اليومية المحفوظة",
                            )}
                          </h3>
                          {dailyReports.length === 0 ? (
                            <p className="muted">
                              {t(
                                "No saved reports yet. The scheduled digest must be activated after setup.",
                                "لا توجد تقارير محفوظة بعد. يتم تفعيل الملخص المجدول بعد إعداد النظام.",
                              )}
                            </p>
                          ) : (
                            dailyReports.map((report) => (
                              <details key={report.report_date}>
                                <summary>{report.report_date}</summary>
                                <div className="table-scroll">
                                  <table>
                                    <thead>
                                      <tr>
                                        {[
                                          t("Member", "العضو"),
                                          t("Approved", "معتمدة"),
                                          t("Review", "للمراجعة"),
                                          t("In progress", "قيد التنفيذ"),
                                          t("Tomorrow", "غدًا"),
                                          t("Overdue", "متأخرة"),
                                        ].map((x) => (
                                          <th key={x}>{x}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {report.summary.map((r, i) => (
                                        <tr key={i}>
                                          {[
                                            "display_name",
                                            "approved",
                                            "waiting_review",
                                            "in_progress",
                                            "tomorrow",
                                            "overdue",
                                          ].map((k) => (
                                            <td key={k}>
                                              {String(r[k] ?? "—")}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </details>
                            ))
                          )}
                        </>
                      )}
                    </section>
                  ) : (
                    <>
                      <div className="section-title">
                        <h2>
                          {view === "calendar"
                            ? t("Schedule", "الجدول الزمني")
                            : t("Task board", "لوحة المهام")}{" "}
                          <span className="count">{visible.length}</span>
                        </h2>
                        <div className="filters">
                          <label className="search">
                            <Search size={17} />
                            <input
                              aria-label={t("Search tasks", "البحث في المهام")}
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                              placeholder={t("Search tasks…", "ابحث عن مهمة…")}
                            />
                          </label>
                          {manager && (
                            <select
                              aria-label={t("Assignee", "المسؤول")}
                              value={filter}
                              onChange={(e) => setFilter(e.target.value)}
                            >
                              <option value="all">
                                {t("All members", "كل الفريق")}
                              </option>
                              {team.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.display_name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                      {view === "calendar" ? (
                        <section className="panel">
                          <p className="muted">
                            {t(
                              "Due dates stay unchanged when work is planned for Tomorrow.",
                              "اختيار غدًا يغيّر تاريخ العمل المخطط دون تغيير موعد التسليم.",
                            )}
                          </p>
                          {[...visible]
                            .sort((a, b) =>
                              (
                                a.planned_for ||
                                a.due_date ||
                                "9999"
                              ).localeCompare(
                                b.planned_for || b.due_date || "9999",
                              ),
                            )
                            .map((task) => (
                              <button
                                className="calendar-row"
                                key={task.id}
                                onClick={() => setSelected(task)}
                              >
                                <time>
                                  {task.planned_for ||
                                    task.due_date ||
                                    t("Unscheduled", "بدون تاريخ")}
                                </time>
                                <b>{task.title}</b>
                                <span>{name(task.assignee_id)}</span>
                                <span>
                                  {labels[task.status][lang === "ar" ? 1 : 0]}
                                </span>
                              </button>
                            ))}
                        </section>
                      ) : (
                        <div className="board">
                          {statuses.map((s) => (
                            <section className={"column " + s} key={s}>
                              <div className="column-title">
                                <span className="status-dot" />
                                <h3>{labels[s][lang === "ar" ? 1 : 0]}</h3>
                                <span>
                                  {visible.filter((x) => x.status === s).length}
                                </span>
                              </div>
                              {visible
                                .filter((x) => x.status === s)
                                .map((task) => (
                                  <button
                                    className="task-card"
                                    key={task.id}
                                    onClick={() => setSelected(task)}
                                  >
                                    <span
                                      className={"priority " + task.priority}
                                    >
                                      {task.priority === "high"
                                        ? t("High priority", "أولوية عالية")
                                        : task.priority === "low"
                                          ? t("Low priority", "أولوية منخفضة")
                                          : t("Normal", "عادية")}
                                    </span>
                                    <h4>{task.title}</h4>
                                    <p>
                                      {task.description ||
                                        t(
                                          "Open task for details",
                                          "افتح المهمة للتفاصيل",
                                        )}
                                    </p>
                                    <div className="task-meta">
                                      <span
                                        className={
                                          overdue(task) ? "overdue" : ""
                                        }
                                      >
                                        <CalendarDays size={13} />
                                        {task.due_date ||
                                          t("No deadline", "بدون موعد")}
                                      </span>
                                      <span
                                        className="mini-avatar"
                                        title={name(task.assignee_id)}
                                      >
                                        {name(task.assignee_id).slice(0, 1)}
                                      </span>
                                    </div>
                                  </button>
                                ))}
                              {!visible.some((x) => x.status === s) && (
                                <div className="column-empty">
                                  {t("No tasks here yet", "لا توجد مهام هنا")}
                                </div>
                              )}
                            </section>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              {view !== "history" && (
                <footer>
                  STC MARKETING FLOW{" "}
                  <span>
                    {t("Every task, a step forward.", "كل مهمة، خطوة لقدّام.")}
                  </span>
                </footer>
              )}
            </>
          )}
        </main>
      </div>
      {showNotices && (
        <section
          className="notifications"
          aria-label={t("Notifications", "الإشعارات")}
        >
          <div className="section-title">
            <h2>
              <Bell size={18} /> {t("Notifications", "الإشعارات")}
            </h2>
            <button aria-label="Close" onClick={() => setShowNotices(false)}>
              <X />
            </button>
          </div>
          <button
            onClick={() =>
              void action(async () => {
                const r = await supabase
                  .from("stc_notifications")
                  .update({ read_at: new Date().toISOString() })
                  .is("read_at", null);
                if (r.error) throw r.error;
                await load();
              })
            }
          >
            <CheckCheck size={16} />
            {t("Mark all read", "تحديد الكل كمقروء")}
          </button>
          {notices.length === 0 && (
            <p className="muted">
              {t("You’re all caught up.", "لا توجد إشعارات جديدة.")}
            </p>
          )}
          {notices.map((n) => (
            <button
              className={n.read_at ? "notice" : "notice unread"}
              key={n.id}
              onClick={() => {
                const task = tasks.find((x) => x.id === n.task_id);
                if (task) setSelected(task);
                void action(async () => {
                  const r = await supabase
                    .from("stc_notifications")
                    .update({ read_at: new Date().toISOString() })
                    .eq("id", n.id);
                  if (r.error) throw r.error;
                  await load();
                });
              }}
            >
              <b>
                {n.kind in labels
                  ? labels[n.kind as keyof typeof labels][lang === "ar" ? 1 : 0]
                  : n.kind === "overdue"
                    ? t("Task overdue", "تأخر موعد المهمة")
                    : n.kind === "due_today"
                      ? t("Due today", "موعد التسليم اليوم")
                      : t("Task assigned", "تم إسناد مهمة")}
              </b>
              <span>
                {tasks.find((x) => x.id === n.task_id)?.title ||
                  t("Task updated", "تحديث مهمة")}
              </span>
              <small>
                {new Date(n.created_at).toLocaleString(
                  lang === "ar" ? "ar-EG" : "en-GB",
                  { timeZone: "Africa/Cairo" },
                )}
              </small>
            </button>
          ))}
        </section>
      )}
      {selected && member && (
        <TaskDetail
          key={selected.id}
          task={tasks.find((x) => x.id === selected.id) || selected}
          member={member}
          team={team}
          lang={lang}
          onClose={() => setSelected(null)}
          onChange={load}
        />
      )}
      {creating && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
          >
            <div className="section-title">
              <h2 id="create-title">{t("Create a task", "إنشاء مهمة")}</h2>
              <button aria-label="Close" onClick={() => setCreating(false)}>
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(async () => {
                  const r = await supabase.from("stc_tasks").insert({
                    title: f.get("title"),
                    description: f.get("description"),
                    assignee_id: f.get("assignee"),
                    due_date: f.get("due") || null,
                    priority: f.get("priority"),
                  });
                  if (r.error) throw r.error;
                  setCreating(false);
                  await load();
                });
              }}
            >
              <label>
                {t("Title", "عنوان المهمة")}
                <input name="title" required maxLength={300} />
              </label>
              <label>
                {t("Description", "التفاصيل")}
                <textarea name="description" rows={4} />
              </label>
              <label>
                {t("Assign to", "إسناد إلى")}
                <select name="assignee" required>
                  {team.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  {t("Deadline", "موعد التسليم")}
                  <input name="due" type="date" />
                </label>
                <label>
                  {t("Priority", "الأولوية")}
                  <select name="priority" defaultValue="normal">
                    <option value="low">{t("Low", "منخفضة")}</option>
                    <option value="normal">{t("Normal", "عادية")}</option>
                    <option value="high">{t("High", "عالية")}</option>
                  </select>
                </label>
              </div>
              <button className="primary wide" disabled={busy}>
                {t("Assign task", "إسناد المهمة")}
              </button>
            </form>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
