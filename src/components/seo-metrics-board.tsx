"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, ChevronDown, Clock3, Save, Send, Target, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Metric = {
  id: string;
  profile_id: string;
  month_key: string;
  metric_key: string;
  target_value: number | null;
  actual_value: number | null;
  status: "draft" | "pending_review" | "approved" | "changes_requested";
  note: string;
  review_note: string;
  updated_at: string;
};
type Definition = { key: string; label: string; unit: string; hint: string; lowerIsBetter?: boolean };
const fields: Definition[] = [
  { key: "organic_traffic", label: "Organic Traffic", unit: "زيارة", hint: "زيارات الموقع من نتائج البحث" },
  { key: "impressions", label: "Impressions", unit: "ظهور", hint: "عدد مرات ظهور الموقع في نتائج البحث" },
  { key: "ctr", label: "CTR", unit: "%", hint: "نسبة الضغط على نتائج البحث" },
  { key: "average_position", label: "Average Position", unit: "مركز", hint: "متوسط ترتيب الموقع في نتائج البحث", lowerIsBetter: true },
  { key: "ranking_keywords", label: "Ranking Keywords", unit: "كلمة", hint: "عدد كلمات البحث اللي الموقع ظاهر فيها" },
  { key: "referring_domains", label: "Referring Domains", unit: "دومين", hint: "عدد المواقع اللي بتشير لموقعنا" },
  { key: "backlinks", label: "Backlinks", unit: "رابط", hint: "إجمالي الروابط اللي بتوصل لموقعنا" },
  { key: "ga4_tracking", label: "GA4 / CRM / Forms", unit: "حدث", hint: "أحداث التتبع المتفعلة أو المتسجلة" },
  { key: "ai_responses", label: "AI Responses", unit: "ظهور", hint: "الظهور في إجابات أدوات الذكاء الاصطناعي" },
  { key: "top_keywords", label: "Top Keywords", unit: "كلمة", hint: "عدد الكلمات الأساسية المستهدفة أو المتصدرة" },
];
const fmt = (v: number | null) => v === null ? "مش متسجل" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v);
const numberValue = (s: string) => {
  if (s.trim() === "") return null;
  const n = Number(s.trim());
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000_000 ? n : undefined;
};

