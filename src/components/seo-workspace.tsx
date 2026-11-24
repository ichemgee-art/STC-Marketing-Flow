"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Activity, ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileSpreadsheet, ImageIcon, Maximize2, Plus, Target, UploadCloud, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Member } from "@/lib/domain";
import SeoTargetBoard, { clearSeoTargetMemory } from "./seo-target-board";
import SeoSourceCards from "./seo-source-cards";
import SeoDailyReport, { clearSeoDailyMemory } from "./seo-daily-report";
import SeoMetricsBoard, { clearSeoMetricsMemory } from "./seo-metrics-board";
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
type SeoCacheEntry = { at:number;profile:Profile;periods:Period[];hours:Hours[];selectedId:string|null };
const seoMemory = new Map<string,SeoCacheEntry>();
const SEO_CACHE_TTL=120_000;
export function clearSeoDataCache(){seoMemory.clear();clearSeoTargetMemory();clearSeoMetricsMemory();clearSeoDailyMemory();}

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
  const seoCacheKey=member.id+":"+slug;
  const cached=seoMemory.get(seoCacheKey);
  const warm=cached && Date.now()-cached.at<SEO_CACHE_TTL?cached:null;
  const [profile,setProfile]=useState<Profile|null>(()=>warm?.profile||null);
  const [periods,setPeriods]=useState<Period[]>(()=>warm?.periods||[]);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [log,setLog]=useState<Hours[]>(()=>warm?.hours||[]);
  const [selected,setSelected]=useState<string|null>(()=>warm?.selectedId||null);
  const mounted=useRef(true);
  const refreshSerial=useRef(0);
  const assetsSerial=useRef(0);
  const [section,setSection]=useState<"targets"|"metrics"|"daily"|"evidence"|"archive">("targets");
  const [snapshot,setSnapshot]=useState({total:0,completed:0,pending:0,approved:0});
  const [newMonth,setNewMonth]=useState("");
  const [showMonthCreator,setShowMonthCreator]=useState(false);
  const [uploadTarget,setUploadTarget]=useState("");
  const [uploadOptions,setUploadOptions]=useState<{id:string;title:string}[]>([]);
  const [uploadingShot,setUploadingShot]=useState(false);
  const [signed,setSigned]=useState<Record<string,string>>({});
  const [zoom,setZoom]=useState<number|null>(null);
  const [uploading,setUploading]=useState(false);
  const [toast,setToast]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{
    mounted.current=true;
    return()=>{mounted.current=false;refreshSerial.current++;assetsSerial.current++;};
  },[]);
  const refresh=useCallback(async()=>{
    const serial=++refreshSerial.current;
    const p=await supabase.from("stc_seo_profiles").select("*").eq("slug",slug).single();
    if(serial!==refreshSerial.current||!mounted.current)return;
    if(p.error || !p.data){setError(p.error?.message||"مش لاقيين حساب الشخص ده.");return;}
    setProfile(p.data);
    const [periodsRes,logsRes]=await Promise.all([
      supabase.from("stc_seo_periods").select("*").eq("profile_id",p.data.id).order("month_key",{ascending:false}),
      supabase.from("stc_seo_hours").select("*").eq("profile_id",p.data.id).order("work_date",{ascending:false}).limit(1000),
    ]);
    if(serial!==refreshSerial.current||!mounted.current)return;
    if(periodsRes.error||logsRes.error){setError((periodsRes.error||logsRes.error)?.message||"في مشكلة في تحميل البيانات.");return;}
    setPeriods(periodsRes.data||[]);
    setLog(logsRes.data||[]);
    const stored=seoMemory.get(seoCacheKey);
    seoMemory.set(seoCacheKey,{at:Date.now(),profile:p.data,periods:periodsRes.data||[],
      hours:logsRes.data||[],selectedId:stored?.selectedId||null});
    setSelected(old=>{
      if(old&&(periodsRes.data||[]).some(p=>p.id===old))return old;
      let remembered="";
      try{remembered=sessionStorage.getItem("stc-seo-month-"+member.id+"-"+slug)||"";}catch{}
      if(remembered&&(periodsRes.data||[]).some(p=>p.id===remembered))return remembered;
      return periodsRes.data?.find(p=>p.period_kind==="month")?.id||periodsRes.data?.[0]?.id||null;
    });
    setError("");
  },[slug,member.id,seoCacheKey]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    const onResume=()=>{if(document.visibilityState==="visible")void refresh();};
    const onNet=()=>void refresh();
    window.addEventListener("focus",onResume);
    window.addEventListener("online",onNet);
    document.addEventListener("visibilitychange",onResume);
    const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},60000);
    return()=>{
      clearInterval(timer);
      window.removeEventListener("focus",onResume);
      window.removeEventListener("online",onNet);
      document.removeEventListener("visibilitychange",onResume);
    };
  },[refresh]);
  useEffect(()=>{
    if(!profile)return;
    const changes=supabase.channel("seo-base-"+member.id+"-"+profile.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"stc_seo_hours"},()=>void refresh())
      .on("postgres_changes",{event:"*",schema:"public",table:"stc_seo_periods"},()=>void refresh())
      .subscribe(state=>{if(state==="SUBSCRIBED")void refresh();});
    return()=>{void supabase.removeChannel(changes);};
  },[member.id,profile?.id,refresh]);
  const period = periods.find(p=>p.id===selected)||null;
  useEffect(()=>{
    try{
      const value=sessionStorage.getItem("stc-seo-screen-"+member.id+"-"+slug);
      if(value&&["targets","metrics","daily","evidence","archive"].includes(value))
        setSection(value as typeof section);
    }catch{}
  },[member.id,slug]);
  function chooseSection(next:typeof section){
    setSection(next);
    try{sessionStorage.setItem("stc-seo-screen-"+member.id+"-"+slug,next);}catch{}
  }
  function chooseMonth(id:string){
    setSelected(id);setZoom(null);setUploadTarget("");
    const entry=seoMemory.get(seoCacheKey);
    if(entry)seoMemory.set(seoCacheKey,{...entry,selectedId:id});
    try{sessionStorage.setItem("stc-seo-month-"+member.id+"-"+slug,id);}catch{}
  }
  const loadSnapshot=useCallback(async()=>{
    if(!profile||!selected)return;
    const current=periods.find(p=>p.id===selected);
    if(!current)return;
    const [a,b,d]=await Promise.all([
      supabase.from("stc_seo_targets").select("id,target_count,cadence").eq("profile_id",profile.id).eq("month_key",current.month_key),
      supabase.from("stc_seo_metrics").select("status").eq("profile_id",profile.id).eq("month_key",current.month_key),
      supabase.from("stc_seo_progress").select("target_id,done_count,work_date").gte("work_date",current.month_key+"-01").lte("work_date",current.month_key+"-31"),
    ]);
    if(a.error||b.error||d.error)return;
    const targets=a.data||[];
    const sums=new Map<string,number>();
    for(const progress of d.data||[])sums.set(progress.target_id,(sums.get(progress.target_id)||0)+progress.done_count);
    setSnapshot({
      total:targets.length,
      completed:targets.filter(t=>t.cadence==="monthly"&&(sums.get(t.id)||0)>=t.target_count).length,
      pending:(b.data||[]).filter(m=>m.status==="pending_review").length,
      approved:(b.data||[]).filter(m=>m.status==="approved").length,
    });
  },[profile?.id,selected,periods]);
  useEffect(()=>{void loadSnapshot();},[loadSnapshot]);
  useEffect(()=>{
    if(!profile||!selected)return;
    const channel=supabase.channel("seo-summary-"+member.id+"-"+selected)
      .on("postgres_changes",{event:"*",schema:"public",table:"stc_seo_progress"},()=>void loadSnapshot())
      .on("postgres_changes",{event:"*",schema:"public",table:"stc_seo_targets"},()=>void loadSnapshot())
      .on("postgres_changes",{event:"*",schema:"public",table:"stc_seo_metrics"},()=>void loadSnapshot())
      .subscribe();
    const poll=setInterval(()=>void loadSnapshot(),30000);
    return()=>{clearInterval(poll);void supabase.removeChannel(channel);};
  },[profile?.id,selected,member.id,loadSnapshot]);

  useEffect(()=>{
    if(!profile||!period||period.period_kind!=="month"){setUploadOptions([]);return;}
    let active=true;
    const load=async()=>{
      const r=await supabase.from("stc_seo_targets").select("id,title")
       .eq("profile_id",profile.id).eq("month_key",period.month_key);
      if(active&&!r.error)setUploadOptions(r.data||[]);
    };
    void load();
    const channel=supabase.channel("seo-screenshots-target-list-"+period.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"stc_seo_targets"},()=>void load()).subscribe();
    return()=>{active=false;void supabase.removeChannel(channel);};
  },[profile?.id,period?.id,period?.month_key,period?.period_kind]);
  const entries=useMemo(()=>period?asEntries(period):[],[period]);
  const loadScreenshots=useCallback(async(periodId:string)=>{
    const serial=++assetsSerial.current;
    const r=await supabase.from("stc_seo_assets").select("*")
      .eq("period_id",periodId).order("position_index");
    if(serial!==assetsSerial.current||!mounted.current)return;
    if(r.error){setError(r.error.message);return;}
    const items=(r.data||[]) as Asset[];
    setAssets(items);
    // Supabase rejects createSignedUrls([]) with "body/paths must NOT have fewer than 1 items".
    if(items.length===0){setSigned({});return;}
    const response=await supabase.storage.from("stc-seo-evidence")
      .createSignedUrls(items.map(a=>a.object_path),3600);
    if(serial!==assetsSerial.current||!mounted.current)return;
    if(response.error){setError("مش قادرين نفتح صور التقرير: "+response.error.message);setSigned({});return;}
    const urls:Record<string,string>={};
    items.forEach((asset,i)=>{
      const url=response.data?.[i]?.signedUrl;
      if(url)urls[asset.id]=url;
    });
    setSigned(urls);
  },[]);
  useEffect(()=>{
    if(!period){assetsSerial.current++;setAssets([]);setSigned({});return;}
    assetsSerial.current++;
    setAssets([]);setSigned({});
    void loadScreenshots(period.id);
    const listen=supabase.channel("seo-assets-"+member.id+"-"+period.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"stc_seo_assets",
        filter:"period_id=eq."+period.id},()=>void loadScreenshots(period.id))
      .subscribe(state=>{if(state==="SUBSCRIBED")void loadScreenshots(period.id);});
    const onResume=()=>{if(document.visibilityState==="visible")void loadScreenshots(period.id);};
    const timer=setInterval(()=>{if(document.visibilityState==="visible")void loadScreenshots(period.id);},180000);
    window.addEventListener("focus",onResume);
    document.addEventListener("visibilitychange",onResume);
    return()=>{
      assetsSerial.current++;
      clearInterval(timer);
      window.removeEventListener("focus",onResume);
      document.removeEventListener("visibilitychange",onResume);
      void supabase.removeChannel(listen);
    };
  },[period?.id,loadScreenshots,member.id]);
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
      window.dispatchEvent(new Event("stc:storage-changed"));
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
    if(manager){setError("رفع الاسكرينات متاح لصاحب الشغل، انتي بتشوفيها من هنا.");return;}
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
      window.dispatchEvent(new Event("stc:storage-changed"));
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
        {manager&&<details className="seo-import-more">
          <summary><FileSpreadsheet size={16}/> استيراد شيت قديم</summary>
          <div className="seo-upload">
            <label className={uploading?"seo-uploading":""}><UploadCloud size={18}/>{uploading?"بنستورد…":"اختاري ملف Excel"}
            <input type="file" accept=".xlsx" disabled={uploading} onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.currentTarget.value="";}}/></label>
          </div>
        </details>}
      </div>
      {error&&<div className="seo-error" role="alert">{error}<button type="button" onClick={()=>setError("")}>×</button></div>}
      <div className="seo-role-explainer">
        <div className="seo-role-explainer__symbol">{manager?<Target size={25}/>:<CheckCircle2 size={25}/>}</div>
        <div>
          <strong>{manager?"لوحة متابعة ناردين":"دي مساحة شغلك"}</strong>
          <p>{manager
            ?"حدّدي تارجت الشغل في أول تاب. في «مؤشرات الموقع» الموظف بيدخل أرقام قبل وبعد، وانتي بتراجعيها وتوافقي عليها. الساعات والاسكرينات كل واحدة في مكانها."
            :"التارجت اللي ناردين حطّته هتلاقيه في أول تاب. سجّل Done وارفَع الاسكرينات، وسجّل شغلك يوم بيوم. آخر الشهر اكتب رقمي قبل وبعد لكل مؤشر وابعتهم للمراجعة."}</p>
        </div>
      </div>
      {manager&&<div className="seo-month-manager">
        <button className="seo-target-add" type="button" onClick={()=>setShowMonthCreator(x=>!x)}><Plus size={16}/> افتحي شهر جديد</button>
        {showMonthCreator&&<form className="seo-new-month" onSubmit={e=>{e.preventDefault();void createMonth();}}>
          <label>اختاري الشهر<input type="month" value={newMonth} onChange={e=>setNewMonth(e.target.value)} required/></label>
          <button type="submit">افتحي الشهر</button>
        </form>}
      </div>}
      <div className="seo-month-label"><CalendarDays size={18}/> اختاري الشهر اللي بتتابعيه</div>
      <div className="seo-month-tabs" role="group" aria-label="شهور شغل السيو">
        {periods.filter(p=>p.period_kind==="month").map(p=><button type="button" key={p.id}
          className={p.id===selected?"active":""} onClick={()=>chooseMonth(p.id)}>
          {p.label}<small>{p.id===period?.id?assets.length:p.image_count} اسكرين</small>
        </button>)}
      </div>
      {period&&<div className="seo-month-welcome">
        <div><span className="seo-target-kicker">شغل {label} · {chart}</span>
          <h2>{period.label}</h2>
          <p>{manager?"التارجت والنتايج والتقرير اليومي متقسمين قدامك بشكل واضح.":"قدامك المطلوب منك في الشهر ده. امشي خطوة خطوة، وكل شغلك هيوصل لناردين."}</p>
        </div>
        <div className="seo-month-evidence"><ImageIcon size={20}/><strong>{assets.length}</strong><span>اسكرين محفوظة</span></div>
      </div>}
      {period&&<div className="seo-overview-strip">
        <button type="button" onClick={()=>chooseSection("targets")}>
          <span>تارجت الشهر</span><strong>{snapshot.total}</strong><small>مطلوب منك</small>
        </button>
        <button type="button" onClick={()=>chooseSection("targets")}>
          <span>تارجت شهري مكتمل</span><strong>{snapshot.completed}</strong><small>من التارجت الشهري</small>
        </button>
        <button type="button" className={snapshot.pending>0?"needs-review":""} onClick={()=>chooseSection("metrics")}>
          <span>مؤشرات مستنية المراجعة</span><strong>{snapshot.pending}</strong><small>{manager?"راجعيهم دلوقتي":"وصلوا لناردين"}</small>
        </button>
        <button type="button" onClick={()=>chooseSection("metrics")}>
          <span>نتايج SEO معتمدة</span><strong>{snapshot.approved}</strong><small>وافقت عليها ناردين</small>
        </button>
      </div>}
      <nav className="seo-action-tabs" aria-label="ترتيب شغل SEO">
        <button className={section==="targets"?"selected":""} onClick={()=>chooseSection("targets")}>
          <span className="seo-action-tabs__num">1</span><Target size={20}/><span>التارجت والـDone<small>{manager?"حددي المطلوب":"سجّل اللي خلّصته"}</small></span>
        </button>
        <button className={section==="metrics"?"selected":""} onClick={()=>chooseSection("metrics")}>
          <span className="seo-action-tabs__num">2</span><Activity size={20}/><span>مؤشرات الموقع<small>{manager?"راجعي أرقام قبل وبعد":"اكتب قبل وبعد"}</small></span>
        </button>
        <button className={section==="daily"?"selected":""} onClick={()=>chooseSection("daily")}>
          <span className="seo-action-tabs__num">3</span><Clock3 size={20}/><span>التقرير اليومي<small>الساعات والشغل</small></span>
        </button>
        <button className={section==="evidence"?"selected":""} onClick={()=>chooseSection("evidence")}>
          <span className="seo-action-tabs__num">4</span><ImageIcon size={20}/><span>الاسكرينات<small>صور الشغل</small></span>
        </button>
        <button className={section==="archive"?"selected":""} onClick={()=>chooseSection("archive")}>
          <FileSpreadsheet size={20}/><span>الشيتات القديمة<small>للمرجع بس</small></span>
        </button>
      </nav>
      {section==="targets"&&period&&profile&&period.period_kind==="month"&&
        <SeoTargetBoard key={profile.id+"-"+period.month_key} profileId={profile.id}
          monthKey={period.month_key} manager={manager} memberId={member.id}
          onError={setError} onNotice={setToast} onAttach={id=>{
            setUploadTarget(id);chooseSection("evidence");
          }}/>}
      {section==="metrics"&&period&&profile&&period.period_kind==="month"&&
        <SeoMetricsBoard key={"metrics-"+period.month_key} profileId={profile.id} memberId={member.id}
          monthKey={period.month_key} manager={manager} onError={setError}
          onNotice={setToast} onUpdated={loadSnapshot}/>}
      {section==="daily"&&profile&&
        <SeoDailyReport key={"daily-"+period?.month_key} profileId={profile.id}
          member={member} monthKey={period?.month_key||""} entries={log}
          onRefresh={refresh} onNotice={setToast} onError={setError}/>}
      {section==="evidence"&&period&&<section className="seo-gallery seo-gallery--main" id="seo-photo-upload">
        <div className="seo-section-top"><div>
          <h2><ImageIcon size={22}/> الاسكرينات بتاعة {period.label}</h2>
          <p>{manager?"الاسكرينات اللي محمد أو ساندرا رفعوها؛ تقدري تفتحيها وتراجعيها هنا.":"ارفع صور شغلك، وافتح أي اسكرين كبيرة من جوه السيستم."}</p>
        </div><span>{assets.length} اسكرين</span></div>
        {!manager&&period.period_kind==="month"&&<div className="seo-gallery-upload">
          <label>ارفع اسكرين جديدة (PNG / JPG / WEBP — لحد 10 ميجا)
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingShot}
              onChange={e=>{const file=e.target.files?.[0];if(file)void uploadScreenshot(file);e.currentTarget.value="";}}/>
          </label>
          <label>الاسكرين دي تابعة لأنهي تارجت؟ (اختياري)
            <select value={uploadTarget} onChange={e=>setUploadTarget(e.target.value)}>
              <option value="">اسكرين عامة للشهر</option>
              {uploadOptions.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
              {uploadTarget&&!uploadOptions.some(item=>item.id===uploadTarget)&&
                <option value={uploadTarget}>التارجت اللي اخترته</option>}
            </select>
          </label>
          {uploadingShot&&<strong className="seo-photo-status">بترفع الاسكرين…</strong>}
        </div>}
        {assets.length===0&&<div className="seo-empty-inline">{manager?"لسه الموظف مارفعش اسكرينات للشهر ده.":"لسه مفيش اسكرينات للشهر ده. ارفع أول اسكرين من فوق."}</div>}
        {assets.length>0&&screenshots.length===0&&<p className="seo-loading">بنفتح الصور من التخزين الخاص…</p>}
        <div className="seo-gallery-grid">{screenshots.map((asset,i)=><button key={asset.id} type="button"
          onClick={()=>setZoom(i)} aria-label={"افتح اسكرين "+(i+1)}>
          <Image src={signed[asset.id]} alt={"اسكرين "+(i+1)+" - "+period.label}
            width={330} height={180} unoptimized/>
          <span><Maximize2 size={14}/> {asset.origin==="manual"?"اسكرين مرفوعة":"اسكرين من الإكسيل"} {i+1}
            {asset.target_id&&uploadOptions.find(t=>t.id===asset.target_id)?.title?
             " · "+uploadOptions.find(t=>t.id===asset.target_id)?.title:""}</span>
        </button>)}</div>
      </section>}
      {section==="archive"&&<div className="seo-archive-panel">
        <div className="seo-archive-title"><FileSpreadsheet size={22}/><div>
          <h2>بيانات الشيتات القديمة</h2>
          <p>البيانات القديمة معروضة كبطاقات للرجوع ليها، ومش داخلة في التارجت أو الـDone الجديد.</p>
        </div></div>
        {period&&<SeoSourceCards key={period.id} cells={period.cells||{}}
          links={period.links||{}} comments={period.comments||{}} quarter={period.period_kind==="quarter"}/>}
        {periods.filter(p=>p.period_kind==="quarter").map(p=><details className="seo-quarter-archive" key={p.id}>
          <summary>تقرير آخر 3 شهور — {p.source_sheet}</summary>
          <SeoSourceCards cells={p.cells||{}} links={p.links||{}} comments={p.comments||{}} quarter/>
        </details>)}
      </div>}
      {!period&&<div className="seo-empty"><FileSpreadsheet size={36}/>
        <h2>لسه مفيش شهر متسجل</h2>
        <p>{manager?"افتحي شهر جديد من فوق وحطي التارجت.":"ناردين هتحدد أول شهر والتارجت، وهيظهرلك هنا."}</p>
      </div>}
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
