"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ExternalLink, FileSpreadsheet, ImageIcon, Maximize2, Plus, UploadCloud, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Member } from "@/lib/domain";
import "./seo-workspace.css";

type Profile = { id: string; slug: string; display_name: string; brand: string; site_url: string };
type Period = {
  id: string; profile_id: string; source_sheet: string; source_filename: string; source_sha256: string;
  month_key: string; label: string; period_kind: string;
  cells: Record<string, string>; links: Record<string, string>; comments: Record<string, string>;
  image_count: number;
};
type Asset = { id: string; period_id: string; filename: string; position_index: number; anchor_row: number; anchor_col: number; object_path: string; mime_type: string };
type Hours = { id: string; profile_id: string; work_date: string; start_minutes: number; end_minutes: number; activities: string; created_by: string };
type Entry = { address: string; value: string; row: number; column: number; link?: string; comment?: string };
function sheetColumn(ref: string) {
  const name = ref.match(/^[A-Z]+/)?.[0] ?? "";
  let v = 0;
  for (const ch of name) v = v * 26 + ch.charCodeAt(0) - 64;
  return v;
}
function asEntries(period: Period): Entry[] {
  return Object.entries(period.cells || {}).filter(([address, value]) => /^[A-Z]+\d+$/.test(address) && String(value ?? "").trim() !== "")
    .map(([address, value]) => ({
      address, value: String(value), row: Number(address.match(/\d+$/)?.[0] ?? 0), column: sheetColumn(address),
      link: period.links?.[address], comment: period.comments?.[address],
    })).sort((a, b) => a.row - b.row || a.column - b.column);
}
function isHttp(url: string) {
  try { return ["http:", "https:"].includes(new URL(url).protocol); } catch { return false; }
}
function makeRows(entries: Entry[], first: number, last: number) {
  const groups = new Map<number, Entry[]>();
  for (const entry of entries.filter(c => c.column >= first && c.column <= last)) {
    groups.set(entry.row, [...(groups.get(entry.row) || []), entry]);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
}
function timeText(min: number) { return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"); }
function mins(value: string) { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
function hoursText(min: number) { return Math.floor(min / 60) + " ساعة" + (min % 60 ? " و" + (min % 60) + " دقيقة" : ""); }

function SourceCell({entry}: {entry: Entry}) {
  const link = entry.link && isHttp(entry.link) ? entry.link : isHttp(entry.value) ? entry.value : null;
  return <div className="seo-cell" dir="auto">
    <span className="seo-cell__value">{entry.value}</span>
    {link && <a href={link} target="_blank" rel="noopener noreferrer" title="فتح الرابط من الشيت الأصلي" onClick={e => e.stopPropagation()}><ExternalLink size={14}/></a>}
    {entry.comment && <small title={entry.comment}>ملاحظة من الإكسيل: {entry.comment}</small>}
  </div>;
}
function SourceRows({title,entries,range}: {title:string;entries:Entry[];range:[number,number]}) {
  const rows = useMemo(() => makeRows(entries,range[0],range[1]),[entries,range]);
  const cols = range[1] - range[0] + 1;
  return <section className="seo-data-section"><h3>{title}<span>{rows.length} سطر فيه بيانات</span></h3>
    {rows.length === 0 ? <p className="seo-empty-inline">لسه مفيش بيانات مكتوبة في الجزء ده من الشيت.</p> :
      <div className="seo-data-scroll"><table className="seo-original-table"><thead><tr><th>صف</th>
        {Array.from({length:cols},(_,i)=><th key={i}>{String.fromCharCode(64+range[0]+i)}</th>)}
      </tr></thead><tbody>
      {rows.map(([r,cells])=><tr key={r}><th>{r}</th>
        {Array.from({length:cols},(_,i)=> {
          const col=range[0]+i;const entry=cells.find(x=>x.column===col);
          return <td key={col}>{entry ? <SourceCell entry={entry}/> : <span className="seo-cell-blank">—</span>}</td>;
        })}
      </tr>)}</tbody></table></div>}
  </section>;
}

export default function SeoWorkspace({slug,member,onBack}: {slug: string;member: Member;onBack:()=>void}) {
  const manager=member.role === "manager";
  const [profile,setProfile]=useState<Profile|null>(null);
  const [periods,setPeriods]=useState<Period[]>([]);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [log,setLog]=useState<Hours[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [section,setSection]=useState<"monthly"|"hours">("monthly");
  const [showAll,setShowAll]=useState(false);
  const [signed,setSigned]=useState<Record<string,string>>({});
  const [zoom,setZoom]=useState<number|null>(null);
  const [start,setStart]=useState("09:00");
  const [end,setEnd]=useState("17:00");
  const [workDate,setWorkDate]=useState(new Date().toISOString().slice(0,10));
  const [activity,setActivity]=useState("");
  const [uploading,setUploading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [toast,setToast]=useState("");
  const [error,setError]=useState("");
  const refresh=useCallback(async()=>{
    const p=await supabase.from("stc_seo_profiles").select("*").eq("slug",slug).single();
    if(p.error || !p.data){setError(p.error?.message||"مش لاقيين حساب الشخص ده.");return;}
    setProfile(p.data);
    const [periodsRes,logsRes]=await Promise.all([
      supabase.from("stc_seo_periods").select("*").eq("profile_id",p.data.id).order("month_key",{ascending:false}),
      supabase.from("stc_seo_hours").select("*").eq("profile_id",p.data.id).order("work_date",{ascending:false}).limit(120),
    ]);
    if(periodsRes.error||logsRes.error){setError((periodsRes.error||logsRes.error)?.message||"في مشكلة في تحميل البيانات.");return;}
    setPeriods(periodsRes.data||[]);
    setLog(logsRes.data||[]);
    setSelected(old=>old && (periodsRes.data||[]).some(p=>p.id===old) ? old : periodsRes.data?.[0]?.id||null);
    setError("");
  },[slug]);
  useEffect(()=>{void refresh();},[refresh]);
  const period = periods.find(p=>p.id===selected)||null;
  const entries=useMemo(()=>period?asEntries(period):[],[period]);
  const dataFirst=entries.length?Math.min(...entries.map(e=>e.column)):1;
  const dataLast=entries.length?Math.max(...entries.map(e=>e.column)):1;
  useEffect(()=>{
    if(!period){setAssets([]);setSigned({});return;}
    let alive=true;
    const load=async()=>{
      const r=await supabase.from("stc_seo_assets").select("*").eq("period_id",period.id).order("position_index");
      if(!alive)return;
      if(r.error){setError(r.error.message);return;}
      const data=r.data as Asset[];
      setAssets(data);
      const links=await supabase.storage.from("stc-seo-evidence").createSignedUrls(data.map(a=>a.object_path),3600);
      if(!alive)return;
      if(links.error){setError(links.error.message);return;}
      const result:Record<string,string>={};
      data.forEach((asset,i)=>{const url=links.data?.[i]?.signedUrl;if(url)result[asset.id]=url;});
      setSigned(result);
    };
    void load();
    return()=>{alive=false;};
  },[period]);
  useEffect(()=>{
    if(!toast)return;
    const id=setTimeout(()=>setToast(""),4200);
    return()=>clearTimeout(id);
  },[toast]);
  async function importFile(file:File) {
    setUploading(true);setError("");
    try{
      const session=await supabase.auth.getSession();
      if(!session.data.session)throw new Error("جلسة الدخول خلصت. ادخلي تاني.");
      const data=new FormData();data.set("slug",slug);data.set("file",file);
      const res=await fetch("/api/seo/import",{method:"POST",headers:{Authorization:"Bearer "+session.data.session.access_token},body:data});
      const payload=await res.json();
      if(!res.ok)throw new Error(payload.error||"الرفع فشل.");
      await refresh();
      setToast("اتحفظ " + payload.sheets + " شيت ومعاهم " + payload.totalImages + " اسكرين. تقدري تفتحيهم جوه السيستم.");
    }catch(e){setError(e instanceof Error?e.message:"حصلت مشكلة في رفع الشيت.");}
    finally{setUploading(false);}
  }
  async function saveHours(){
    if(!profile)return;
    const a=mins(start),b=mins(end);
    if(!workDate||!Number.isInteger(a)||!Number.isInteger(b)||a<0||b>1440||b<=a){setError("اتأكد من وقت البداية والنهاية، لازم النهاية تكون بعد البداية.");return;}
    if(activity.trim().length<2){setError("اكتب باختصار عملت إيه خلال الفترة دي.");return;}
    if(log.some(h=>h.work_date===workDate&&a<h.end_minutes&&b>h.start_minutes)){
      setError("الفترة دي متداخلة مع فترة اتسجلت قبل كده.");return;
    }
    setBusy(true);setError("");
    try{
      const insert=await supabase.from("stc_seo_hours").insert({
        profile_id:profile.id,work_date:workDate,start_minutes:a,end_minutes:b,activities:activity.trim(),created_by:member.id,
      });
      if(insert.error)throw insert.error;
      setActivity("");await refresh();setToast("تمام! ساعاتك وشغلك اتحفظوا.");
    }catch(e){setError(e instanceof Error?e.message:"مقدرناش نحفظ الساعات.");}
    finally{setBusy(false);}
  }
  async function deleteHours(id:string) {
    if(!window.confirm("تمسح تسجيل الساعات ده؟"))return;
    const r=await supabase.from("stc_seo_hours").delete().eq("id",id);
    if(r.error)setError(r.error.message);
    else{await refresh();setToast("التسجيل اتمسح.");}
  }
  const totalMinutes=log.reduce((n,h)=>n+h.end_minutes-h.start_minutes,0);
  const screenshots = assets.filter(a=>!!signed[a.id]);
  const label = profile?.display_name|| (slug==="sandra"?"ساندرا":"محمد عمر");
  const chart = slug==="sandra" ? "iChem" : "STC";
  return <div className="seo-shell" dir="rtl">
    <header className="seo-topbar">
      <div className="seo-brand"><Image src="/stc-logo.png" alt="STC" width={105} height={59}/><div><strong>{label} · SEO</strong><small>{chart} — {profile?.site_url||"SEO"}</small></div></div>
      <button type="button" onClick={onBack} className="seo-back"><ArrowRight size={18}/>{manager?"رجوع للتيم":"خروج"}</button>
    </header>
    <main className="seo-main">
      <div className="seo-headline"><div><span className="seo-eyebrow">متابعة السيو · {chart}</span><h1>شغل {label} 👋</h1>
        <p>كل شهر لوحده: التارجت، اللي اتعمل، أرقام الموقع، وكل الاسكرينات الأصلية من الإكسيل.</p></div>
        {manager&&<div className="seo-upload">
          <label className={uploading?"seo-uploading":""}><UploadCloud size={20}/>{uploading?"بندخل بيانات الملف…":"ارفع الشيت الأصلي"}
          <input type="file" accept=".xlsx" disabled={uploading} onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.currentTarget.value="";}}/></label>
        </div>}
      </div>
      {error&&<div className="seo-error" role="alert">{error}<button type="button" onClick={()=>setError("")}>×</button></div>}
      <nav className="seo-main-tabs" aria-label="أقسام SEO">
        <button className={section==="monthly"?"selected":""} onClick={()=>setSection("monthly")}><CalendarDays size={18}/> تقارير الشهور <span>{periods.length}</span></button>
        <button className={section==="hours"?"selected":""} onClick={()=>setSection("hours")}><Clock3 size={18}/> ساعات الشغل</button>
      </nav>
      {section==="monthly"?<>
        <div className="seo-month-tabs" role="tablist" aria-label="شهور الشغل">
          {periods.map(p=><button type="button" role="tab" aria-selected={p.id===selected} key={p.id} className={p.id===selected?"active":""} onClick={()=>{setSelected(p.id);setZoom(null);setShowAll(false);}}>
            {p.label}<small>{p.image_count} اسكرين</small></button>)}
        </div>
        {!period&&<div className="seo-empty"><FileSpreadsheet size={34}/><h2>الشهور لسه ما اترفعتش</h2><p>{manager?"اختاري ملف الإكسيل الأصلي من زرار «ارفع الشيت الأصلي»؛ هينقل كل الشهور والاسكرينات.":"ناردين هتضيف شيتاتك هنا، وكل شهر هيظهر بتفاصيله."}</p></div>}
        {period&&<>
          <div className="seo-month-summary">
            <div><span>الشهر</span><strong>{period.label}</strong></div>
            <div><span>خلايا فيها بيانات</span><strong>{entries.length}</strong></div>
            <div><span>الاسكرينات الأصلية</span><strong>{period.image_count}</strong></div>
            <div><span>المصدر</span><strong>{period.source_sheet}</strong></div>
          </div>
          {slug==="sandra"&&period.month_key==="2026-10"&&<div className="seo-caution"><AlertTriangle size={17}/> أرقام أكتوبر في الشيت متشابهة مع سبتمبر. معروضين زي المصدر، بس محتاجين مراجعة قبل اعتماد النتايج.</div>}
          {period.period_kind==="quarter"?<SourceRows title="مقارنة الـ3 شهور" entries={entries} range={[2,7]}/> :
            <>
              <SourceRows title="خطة الشهر والتارجت" entries={entries} range={[1,4]}/>
              <SourceRows title="مؤشرات SEO ونتايج الموقع" entries={entries} range={[5,10]}/>
              {dataLast>10&&<SourceRows title="ملاحظات التحليل والكلمات والمصادر" entries={entries} range={[11,Math.min(dataLast,20)]}/>}
            </>}
          <section className="seo-gallery"><div className="seo-section-top"><div><h2><ImageIcon size={20}/> الاسكرينات</h2><p>دوس على أي صورة عشان تتفتح كبيرة جوه السيستم، وتقدر تتنقل بين الصور.</p></div><span>{screenshots.length} صورة</span></div>
            {period.image_count>0&&screenshots.length===0&&<p className="seo-loading">بنفكّ الصور من التخزين الخاص…</p>}
            {period.image_count===0&&<p className="seo-empty-inline">مفيش اسكرينات في الشيت ده.</p>}
            <div className="seo-gallery-grid">{screenshots.map((asset,i)=><button key={asset.id} type="button" onClick={()=>setZoom(i)} aria-label={"فتح اسكرين "+(i+1)}>
              <Image src={signed[asset.id]} alt={"اسكرين "+(i+1)+" من "+period.label} width={330} height={180} unoptimized/>
              <span><Maximize2 size={14}/> اسكرين {i+1}</span>
            </button>)}</div>
          </section>
          <button className="seo-all-toggle" onClick={()=>setShowAll(!showAll)}>{showAll?"إخفاء تفاصيل الخلايا":"عرض كل الخلايا الأصلية زي ما هي من Excel"}</button>
          {showAll&&<SourceRows title="كل البيانات الأصلية بالترتيب" entries={entries} range={[dataFirst,Math.min(dataLast,26)]}/>}
          <div className="seo-source">المصدر: {period.source_filename} / {period.source_sheet} · كل الملاحظات والروابط الأساسية محفوظة في الشيت.</div>
        </>}
      </>:<section className="seo-hours">
        <div className="seo-section-top"><div><h2><Clock3 size={21}/> سجل ساعات الشغل</h2><p>اكتب من الساعة كام لكام، وإيه اللي خلصته في الفترة دي. ممكن تسجل أكتر من فترة في اليوم.</p></div><div className="seo-hours-total">{hoursText(totalMinutes)}<small>إجمالي المسجل</small></div></div>
        <form className="seo-hours-form" onSubmit={e=>{e.preventDefault();void saveHours();}}>
          <label>اليوم<input type="date" value={workDate} onChange={e=>setWorkDate(e.target.value)} required/></label>
          <label>بدأت الساعة<input type="time" value={start} onChange={e=>setStart(e.target.value)} required/></label>
          <label>خلصت الساعة<input type="time" value={end} onChange={e=>setEnd(e.target.value)} required/></label>
          <label className="seo-hours-wide">عملت إيه خلال الوقت ده؟<textarea rows={3} placeholder="مثلاً: حدّثت صفحات منتجات، عملت Keyword Research، وراجعت Search Console…" value={activity} onChange={e=>setActivity(e.target.value)} required/></label>
          <button type="submit" disabled={busy}><Plus size={18}/>{busy?"بنسجّل…":"سجّل الساعات"}</button>
        </form>
        <div className="seo-hours-list">{log.map(h=><div className="seo-hours-entry" key={h.id}><div><strong>{h.work_date}</strong><span>{timeText(h.start_minutes)} - {timeText(h.end_minutes)} · {hoursText(h.end_minutes-h.start_minutes)}</span><p>{h.activities}</p></div>{(manager||h.created_by===member.id)&&<button type="button" onClick={()=>void deleteHours(h.id)} aria-label="مسح الساعات">×</button>}</div>)}</div>
        {!log.length&&<div className="seo-empty-inline">لسه مفيش ساعات شغل متسجلة.</div>}
      </section>}
    </main>
    {toast&&<div className="seo-toast" role="status"><CheckCircle2 size={19}/>{toast}</div>}
    {zoom!==null&&screenshots[zoom]&&<div className="seo-lightbox" role="dialog" aria-modal="true" aria-label="اسكرين كبيرة" onClick={()=>setZoom(null)}>
      <header><span>{period?.label} — اسكرين {zoom+1} من {screenshots.length}</span><button type="button" onClick={()=>setZoom(null)} aria-label="إغلاق الاسكرين"><X size={24}/></button></header>
      <div className="seo-lightbox-stage" onClick={e=>e.stopPropagation()}>
        {screenshots.length>1&&<button className="seo-lightbox-prev" onClick={()=>setZoom((zoom-1+screenshots.length)%screenshots.length)} aria-label="الصورة اللي قبلها"><ChevronRight size={29}/></button>}
        <Image src={signed[screenshots[zoom].id]} alt="صورة التقرير الأصلية" width={1400} height={1000} unoptimized/>
        {screenshots.length>1&&<button className="seo-lightbox-next" onClick={()=>setZoom((zoom+1)%screenshots.length)} aria-label="الصورة اللي بعدها"><ChevronLeft size={29}/></button>}
      </div>
      <footer>اضغط بره الصورة عشان ترجع للتقرير</footer>
    </div>}
  </div>;
}
