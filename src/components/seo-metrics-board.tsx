"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, CheckCircle2, ChevronDown, Clock3, Send, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Metric = {
  id: string;
  profile_id: string;
  month_key: string;
  metric_key: string;
  before_value: number | null;
  after_value: number | null;
  status: "draft" | "pending_review" | "approved" | "changes_requested";
  note: string;
  review_note: string;
  updated_at: string;
};
type Definition = {
  key: string; label: string; unit: string; hint: string; lowerIsBetter?: boolean;
};
const metricsMemory=new Map<string,{at:number;rows:Metric[]}>();
export function clearSeoMetricsMemory(){metricsMemory.clear();}

const fields: Definition[] = [
  { key: "organic_traffic", label: "Organic Traffic", unit: "زيارة", hint: "زيارات الموقع اللي جاية من نتائج البحث" },
  { key: "impressions", label: "Impressions", unit: "ظهور", hint: "عدد مرات ظهور الموقع في نتائج البحث" },
  { key: "ctr", label: "CTR", unit: "%", hint: "نسبة الناس اللي ضغطت على النتيجة" },
  { key: "average_position", label: "Average Position", unit: "مركز", hint: "متوسط مركز الموقع في جوجل", lowerIsBetter: true },
  { key: "ranking_keywords", label: "Ranking Keywords", unit: "كلمة", hint: "كلمات البحث اللي الموقع ظاهر فيها" },
  { key: "referring_domains", label: "Referring Domains", unit: "دومين", hint: "عدد المواقع اللي بتشير لموقعنا" },
  { key: "backlinks", label: "Backlinks", unit: "رابط", hint: "الروابط اللي بتوصل للموقع" },
  { key: "ga4_tracking", label: "GA4 / CRM / Forms", unit: "حدث", hint: "عدد أحداث التتبع المتسجلة" },
  { key: "ai_responses", label: "AI Responses", unit: "ظهور", hint: "الظهور في إجابات أدوات الذكاء الاصطناعي" },
  { key: "top_keywords", label: "Top Keywords", unit: "كلمة", hint: "الكلمات الأساسية اللي بنتابعها" },
];
const format = (value: number | null) =>
  value === null ? "لسه مش متسجل" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
function numberValue(value: string) {
  if (!value.trim()) return null;
  const number = Number(value.trim());
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000_000_000 ? number : undefined;
}
function ChangeSummary({before,after,def}:{
  before:number|null;after:number|null;def:Definition;
}) {
  if(before===null||after===null)return null;
  const diff=after-before;
  const abs=Math.abs(diff);
  const positive=def.lowerIsBetter?diff<0:diff>0;
  const negative=def.lowerIsBetter?diff>0:diff<0;
  const noChange=diff===0;
  const pct=before>0?Math.round(abs/before*10000)/100:null;
  const word=noChange?"مفيش تغيير":def.lowerIsBetter?
    positive?"تحسن في الترتيب":"تراجع في الترتيب":
    positive?"زيادة":"انخفاض";
  return <div className={"seo-metric-difference"+(negative?" is-negative":noChange?" is-neutral":"")}>
    {negative?<TrendingDown size={16}/>:<TrendingUp size={16}/>}
    <span><strong>{word}</strong>
      {!noChange&&<>: {format(abs)} {def.unit}{pct!==null?" ("+pct+"%)":""}</>}
      {noChange&&<> — نفس الرقم قبل وبعد</>}
    </span>
  </div>;
}

