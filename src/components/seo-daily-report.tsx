"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardCheck, Clock3, Download, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { monthBounds, buildSeoMonthlyWorkbook, type ReportAchievement } from "@/lib/seo-monthly-export";
import { readableError } from "@/lib/workspace-quality";
import { confirmInCurrentLanguage } from "./app-language-provider";
import type { Member } from "@/lib/domain";
import type { SeoProgress, SeoTarget } from "./seo-target-board";

export type SeoHours = {
  id: string; profile_id: string; work_date: string; start_minutes: number;
  end_minutes: number; activities: string; created_by: string;
};
const cairoToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const formatTime=(minutes:number)=>String(Math.floor(minutes/60)).padStart(2,"0")+":"+String(minutes%60).padStart(2,"0");
const asMinutes=(value:string)=>{const [hours,minutes]=value.split(":").map(Number);return hours*60+minutes;};
const timeLabel=(m:number)=>Math.floor(m/60)+" ساعة"+(m%60?" و"+m%60+" دقيقة":"");
const dailyMemory=new Map<string,{at:number;targets:SeoTarget[];progress:SeoProgress[]}>();
export function clearSeoDailyMemory(){dailyMemory.clear();}


export default function SeoDailyReport({
  profileId, profileName, brand, member, monthKey, entries, onRefresh, onNotice, onError,
}: {
  profileId:string; profileName:string; brand:string; member:Member; monthKey:string; entries:SeoHours[];
  onRefresh:()=>Promise<void>; onNotice:(message:string)=>void; onError:(message:string)=>void;
}) {
  const manager=member.role==="manager";
  const cacheKey=member.id+":"+profileId+":"+monthKey;
  const recent=dailyMemory.get(cacheKey);
  const warm=recent&&Date.now()-recent.at<120_000?recent:null;
  const [date,setDate]=useState(()=>{
    const now=cairoToday();
    return monthKey&&now.startsWith(monthKey+"-")?now:monthKey?monthKey+"-01":now;
  });
  const [start,setStart]=useState("09:00");
  const [end,setEnd]=useState("17:00");
  const [activity,setActivity]=useState("");
  const [saving,setSaving]=useState(false);
  const [exporting,setExporting]=useState(false);
  const exportLock=useRef(false);
  const [targets,setTargets]=useState<SeoTarget[]>(()=>warm?.targets||[]);
  const [progress,setProgress]=useState<SeoProgress[]>(()=>warm?.progress||[]);
  const fetchSeq=useRef(0);
  useEffect(()=>()=>{fetchSeq.current++;},[]);
  const load=useCallback(async()=>{
    const seq=++fetchSeq.current;
    const t=await supabase.from("stc_seo_targets").select("*").eq("profile_id",profileId);
    if(seq!==fetchSeq.current)return;
    if(t.error){onError(t.error.message);return;}
    if(!t.data.length){
      setTargets([]);setProgress([]);
      dailyMemory.set(cacheKey,{at:Date.now(),targets:[],progress:[]});
      return;
    }
    const p=await supabase.from("stc_seo_progress").select("*")
      .in("target_id",t.data.map(item=>item.id)).order("work_date",{ascending:false}).limit(1000);
    if(seq!==fetchSeq.current)return;
    if(p.error){onError(p.error.message);return;}
    const allTargets=t.data as SeoTarget[],allProgress=p.data as SeoProgress[];
    dailyMemory.set(cacheKey,{at:Date.now(),targets:allTargets,progress:allProgress});
    setTargets(allTargets);setProgress(allProgress);
  },[profileId,onError,cacheKey]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    const channel=supabase.channel("seo-daily-"+profileId)
      .on("postgres_changes",{event:"*",schema:"public",table:"stc_seo_progress"},()=>void load())
      .on("postgres_changes",{event:"*",schema:"public",table:"stc_seo_targets"},()=>void load())
      .subscribe();
    const resume=()=>{if(document.visibilityState==="visible")void load();};
    const interval=setInterval(()=>{if(document.visibilityState==="visible")void load();},60000);
    window.addEventListener("focus",resume);
    document.addEventListener("visibilitychange",resume);
    return()=>{
      clearInterval(interval);
      window.removeEventListener("focus",resume);
      document.removeEventListener("visibilitychange",resume);
      void supabase.removeChannel(channel);
    };
  },[profileId,load]);
  const monthEntries=entries.filter(e=>!monthKey||e.work_date.startsWith(monthKey+"-"));
  const days=useMemo(()=>[...new Set([date,...monthEntries.map(e=>e.work_date),...progress.filter(e=>!monthKey||e.work_date.startsWith(monthKey+"-")).map(e=>e.work_date)])].sort().reverse(),[date,monthEntries,progress,monthKey]);
  const rows=monthEntries.filter(e=>e.work_date===date).sort((a,b)=>a.start_minutes-b.start_minutes);
  const achievements=progress.filter(e=>e.work_date===date).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const duration=rows.reduce((n,r)=>n+r.end_minutes-r.start_minutes,0);
  const monthDuration=monthEntries.reduce((n,r)=>n+r.end_minutes-r.start_minutes,0);
  async function exportMonth(){
    if(exportLock.current||!monthKey)return;
    exportLock.current=true;setExporting(true);
    try{
      const {first,next}=monthBounds(monthKey);
      const hours:SeoHours[]=[];
      const done:ReportAchievement[]=[];
      const pageSize=500;
      for(let from=0;;from+=pageSize){
        const r=await supabase.from("stc_seo_hours").select("id,profile_id,work_date,start_minutes,end_minutes,activities,created_by")
          .eq("profile_id",profileId).gte("work_date",first).lt("work_date",next)
          .order("work_date").order("start_minutes").order("id").range(from,from+pageSize-1);
        if(r.error)throw r.error;
        hours.push(...(r.data||[]));
        if((r.data||[]).length<pageSize)break;
      }
      for(let from=0;;from+=pageSize){
        const r=await supabase.from("stc_seo_progress").select("id,work_date,done_count,note,stc_seo_targets!inner(title,target_unit,profile_id)")
          .eq("stc_seo_targets.profile_id",profileId).gte("work_date",first).lt("work_date",next)
          .order("work_date").order("id").range(from,from+pageSize-1);
        if(r.error)throw r.error;
        for(const row of r.data||[]){
          const target=Array.isArray(row.stc_seo_targets)?row.stc_seo_targets[0]:row.stc_seo_targets;
          if(target)done.push({work_date:row.work_date,title:target.title,unit:target.target_unit,done_count:row.done_count,note:row.note});
        }
        if((r.data||[]).length<pageSize)break;
      }
      if(!hours.length&&!done.length){onNotice("مفيش بيانات متسجلة للشهر ده.");return;}
      const workbook=buildSeoMonthlyWorkbook({profileName,brand,monthKey,hours,done});
      const url=URL.createObjectURL(new Blob([new Uint8Array(workbook)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      const link=document.createElement("a");
      link.href=url;link.download=("STC-SEO-"+profileName+"-"+monthKey+".xlsx").replace(/[\\/:*?"<>|]/g,"-");
      document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      onNotice("تم تصدير التقرير الشهري بنجاح.");
    }catch(e){onError(readableError(e));}
    finally{exportLock.current=false;setExporting(false);}
  }
  async function submitHours() {
    if(monthKey&&!date.startsWith(monthKey+"-")){onError("اختار يوم جوه الشهر اللي فاتحه.");return;}
    const from=asMinutes(start),to=asMinutes(end);
    if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to>1440||to<=from){
      onError("اتأكد من مواعيد البداية والنهاية.");return;
    }
    if(!activity.trim()||activity.trim().length<2){
      onError("اكتب باختصار اشتغلت على إيه خلال الفترة دي.");return;
    }
    if(rows.some(e=>from<e.end_minutes&&to>e.start_minutes)){
      onError("الساعات دي متداخلة مع فترة انت سجلتها قبل كده.");return;
    }
    setSaving(true);
    try {
      const result=await supabase.from("stc_seo_hours").insert({
        profile_id:profileId,work_date:date,start_minutes:from,end_minutes:to,
        activities:activity.trim(),created_by:member.id,
      });
      if(result.error)throw result.error;
      setActivity("");await onRefresh();onNotice("اتحفظ تقرير الفترة دي، والساعات اتحسبت.");
    } catch(e) { onError(e instanceof Error?e.message:"مقدرناش نسجّل ساعات الشغل."); }
    finally {setSaving(false);}
  }
  async function removeHours(id:string){
    if(manager){onError("حساب ناردين للمتابعة، مش لتسجيل أو مسح ساعات الموظف.");return;}
    if(!(await confirmInCurrentLanguage("متأكد إنك عايز تمسح فترة الساعات دي؟")))return;
    const r=await supabase.from("stc_seo_hours").delete().eq("id",id);
    if(r.error)onError(r.error.message);
    else{await onRefresh();onNotice("اتمسحت الفترة دي من التقرير.");}
  }
  return <section className="seo-daily-panel">
    <div className="seo-daily-intro">
      <div><span className="seo-target-kicker">تقرير اليوم</span>
        <h2><Clock3 size={23}/> ساعات الشغل والحاجات اللي اتعملت</h2>
        <p>اختار اليوم وهتشوف الساعات اللي اتسجلت، وكل الإنجازات والملاحظات بتاعته.</p>
      </div>
      <div className="seo-daily-actions">
        <label className="seo-daily-picker"><CalendarDays size={18}/> اليوم<input type="date" value={date}
          min={monthKey?monthKey+"-01":undefined} max={monthKey?monthBounds(monthKey).last:undefined}
          onChange={e=>setDate(e.target.value)}/></label>
        <button type="button" className="seo-month-export" disabled={exporting||!monthKey} aria-busy={exporting}
          onClick={()=>void exportMonth()}><Download size={18}/>{exporting?"جاري التصدير…":"تصدير تقرير الشهر Excel"}</button>
      </div>
    </div>
    <div className="seo-daily-summary">
      <div><Clock3 size={19}/><span>ساعات اليوم</span><strong>{timeLabel(duration)}</strong></div>
      <div><CalendarDays size={19}/><span>ساعات الشهر</span><strong>{timeLabel(monthDuration)}</strong></div>
      <div><CheckCircle2 size={19}/><span>الإنجازات اللي اتسجلت</span><strong>{achievements.reduce((n,x)=>n+x.done_count,0)}</strong></div>
    </div>
    {!manager&&<form className="seo-daily-entry-form" onSubmit={e=>{e.preventDefault();void submitHours();}}>
      <h3><Plus size={19}/> ضيف فترة شغل</h3>
      <div className="seo-daily-entry-fields">
        <label>من الساعة<input type="time" value={start} onChange={e=>setStart(e.target.value)} required/></label>
        <label>للساعة<input type="time" value={end} onChange={e=>setEnd(e.target.value)} required/></label>
        <label className="seo-daily-activity">عملت إيه؟<textarea rows={2} value={activity} onChange={e=>setActivity(e.target.value)} placeholder="مثلاً: تحديث 3 صفحات، كتابة جزء من بلوج، مراجعة Search Console…" required/></label>
      </div>
      <button type="submit" disabled={saving}><Plus size={17}/>{saving?"بنسجّل…":"سجّل الساعات والشغل"}</button>
    </form>}
    <div className="seo-daily-column-grid">
      <div className="seo-daily-block">
        <h3><Clock3 size={19}/> تفاصيل اليوم ({rows.length})</h3>
        {!rows.length&&<p className="seo-daily-muted">مفيش ساعات متسجّلة لليوم ده.</p>}
        <div className="seo-daily-timeline">{rows.map(row=><article key={row.id}>
          <div className="seo-daily-time">{formatTime(row.start_minutes)} – {formatTime(row.end_minutes)}
            <small>{timeLabel(row.end_minutes-row.start_minutes)}</small></div>
          <p>{row.activities}</p>
          {!manager&&row.created_by===member.id&&<button type="button" onClick={()=>void removeHours(row.id)} aria-label="امسح الفترة"><Trash2 size={16}/></button>}
        </article>)}</div>
      </div>
      <div className="seo-daily-block">
        <h3><ClipboardCheck size={19}/> الشغل اللي اتسجّل Done ({achievements.length})</h3>
        {!achievements.length&&<p className="seo-daily-muted">مفيش إنجازات اتسجّلت لليوم ده. الإنجازات بتظهر هنا أول ما تسجّل Done من كارت التارجت.</p>}
        <div className="seo-daily-achievements">{achievements.map(row=>{
          const target=targets.find(t=>t.id===row.target_id);
          return <article key={row.id}>
            <span className="seo-daily-done"><CheckCircle2 size={16}/> {row.done_count} {target?.target_unit||"إنجاز"}</span>
            <strong>{target?.title||"تارجت"}</strong>
            {row.note&&<p>{row.note}</p>}
          </article>;
        })}</div>
      </div>
    </div>
    <details className="seo-daily-history"><summary>شوف تقارير الأيام التانية ({days.length})</summary>
      <div>{days.map(d=><button type="button" key={d} className={d===date?"selected":""} onClick={()=>setDate(d)}>{d}</button>)}</div>
    </details>
  </section>;
}
