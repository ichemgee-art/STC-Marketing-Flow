"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Archive, ArrowRight, Cloud, Database, Download, File, FileImage, FileSpreadsheet, Folder, HardDrive, Image as ImageIcon, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import BrandLockup from "./brand-lockup";
import "./storage-dashboard.css";

type StorageBucket = {
  id:string;name:string;public:boolean;file_count:number;total_bytes:number;latest_file_at:string|null;
};
type StorageFile = {
  bucket_id:string;name:string;size_bytes:number;mime_type:string;created_at:string;updated_at:string;
};
type StorageOverview = {
  measured_at:string;total_bytes:number;total_files:number;
  buckets:StorageBucket[];recent:StorageFile[];
};
const bucketNames:Record<string,string>={
  "stc-seo-evidence":"اسكرينات وشواهد SEO",
  "stc-seo-workbooks":"ملفات إكسيل SEO الأصلية",
  "stc-task-files":"مرفقات التاسكات",
  "stc-history":"ملفات الأرشيف القديم",
};
// The project's organization is currently on Supabase Free (1 GB Storage).
// This is a reference allowance, not a live billing balance from Supabase.
const FREE_STORAGE_ALLOWANCE_BYTES=1024**3;
const formatSize=(size:number)=>{
  if(size>=1024*1024*1024)return (size/(1024**3)).toFixed(2)+" GiB";
  if(size>=1024*1024)return (size/(1024**2)).toFixed(2)+" MiB";
  if(size>=1024)return (size/1024).toFixed(1)+" KiB";
  return size+" بايت";
};
const friendlyDate=(s:string|null)=>{
  if(!s)return "—";
  try{return new Date(s).toLocaleString("ar-EG",{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:"Africa/Cairo"});}
  catch{return "—";}
};
function shortName(path:string){
  try{return decodeURIComponent(path.split("/").pop()||path);}
  catch{return path.split("/").pop()||path;}
}
function FileIcon({mime,name}:{mime:string;name:string}){
  if(mime.startsWith("image/"))return <FileImage size={20}/>;
  if(/\.xlsx?$/.test(name.toLowerCase()))return <FileSpreadsheet size={20}/>;
  return <File size={20}/>;
}
type Preview={url:string;name:string;type:"image"|"pdf"};
let recentOverview:{userId:string;value:StorageOverview;at:number}|null=null;
export function clearStorageManagerCache(){recentOverview=null;}

