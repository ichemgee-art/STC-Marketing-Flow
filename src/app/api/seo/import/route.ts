import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseSeoWorkbook } from "@/lib/seo-workbook";

export const runtime = "nodejs";
export const maxDuration = 60;

type Period = { id: string; source_sha256: string; image_count: number };
const mapSheet = (slug: string, sheet: string): { label: string; month: string; kind: "month" | "quarter" } => {
  const normalized = sheet.toLowerCase().trim();
  if (normalized.includes("quarter")) return { label: "تقرير آخر 3 شهور", month: "2026-quarter", kind: "quarter" };
  const months: Record<string, [string, string]> = {
    august: ["أغسطس 2026", "2026-08"],
    september: ["سبتمبر 2026", "2026-09"],
    october: ["أكتوبر 2026", "2026-10"],
    november: ["نوفمبر 2026", "2026-11"],
  };
  const hit = Object.entries(months).find(([name]) => normalized.includes(name));
  if (!hit) return { label: sheet, month: "2026-unspecified", kind: "month" };
  return { label: hit[1][0], month: hit[1][1], kind: "month" };
};
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return error("لازم تسجّلي دخول بحساب ناردين.", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return error("إعدادات Supabase ناقصة.", 500);

  // All operations use the signed-in user's JWT, never a service-role secret.
  const db = createClient(url, key, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const user = await db.auth.getUser(token);
  if (user.error || !user.data.user) return error("جلسة الدخول انتهت؛ ادخلي تاني.", 401);
  const { data: manager, error: memberError } = await db.from("stc_members")
    .select("id,role,active").eq("id", user.data.user.id).single();
  if (memberError || !manager?.active || manager.role !== "manager") {
    return error("رفع شيتات الـSEO متاح لناردين بس.", 403);
  }

  const data = await req.formData();
  const file = data.get("file");
  const slug = data.get("slug");
  if (!(file instanceof File) || typeof slug !== "string" || !["sandra", "mohamed-omar"].includes(slug)) {
    return error("اختاري ملف Excel الصحيح وصاحب الشيت.");
  }
  if (file.size === 0 || file.size > 4.1 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".xlsx")) {
    return error("اختاري ملف XLSX حجمه أقل من 4 ميجا.");
  }
  const nameLooksCorrect = slug === "sandra"
    ? /ichem/i.test(file.name)
    : /stc/i.test(file.name);
  if (!nameLooksCorrect) return error("اسم الملف مش مطابق للشخص المختار، راجعي الشيت.");
  let workbook;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await file.arrayBuffer());
    workbook = parseSeoWorkbook(bytes);
  } catch (e) {
    return error(e instanceof Error ? e.message : "حصلت مشكلة في قراءة Excel.");
  }
  const profile = await db.from("stc_seo_profiles").select("id,slug").eq("slug", slug).single();
  if (profile.error || !profile.data) return error("ملف الشخص ده مش متجهز في السيستم.", 404);

  const workbookPath = slug + "/" + workbook.hash + "/original.xlsx";
  const savedWorkbook = await db.storage.from("stc-seo-workbooks").upload(
    workbookPath, bytes, { upsert: false, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  );
  if (savedWorkbook.error && !/already exists|duplicate/i.test(savedWorkbook.error.message)) {
    return error("مش قادرين نحفظ نسخة الإكسيل الخاصة: " + savedWorkbook.error.message);
  }

  let imageCount = 0, importedPeriods = 0;
  const report: { sheet: string; rows: number; images: number }[] = [];
  for (const sheet of workbook.sheets) {
    const { label, month, kind } = mapSheet(slug, sheet.name);
    const old = await db.from("stc_seo_periods")
      .select("id,source_sha256,image_count").eq("profile_id", profile.data.id)
      .eq("source_sheet", sheet.name).maybeSingle();
    if (old.error) return error("تعذر مراجعة الشهور القديمة: " + old.error.message);
    const previous = old.data as Period | null;
    if (previous?.source_sha256 && previous.source_sha256 !== workbook.hash) {
      return error("الشهر ده له نسخة قديمة مختلفة محفوظة. لازم نراجع الاختلافات قبل الاستبدال.");
    }
    let periodId = previous?.id;
    if (!periodId) {
      const created = await db.from("stc_seo_periods").insert({
        profile_id: profile.data.id,
        source_sheet: sheet.name,
        source_filename: file.name,
        source_sha256: workbook.hash,
        label,
        month_key: month,
        period_kind: kind,
        cells: sheet.cells,
        links: sheet.links,
        comments: sheet.comments,
        image_count: sheet.images.length,
      }).select("id").single();
      if (created.error || !created.data) return error("تعذر حفظ شهر " + sheet.name + ": " + created.error?.message);
      periodId = created.data.id;
      importedPeriods++;
    }
    const existing = await db.from("stc_seo_assets").select("position_index").eq("period_id", periodId);
    if (existing.error) return error("تعذر مراجعة صور شهر " + sheet.name);
    const positions = new Set((existing.data || []).map(a => a.position_index));
    // Upload embedded screenshots privately. Clicking thumbnails opens a
    // short-lived signed URL inside an in-app lightbox, not a public link.
    for (const image of sheet.images) {
      if (positions.has(image.index)) continue;
      const ext = image.mime === "image/png" ? "png" : image.mime === "image/webp" ? "webp" : "jpg";
      const objectPath = slug + "/" + workbook.hash + "/" +
        encodeURIComponent(sheet.name) + "/" + (image.index + 1) + "." + ext;
      const upload = await db.storage.from("stc-seo-evidence").upload(
        objectPath, image.bytes, { upsert: false, contentType: image.mime },
      );
      if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) {
        return error("تعذر رفع اسكرين " + sheet.name + ": " + upload.error.message);
      }
      const inserted = await db.from("stc_seo_assets").insert({
        period_id: periodId, position_index: image.index, anchor_row: image.row, anchor_col: image.col,
        filename: image.filename, object_path: objectPath, mime_type: image.mime, size_bytes: image.bytes.length,
      });
      if (inserted.error && !/duplicate/i.test(inserted.error.message)) {
        return error("تعذر ربط الاسكرين بشهر " + sheet.name + ": " + inserted.error.message);
      }
      imageCount++;
    }
    report.push({ sheet: sheet.name, rows: Object.keys(sheet.cells).length, images: sheet.images.length });
  }
  return NextResponse.json({
    ok: true, sheets: workbook.sheets.length, totalImages: workbook.sheets.reduce((n, s) => n + s.images.length, 0),
    importedPeriods, newlyUploadedImages: imageCount, report,
  });
}