function MetricCard({row,def,manager,onSaved,onNotice,onError}:{
  row:Metric;def:Definition;manager:boolean;
  onSaved:()=>Promise<void>;onNotice:(message:string)=>void;onError:(message:string)=>void;
}) {
  const [before,setBefore]=useState(row.before_value===null?"":String(row.before_value));
  const [after,setAfter]=useState(row.after_value===null?"":String(row.after_value));
  const [note,setNote]=useState(row.note||"");
  const [reviewNote,setReviewNote]=useState("");
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const submitted=row.status==="pending_review";
  const approved=row.status==="approved";
  const needsFix=row.status==="changes_requested";
  useEffect(()=>{
    setBefore(row.before_value===null?"":String(row.before_value));
    setAfter(row.after_value===null?"":String(row.after_value));
    setNote(row.note||"");
  },[row.id,row.before_value,row.after_value,row.note]);

  async function write(values:Record<string,unknown>,success:string) {
    setBusy(true);
    try {
      const result=await supabase.from("stc_seo_metrics").update(values)
        .eq("id",row.id).eq("updated_at",row.updated_at).select("id");
      if(result.error)throw result.error;
      if(!result.data?.length)throw new Error("فيه تعديل حصل من حساب تاني؛ افتح المؤشر تاني.");
      await onSaved();
      onNotice(success);
      setEditing(false);setReviewNote("");
    } catch(e) {
      onError(e instanceof Error?e.message:"حصلت مشكلة في الحفظ.");
      await onSaved();
    } finally {setBusy(false);}
  }
  async function submit() {
    if(manager)return;
    const beforeNumber=numberValue(before),afterNumber=numberValue(after);
    if(beforeNumber===undefined||beforeNumber===null||afterNumber===undefined||afterNumber===null) {
      onError("اكتب رقم «قبل» ورقم «بعد» عشان نقدر نقارنهم.");return;
    }
    if(def.key==="ctr"&&(beforeNumber>100||afterNumber>100)){
      onError("الـCTR لازم يكون من 0 لـ100%.");return;
    }
    await write({before_value:beforeNumber,after_value:afterNumber,note:note.trim(),status:"pending_review"},
      def.label+" اتبعت لناردين بأرقام قبل وبعد. ✅");
  }
  async function review(status:"approved"|"changes_requested") {
    if(!manager)return;
    await write({status,review_note:reviewNote.trim()},
      status==="approved"?"تمام، مقارنة "+def.label+" اتعمدت وظهرت بالأخضر.":"المقارنة رجعت للموظف للتعديل.");
  }
  return <article className={"seo-metric-card"+(approved?" is-approved":submitted?" is-pending":needsFix?" is-fix":"")}>
    <div className="seo-metric-card__top">
      <div className="seo-metric-card__icon"><Activity size={19}/></div>
      <span className={"seo-metric-card__status seo-metric-card__status--"+row.status}>
        {approved?"اتراجعت واتعمدت ✓":submitted?"مستني مراجعة ناردين":needsFix?"مطلوب تعديل":"لسه مش متسلّم"}
      </span>
    </div>
    <h3>{def.label}</h3>
    <p className="seo-metric-hint">{def.hint}</p>
    <div className="seo-metric-pair">
      <div><span>قبل</span><strong>{format(row.before_value)}</strong><small>{def.unit}</small></div>
      <div><span>بعد</span><strong>{format(row.after_value)}</strong><small>{def.unit}</small></div>
    </div>
    <ChangeSummary before={row.before_value} after={row.after_value} def={def}/>
    {row.note&&<div className="seo-metric-note"><b>ملاحظة صاحب الشغل</b><p>{row.note}</p></div>}
    {row.review_note&&<div className="seo-metric-note seo-metric-review-note">
      <b>رد ناردين</b><p>{row.review_note}</p>
    </div>}
    {manager ? <>
      {submitted&&<div className="seo-metric-review-form">
        <label>ملاحظتك للموظف (اختياري)
          <textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)} rows={2}
            placeholder="اكتبي توضيح لو محتاج تعديل…"/></label>
        <div>
          <button type="button" className="seo-metric-approve" disabled={busy}
            onClick={()=>void review("approved")}><CheckCircle2 size={17}/> موافقة</button>
          <button type="button" className="seo-metric-return" disabled={busy}
            onClick={()=>void review("changes_requested")}><XCircle size={16}/> رجّعي للتعديل</button>
        </div>
      </div>}
      {!submitted&&<div className={"seo-metric-feedback"+(approved?" green":"")}>
        {approved?<CheckCircle2 size={17}/>:<Clock3 size={17}/>}
        {approved?"المقارنة اتعمدت":needsFix?"مستنيين الموظف يعدّل الأرقام":"مستنيين الموظف يبعت رقمي قبل وبعد"}
      </div>}
    </> : <>
      {!submitted&&!approved ? <div className="seo-metric-employee-actions">
        <button type="button" className="seo-metric-primary" onClick={()=>setEditing(v=>!v)}>
          <Send size={16}/>{editing?"اقفل الإدخال":needsFix?"عدّل أرقام قبل وبعد":"اكتب أرقام قبل وبعد"}
        </button>
        {editing&&<div className="seo-metric-edit-form">
          <div className="seo-metric-input-pair">
            <label>قبل ({def.unit})
              <input type="number" step="0.01" min="0"
                max={def.key==="ctr"?"100":"1000000000000"} value={before}
                onChange={e=>setBefore(e.target.value)} placeholder="الرقم قبل" required/></label>
            <label>بعد ({def.unit})
              <input type="number" step="0.01" min="0"
                max={def.key==="ctr"?"100":"1000000000000"} value={after}
                onChange={e=>setAfter(e.target.value)} placeholder="الرقم بعد" required/></label>
          </div>
          <label>ملاحظة (اختياري)<textarea rows={2} value={note}
            onChange={e=>setNote(e.target.value)} placeholder="مصدر الرقم أو أي توضيح…"/></label>
          <button type="button" disabled={busy} onClick={()=>void submit()}>
            <Send size={15}/> ابعت المقارنة لناردين للمراجعة
          </button>
        </div>}
      </div> : <div className={"seo-metric-feedback"+(approved?" green":"")}>
        {approved?<CheckCircle2 size={17}/>:<Clock3 size={17}/>}
        {approved?"ناردين وافقت على أرقام قبل وبعد":"الاتنين وصلوا لناردين ومستنيين مراجعتها"}
      </div>}
    </>}
  </article>;
}