export default function StorageDashboard({userId,onBack,readOnly=false}:{
  userId:string;onBack:()=>void;readOnly?:boolean;
}){
  const [overview,setOverview]=useState<StorageOverview|null>(
    recentOverview?.userId===userId?recentOverview.value:null
  );
  const [updatedAt,setUpdatedAt]=useState(recentOverview?.userId===userId?recentOverview.at:0);
  const [loading,setLoading]=useState(!recentOverview||recentOverview.userId!==userId);
  const [error,setError]=useState("");
  const [activeBucket,setActiveBucket]=useState("all");
  const [search,setSearch]=useState("");
  const [preview,setPreview]=useState<Preview|null>(null);
  const [opening,setOpening]=useState<string|null>(null);
  const mounted=useRef(true);
  const busy=useRef(false);

  const refresh=useCallback(async(silent=false)=>{
    if(busy.current)return;
    busy.current=true;
    if(!silent)setLoading(true);
    try{
      const result=await supabase.rpc("stc_manager_storage_overview");
      if(result.error)throw result.error;
      const next=result.data as StorageOverview;
      if(!next||!Array.isArray(next.buckets)||!Array.isArray(next.recent))
        throw new Error("استجابة التخزين ناقصة؛ جربي تاني.");
      const at=Date.now();
      recentOverview={userId,value:next,at};
      if(mounted.current){setOverview(next);setUpdatedAt(at);setError("");}
    }catch(e){
      if(mounted.current)setError(e instanceof Error?e.message:"مش قادرين نجيب بيانات التخزين.");
    }finally{
      busy.current=false;
      if(mounted.current)setLoading(false);
    }
  },[userId]);

  useEffect(()=>{
    mounted.current=true;
    // Show the cached snapshot immediately, but always refresh from Supabase.
    void refresh(true);
    const interval=window.setInterval(()=>{
      if(document.visibilityState==="visible")void refresh(true);
    },10000);
    const onFocus=()=>void refresh(true);
    const onVisible=()=>{
      if(document.visibilityState==="visible")void refresh(true);
    };
    window.addEventListener("focus",onFocus);
    window.addEventListener("stc:storage-changed",onFocus);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{
      mounted.current=false;
      clearInterval(interval);
      window.removeEventListener("focus",onFocus);
      window.removeEventListener("stc:storage-changed",onFocus);
      document.removeEventListener("visibilitychange",onVisible);
    };
  },[refresh]);

  const files=useMemo(()=>(overview?.recent||[]).filter(file=>{
    if(activeBucket!=="all"&&file.bucket_id!==activeBucket)return false;
    if(!search.trim())return true;
    const q=search.trim().toLowerCase();
    return file.name.toLowerCase().includes(q)||(bucketNames[file.bucket_id]||file.bucket_id).toLowerCase().includes(q);
  }),[overview,activeBucket,search]);
  const pct=(size:number)=>overview?.total_bytes?Math.round(size/overview.total_bytes*100):0;
  const used=overview?.total_bytes||0;
  const freeBytes=Math.max(0,FREE_STORAGE_ALLOWANCE_BYTES-used);
  const usedPercent=Math.round(used/FREE_STORAGE_ALLOWANCE_BYTES*10000)/100;
  const remainingPercent=Math.max(0,100-usedPercent);

  async function openFile(file:StorageFile,download=false){
    setOpening(file.bucket_id+"/"+file.name);setError("");
    try{
      const filename=shortName(file.name);
      const result=await supabase.storage.from(file.bucket_id).createSignedUrl(
        file.name,90,download?{download:filename}:undefined
      );
      if(result.error)throw result.error;
      if(download){
        const a=document.createElement("a");
        a.href=result.data.signedUrl;
        a.rel="noopener noreferrer";
        a.download=filename;
        a.click();
      }else if(file.mime_type.startsWith("image/")){
        setPreview({url:result.data.signedUrl,name:filename,type:"image"});
      }else if(file.mime_type==="application/pdf"||filename.toLowerCase().endsWith(".pdf")){
        setPreview({url:result.data.signedUrl,name:filename,type:"pdf"});
      }else{
        const a=document.createElement("a");a.href=result.data.signedUrl;
        a.target="_blank";a.rel="noopener noreferrer";a.click();
      }
    }catch(e){
      setError("مقدرناش نفتح الملف ده: "+(e instanceof Error?e.message:"صلاحية الملف مش متاحة."));
    }finally{setOpening(null);}
  }

  return <div className="storage-screen" dir="rtl">
    <header className="storage-top">
      <BrandLockup size="compact"/>
      <div className="storage-top-copy"><strong>التخزين والملفات</strong>
        <small>{readOnly?"صفحة جرجس · عرض وتحميل فقط":"لوحة ناردين · Supabase Storage"}</small>
      </div>
      <button type="button" className="storage-back" onClick={onBack}>
        <ArrowRight size={18}/> {readOnly?"رجوع لشغلي":"رجوع للتيم"}
      </button>
    </header>
    <main className="storage-content">
      <div className="storage-intro">
        <div><span className="storage-eyebrow">STC / SUPABASE</span>
          <h1>متابعة مساحة التخزين</h1>
          <p>هنا كل الملفات اللي اترفعت: الحجم الفعلي لكل قسم، وعدد الملفات، وآخر الملفات اللي وصلت للسيستم.</p>
        </div>
        <div className="storage-refresh-area">
          <span className="storage-live"><span/> تحديث تلقائي كل 10 ثواني</span>
          <button type="button" className="storage-refresh" disabled={loading} onClick={()=>void refresh()}>
            <RefreshCw size={16} className={loading?"storage-spin":""}/> تحديث دلوقتي
          </button>
        </div>
      </div>
      {error&&<div className="storage-error" role="alert">{error}<button onClick={()=>void refresh()}>حاول تاني</button></div>}
      {!overview&&<div className="storage-loading">بنحمّل بيانات التخزين من Supabase…</div>}
      {overview&&<>
        <section className="storage-quota" aria-label="المساحة المستخدمة من إجمالي مساحة Supabase Free">
          <div className="storage-quota__headline">
            <div><span className="storage-eyebrow">SUPABASE FREE · STORAGE</span>
              <h2>استهلكنا كام من مساحة الملفات؟</h2>
              <p>المساحة المستخدمة حاليًا من حد التخزين المجاني المعروف (1 GB).</p>
            </div>
            <div className="storage-quota__number" dir="ltr">
              <strong>{formatSize(used)}</strong><span> / 1 GiB</span>
            </div>
          </div>
          <div className="storage-quota__progress" role="progressbar"
            aria-label="نسبة التخزين المستخدمة" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.min(100,usedPercent)}>
            <span style={{width:Math.max(0,Math.min(100,usedPercent))+"%"}}/>
          </div>
          <div className="storage-quota__bottom">
            <span><b>{usedPercent.toFixed(2)}%</b> مستخدم</span>
            <span><b>{formatSize(freeBytes)}</b> متبقي تقريبًا</span>
            <span><b>{remainingPercent.toFixed(2)}%</b> فاضي</span>
          </div>
          <small>الحد ده مرجع لخطة Free، مش قراءة مباشرة من نظام الفوترة. استهلاك الملفات التابع لمشاريع تانية في نفس المؤسسة مش داخل الرقم ده.</small>
        </section>
        <div className="storage-snapshot" aria-label="ملخص التخزين">
          <span><FileImage size={17}/> <strong>{overview.total_files}</strong> ملف</span>
          <span><Folder size={17}/> <strong>{overview.buckets.length}</strong> قسم</span>
          <span><Cloud size={17}/> آخر رفع: <strong>{friendlyDate(overview.recent[0]?.created_at||null)}</strong></span>
        </div>
        <div className="storage-updated"><ShieldCheck size={16}/>
          آخر تحديث للبيانات: {friendlyDate(overview.measured_at)} · {updatedAt?"مباشر من Supabase":"نسخة محفوظة مؤقتًا"}
        </div>
        <details className="storage-section storage-breakdown">
          <summary><Database size={19}/> استهلاك كل قسم <small>عرض التفاصيل</small></summary>
          <div className="storage-buckets">
            {overview.buckets.map(bucket=><button key={bucket.id} type="button"
              className={"storage-bucket"+(activeBucket===bucket.id?" chosen":"")}
              onClick={()=>setActiveBucket(activeBucket===bucket.id?"all":bucket.id)}>
              <div className="storage-bucket-head">
                <span className="storage-bucket-icon">{bucket.id==="stc-history"?<Archive size={20}/>:<Database size={20}/>}</span>
                <span className="storage-bucket-count">{bucket.file_count} ملف</span>
              </div>
              <strong>{bucketNames[bucket.id]||bucket.name}</strong>
              <small dir="ltr">{bucket.name}</small>
              <div className="storage-bucket-value"><b dir="ltr">{formatSize(bucket.total_bytes)}</b><span>{pct(bucket.total_bytes)}% من الإجمالي</span></div>
              <div className="storage-progress"><span style={{width:pct(bucket.total_bytes)+"%"}}/></div>
              </button>)}
          </div>
        </details>
        <section className="storage-section storage-files">
          <div className="storage-heading"><div><h2>آخر الملفات المرفوعة</h2>
            <p>آخر {overview.recent.length} ملف من التخزين · دوسي على ملف لمعاينته أو تحميله، لو صلاحياته تسمح.</p>
          </div><button type="button" className="storage-reset" onClick={()=>{setActiveBucket("all");setSearch("");}}>
            كل الملفات</button></div>
          <div className="storage-filters">
            <label className="storage-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="دوري باسم الملف أو القسم…"/></label>
            <select aria-label="اختاري قسم التخزين" value={activeBucket} onChange={e=>setActiveBucket(e.target.value)}>
              <option value="all">كل أقسام التخزين</option>
              {overview.buckets.map(b=><option key={b.id} value={b.id}>{bucketNames[b.id]||b.name}</option>)}
            </select>
          </div>
          <div className="storage-file-list">
            {files.map(file=><article className="storage-file" key={file.bucket_id+"/"+file.name}>
              <div className="storage-file-icon"><FileIcon mime={file.mime_type} name={file.name}/></div>
              <div className="storage-file-details"><strong title={file.name} dir="auto">{shortName(file.name)}</strong>
                <small>{bucketNames[file.bucket_id]||file.bucket_id} · {friendlyDate(file.created_at)}</small>
                <span title={file.name} dir="ltr">{file.name}</span>
              </div>
              <div className="storage-file-size" dir="ltr">{formatSize(file.size_bytes)}</div>
              <button type="button" className="storage-file-open" disabled={opening===file.bucket_id+"/"+file.name}
                onClick={()=>void openFile(file)}><ImageIcon size={16}/> فتح</button>
              <button type="button" className="storage-file-download" disabled={opening===file.bucket_id+"/"+file.name}
                aria-label={"تحميل "+shortName(file.name)} onClick={()=>void openFile(file,true)}><Download size={18}/></button>
            </article>)}
            {!files.length&&<div className="storage-no-files">مفيش ملفات مطابقة للبحث ده.</div>}
          </div>
        </section>
        <details className="storage-caveat"><summary><ShieldCheck size={16}/> عن الأرقام والصلاحيات</summary><p>
          الأرقام هنا لحجم الملفات الموجودة دلوقتي، وبتتحدث تلقائيًا كل 10 ثواني لما الصفحة مفتوحة.
          <strong> دي مش حصة الباقة ولا حساب فاتورة Supabase الشهرية،</strong> لأن الفوترة بتتأثر بالحجم عبر الوقت.
          الملفات الخاصة متاحة لناردين وللحسابات المصرح لها بعرض التخزين فقط، وأي فتح بيستخدم رابط مؤقت.
        </p></details>
      </>}
    </main>
    {preview&&<div className="storage-preview-backdrop" role="dialog" aria-modal="true"
      aria-label={"معاينة "+preview.name} onClick={()=>setPreview(null)}>
      <div className="storage-preview" onClick={e=>e.stopPropagation()}>
        <header><strong dir="auto">{preview.name}</strong><button onClick={()=>setPreview(null)} aria-label="إغلاق المعاينة"><X size={23}/></button></header>
        {preview.type==="image"
          ?<Image src={preview.url} alt={preview.name} width={1400} height={950} unoptimized/>
          :<iframe src={preview.url} title={"ملف "+preview.name}/>}
      </div>
    </div>}
  </div>;
}
