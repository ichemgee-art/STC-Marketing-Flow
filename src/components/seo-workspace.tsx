"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ExternalLink, FileSpreadsheet, ImageIcon, Maximize2, Plus, UploadCloud, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Member } from "@/lib/domain";
import SeoTargetBoard from "./seo-target-board";
import SeoSourceCards from "./seo-source-cards";
import SeoDailyReport from "./seo-daily-report";
import "./seo-workspace.css";

type Profile = { id: string; slug: string; display_name: string; brand: string; site_url: string };
type Period = {
  id: string; profile_id: string; source_sheet: string; source_filename: string; source_sha256: string;
  month_key: string; label: string; period_kind: string;
  cells: Record<string, string>; links: Record<string, string>; comments: Record<string, string>;
  image_count: number;
};
type Asset = {
 id: string; period_id: string; filename: string; position_index: number; anchor_row: number;
 anchor_col: number; object_path: string; mime_type: string;
 target_id?: string | null; origin?: "workbook" | "manual"; uploaded_by?: string | null;
};
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

export default function SeoWorkspace({slug,member,onBack}: {slug: string;member: Member;onBack:()=>void}) {
  const manager=member.role === "manager";
  const [profile,setProfile]=useState<Profile|null>(null);
  const [periods,setPeriods]=useState<Period[]>([]);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [log,setLog]=useState<Hours[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [section,setSection]=useState<"monthly"|"hours">("monthly");
  const [newMonth,setNewMonth]=useState("");
  const [showMonthCreator,setShowMonthCreator]=useState(false);
  const [uploadTarget,setUploadTarget]=useState("");
  const [uploadingShot,setUploadingShot]=useState(false);
  const [signed,setSigned]=useState<Record<string,string>>({});
  const [zoom,setZoom]=useState<number|null>(null);
  const [uploading,setUploading]=useState(false);
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
  const loadScreenshots=useCallback(async(periodId:string)=>{
    const r=await supabase.from("stc_seo_assets").select("*")
      .eq("period_id",periodId).order("position_index");
    if(r.error){setError(r.error.message);return;}
    const items=(r.data||[]) as Asset[];
    setAssets(items);
    // Supabase rejects createSignedUrls([]) with "body/paths must NOT have fewer than 1 items".
    if(items.length===0){setSigned({});return;}
    const response=await supabase.storage.from("stc-seo-evidence")
      .createSignedUrls(items.map(a=>a.object_path),3600);
    if(response.error){setError("مش قادرين نفتح صور التقرير: "+response.error.message);setSigned({});return;}
    const urls:Record<string,string>={};
    items.forEach((asset,i)=>{
      const url=response.data?.[i]?.signedUrl;
      if(url)urls[asset.id]=url;
    });
    setSigned(urls);
  },[]);
  useEffect(()=>{
    if(!period){setAssets([]);setSigned({});return;}
    setAssets([]);setSigned({});
    void loadScreenshots(period.id);
  },[period?.id,loadScreenshots]);
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
  async function createMonth() {
    if(!profile||!manager)return;
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(newMonth)){setError("اختاري شهر صحيح.");return;}
    if(periods.some(p=>p.month_key===newMonth)){setError("الشهر ده موجود بالفعل، اختاريه من التابات.");return;}
    const date=new Date(newMonth+"-01T12:00:00Z");
    const label=new Intl.DateTimeFormat("ar-EG",{month:"long",year:"numeric",timeZone:"UTC"}).format(date);
    const r=await supabase.from("stc_seo_periods").insert({
      profile_id:profile.id,source_sheet:"from-system-"+newMonth,
      source_filename:"خطة من السيستم",source_sha256:"manual:"+slug+":"+newMonth,
      month_key:newMonth,label,period_kind:"month",cells:{},links:{},comments:{},image_count:0,
    });
    if(r.error){setError(r.error.message);return;}
    setShowMonthCreator(false);setNewMonth("");await refresh();
    setToast("الشهر الجديد اتفتح. دلوقتي ناردين تقدر تحط التارجت.");
  }
  async function uploadScreenshot(file:File) {
    if(!profile||!period){setError("اختار الشهر الأول.");return;}
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)){setError("الاسكرين لازم يكون PNG أو JPG أو WEBP.");return;}
    if(file.size>10*1024*1024){setError("حجم الاسكرين لازم يكون أقل من 10 ميجا.");return;}
    setUploadingShot(true);setError("");
    const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
    const objectPath=slug+"/manual/"+period.id+"/"+member.id+"/"+crypto.randomUUID()+"."+ext;
    try{
      const up=await supabase.storage.from("stc-seo-evidence").upload(
        objectPath,file,{contentType:file.type,upsert:false});
      if(up.error)throw up.error;
      const position=(assets.length?Math.max(...assets.map(a=>a.position_index)):-1)+1;
      const added=await supabase.from("stc_seo_assets").insert({
        period_id:period.id,position_index:position,anchor_row:0,anchor_col:0,
        filename:file.name,object_path:objectPath,mime_type:file.type,
        size_bytes:file.size,target_id:uploadTarget||null,uploaded_by:member.id,origin:"manual",
      });
      if(added.error)throw added.error;
      await loadScreenshots(period.id);
      setToast("الاسكرين اتحفظت، وتقدر تفتحها كبيرة من جوه السيستم.");
    }catch(e){setError(e instanceof Error?e.message:"حصلت مشكلة في رفع الاسكرين.");}
    finally{setUploadingShot(false);}
  }
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
        <p>التارجت والمتابعة ببطاقات واضحة، ونتايج SEO، وساعات الشغل بتقرير يومي، والاسكرينات بتتفتح من السيستم.</p></div>
        {manager&&<div className="seo-upload">
          <label className={uploading?"seo-uploading":""}><UploadCloud size={20}/>{uploading?"بندخل بيانات الملف…":"ارفع الشيت الأصلي"}
          <input type="file" accept=".xlsx" disabled={uploading} onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.currentTarget.value="";}}/></label>
        </div>}
      </div>
      {error&&<div className="seo-error" role="alert">{error}<button type="button" onClick={()=>setError("")}>×</button></div>}
      <nav className="seo-main-tabs" aria-label="أقسام SEO">
        <button className={section==="monthly"?"selected":""} onClick={()=>setSection("monthly")}><CalendarDays size={18}/> التارجت وتقارير الشهور <span>{periods.length}</span></button>
        <button className={section==="hours"?"selected":""} onClick={()=>setSection("hours")}><Clock3 size={18}/> التقرير اليومي وساعات الشغل</button>
      </nav>
      {section==="monthly"?<>
        {manager&&<div className="seo-month-manager">
          <button className="seo-target-add" type="button" onClick={()=>setShowMonthCreator(x=>!x)}><Plus size={16}/> افتحي شهر جديد</button>
          {showMonthCreator&&<form className="seo-new-month" onSubmit={e=>{e.preventDefault();void createMonth();}}>
            <label>اختاري الشهر<input type="month" value={newMonth} onChange={e=>setNewMonth(e.target.value)} required/></label>
            <button type="submit">افتحي الشهر</button>
          </form>}
        </div>}
        <div className="seo-month-tabs" role="tablist" aria-label="شهور الشغل">
          {periods.map(p=><button type="button" role="tab" aria-selected={p.id===selected} key={p.id} className={p.id===selected?"active":""} onClick={()=>{setSelected(p.id);setZoom(null);setUploadTarget("");}}>
            {p.label}<small>{p.image_count} اسكرين</small></button>)}
        </div>
        {!period&&<div className="seo-empty"><FileSpreadsheet size={34}/><h2>الشهور لسه ما اترفعتش</h2><p>{manager?"اختاري ملف الإكسيل الأصلي من زرار «ارفع الشيت الأصلي»؛ هينقل كل الشهور والاسكرينات.":"ناردين هتضيف شيتاتك هنا، وكل شهر هيظهر بتفاصيله."}</p></div>}
        {period&&<>
          <div className="seo-month-welcome">
            <div><span className="seo-target-kicker">خطة الشهر · {chart}</span><h2>{period.label}</h2>
              <p>اختار تارجت من الكروت، وسجّل الإنجاز أول بأول. اللي جاي من الإكسيل محفوظ تحت بتصميم جديد.</p>
            </div>
            <div className="seo-month-evidence"><ImageIcon size={20}/><strong>{assets.length}</strong><span>اسكرين في الشهر ده</span></div>
          </div>
          {period.period_kind==="quarter"
            ? <SeoSourceCards cells={period.cells||{}} links={period.links||{}} comments={period.comments||{}} quarter/>
            : <>
              {profile&&<SeoTargetBoard key={profile.id+"-"+period.month_key} profileId={profile.id}
                monthKey={period.month_key} manager={manager} memberId={member.id}
                onError={setError} onNotice={setToast}
                onAttach={id=>{
                  setUploadTarget(id);
                  document.getElementById("seo-photo-upload")?.scrollIntoView({behavior:"smooth",block:"center"});
                }}/>}
              <div className="seo-source-heading"><FileSpreadsheet size={20}/>
                <div><strong>محتوى الشيت الأصلي · {period.label}</strong>
                  <p>رتّبنا خطة الإكسيل ونتايج الموقع والتحليل في بطاقات بدل الجداول القديمة.</p></div>
              </div>
              <SeoSourceCards cells={period.cells||{}} links={period.links||{}} comments={period.comments||{}}/>
            </>}
          <section className="seo-gallery" id="seo-photo-upload">
            <div className="seo-section-top"><div><h2><ImageIcon size={20}/> الاسكرينات والـEvidence</h2>
              <p>ارفع صورة، أو دوس على أي اسكرين عشان تفتح كبيرة وتتنقل بين الصور.</p>
            </div><span>{assets.length} صورة</span></div>
            {period.period_kind==="month"&&<div className="seo-gallery-upload">
              <label>اسكرين جديدة (PNG / JPG / WEBP لحد 10 ميجا)
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingShot}
                  onChange={e=>{const file=e.target.files?.[0];if(file)void uploadScreenshot(file);e.currentTarget.value="";}}/>
              </label>
              <label>تابعة لتارجت معيّن؟ (اختياري)
                <select value={uploadTarget} onChange={e=>setUploadTarget(e.target.value)}>
                  <option value="">صورة عامة للشهر</option>
                  {/*
                    The target dropdown is populated by the separate live board
                    through its attach button. The selected target persists here.
                  */}
                  {uploadTarget&&<option value={uploadTarget}>التارجت اللي اخترته</option>}
                </select>
              </label>
              {uploadingShot&&<strong className="seo-photo-status">بنرفع الاسكرين…</strong>}
            </div>}
            {period.image_count>0&&screenshots.length===0&&<p className="seo-loading">بنفكّ الصور من التخزين الخاص…</p>}
            {assets.length===0 && period.image_count===0 && <p className="seo-empty-inline">مفيش اسكرينات مرفوعة للشهر ده لسه.</p>}
            <div className="seo-gallery-grid">{screenshots.map((asset,i)=><button key={asset.id} type="button" onClick={()=>setZoom(i)} aria-label={"فتح اسكرين "+(i+1)}>
              <Image src={signed[asset.id]} alt={"اسكرين "+(i+1)+" من "+period.label} width={330} height={180} unoptimized/>
              <span><Maximize2 size={14}/> اسكرين {i+1}</span>
            </button>)}</div>
          </section>
          <p className="seo-source">مصدر التقارير القديمة: {period.source_filename} · {period.source_sheet}. الصور المرفوعة الجديدة محفوظة في مساحة خاصة.</p>
        </>}
      </>:profile&&<SeoDailyReport profileId={profile.id} member={member} entries={log}
         onRefresh={refresh} onNotice={setToast} onError={setError}/>}
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