export default function SeoMetricsBoard({profileId,monthKey,manager,memberId,onNotice,onError,onUpdated}:{
  profileId:string;monthKey:string;manager:boolean;memberId:string;
  onNotice:(text:string)=>void;onError:(text:string)=>void;onUpdated?:()=>void;
}) {
  const cacheKey=memberId+":"+profileId+":"+monthKey;
  const recent=metricsMemory.get(cacheKey);
  const warm=recent&&Date.now()-recent.at<120_000?recent:null;
  const [rows,setRows]=useState<Metric[]>(()=>warm?.rows||[]);
  const [loading,setLoading]=useState(!warm);
  const [showExtra,setShowExtra]=useState(false);
  const fetchSeq=useRef(0);
  useEffect(()=>()=>{fetchSeq.current++;},[]);
  const load=useCallback(async()=>{
    const seq=++fetchSeq.current;
    const r=await supabase.from("stc_seo_metrics").select("*")
      .eq("profile_id",profileId).eq("month_key",monthKey);
    if(seq!==fetchSeq.current)return;
    if(r.error){onError(r.error.message);setLoading(false);return;}
    const values=r.data as Metric[];
    metricsMemory.set(cacheKey,{at:Date.now(),rows:values});
    setRows(values);setLoading(false);onUpdated?.();
  },[profileId,monthKey,onError,onUpdated,cacheKey]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    const channel=supabase.channel("seo-metrics-board-"+profileId+"-"+monthKey)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"stc_seo_metrics"},()=>void load())
      .subscribe();
    const interval=setInterval(()=>{
      if(document.visibilityState==="visible")void load();
    },30000);
    const resume=()=>{if(document.visibilityState==="visible")void load();};
    window.addEventListener("focus",resume);
    document.addEventListener("visibilitychange",resume);
    return()=>{
      clearInterval(interval);
      window.removeEventListener("focus",resume);
      document.removeEventListener("visibilitychange",resume);
      void supabase.removeChannel(channel);
    };
  },[profileId,monthKey,load]);
  const byKey=useMemo(()=>new Map(rows.map(row=>[row.metric_key,row])),[rows]);
  const approved=rows.filter(row=>row.status==="approved").length;
  const waiting=rows.filter(row=>row.status==="pending_review").length;
  const submitted=rows.filter(row=>row.before_value!==null&&row.after_value!==null).length;
  const visible=showExtra?fields:fields.slice(0,4);
  return <section className="seo-metrics-section">
    <header className="seo-metrics-heading">
      <div>
        <span className="seo-target-kicker">مقارنة الموقع · {monthKey}</span>
        <h2><Activity size={23}/> مؤشرات SEO — قبل وبعد</h2>
        <p>{manager
          ?"محمد عمر أو ساندرا بيسجّلوا رقمي «قبل» و«بعد». دورك تراجعي المقارنة وتوافقي عليها أو ترجّعيها للتعديل."
          :"اكتب الرقم قبل وبعد لكل مؤشر، وأبعتهم لناردين مع ملاحظة لو حابب. هي هتراجع وترد عليك."}</p>
      </div>
      <div className="seo-metrics-counter">
        <div><strong>{submitted}</strong><span>اتسجلت</span></div>
        <div><strong>{waiting}</strong><span>مستنية مراجعة</span></div>
        <div><strong>{approved}</strong><span>اتعمدت</span></div>
      </div>
    </header>
    {loading&&!rows.length&&<p className="seo-empty-inline">بنحمّل مؤشرات الموقع…</p>}
    {!loading&&!rows.length&&<p className="seo-empty-inline">لسه مفيش مؤشرات متسجلة للشهر ده.</p>}
    <div className="seo-metrics-grid">{visible.map(def=>{
      const row=byKey.get(def.key);
      return row?<MetricCard key={row.id} row={row} def={def} manager={manager}
        onSaved={load} onNotice={onNotice} onError={onError}/>:null;
    })}</div>
    {rows.length>4&&<button type="button" className="seo-metrics-show-more" onClick={()=>setShowExtra(v=>!v)}>
      <ChevronDown size={17}/>{showExtra?"وريني أهم 4 مؤشرات بس":"وريني باقي المؤشرات ("+(rows.length-4)+")"}
    </button>}
    <p className="seo-metrics-source-help">
      مقارنة قبل وبعد مختلفة عن تارجت التاسكات الشهري اللي ناردين بتحدده. أرقام الشيت القديم موجودة للرجوع ليها فقط.
    </p>
  </section>;
}
