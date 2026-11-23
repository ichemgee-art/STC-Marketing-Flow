"use client";
import { useCallback, useEffect, useState } from "react";
import { Upload, Link2, Archive, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { safeUrl, type ArchiveRow, type Member } from "@/lib/domain";
import type { Lang } from "@/lib/i18n";
type Batch = {
  id: string;
  source_name: string;
  source_sha256: string;
  expected_rows: number;
  original_path: string;
};
export default function History({
  lang,
  team,
}: {
  lang: Lang;
  team: Member[];
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [batches, setBatches] = useState<Batch[]>([]),
    [batch, setBatch] = useState(""),
    [rows, setRows] = useState<ArchiveRow[]>([]),
    [links, setLinks] = useState<Record<string, string>>({}),
    [sheet, setSheet] = useState("all"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<ArchiveRow | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const loadBatches = useCallback(async () => {
    const r = await supabase
      .from("stc_import_batches")
      .select("*")
      .order("created_at", { ascending: false });
    if (r.error) {
      setError(r.error.message);
      return;
    }
    setBatches(r.data);
    setBatch((prev) => prev || r.data[0]?.id || "");
  }, []);
  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);
  const loadRows = useCallback(async () => {
    if (!batch) {
      setRows([]);
      return;
    }
    const all: ArchiveRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const r = await supabase
        .from("stc_archive_rows")
        .select("*")
        .eq("batch_id", batch)
        .order("sheet")
        .order("row_number")
        .range(offset, offset + 999);
      if (r.error) {
        setError(r.error.message);
        return;
      }
      all.push(...r.data);
      if (r.data.length < 1000) break;
    }
    setRows(all);
    const l = await supabase.from("stc_legacy_links").select("*");
    if (l.error) setError(l.error.message);
    else
      setLinks(
        Object.fromEntries(l.data.map((x) => [x.archive_row_id, x.task_id])),
      );
  }, [batch]);
  useEffect(() => {
    void loadRows();
  }, [loadRows]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importFiles(form: HTMLFormElement) {
    const f = new FormData(form);
    const original = f.get("original") as File,
      json = f.get("json") as File;
    const bytes = await original.arrayBuffer();
    const sha = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    const payload = JSON.parse(await json.text());
    if (
      payload.source_sha256 !== sha ||
      payload.format_version !== 1 ||
      !Array.isArray(payload.rows)
    )
      throw new Error(
        t(
          "Workbook fingerprint or archive format does not match.",
          "بصمة الملف أو صيغة الأرشيف غير متطابقة.",
        ),
      );
    const existing = batches.find((b) => b.source_sha256 === sha);
    if (existing) {
      setBatch(existing.id);
      setMessage(
        t(
          "Already imported. No data changed.",
          "تم استيراد الملف سابقًا. لم تتغير البيانات.",
        ),
      );
      return;
    }
    const path = sha + "/original.xlsx";
    const check = await supabase.storage.from("stc-history").list(sha);
    if (check.error) throw check.error;
    if (!check.data.some((x) => x.name === "original.xlsx")) {
      const r = await supabase.storage
        .from("stc-history")
        .upload(path, original, {
          upsert: false,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      if (r.error) throw r.error;
    }
    const result = await supabase.rpc("stc_import_archive", { payload });
    if (result.error) throw result.error;
    await loadBatches();
    setBatch(result.data);
    setMessage(
      t(
        "Archive imported and reconciled.",
        "تم استيراد الأرشيف ومطابقة عدد الصفوف.",
      ),
    );
  }
  const visible = rows.filter(
    (r) =>
      (sheet === "all" || r.sheet === sheet) &&
      JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
  );
  const duplicates = new Map<string, number>();
  rows.forEach((r) =>
    duplicates.set(r.fingerprint, (duplicates.get(r.fingerprint) || 0) + 1),
  );
  return (
    <>
      <section className="panel">
        <div className="section-title">
          <h2>
            <Archive size={20} /> {t("Preserved history", "التاريخ المحفوظ")}
          </h2>
          <span className="status-pill">
            {rows.length} {t("source rows", "صف مصدر")}
          </span>
        </div>
        <p className="muted">
          {t(
            "Original sheets, cell coordinates, notes and links remain intact. Historical statuses do not count as new approvals. Duplicate candidates require a recorded decision.",
            "التبويبات والخلايا والملاحظات والروابط الأصلية محفوظة. الحالات القديمة لا تُحسب اعتمادًا جديدًا، والتكرارات المحتملة تحتاج قرارًا مسجّلًا.",
          )}
        </p>
        <form
          className="import-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => importFiles(e.currentTarget));
          }}
        >
          <label>
            {t("Original workbook", "الإكسيل الأصلي")}
            <input name="original" type="file" accept=".xlsx" required />
          </label>
          <label>
            {t("Extracted archive JSON", "ملف الأرشيف المستخرج JSON")}
            <input name="json" type="file" accept=".json" required />
          </label>
          <button className="primary" disabled={busy}>
            <Upload size={17} />
            {t("Verify & import", "تحقق واستورد")}
          </button>
        </form>
        {batches.length > 0 && (
          <div className="filters">
            <select
              value={batch}
              aria-label={t("Import batch", "دفعة الاستيراد")}
              onChange={(e) => {
                setBatch(e.target.value);
                setSelected(null);
              }}
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.source_name} · {b.source_sha256.slice(0, 8)}
                </option>
              ))}
            </select>
            <button
              onClick={() =>
                void run(async () => {
                  const b = batches.find((x) => x.id === batch);
                  if (!b) return;
                  const r = await supabase.storage
                    .from("stc-history")
                    .createSignedUrl(b.original_path, 60, {
                      download: b.source_name,
                    });
                  if (r.error) throw r.error;
                  const a = document.createElement("a");
                  a.href = r.data.signedUrl;
                  a.click();
                })
              }
            >
              <Download size={16} />
              {t("Original workbook", "الملف الأصلي")}
            </button>
            <span>
              {t("Expected / archived", "المتوقع / المؤرشف")}:{" "}
              {batches.find((x) => x.id === batch)?.expected_rows} /{" "}
              {rows.length}
            </span>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
      </section>
      <div className="archive-grid">
        <section className="panel">
          <div className="filters">
            <select
              value={sheet}
              aria-label={t("Source sheet", "تبويب المصدر")}
              onChange={(e) => setSheet(e.target.value)}
            >
              <option value="all">{t("All sheets", "كل التبويبات")}</option>
              {Array.from(new Set(rows.map((r) => r.sheet))).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search history…", "ابحث في التاريخ…")}
              aria-label={t("Search history", "البحث في التاريخ")}
            />
          </div>
          {!rows.length && (
            <div className="empty">
              {t(
                "Import your preserved workbook to begin.",
                "استورد الملف المحفوظ لعرض التاريخ.",
              )}
            </div>
          )}
          <div className="archive-list">
            {visible.map((r) => (
              <button
                key={r.id}
                className={
                  selected?.id === r.id ? "archive-row active" : "archive-row"
                }
                onClick={() => setSelected(r)}
              >
                <small>
                  {r.sheet} · {t("Row", "صف")} {r.row_number}
                  {links[r.id] ? " · " + t("Linked", "مرتبط") : ""}
                </small>
                <b>
                  {String(
                    r.mapped.title || t("Source record", "سجل مصدر"),
                  ).slice(0, 140)}
                </b>
                <span>
                  {String(r.mapped.date || r.mapped.source_date || "—")} ·{" "}
                  {String(r.mapped.source_status || "—")}
                </span>
                {(duplicates.get(r.fingerprint) || 0) > 1 && (
                  <small className="overdue">
                    {t("Possible duplicate", "تكرار محتمل")}
                  </small>
                )}
              </button>
            ))}
          </div>
        </section>
        <section className="panel archive-detail">
          {selected ? (
            <>
              <h2>
                {selected.sheet} · {selected.row_number}
              </h2>
              {Object.entries(selected.cells).map(([address, c]) => (
                <div className="source-cell" key={address}>
                  <b>{address}</b>
                  <p dir="auto">{String(c.value ?? "")}</p>
                  {safeUrl(c.value) && (
                    <a
                      href={safeUrl(c.value)!}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("Open reference", "فتح المرجع")}
                    </a>
                  )}
                  {!!c.comment && (
                    <p>
                      {t("Comment", "تعليق")}: {JSON.stringify(c.comment)}
                    </p>
                  )}
                  {!!c.hyperlink && (
                    <p>
                      {t("Original link", "الرابط الأصلي")}:{" "}
                      {JSON.stringify(c.hyperlink)}
                    </p>
                  )}
                </div>
              ))}
              <details>
                <summary>
                  {t("Mapping and provenance", "التحويل ومصدر السجل")}
                </summary>
                <pre>{JSON.stringify(selected.mapped, null, 2)}</pre>
              </details>
              {links[selected.id] ? (
                <p className="success">
                  {t("Linked to new task", "مرتبط بالمهمة الجديدة")}:{" "}
                  {links[selected.id]}
                </p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () => {
                      const r = await supabase.rpc("stc_promote_archive", {
                        source_row: selected.id,
                        assignee: String(f.get("assignee")),
                        new_title: String(f.get("title")),
                        decision: String(f.get("decision")),
                      });
                      if (r.error) throw r.error;
                      await loadRows();
                      setMessage(
                        t(
                          "Created a new To Do task with a provenance link.",
                          "تم إنشاء مهمة للتنفيذ وربطها بسجل المصدر.",
                        ),
                      );
                    });
                  }}
                >
                  <h3>
                    <Link2 size={17} />{" "}
                    {t("Continue as a new task", "المتابعة كمهمة جديدة")}
                  </h3>
                  <label>
                    {t("Task title", "عنوان المهمة")}
                    <input
                      name="title"
                      required
                      maxLength={300}
                      key={selected.id}
                      defaultValue={String(selected.mapped.title || "").slice(
                        0,
                        300,
                      )}
                    />
                  </label>
                  <label>
                    {t("Assign to", "المسؤول")}
                    <select name="assignee" required>
                      {team.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Mapping / duplicate decision", "قرار الربط والتكرار")}
                    <textarea name="decision" required />
                  </label>
                  <button className="primary" disabled={busy}>
                    {t("Create and link", "إنشاء وربط")}
                  </button>
                </form>
              )}
            </>
          ) : (
            <p className="muted">
              {t(
                "Select a source row to view every original cell.",
                "اختر صفًا لعرض كل خلاياه الأصلية.",
              )}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
