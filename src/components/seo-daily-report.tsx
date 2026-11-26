"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Clock3, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {companyMonthRange,inCompanyMonth,companyDefaultDay} from "@/lib/report-period";
import MonthlyReports from "./monthly-reports";
import { confirmInCurrentLanguage } from "./app-language-provider";
import type { Member } from "@/lib/domain";

export type SeoHours = {
  id: string; profile_id: string; work_date: string; start_minutes: number;
  end_minutes: number; activities: string; created_by: string;
};
const cairoToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const formatTime=(minutes:number)=>String(Math.floor(minutes/60)).padStart(2,"0")+":"+String(minutes%60).padStart(2,"0");
const asMinutes=(value:string)=>{const [hours,minutes]=value.split(":").map(Number);return hours*60+minutes;};
const timeLabel=(m:number)=>Math.floor(m/60)+" ساعة"+(m%60?" و"+m%60+" دقيقة":"");
export default function SeoDailyReport({
  profileId, profileName, brand, member, monthKey, entries, onRefresh, onNotice, onError,
}: {
  profileId:string; profileName:string; brand:string; member:Member; monthKey:string; entries:SeoHours[];
  onRefresh:()=>Promise<void>; onNotice:(message:string)=>void; onError:(message:string)=>void;
}) {
  const manager=member.role==="manager";
  const [date,setDate]=useState(()=>{
    const now=cairoToday();
    return monthKey?companyDefaultDay(monthKey,now):now;
  });
  const [start,setStart]=useState("09:00");
  const [end,setEnd]=useState("17:00");
  const [activity,setActivity]=useState("");
  const [saving,setSaving]=useState(false);
  const monthEntries=useMemo(()=>entries.filter(e=>e.profile_id===profileId&&!!monthKey&&inCompanyMonth(e.work_date,monthKey)),[entries,profileId,monthKey]);
  const days=useMemo(()=>[...new Set([date,...monthEntries.map(e=>e.work_date)])].filter(d=>!!monthKey&&inCompanyMonth(d,monthKey)).sort().reverse(),[date,monthEntries,monthKey]);
  const rows=monthEntries.filter(e=>e.work_date===date).sort((a,b)=>a.start_minutes-b.start_minutes);
  const duration=rows.reduce((n,r)=>n+r.end_minutes-r.start_minutes,0);
  const monthDuration=monthEntries.reduce((n,r)=>n+r.end_minutes-r.start_minutes,0);
  async function submitHours() {
    if(!monthKey||!inCompanyMonth(date,monthKey)){onError("اختار يوم جوه الشهر اللي فاتحه.");return;}
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
        <p>اختار اليوم وهتشوف ساعات الشغل والأعمال المسجلة في التقرير اليومي فقط.</p>
      </div>
      <div className="seo-daily-actions">
        <label className="seo-daily-picker"><CalendarDays size={18}/> اليوم<input type="date" value={date}
          min={monthKey?companyMonthRange(monthKey).first:undefined} max={monthKey?companyMonthRange(monthKey).last:undefined}
          onChange={e=>{if(monthKey&&inCompanyMonth(e.target.value,monthKey))setDate(e.target.value);}}/></label>
        <MonthlyReports department="seo" member={member} people={[{id:profileId,name:profileName,brand}]} initialMonth={monthKey||undefined} scopeLabel="تصدير التقرير اليومي" dailyOnly/>
      </div>
    </div>
    <div className="seo-daily-summary">
      <div><Clock3 size={19}/><span>ساعات اليوم</span><strong>{timeLabel(duration)}</strong></div>
      <div><CalendarDays size={19}/><span>ساعات الشهر</span><strong>{timeLabel(monthDuration)}</strong></div>
      <div><CalendarDays size={19}/><span>فترات الشغل المسجلة اليوم</span><strong>{rows.length}</strong></div>
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
    <div className="seo-daily-column-grid" style={{gridTemplateColumns:"minmax(0,1fr)"}}>
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
    </div>
    <details className="seo-daily-history"><summary>شوف تقارير الأيام التانية ({days.length})</summary>
      <div>{days.map(d=><button type="button" key={d} className={d===date?"selected":""} onClick={()=>setDate(d)}>{d}</button>)}</div>
    </details>
  </section>;
}
