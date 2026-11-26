"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import BrandLockup from "./brand-lockup";
import { Activity, ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileSpreadsheet, ImageIcon, Maximize2, Plus, Target, UploadCloud, Download, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/lib/toasts";
import { confirmInCurrentLanguage } from "./app-language-provider";
import { getFlowLocation, setFlowLocation } from "@/lib/flow-location";
import type { Member } from "@/lib/domain";
import MonthlyReports from "./monthly-reports";
import SeoTargetBoard, { clearSeoTargetMemory } from "./seo-target-board";
import { countCompletedMonthlyTargets } from "@/lib/seo-progress-correction";
import {companyMonthRange,companyMonthKey,cairoDate} from "@/lib/report-period";
import SeoSourceCards from "./seo-source-cards";
import SeoDailyReport, { clearSeoDailyMemory } from "./seo-daily-report";
import SeoMetricsBoard, { clearSeoMetricsMemory } from "./seo-metrics-board";
import SeoHistoricalView from "./seo-historical-view";
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
  const snapshotSerial=useRef(0);
  const assetsSerial=useRef(0);
  const [section,setSection]=useState<"targets"|"metrics"|"daily"|"evidence"|"archive">("targets");
  const [positionReady,setPositionReady]=useState(false);
  const [snapshotState,setSnapshot]=useState<{key:string;total:number;completed:number;pending:number;approved:number}>({key:"",total:0,completed:0,pending:0,approved:0});
  const snapshot=snapshotState.key===profile?.id+":"+selected?snapshotState:{total:0,completed:0,pending:0,approved:0};
  const [newMonth,setNewMonth]=useState(()=>companyMonthKey(cairoDate(new Date().toISOString())));
  const [showMonthCreator,setShowMonthCreator]=useState(false);
  const [copyPreviousTargets,setCopyPreviousTargets]=useState(false);
  const [creatingMonth,setCreatingMonth]=useState(false);
  const [uploadingShot,setUploadingShot]=useState(false);
  const [removingShot,setRemovingShot]=useState<string|null>(null);
  const [downloadingShot,setDownloadingShot]=useState<string|null>(null);
  const [signed,setSigned]=useState<Record<string,string>>({});
  const [zoom,setZoom]=useState<number|null>(null);
  const [uploading,setUploading]=useState(false);
  const setToast=useCallback((message:string)=>showToast(message,/اتمسح|اتمسحت|مسح|حذف/.test(message)?"delete":"success"),[]);
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
    const periodsRes=await supabase.from("stc_seo_periods").select("*").eq("profile_id",p.data.id).order("month_key",{ascending:false});
    const allHours:Hours[]=[];
    for(let offset=0;;offset+=500){
      const res=await supabase.from("stc_seo_hours").select("*").eq("profile_id",p.data.id).order("work_date",{ascending:false}).order("id").range(offset,offset+499);
      if(serial!==refreshSerial.current||!mounted.current)return;
      if(res.error){setError(res.error.message);return;}
      allHours.push(...(res.data||[]));if((res.data||[]).length<500)break;
    }
    const logsRes={data:allHours,error:null};
    if(serial!==refreshSerial.current||!mounted.current)return;
    if(periodsRes.error){setError(periodsRes.error.message||"في مشكلة في تحميل البيانات.");return;}
    setPeriods(periodsRes.data||[]);
    setLog(logsRes.data||[]);
    const stored=seoMemory.get(seoCacheKey);
    seoMemory.set(seoCacheKey,{at:Date.now(),profile:p.data,periods:periodsRes.data||[],
      hours:logsRes.data||[],selectedId:stored?.selectedId||null});
    setSelected(old=>{
      const last=getFlowLocation(member.id);
      const fromLink=last.view==="seo"&&last.person===slug&&last.month
        ?(periodsRes.data||[]).find(p=>p.period_kind==="month"&&p.month_key===last.month):null;
      if(fromLink)return fromLink.id;
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
    const nav=getFlowLocation(member.id);
    if(nav.view==="seo"&&nav.person===slug&&nav.section){
      setSection(nav.section);
    }else try{
      const value=sessionStorage.getItem("stc-seo-screen-"+member.id+"-"+slug);
      if(value&&["targets","metrics","daily","evidence","archive"].includes(value))
        setSection(value as typeof section);
    }catch{}
    setPositionReady(true);
  },[member.id,slug]);
  useEffect(()=>{
    if(!positionReady||!period)return;
    setFlowLocation(member.id,{view:"seo",person:slug,section,month:period.month_key});
  },[positionReady,member.id,slug,period?.month_key,section]);
  useEffect(()=>{
    const onBack=()=>{
      const nav=getFlowLocation(member.id);
      if(nav.view!=="seo"||nav.person!==slug)return;
      if(nav.section)setSection(nav.section);
      if(nav.month){
        const found=periods.find(p=>p.period_kind==="month"&&p.month_key===nav.month);
        if(found)setSelected(found.id);
      }
    };
    window.addEventListener("popstate",onBack);
    return()=>window.removeEventListener("popstate",onBack);
  },[member.id,slug,periods]);
  function chooseSection(next:typeof section){
    setSection(next);
    if(period)setFlowLocation(member.id,{view:"seo",person:slug,section:next,month:period.month_key},"push");
    try{sessionStorage.setItem("stc-seo-screen-"+member.id+"-"+slug,next);}catch{}
  }
  function chooseMonth(id:string){
    setSelected(id);setZoom(null);
    const entry=seoMemory.get(seoCacheKey);
    if(entry)seoMemory.set(seoCacheKey,{...entry,selectedId:id});
    const next=periods.find(p=>p.id===id);
    if(next)setFlowLocation(member.id,{view:"seo",person:slug,section,month:next.month_key},"push");
    try{sessionStorage.setItem("stc-seo-month-"+member.id+"-"+slug,id);}catch{}
  }
  const loadSnapshot=useCallback(async()=>{
    const serial=++snapshotSerial.current;
    if(!profile||!selected)return;
    const current=periods.find(p=>p.id===selected);
    if(!current)return;
    const bounds=companyMonthRange(current.month_key);
    const [a,b]=await Promise.all([
      supabase.from("stc_seo_targets").select("id,target_count,cadence").eq("profile_id",profile.id).eq("month_key",current.month_key),
      supabase.from("stc_seo_metrics").select("status").eq("profile_id",profile.id).eq("month_key",current.month_key),
    ]);
    if(serial!==snapshotSerial.current||!mounted.current||a.error||b.error)return;
    const targets=a.data||[];
    const progress:{target_id:string;done_count:number;work_date:string}[]=[];
    if(targets.length)for(let offset=0;;offset+=500){
      const d=await supabase.from("stc_seo_progress").select("target_id,done_count,work_date").in("target_id",targets.map(t=>t.id)).gte("work_date",bounds.first).lt("work_date",bounds.next).order("id").range(offset,offset+499);
      if(serial!==snapshotSerial.current||!mounted.current||d.error)return;
      progress.push(...(d.data||[]));if((d.data||[]).length<500)break;
    }
    setSnapshot({key:profile.id+":"+selected,
      total:targets.length,
      completed:countCompletedMonthlyTargets(targets,progress,current.month_key),
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
    const poll=setInterval(()=>{if(document.visibilityState==="visible")void loadSnapshot();},45000);
    return()=>{clearInterval(poll);void supabase.removeChannel(channel);};
  },[profile?.id,selected,member.id,loadSnapshot]);

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
    if(!profile||!manager||creatingMonth)return;
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(newMonth)){setError("اختاري شهر صحيح.");return;}
    if(periods.some(p=>p.month_key===newMonth)){setError("الشهر ده موجود بالفعل، اختاريه من التابات.");return;}
    setCreatingMonth(true);setError("");
    try{
      let copied:{title:string;details:string;target_count:number|null;target_unit:string;cadence:string}[]=[];
      let sourceMonth="";
      if(copyPreviousTargets){
        const past=await supabase.from("stc_seo_targets")
          .select("title,details,target_count,target_unit,cadence,month_key")
          .eq("profile_id",profile.id).lt("month_key",newMonth)
          .order("month_key",{ascending:false}).limit(100);
        if(past.error)throw past.error;
        sourceMonth=past.data?.[0]?.month_key||"";
        if(!sourceMonth)throw new Error("مفيش تارجت سابق ننسخه. شيلي علامة النسخ وافتحي الشهر من غير تارجت.");
        copied=(past.data||[]).filter(t=>t.month_key===sourceMonth)
          .map(t=>({title:t.title,details:t.details,target_count:t.target_count,target_unit:t.target_unit,cadence:t.cadence}));
      }
      const date=new Date(newMonth+"-01T12:00:00Z");
      const label=new Intl.DateTimeFormat("ar-EG",{month:"long",year:"numeric",timeZone:"UTC"}).format(date);
      const result=await supabase.from("stc_seo_periods").insert({
        profile_id:profile.id,source_sheet:"from-system-"+newMonth,
        source_filename:"خطة من السيستم",source_sha256:"manual:"+slug+":"+newMonth,
        month_key:newMonth,label,period_kind:"month",cells:{},links:{},comments:{},image_count:0,
      }).select("id").single();
      if(result.error)throw result.error;
      if(copied.length){
        const inserted=await supabase.from("stc_seo_targets").insert(copied.map(t=>({
          ...t,profile_id:profile.id,month_key:newMonth,created_by:member.id
        })));
        if(inserted.error){
          await refresh();
          throw new Error("الشهر اتفتح، لكن نسخ التارجت فشل: "+inserted.error.message+" . افتحي الشهر وأضيفي التارجت يدويًا.");
        }
      }
      setShowMonthCreator(false);setCopyPreviousTargets(false);setNewMonth("");
      setFlowLocation(member.id,{view:"seo",person:slug,section,month:newMonth},"push");
      if(result.data)setSelected(result.data.id);
      await refresh();
      setToast(copied.length?
        "الشهر الجديد اتفتح واتنسخ "+copied.length+" تارجت من "+sourceMonth+"، من غير إنجازات قديمة.":
        "الشهر الجديد اتفتح. دلوقتي ناردين تقدر تحدد التارجت.");
    }catch(e){setError(e instanceof Error?e.message:"مقدرناش نفتح الشهر.");}
    finally{setCreatingMonth(false);}
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
        size_bytes:file.size,target_id:null,uploaded_by:member.id,origin:"manual",
      });
      if(added.error)throw added.error;
      await loadScreenshots(period.id);
      window.dispatchEvent(new Event("stc:storage-changed"));
      setToast("الاسكرين اتحفظت، وتقدر تفتحها كبيرة من جوه السيستم.");
    }catch(e){setError(e instanceof Error?e.message:"حصلت مشكلة في رفع الاسكرين.");}
    finally{setUploadingShot(false);}
  }
  async function downloadScreenshot(asset:Asset){
    if(!manager)return;
    setDownloadingShot(asset.id);setError("");
    try{
      const result=await supabase.storage.from("stc-seo-evidence").download(asset.object_path);
      if(result.error||!result.data)throw result.error||new Error("ملف الصورة مش متاح.");
      const filename=asset.filename||"screenshot.png";
      const localUrl=URL.createObjectURL(result.data);
      const link=document.createElement("a");
      link.href=localUrl;link.download=filename;
      document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(localUrl),60_000);
      setToast("الصورة اتحمّلت على جهازك.");
    }catch(e){
      const message=e instanceof Error?e.message:"مش قادرين نحمّل الصورة.";
      setError(message);showToast(message,"error");
    }finally{setDownloadingShot(null);}
  }
  async function removeScreenshot(asset:Asset){
    if(manager||asset.origin!=="manual"||asset.uploaded_by!==member.id){
      setError("تقدر تمسح بس الاسكرينات اللي إنت رفعتها بنفسك.");return;
    }
    if(!(await confirmInCurrentLanguage("متأكد إنك عايز تمسح الاسكرين دي نهائيًا من شهر "+(period?.label||"الشغل")+"؟")))return;
    setRemovingShot(asset.id);setError("");
    try{
      // Delete the actual Storage object via the Storage API (not SQL).
      // RLS only permits the profile owner to delete their manual uploads.
      const removed=await supabase.storage.from("stc-seo-evidence").remove([asset.object_path]);
      if(removed.error)throw removed.error;
      const row=await supabase.from("stc_seo_assets").delete()
        .eq("id",asset.id).eq("uploaded_by",member.id).eq("origin","manual").select("id");
      if(row.error)throw row.error;
      if(!row.data?.length)throw new Error("اتمسح الملف، بس محتاجين نحدّث سجل الاسكرينات.");
      setZoom(null);
      if(period)await loadScreenshots(period.id);
      window.dispatchEvent(new Event("stc:storage-changed"));
      showToast("الاسكرين اتمسحت من الشهر ومن التخزين.","delete");
    }catch(e){
      const message=e instanceof Error?e.message:"حصلت مشكلة في حذف الاسكرين.";
      setError(message);showToast(message,"error");
      if(period)await loadScreenshots(period.id);
    }finally{setRemovingShot(null);}
  }
  const screenshots = assets.filter(a=>!!signed[a.id]);
  const label = profile?.display_name|| (slug==="sandra"?"ساندرا":"محمد عمر");
  const chart = slug==="sandra" ? "iChem" : "STC";
  return <div className="seo-shell" dir="rtl">
    <header className="seo-topbar">
      <div className="seo-brand"><BrandLockup size="compact"/><div><strong>{label} · SEO</strong><small>{chart} — {profile?.site_url||"SEO"}</small></div></div>
      <button type="button" onClick={onBack} className="seo-back"><ArrowRight size={18}/>{manager?"رجوع للتيم":"خروج"}</button>
    </header>
    <main className="seo-main">
      <div className="seo-headline"><div><span className="seo-eyebrow">متابعة السيو · {chart}</span><h1>متابعة SEO</h1>
        <p>{manager?"راجعي التارجت والنتايج من التبويبات.":"اختار الشهر، وبعدها ابدأ بالتارجت أو سجّل شغل اليوم."}</p></div>
        <div className="stc-report-actions">{profile&&<MonthlyReports department="seo" member={member} people={[{id:profile.id,name:profile.display_name,brand:profile.brand}]} initialMonth={period?.month_key} scopeLabel="التقرير الشهري"/>}
        {manager&&<details className="seo-import-more">
          <summary><FileSpreadsheet size={16}/> استيراد شيت قديم</summary>
          <div className="seo-upload">
            <label className={uploading?"seo-uploading":""}><UploadCloud size={18}/>{uploading?"بنستورد…":"اختاري ملف Excel"}
            <input type="file" accept=".xlsx" disabled={uploading} onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.currentTarget.value="";}}/></label>
          </div>
        </details>}</div>
      </div>
      {error&&<div className="seo-error" role="alert">{error}<button type="button" onClick={()=>setError("")}>×</button></div>}
      {manager&&<div className="seo-month-manager">
        <button className="seo-target-add" type="button" onClick={()=>{if(!showMonthCreator&&!newMonth)setNewMonth(companyMonthKey(cairoDate(new Date().toISOString())));setShowMonthCreator(x=>!x);}}><Plus size={16}/> افتحي شهر جديد</button>
        {showMonthCreator&&<form className="seo-new-month" onSubmit={e=>{e.preventDefault();void createMonth();}}>
          <label>اختاري الشهر<input type="month" value={newMonth} onChange={e=>setNewMonth(e.target.value)} required/></label>
          <label className="flow-copy-targets"><input type="checkbox" checked={copyPreviousTargets}
            onChange={e=>setCopyPreviousTargets(e.target.checked)}/>
            انسخي تارجت آخر شهر سابق (من غير إنجازات أو ساعات أو صور)
          </label>
          <button type="submit" disabled={creatingMonth}>{creatingMonth?"بنفتح الشهر…":"افتحي الشهر"}</button>
        </form>}
      </div>}
      <div className="seo-month-label"><CalendarDays size={18}/> اختاري الشهر اللي بتتابعيه</div>
      <div className="seo-month-tabs" role="group" aria-label="شهور شغل السيو">
        {periods.filter(p=>p.period_kind==="month").map(p=><button type="button" key={p.id}
          className={p.id===selected?"active":""} onClick={()=>chooseMonth(p.id)}>
          {p.label}
        </button>)}
      </div>
      {period&&period.month_key>="2026-11"&&<p className="seo-month-label"><CalendarDays size={16}/> فترة الشهر: <span dir="ltr">{companyMonthRange(period.month_key).first} — {companyMonthRange(period.month_key).last}</span></p>}
      {period&&period.month_key>="2026-11"&&<div className="seo-overview-strip">
        <button type="button" onClick={()=>chooseSection("targets")}>
          <span>تارجت الشهر</span><strong>{snapshot.total}</strong>
        </button>
        <button type="button" onClick={()=>chooseSection("targets")}>
          <span>تارجت شهري مكتمل</span><strong>{snapshot.completed}</strong>
        </button>
        <button type="button" className={snapshot.pending>0?"needs-review":""} onClick={()=>chooseSection("metrics")}>
          <span>{manager?"مستني موافقتك":"مستني مراجعة"}</span><strong>{snapshot.pending}</strong>
        </button>
      </div>}
      <nav className="seo-action-tabs" aria-label="أقسام شغل SEO">
        <button type="button" className={section==="targets"?"selected":""} aria-pressed={section==="targets"} onClick={()=>chooseSection("targets")}>
          <Target size={19}/><span>التارجت والـDone</span>
        </button>
        <button type="button" className={section==="metrics"?"selected":""} aria-pressed={section==="metrics"} onClick={()=>chooseSection("metrics")}>
          <Activity size={19}/><span>مؤشرات الموقع</span>
          {snapshot.pending>0&&<b className="seo-tab-count">{snapshot.pending}</b>}
        </button>
        <button type="button" className={section==="daily"?"selected":""} aria-pressed={section==="daily"} onClick={()=>chooseSection("daily")}>
          <Clock3 size={19}/><span>التقرير اليومي</span>
        </button>
        <button type="button" className={section==="evidence"?"selected":""} aria-pressed={section==="evidence"} onClick={()=>chooseSection("evidence")}>
          <ImageIcon size={19}/><span>الاسكرينات ({assets.length})</span>
        </button>
        <button type="button" className={"seo-archive-tab "+(section==="archive"?"selected":"")} aria-pressed={section==="archive"} onClick={()=>chooseSection("archive")}>
          <FileSpreadsheet size={18}/><span>الأرشيف</span>
        </button>
      </nav>
      {section==="targets"&&period&&profile&&period.period_kind==="month"&&
        (period.month_key<"2026-11"
          ?<SeoHistoricalView key={"historical-targets-"+period.id} slug={slug} monthKey={period.month_key}
             monthLabel={period.label} cells={period.cells||{}} mode="targets"
             photos={screenshots.map(asset=>({id:asset.id,url:signed[asset.id],filename:asset.filename}))}
             expectedPhotos={period.image_count} onGallery={()=>chooseSection("evidence")}
             onOpenPhoto={id=>{const idx=screenshots.findIndex(asset=>asset.id===id);if(idx>=0)setZoom(idx);}}/>
          :<SeoTargetBoard key={profile.id+"-"+period.month_key} profileId={profile.id}
             monthKey={period.month_key} manager={manager} memberId={member.id}
             onError={setError} onNotice={setToast}/>)}
      {section==="metrics"&&period&&profile&&period.period_kind==="month"&&
        (period.month_key<"2026-11"
          ?<SeoHistoricalView key={"historical-metrics-"+period.id} slug={slug} monthKey={period.month_key}
             monthLabel={period.label} cells={period.cells||{}} mode="metrics"
             photos={screenshots.map(asset=>({id:asset.id,url:signed[asset.id],filename:asset.filename}))}
             expectedPhotos={period.image_count} onGallery={()=>chooseSection("evidence")}
             onOpenPhoto={id=>{const idx=screenshots.findIndex(asset=>asset.id===id);if(idx>=0)setZoom(idx);}}/>
          :<SeoMetricsBoard key={"metrics-"+period.month_key} profileId={profile.id} memberId={member.id}
             monthKey={period.month_key} manager={manager} onError={setError}
             onNotice={setToast} onUpdated={loadSnapshot}/>)}
      {section==="daily"&&profile&&period?.period_kind==="month"&&
        <SeoDailyReport key={"daily-"+profile.id+"-"+period.month_key} profileId={profile.id} profileName={profile.display_name} brand={profile.brand}
          member={member} monthKey={period.month_key} entries={log}
          onRefresh={refresh} onNotice={setToast} onError={setError}/>}
      {section==="evidence"&&period&&<section className="seo-gallery seo-gallery--main" id="seo-photo-upload">
        <div className="seo-section-top"><div>
          <h2><ImageIcon size={22}/> الاسكرينات شهر {period.label}</h2>
          <p>{manager?"الاسكرينات اللي محمد أو ساندرا رفعوها؛ تقدري تفتحيها وتراجعيها هنا.":"ارفع اسكرينات الشهر كله هنا في مكان واحد، وافتح أي صورة بحجم كبير."}</p>
        </div><span>{assets.length} اسكرين</span></div>
        {!manager&&period.period_kind==="month"&&<div className="seo-gallery-upload">
          <label>ارفع اسكرين جديدة (PNG / JPG / WEBP — لحد 10 ميجا)
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingShot}
              onChange={e=>{const file=e.target.files?.[0];if(file)void uploadScreenshot(file);e.currentTarget.value="";}}/>
          </label>
          {uploadingShot&&<strong className="seo-photo-status">بترفع الاسكرين…</strong>}
        </div>}
        {assets.length===0&&<div className="seo-empty-inline">{manager?"لسه الموظف مارفعش اسكرينات للشهر ده.":"لسه مفيش اسكرينات للشهر ده. ارفع أول اسكرين من فوق."}</div>}
        {assets.length>0&&screenshots.length===0&&<p className="seo-loading">بنفتح الصور من التخزين الخاص…</p>}
        <div className="seo-gallery-grid">{screenshots.map((asset,i)=><div className="seo-gallery-photo" key={asset.id}>
          <button className="seo-gallery-photo__preview" type="button"
            onClick={()=>setZoom(i)} aria-label={"افتح اسكرين "+(i+1)}>
            <Image src={signed[asset.id]} alt={"اسكرين "+(i+1)+" - "+period.label}
              width={330} height={180} unoptimized/>
            <span><Maximize2 size={14}/> اسكرين {i+1} · {period.label}</span>
          </button>
          {manager&&<button className="seo-gallery-photo__action" type="button"
            disabled={downloadingShot===asset.id} onClick={()=>void downloadScreenshot(asset)}>
            <Download size={16}/>{downloadingShot===asset.id?"بنحمّل…":"تحميل الصورة"}
          </button>}
          {!manager&&asset.origin==="manual"&&asset.uploaded_by===member.id&&
            <button className="seo-gallery-photo__action seo-gallery-photo__action--delete" type="button"
              disabled={removingShot===asset.id} onClick={()=>void removeScreenshot(asset)}>
              <Trash2 size={16}/>{removingShot===asset.id?"بنمسح…":"امسح الاسكرين"}
            </button>}
        </div>)}</div>
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
    {zoom!==null&&screenshots[zoom]&&<div className="seo-lightbox" role="dialog" aria-modal="true" aria-label="اسكرين كبيرة" onClick={()=>setZoom(null)}>
      <header><span>{period?.label} — اسكرين {zoom+1} من {screenshots.length}</span>
        <div className="seo-lightbox-actions">
          {manager&&<button type="button" className="seo-lightbox-download" disabled={downloadingShot===screenshots[zoom].id}
            onClick={e=>{e.stopPropagation();void downloadScreenshot(screenshots[zoom]);}}><Download size={18}/> تحميل</button>}
          {!manager&&screenshots[zoom].origin==="manual"&&screenshots[zoom].uploaded_by===member.id&&
            <button type="button" className="seo-lightbox-delete" disabled={removingShot===screenshots[zoom].id}
              onClick={e=>{e.stopPropagation();void removeScreenshot(screenshots[zoom]);}}><Trash2 size={18}/> حذف</button>}
          <button type="button" onClick={()=>setZoom(null)} aria-label="إغلاق الاسكرين"><X size={24}/></button>
        </div>
      </header>
      <div className="seo-lightbox-stage" onClick={e=>e.stopPropagation()}>
        {screenshots.length>1&&<button className="seo-lightbox-prev" onClick={()=>setZoom((zoom-1+screenshots.length)%screenshots.length)} aria-label="الصورة اللي قبلها"><ChevronRight size={29}/></button>}
        <Image src={signed[screenshots[zoom].id]} alt="صورة التقرير الأصلية" width={1400} height={1000} unoptimized/>
        {screenshots.length>1&&<button className="seo-lightbox-next" onClick={()=>setZoom((zoom+1)%screenshots.length)} aria-label="الصورة اللي بعدها"><ChevronLeft size={29}/></button>}
      </div>
      <footer>اضغط بره الصورة عشان ترجع للتقرير</footer>
    </div>}
  </div>;
}