function MetricCard({ row, def, manager, onSaved, onNotice, onError }: {
  row: Metric; def: Definition; manager: boolean; onSaved: () => Promise<void>;
  onNotice: (message: string) => void; onError: (message: string) => void;
}) {
  const [target, setTarget] = useState(row.target_value === null ? "" : String(row.target_value));
  const [actual, setActual] = useState(row.actual_value === null ? "" : String(row.actual_value));
  const [note, setNote] = useState(row.note || "");
  const [reviewNote, setReviewNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitted = row.status === "pending_review";
  const approved = row.status === "approved";
  const needsFix = row.status === "changes_requested";

  useEffect(() => {
    setTarget(row.target_value === null ? "" : String(row.target_value));
    setActual(row.actual_value === null ? "" : String(row.actual_value));
    setNote(row.note || "");
  }, [row.id, row.target_value, row.actual_value, row.note]);

  async function write(fields: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const res = await supabase.from("stc_seo_metrics").update(fields)
        .eq("id", row.id).eq("updated_at", row.updated_at).select("id");
      if (res.error) throw res.error;
      if (!res.data?.length) throw new Error("البيانات اتعدّلت من حساب تاني؛ هنحدّثها وجرّب تاني.");
      await onSaved();
      onNotice(success);
      setEditing(false);
      setReviewNote("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "حصلت مشكلة في الحفظ.");
      await onSaved();
    } finally { setBusy(false); }
  }

  async function saveTarget() {
    const value = numberValue(target);
    if (value === undefined || (def.key === "ctr" && value !== null && value > 100)) {
      onError("اكتبي التارجت برقم صحيح."); return;
    }
    await write({ target_value: value }, "تمام، التارجت بتاع " + def.label + " اتحفظ وظهر للموظف.");
  }
  async function submitResult() {
    const value = numberValue(actual);
    if (value === null || value === undefined || (def.key === "ctr" && value > 100)) {
      onError("اكتب النتيجة الفعلية الأول، وخلّيها رقم صحيح."); return;
    }
    await write({
      actual_value: value, note: note.trim(), status: "pending_review",
    }, "نتيجة " + def.label + " اتبعتت لناردين للمراجعة.");
  }
  async function decide(status: "approved" | "changes_requested") {
    await write({ status, review_note: reviewNote.trim() },
      status === "approved" ? "النتيجة اتعمدت وظهرت بالأخضر للموظف." : "رجّعتي المؤشر للتعديل، وهيظهر للموظف.");
  }

  return <article className={"seo-metric-card" + (approved ? " is-approved" : submitted ? " is-pending" : needsFix ? " is-fix" : "")}>
    <div className="seo-metric-card__top">
      <div className="seo-metric-card__icon"><Activity size={19}/></div>
      <span className={"seo-metric-card__status seo-metric-card__status--" + row.status}>
        {approved ? "اتعمد ✓" : submitted ? "مستني مراجعة ناردين" : needsFix ? "مطلوب تعديل" : "لسه مش متسلّم"}
      </span>
    </div>
    <h3>{def.label}</h3><p className="seo-metric-hint">{def.hint}</p>
    <div className="seo-metric-pair">
      <div><span>التارجت بتاع ناردين</span><strong>{fmt(row.target_value)}</strong><small>{def.unit}</small></div>
      <div><span>النتيجة الفعلية</span><strong>{fmt(row.actual_value)}</strong><small>{def.unit}</small></div>
    </div>
    {row.target_value !== null && row.actual_value !== null && <div className="seo-metric-difference">
      {def.lowerIsBetter ? (row.actual_value <= row.target_value ? "✓ الترتيب في المستوى المطلوب" : "الترتيب محتاج يتحسّن")
        : (row.actual_value >= row.target_value ? "✓ وصلنا للتارجت" : "لسه أقل من التارجت")}
    </div>}
    {!!row.note && <div className="seo-metric-note"><b>ملاحظة الموظف</b><p>{row.note}</p></div>}
    {!!row.review_note && <div className="seo-metric-note seo-metric-review-note"><b>رد ناردين</b><p>{row.review_note}</p></div>}

    {manager ? <>
      {!submitted && !approved && <div className="seo-metric-manager-actions">
        <button type="button" className="seo-metric-outline" onClick={() => setEditing(x => !x)}>
          <Target size={15}/>{editing ? "اقفلي التعديل" : row.target_value === null ? "حددي التارجت" : "عدّلي التارجت"}
        </button>
        {editing && <div className="seo-metric-edit-form">
          <label>التارجت ({def.unit})<input aria-label={"التارجت "+def.label} type="number" step="0.01"
            min="0" max={def.key === "ctr" ? "100" : "1000000000000"} value={target} onChange={e => setTarget(e.target.value)} placeholder="مثلاً 1000"/></label>
          <button type="button" disabled={busy} onClick={() => void saveTarget()}><Save size={16}/> احفظي التارجت</button>
        </div>}
      </div>}
      {submitted && <div className="seo-metric-review-form">
        <label>ملاحظتك للموظف (اختياري)<textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={2} placeholder="موافقة، أو محتاج تعديل في…"/></label>
        <div>
          <button type="button" className="seo-metric-approve" disabled={busy} onClick={() => void decide("approved")}><CheckCircle2 size={17}/> موافقة</button>
          <button type="button" className="seo-metric-return" disabled={busy} onClick={() => void decide("changes_requested")}><XCircle size={16}/> رجّعي للتعديل</button>
        </div>
      </div>}
    </> : <>
      {!submitted && !approved ? <div className="seo-metric-employee-actions">
        <button type="button" className="seo-metric-primary" onClick={() => setEditing(x => !x)}>
          <Send size={16}/>{editing ? "اقفل التسجيل" : row.actual_value === null ? "سجّل نتيجة الشهر" : "عدّل النتيجة وابعتهـا"}
        </button>
        {editing && <div className="seo-metric-edit-form">
          <label>النتيجة الفعلية ({def.unit})
            <input aria-label={"النتيجة "+def.label} type="number" step="0.01" min="0" value={actual}
              max={def.key === "ctr" ? "100" : "1000000000000"} onChange={e => setActual(e.target.value)} placeholder="اكتب الرقم"/></label>
          <label>ملاحظة (اختياري)<textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="المصدر أو أي توضيح…"/></label>
          <button type="button" disabled={busy} onClick={() => void submitResult()}><Send size={15}/> ابعتها لناردين للمراجعة</button>
        </div>}
      </div> : <div className={"seo-metric-feedback"+(approved?" green":"")}>
        {approved ? <CheckCircle2 size={17}/> : <Clock3 size={17}/>}
        {approved ? "ناردين وافقت على النتيجة" : "وصلت لناردين، مستنيين المراجعة"}
      </div>}
    </>}
  </article>;
}

export default function SeoMetricsBoard({
 profileId, monthKey, manager, onNotice, onError, onUpdated,
}: {
 profileId: string; monthKey: string; manager: boolean; onNotice: (s:string)=>void; onError:(s:string)=>void;
 onUpdated?: () => void;
}) {
  const [rows,setRows] = useState<Metric[]>([]);
  const [loading,setLoading] = useState(true);
  const [showExtra,setShowExtra] = useState(false);
  const load = useCallback(async () => {
    const result = await supabase.from("stc_seo_metrics").select("*")
      .eq("profile_id",profileId).eq("month_key",monthKey);
    if(result.error) {onError(result.error.message);setLoading(false);return;}
    setRows(result.data as Metric[]); setLoading(false);onUpdated?.();
  },[profileId,monthKey,onError,onUpdated]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    const channel=supabase.channel("seo-metrics-board-"+profileId+"-"+monthKey)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"stc_seo_metrics"},()=>void load())
      .subscribe();
    const interval=setInterval(()=>void load(),30000);
    return()=>{clearInterval(interval);void supabase.removeChannel(channel);};
  },[profileId,monthKey,load]);
  const byKey=useMemo(()=>new Map(rows.map(x=>[x.metric_key,x])),[rows]);
  const approved=rows.filter(x=>x.status==="approved").length;
  const waiting=rows.filter(x=>x.status==="pending_review").length;
  const submitted=rows.filter(x=>x.actual_value!==null).length;
  const defs = showExtra?fields:fields.slice(0,4);
  return <div className="seo-metrics-section">
    <header className="seo-metrics-heading">
      <div><span className="seo-target-kicker">نتايج الموقع · {monthKey}</span>
        <h2><Activity size={23}/> مؤشرات الـSEO آخر الشهر</h2>
        <p>{manager ? "حطي تارجت كل مؤشر، وراجعي الأرقام اللي الموظف بعتها. المستني مراجعتك هيظهر بالأصفر."
          : "سجّل نتيجة كل مؤشر آخر الشهر، وابعتها لناردين. لما توافق هيبقى الكارت أخضر."}</p>
      </div>
      <div className="seo-metrics-counter">
        <div><strong>{submitted}</strong><span>اتسجلت</span></div>
        <div><strong>{waiting}</strong><span>مستنية مراجعة</span></div>
        <div><strong>{approved}</strong><span>اتعمدت</span></div>
      </div>
    </header>
    {loading && !rows.length && <p className="seo-empty-inline">بنحمّل مؤشرات الموقع…</p>}
    {!loading && !rows.length && <p className="seo-empty-inline">مفيش مؤشرات مضافة للشهر ده لسه. افتحي الشهر من تابات الشهور.</p>}
    <div className="seo-metrics-grid">{defs.map(def=>{
      const row=byKey.get(def.key);
      return row?<MetricCard key={row.id} row={row} def={def} manager={manager}
        onSaved={load} onNotice={onNotice} onError={onError}/>:null;
    })}</div>
    {rows.length>4 && <button type="button" className="seo-metrics-show-more" onClick={()=>setShowExtra(v=>!v)}>
      <ChevronDown size={17}/>{showExtra?"وريني الأربع مؤشرات الأساسية بس":"وريني باقي المؤشرات ("+(rows.length-4)+")"}
    </button>}
    <p className="seo-metrics-source-help">أرقام الأشهر القديمة اللي جاية من الإكسيل محفوظة للرجوع ليها، لكن مش هنعتبرها نتايج معتمدة هنا إلا لما الموظف يسجّلها وناردين تراجعها.</p>
  </div>;
}
